import { Url } from "./Url.ts";
import { MessageBody } from "./MessageBody.ts";
import { CookieOptions } from "./CookieOptions.ts";
import { resolvePathPatternWithUrl } from "./PathPattern.ts";
import { isJson } from "./mimeType.ts";
import parseRange from "https://cdn.skypack.dev/range-parser?dts";
import { ab2str, str2ab } from "./utility/arrayBufferUtility.ts";
import { after, getProp, upTo, upToLast } from "./utility/utility.ts";
import { IAuthUser } from "./user/IAuthUser.ts";
import { AsyncQueue } from "./utility/asyncQueue.ts";
import { ErrorObject, ValidateFunction } from "https://cdn.skypack.dev/ajv?dts";
import { SimpleServiceContext } from "./ServiceContext.ts";

/**
 * List of headers which can be used in a response
 */
const sendHeaders: string[] = [
    "accept-ranges",
    "access-control-allow-origin",
    "access-control-allow-credentials",
    "access-control-expose-headers",
    "access-control-max-age",
    "access-control-allow-methods",
    "access-control-allow-headers",
    "cache-control",
    "content-disposition",
    "content-encoding",
    "content-language",
    "content-length",
    "content-location",
    "content-md5",
    "content-range",
    "content-security-policy",
    "content-type",
    "date",
    "delta-base",
    "etag",
    "expires",
    "im",
    "last-modified",
    "link",
    "location",
    "p3p",
    "pragma",
    "proxy-authenticate",
    "public-key-pins",
    "refresh",
    "retry-after",
    "server",
    "set-cookie",
    "strict-transport-security",
    "timing-allow-origin",
    "trailer",
    "transfer-encoding",
    "tk",
    "upgrade",
    "vary",
    "via",
    "warning",
    "www-authenticate",
    "x-content-type-options",
    "x-correlation-id",
    "x-frame-options",
    "x-powered-by",
    "x-request-id",
    "x-restspace-service",
    "x-ua-compatible",
    "x-xss-protection"
];

/**
 * Format a date for use in a header
 * @param d - the date to format
 * @returns the formatted date
 */
const headerDate = (d: Date) => {
    const leadingZ = (n: number) => n.toString().padStart(2, '0');
    const dayName = [ 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ][d.getUTCDay()];
    const day = leadingZ(d.getUTCDate());
    const month = [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ][d.getUTCMonth()];
    const year = d.getUTCFullYear();
    const hour = leadingZ(d.getUTCHours());
    const minute = leadingZ(d.getUTCMinutes());
    const second = leadingZ(d.getUTCSeconds());
    return `${dayName}, ${day} ${month} ${year} ${hour}:${minute}:${second} GMT`;
}

/**
 * Method of an HTTP message
 */
export type MessageMethod = "" | "GET" | "PUT" | "POST" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD";

/**
 * Named sets of caching headers for different caching strategies
 */
export type CacheType = "none";

/**
 * An HTTP message (request or response)
 */
export class Message {
    cookies: { [key: string]: string } = {};
    context: { [key: string]: Record<string, unknown> } = {};
    /**
     * 
     */
    depth = 0;
    conditionalMode = false; // whether the msg might be representing an error in conditional mode i.e. status 200, error in body
    authenticated = false;
    originator = '';
    internalPrivilege = false;
    url: Url;
    externalUrl: Url | null = null;
    user: IAuthUser | null = null;
    websocket: WebSocket | null = null;
    tenant: string;
    protected _status = 0;
    protected _data?: MessageBody;
    protected uninitiatedDataCopies: MessageBody[] = [];
    protected _headers: Record<string, string | string[]> = {};
    protected _nullMessage = false;
    
    private static pullName = new RegExp(/([; ]name=["'])(.*?)(["'])/);

    get headers(): Record<string, string | string[]> {
        const headersOut = {
            ...this._headers
        };

        // enforce that headers appropriate to the payload are used
        if (this.data?.mimeType) {
            headersOut['content-type'] = this.data?.mimeType;
        }
        if (!headersOut['content-type']) headersOut['content-type'] = 'text/plain';
        if (this.data?.size) {
            headersOut['content-length'] = this.data.size.toString();
        }
        if (this.data?.filename) {
            headersOut['content-disposition'] = `attachment; filename="${this.data.filename}"`;
        }
        if (this.data?.dateModified) {
            headersOut['last-modified'] = headerDate(this.data.dateModified);
        }
        return headersOut;
    }
    set headers(val: Record<string, string | string[]>) {
        const valLowerCase = Object.fromEntries(Object.entries(val).map(([k, v]) => [ k.toLowerCase(), v ]));
        this._headers = valLowerCase;
    }

    get schema(): string {
        const contentType = this.getHeader('content-type');
        if (contentType.includes("schema=")) {
            return upTo(after(contentType, 'schema="'), '"');
        } else {
            return '';
        }
    }

    get data(): MessageBody | undefined {
        return this._data;
    }
    set data(d: MessageBody | undefined) {
        this.cancelOldStream();
        this._data = d;
    }

    get status(): number {
        return this.data && this.data.statusCode > 0 ? this.data.statusCode : this._status;
    }
    set status(code: number) {
        this._status = code;
    }

    get ok(): boolean {
        return this.status < 400;
    }

    get isRedirect(): boolean {
        return 300 <= this.status && this.status < 400;
    }

    get isManageRequest(): boolean {
        const modeHdr = this.getHeader('X-Restspace-Request-Mode');
        return !!modeHdr && (modeHdr === 'manage');
    }

    get name(): string {
        const cd = this.getHeader('Content-Disposition');
        if (!cd) return '';
        const match = Message.pullName.exec(cd);
        return match && match[2] ? match[2] : '';
    }
    set name(name: string) {
        const cd = this.getHeader('Content-Disposition') as string;
        if (name === '') {
            this.removeHeader('Content-Disposition');
        } else if (cd) {
            this.setHeader('Content-Disposition',
                cd.replace(Message.pullName, `$1${name}$3`));
        } else {
            this.setHeader('Content-Disposition', `form-data; name="${name}"`);
        }
    }

    get host(): string {
        const host = this.getHeader('Host');
        return host || '';
    }

    get nullMessage(): boolean {
        return this._nullMessage;
    }
    set nullMessage(val: boolean) {
        this._nullMessage = val;
        if (val) this.data = undefined;
    }

    // private setMetadataFromHeaders(data: MessageBody) {
    //     if (this._headers['content-type'] && !data.mimeType) {
    //         data.setMimeType(this._headers['content-type'] as string);
    //     }
    //     if (this._headers['content-length'] && data.size === 0) {
    //         data.size = parseInt(this._headers['content-length'] as string);
    //     }
    //     if (this._headers['last-modified'] && !data.dateModified) {
    //         data.dateModified = new Date(this._headers['last-modified'] as string);
    //     }
    //     if (this._headers['content-disposition']?.includes('filename=') && !data.filename) {
    //         data.filename = upTo(after(this._headers['content-disposition'] as string, `filename="`), '"');
    //     }
    // }

    constructor(url: Url | string, public tenantOrContext: string | SimpleServiceContext, public method: MessageMethod = "GET", parent?: Message | null, headers?: Headers | { [key:string]: string | string[] }, data?: MessageBody) {
        this.url = (typeof url === 'string') ? new Url(url) : url;
        this.data = data;
        if (headers) {
            if (headers instanceof Headers) {
                for (const [key, val] of headers.entries()) this._headers[key.toLowerCase()] = val;
            } else {
                this.headers = headers;
            }
        }
        // handle forwards from reverse proxies which deal with https, we do the below
        // to get back the original request url scheme
        if (this.getHeader("x-forwarded-proto")) {
            this.url.scheme = this.getHeader("x-forwarded-proto") + '://';
        }

        //inherit tracing from parent or set up

        if (!parent) {
            const traceId = crypto.randomUUID().replace(/-/g, '');
            const spanId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
            this.setHeader('traceparent', `00-${traceId}-${spanId}-00`);
        } else if (parent instanceof Message) {
            const traceparent = parent.getHeader('traceparent');
            if (traceparent) {
                this.setHeader('traceparent', traceparent);
                const tracestate = parent.getHeader('tracestate');
                if (tracestate) this.setHeader('tracestate', tracestate);
            }
        } else if (typeof tenantOrContext !== 'string') {
            if (tenantOrContext.traceparent) {
                this.setHeader('traceparent', tenantOrContext.traceparent);
                if (tenantOrContext.tracestate) this.setHeader('tracestate', tenantOrContext.tracestate);
            }
        }

        if (typeof tenantOrContext === 'string') {
            this.tenant = tenantOrContext;
        } else {
            this.tenant = tenantOrContext.tenant;
        }

        const cookieStrings = ((this.headers['cookie'] as string) || '').split(';');
        this.cookies = cookieStrings ? cookieStrings.reduce((res, cookieString) => {
            const parts = cookieString.trim().split('=');
            res[parts[0]] = parts[1];
            return res;
        }, {} as { [ key: string]: string }) : {};
    }

    copy(withData = true): Message {
        const msg = new Message(this.url.copy(), this.tenant, this.method, this,
            { ...this._headers }, withData ? this.data : undefined);
        msg.externalUrl = this.externalUrl ? this.externalUrl.copy() : null;
        msg.depth = this.depth;
        msg.conditionalMode = this.conditionalMode;
        msg.authenticated = this.authenticated;
        msg.internalPrivilege = this.internalPrivilege;
        msg.user = this.user;
        msg.name = this.name;
        return msg.setStatus(this.status);
    }

    /** copies the messge's data, teeing it if it is a stream */
    copyWithData(): Message {
        const newMsg = this.copy();
        newMsg.data = this.data ? this.data.copy() : undefined;
        if (newMsg.data) this.uninitiatedDataCopies.push(newMsg.data);
        return newMsg;
    }

    setMetadataOn(msg: Message) {
        msg.externalUrl = this.externalUrl ? this.externalUrl.copy() : null;
        msg.depth = this.depth;
        msg.conditionalMode = this.conditionalMode;
        msg.authenticated = this.authenticated;
        msg.internalPrivilege = this.internalPrivilege;
        msg.user = this.user;
        msg.name = this.name;
        const traceparent = this.getHeader('traceparent');
        if (traceparent) msg.setHeader('traceparent', traceparent);
    }

    hasData(): boolean {
        return !!this.data && !!this.data.data;
    }

    headerCase(header: string): string {
        return header.split('-').map(part => part.substr(0, 1).toUpperCase() + part.substr(1).toLowerCase()).join('-');
    }

    private mapHeaders(msgHeaders: Record<string, string | string[]>, headers: Headers) {
        Object.entries(msgHeaders)
            .flatMap(([k, vs]) => Array.isArray(vs) ? vs.map(v => [k, v]) : [[k, vs]]) // expand multiple identical headers
            .forEach(([k, v]) => headers.set(this.headerCase(k), v));
        return headers;
    }

    private responseHeadersOnly(headers: Record<string, string | string[]>) {
        const isContentDispositionFormData = (k: string, v: string | string[]) =>
            k.toLowerCase() === 'content-disposition'
            && !Array.isArray(v)
            && v.startsWith('form-data');

        return Object.fromEntries(Object.entries(headers)
            .filter(([k, v]) => sendHeaders.indexOf(k.toLowerCase()) >= 0
                && !isContentDispositionFormData(k, v))
        );
    }

    private forbiddenHeaders = [
        "accept-charset",
        "accept-encoding",
        "access-control-request-headers",
        "access-control-request-method",
        "connection",
        "date",
        "dnt",
        "expect",
        "feature-policy",
        "host",
        "keep-alive",
        "origin",
        "referer",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
        "via"
    ]

    nonForbiddenHeaders() {
        const isForbidden = (h: string) => this.forbiddenHeaders.includes(h)
            || h.startsWith('proxy-')
            || h.startsWith('sec-')
            || (!this.data && h.startsWith('content-'));

        return Object.fromEntries(Object.entries(this.headers)
            .filter(([k, _]) => !isForbidden(k)));
    }

    responsify() {
        this.method = "";
        this.status = this.status || 200;
    }

    requestify() {
        this.status = 0;
    }

    toResponse() {
        const res = new Response(this.data?.data || undefined,
            {
                status: this.status || 200
            });
        this.mapHeaders(this.responseHeadersOnly(this.headers), res.headers);
        if (this.data) {
            res.headers.delete('content-length');
            //if (this.data.size) res.setHeader('Content-Length', this.data.size.toString());
        }
        res.headers.set('X-Powered-By', 'Restspace');
        return res;
    }

    toRequest() {
        if (this.data?.data instanceof ReadableStream) {
            if (this.data.data.locked) throw new Error("Can't convert locked stream to request, will fail");
        }
        let body = this.data?.data || undefined;
        if (this.method === "GET" || this.method === "HEAD") body = undefined;
        const req = new Request(this.url.toString(), {
            method: this.method,
            headers: this.mapHeaders(this.nonForbiddenHeaders(), new Headers()),
            body,
        });
        
        return req;
    }

    setStatus(status: number, message?: string): Message {
        if (message !== undefined) {
            this.setData(message, 'text/plain');
        }
        this.status = status;
        if (status >= 400) {
            // default caching for an error is none as error state may change in near future
            this.setCaching('none');
        }
        return this;
    }

    setCaching(caching: CacheType) {
        switch (caching) {
            case "none":
                this.setHeader("cache-control", "no-cache, no-store, must-revalidate");
                this.setHeader("Pragma", "no-cache");
                this.removeHeader('Expires');
                break;
        }
        return this;
    }

    getHeader(header: string): string {
        const hdr = this.headers[header.toLowerCase()];
        return Array.isArray(hdr) ? hdr[0] : hdr;
    }

    setHeader(header: string, value: string) {
        this._headers[header.toLowerCase()] = value; 
        return this;
    }

    removeHeader(header: string) {
        delete this._headers[header.toLowerCase()];
        return this;
    }

    async getParam(name: string, urlPosition = -1): Promise<any> {
        if (urlPosition > 0 && this.url.servicePathElements.length > urlPosition) {
            return this.url.servicePathElements[urlPosition];
        } else if (this.url.query[name]) {
            return this.url.query[name] || undefined;
        } if (this.data && isJson(this.data.mimeType)) {
            const json = (await this.data.asJson()) || {};
            return json[name];
        }
        return undefined;
    }

    /** Allows a service to set a redirect to be used later in a pipeline
     *  specifically, in the pre-pipeline before a service is invoked
     */
    setServiceRedirect(servicePath: string) {
        this.setHeader('X-Restspace-Service-Redirect', servicePath);
    }
    getServiceRedirect() {
        const redir = this.getHeader('X-Restspace-Service-Redirect')
        return redir;
    }
    /** Apply the service redirect set by an earlier service */
    applyServiceRedirect() {
        const redirServicePath = this.getServiceRedirect();
        if (redirServicePath) this.url.servicePath = redirServicePath;
    }

    getRequestRange(size: number) {
        const ranges = this.getHeader('Range');
        if (!ranges) return null;
        const parsed = parseRange(size, ranges, { combine: true });
        return parsed;
    }

    setRange(type: string, size: number, range?: { start: number, end: number }) {
        this.setHeader('Content-Range', type + ' ' + (range ? range.start + '-' + range.end : '*') + '/' + size);
        if (range && this.data) this.data.size = range.end - range.start + 1;
        return this;
    }

    getCookie(name: string): string | undefined {
        return this.cookies[name] === undefined ? undefined : decodeURIComponent(this.cookies[name]);
    }

    setCookie(name: string, value: string, options: CookieOptions) {
        let currSetCookie: string[] = this.headers['set-cookie'] as string[] || [];
        currSetCookie = currSetCookie.filter((sc) => !sc.startsWith(name + '='));
        this._headers['set-cookie'] = [ ...currSetCookie, `${name}=${encodeURIComponent(value)}${options}` ];
        return this;
    }

    deleteCookie(name: string) {
        this.setCookie(name, '', new CookieOptions({ expires: new Date(2000, 0, 1) }));
    }

    private cancelOldStream() {
        if (this.data?.data instanceof ReadableStream) {
            const self = this;
            (async (rs: ReadableStream) => {
                try {
                    if (rs !== self.data?.data) { // check rs is now not the data of this message
                        await rs.cancel('message body change'); // fire&forget promise
                    }
                } catch {}
            })(this.data.data);
        }
    }

    setData(data: string | ArrayBuffer | ReadableStream | null, mimeType: string) {
        this.cancelOldStream();
        if (data == null) {
            this.data = undefined;
            this.removeHeader("content-type");
            return this;
        } else if (typeof data === 'string') {
            this.data = new MessageBody(str2ab(data), mimeType);
        } else {
            this.data = new MessageBody(data, mimeType);
        }
        this._status = 0;
        this.conditionalMode = false;
        this.setHeader("content-type", mimeType);
        return this;
    }

    setText(data: string) {
        this.cancelOldStream();
        this.data = new MessageBody(str2ab(data), 'text/plain');
        this._status = 0;
        this.conditionalMode = false;
        return this;
    }

    setDataJson(value: any, mimeType?: string) {
        this._status = 0;
        this.conditionalMode = false;
        return this.setData(JSON.stringify(value), mimeType || 'application/json');
    }

    setDirectoryJson(value: any) {
        this.setDataJson(value);
        this.data?.setMimeType('inode/directory+json');
        return this;
    }

    setMethod(httpMethod: MessageMethod) {
        this.method = httpMethod;
        return this;
    }

    setUrl(url: Url | string) {
        if (typeof url === 'string') {
            this.url = Url.inheritingBase(this.url, url);
        } else {
            this.url = url;
        }
        return this;
    }

    setName(name: string) {
        this.name = name;
        return this;
    }

    setDateModified(dateModified: Date) {
        if (this.data) this.data.dateModified = dateModified;
        return this;
    }

    setNullMessage(isNullMessage: boolean) {
        this.nullMessage = isNullMessage;
        return this;
    }

    enterConditionalMode() {
        if (!this.ok) {
            const errorMsg = this.data && (this.data.data instanceof ArrayBuffer) ? ab2str(this.data.data) : '';
            this.conditionalMode = true;
            this.setDataJson({ _errorStatus: this.status, _errorMessage: errorMsg }).setStatus(200);
        }
        return this;
    }

    exitConditionalMode() {
        if (this?.data?.mimeType === 'application/json' && this?.data.data instanceof ArrayBuffer) {
            const str = ab2str(this.data.data);
            const err = str ? JSON.parse(str) : {};
            if (err && err['_errorStatus'] !== undefined && err['_errorMessage'] !== undefined) {
                this.setStatus(err['_errorStatus'] as number, err['_errorMessage'] as string);
            }
            this.conditionalMode = false;
        }
        return this;
    }

    callDown() {
        this.depth++;
        return this;
    }

    callUp() {
        this.depth--;
        return this;
    }

    startSpan(traceparent?: string, tracestate?: string) {
        if (!traceparent) traceparent = this.getHeader('traceparent');
        if (traceparent) {
            const traceParts = traceparent.split('-');
            const newSpanId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
            this.setHeader('traceparent', `${traceParts[0]}-${traceParts[1]}-${newSpanId}-00`);
            if (tracestate) this.setHeader('tracestate', tracestate);
        }
        return this;
    }

    loggerArgs() {
        let traceId = 'x'.repeat(32);
        let spanId = 'x'.repeat(16);
        const traceparent = this.getHeader('traceparent');
        if (traceparent) {
            const parts = traceparent.split('-');
            if (parts.length >= 3) {
                traceId = parts[1];
                spanId = parts[2];
            }
        }
        return [ this.tenant, this.user?.email || '?', traceId, spanId ];
    }

    async requestExternal(): Promise<Message> {
        let resp: Response;

        try {
            resp = await fetch(this.toRequest());
        } catch (err) {
            console.error(`External request failed: ${err}`);
            return this.setStatus(500, `External request fail: ${err}`);
        }
        const msgOut = Message.fromResponse(resp, this.tenant);
        msgOut.method = this.method; // slightly pointless
        msgOut.name = this.name;
        this.setMetadataOn(msgOut);
        return msgOut;
    }

    async divertToSpec(spec: string | string[], defaultMethod?: MessageMethod, effectiveUrl?: Url, inheritMethod?: MessageMethod, headers?: object): Promise<Message | Message[]> {
        if (Array.isArray(spec)) {
            const unflatMsgs = await Promise.all(spec.flatMap(stg => this.divertToSpec(stg, defaultMethod, effectiveUrl, inheritMethod, headers)));
            return unflatMsgs.flat(1) as Message[];
        }
        let obj = {};
        const hasData = (mimeType: string) => isJson(mimeType) || mimeType === 'application/x-www-form-urlencoded';
        // include object if there's data, it's json and it includes an object macro
        const specHasObjectMacro = spec.indexOf('${') >= 0 || spec.indexOf(' $this') >= 0;
        const specHasProperty = spec.split(' ').length === 3;
        if (this.data && this.data.mimeType && hasData(this.data.mimeType)
            && (specHasObjectMacro || specHasProperty)) {
            obj = await this.data.asJson();
        }
        const msgs = Message.fromSpec(spec, this.tenant, effectiveUrl || this.url, obj, defaultMethod, this.name, inheritMethod, headers);
        // TODO ensure data splitting works with streams
        (Array.isArray(msgs) ? msgs : [ msgs ]).forEach(msg => {
            msg.data = msg.data || this.data;
            msg._headers = { ...this._headers };
            msg.setStatus(this.status);
            this.setMetadataOn(msg);
        });
        return msgs;
    }

    redirect(url: Url, isTemporary?: boolean) {
        this.setStatus(isTemporary ? 302 : 301);
        this.setHeader('Location', url.toString());
        return this;
    }

    splitData(): AsyncQueue<Message> {
        const datas = new AsyncQueue<Message>();
        if (!this.data) {
            datas.close();
            return datas;
        }
        switch (this.data.mimeType) {
            default: {
                datas.enqueue(this);
                datas.close();
            }
        }
        return datas;
    }

    async validate(validator: ValidateFunction) {
        if (!this.data || !isJson(this.data.mimeType)) {
            validator.errors = [ {
                keyword: "",
                instancePath: "",
                schemaPath: "",
                params: {},
                message: "The body was not JSON"
            } as ErrorObject ];
            return false;
        }
        const json = await this.data.asJson();
        return validator(json);
    }

    /** Not proper HTTP/1.1 as body is always base 64 */
    toString() {
        const startLine = `${this.method} ${this.url.toString("absolute path")} HTTP/1.1`;
        const headers = Object.entries(this.headers).flatMap(([name, vals]) =>
            (Array.isArray(vals) ? vals : [ vals ]).map(val => `${name}: ${val}`));
        const body = this.data ? this.data.asStringSync() : '';
        return `${startLine}\r\n${headers.join("\r\n")}${body ? "\r\n\r\n" + body : ''}`;
    }

    async toUint8Array() {
        let startLine: string;
        if (this.method) {
            startLine = `${this.method} ${this.url.toString("absolute path")} HTTP/1.1`;
        } else {
            startLine = `HTTP/1.1 ${this.status} ${this.ok || !this.hasData ? "" : await this.data!.asString()}`;
        }
        const headers = Object.entries(this.headers).flatMap(([name, vals]) =>
            (Array.isArray(vals) ? vals : [ vals ]).map(val => `${name}: ${val}`));
        const hasBody = !!this.data?.data;
        const enc = new TextEncoder().encode(`${startLine}\r\n${headers.join("\r\n")}${hasBody ? "\r\n\r\n" : ""}`);
        if (this.data?.data) {
            const body = await this.data.asArrayBuffer();
            const res = new Uint8Array(enc.byteLength + body!.byteLength);
            res.set(enc, 0);
            res.set(new Uint8Array(body!), enc.byteLength);
            return res;
        } else {
            return enc;
        }
    }

    static fromRequest(req: Request, tenant: string) {
        const url = new Url(req.url);
        const msg = new Message(url, tenant, req.method as MessageMethod, null, req.headers, MessageBody.fromRequest(req) || undefined);
        const traceparent = req.headers.get('traceparent');
        if (traceparent) {
            msg.setHeader('traceparent', traceparent);
            const tracestate = req.headers.get('tracestate');
            if (tracestate) msg.setHeader('tracestate', tracestate);
        }
        return msg;
    }
 
    static fromResponse(resp: Response, tenant: string) {
        const msg = new Message(resp.url, tenant, "", null, resp.headers,
            resp.body
                ? new MessageBody(resp.body, resp.headers.get('content-type') || 'text/plain')
                : undefined);
        msg.setStatus(resp.status);
        const traceparent = resp.headers.get('traceparent');
        if (traceparent) {
            msg.setHeader('traceparent', traceparent);
            const tracestate = resp.headers.get('tracestate');
            if (tracestate) msg.setHeader('tracestate', tracestate);
        }
        return msg;
    }

    static fromUint8Array(arr: Uint8Array, tenant: string) {
        const decoder = new TextDecoder();
        const pullString = (arr: Uint8Array, start: number): [ string, number ] => {
            let pos = start;
            while (pos < arr.byteLength && (arr[pos] !== 13 && arr[pos] !== 10)) pos++;
            return [pos < arr.byteLength ? decoder.decode(arr.subarray(start, pos)) : '', pos + 2];
        };

        let [line, pos] = pullString(arr, 0);
        const initial = upTo(line, ' ');
        let msg: Message;
        if (initial === "HTTP/1.1") {
            const lastPart = after(line, ' ');
            const statusStr = upTo(lastPart, ' ');
            const statusMsg = after(lastPart, ' ');
            msg = new Message("/", tenant, "", null);
            msg.setStatus(parseInt(statusStr), statusMsg || undefined);
        } else {
            const firstPart = upToLast(line, ' ');
            const url = after(firstPart, ' ');
            msg = new Message(url, tenant, initial as MessageMethod, null);
        }
        while (line) {
            [line, pos] = pullString(arr, pos);
            if (!line) break;
            const headerParts = line.split(':');
            msg.setHeader(headerParts[0].trim(), headerParts[1].trim());
        }
        if (pos < arr.byteLength - 1 && msg.method) {
            const body = new Uint8Array(arr.subarray(pos)).buffer;
            const contentType = msg.getHeader('content-type');
            if (!contentType) throw new Error('Content-Type header not set');
            msg.setData(body, contentType);
        }

        return msg;
    }

    private static isMethod(method: string) {
        return [ "GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH", "$METHOD" ].includes(method);
    }


    /** A request spec is "[<method>] [<post data property>] <url>" */
    static fromSpec(spec: string, tenant: string, referenceUrl?: Url, data?: any, defaultMethod?: MessageMethod, name?: string, inheritMethod?: MessageMethod, headers?: object) {
        const parts = spec.trim().split(' ');
        let method = defaultMethod || 'GET' as MessageMethod;
        let url = '';
        let postData: any = null;
    
        if (!Message.isMethod(parts[0])) {
            url = spec.trim();
        } else {
            if (parts.length === 2 || parts[1].includes('/')) {
                // $METHOD indicates use the method inherited from an outer message
                method = parts[0] === '$METHOD' ? (inheritMethod || method) : parts[0] as MessageMethod;
                url = parts.slice(1).join(' ');
            } else if (data) {
                method = parts[0] === '$METHOD' ? (inheritMethod || method) : parts[0] as MessageMethod;
                const propertyPath = parts[1];
                if (propertyPath === '$this') {
                    postData = data;
                } else {
                    postData = getProp(data, propertyPath);
                }
                url = parts.slice(2).join(' ');
            } else {
                console.error('bad req spec: ' + spec);
                throw new Error('Bad request spec');
            }
        }
        if (referenceUrl || data) {
            const refUrl = referenceUrl || new Url('/');
            const urls = resolvePathPatternWithUrl(url, refUrl, data, name);
            if (Array.isArray(urls)) {
                return urls.map((url) => new Message(Url.inheritingBase(referenceUrl, url), tenant, method, null, { ...headers }, postData ? MessageBody.fromObject(postData) : undefined));
            }
            url = urls;
        }
        return new Message(Url.inheritingBase(referenceUrl, url), tenant, method, null, { ...headers }, postData ? MessageBody.fromObject(postData) : undefined);
    }
}