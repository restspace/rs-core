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
import { SimpleServiceContext } from "./ServiceContext.ts";
import { jsonPath } from "./jsonPath.ts";

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
    "cross-origin-resource-policy",
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
    "x-total-count",
    "x-ua-compatible",
    "x-xss-protection"
];

export const httpStatusMessages: { [key: number]: string } = {
    // 1xx Informational
    100: "Continue",
    101: "Switching Protocols",
    102: "Processing",
    103: "Early Hints",

    // 2xx Success
    200: "OK",
    201: "Created", 
    202: "Accepted",
    203: "Non-Authoritative Information",
    204: "No Content",
    205: "Reset Content",
    206: "Partial Content",
    207: "Multi-Status",
    208: "Already Reported",
    226: "IM Used",

    // 3xx Redirection
    300: "Multiple Choices",
    301: "Moved Permanently",
    302: "Found",
    303: "See Other",
    304: "Not Modified",
    305: "Use Proxy",
    307: "Temporary Redirect",
    308: "Permanent Redirect",

    // 4xx Client Error
    400: "Bad Request",
    401: "Unauthorized",
    402: "Payment Required",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    406: "Not Acceptable",
    407: "Proxy Authentication Required",
    408: "Request Timeout",
    409: "Conflict",
    410: "Gone",
    411: "Length Required",
    412: "Precondition Failed",
    413: "Payload Too Large",
    414: "URI Too Long",
    415: "Unsupported Media Type",  
    416: "Range Not Satisfiable",
    417: "Expectation Failed",
    421: "Misdirected Request",
    422: "Unprocessable Entity",
    423: "Locked",
    424: "Failed Dependency",
    425: "Too Early",
    426: "Upgrade Required",
    428: "Precondition Required",
    429: "Too Many Requests",
    431: "Request Header Fields Too Large",
    451: "Unavailable For Legal Reasons",

    // 5xx Server Error
    500: "Internal Server Error",
    501: "Not Implemented",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
    505: "HTTP Version Not Supported",
    // 506: "Variant Also Negotiates",
    // 507: "Insufficient Storage",
    // 508: "Loop Detected",
};

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

interface TraceParentParts {
    traceId: string;
    parentId: string;
    traceFlags: string;
}

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
    private static hex = /^[0-9a-f]{2}$/;
    private static traceIdPattern = /^[0-9a-f]{32}$/;
    private static parentIdPattern = /^[0-9a-f]{16}$/;
    private static traceStateSimpleKey = /^[a-z0-9][a-z0-9_\-*/]{0,255}$/;
    private static traceStateTenantId = /^[a-z0-9][a-z0-9_\-*/]{0,240}$/;
    private static traceStateSystemId = /^[a-z][a-z0-9_\-*/]{0,13}$/;

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
        if (contentType?.includes("schema=")) {
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

    get traceId(): string {
        const traceparent = this.getHeader('traceparent') || '';
        return traceparent.split('-')[1] || '';
    }

    private static newTraceparent(traceFlags = '00') {
        const traceId = crypto.randomUUID().replace(/-/g, '');
        const spanId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
        return `00-${traceId}-${spanId}-${traceFlags}`;
    }

    private static sampledTraceFlags(traceFlags: string) {
        return (parseInt(traceFlags, 16) & 1).toString(16).padStart(2, '0');
    }

    private static parseTraceparent(traceparent?: string | null): TraceParentParts | null {
        if (!traceparent) return null;
        const version = traceparent.substring(0, 2);
        if (!Message.hex.test(version) || version === 'ff' || traceparent[2] !== '-') return null;

        if (version === '00') {
            const parts = traceparent.split('-');
            if (parts.length !== 4) return null;
            const [ , traceId, parentId, traceFlags ] = parts;
            if (!Message.traceIdPattern.test(traceId) || /^0{32}$/.test(traceId)) return null;
            if (!Message.parentIdPattern.test(parentId) || /^0{16}$/.test(parentId)) return null;
            if (!Message.hex.test(traceFlags)) return null;
            return { traceId, parentId, traceFlags: Message.sampledTraceFlags(traceFlags) };
        }

        if (traceparent.length < 55) return null;
        const traceId = traceparent.substring(3, 35);
        const parentId = traceparent.substring(36, 52);
        const traceFlags = traceparent.substring(53, 55);
        if (traceparent[35] !== '-' || traceparent[52] !== '-') return null;
        if (traceparent.length > 55 && traceparent[55] !== '-') return null;
        if (!Message.traceIdPattern.test(traceId) || /^0{32}$/.test(traceId)) return null;
        if (!Message.parentIdPattern.test(parentId) || /^0{16}$/.test(parentId)) return null;
        if (!Message.hex.test(traceFlags)) return null;
        return { traceId, parentId, traceFlags: Message.sampledTraceFlags(traceFlags) };
    }

    private static validTraceStateKey(key: string) {
        if (Message.traceStateSimpleKey.test(key)) return true;
        const parts = key.split('@');
        return parts.length === 2
            && Message.traceStateTenantId.test(parts[0])
            && Message.traceStateSystemId.test(parts[1]);
    }

    private static validTraceStateValue(value: string) {
        if (!value) return false;
        for (let i = 0; i < value.length; i++) {
            const charCode = value.charCodeAt(i);
            if (charCode < 0x20 || charCode > 0x7e || charCode === 0x2c || charCode === 0x3d) return false;
        }
        return value.charCodeAt(value.length - 1) !== 0x20;
    }

    private static sanitizeTracestate(tracestate?: string | null) {
        if (!tracestate) return undefined;
        const entries: string[] = [];
        const seen = new Set<string>();
        for (const rawEntry of tracestate.split(',')) {
            const entry = rawEntry.trim();
            if (!entry) continue;
            const equalsIndex = entry.indexOf('=');
            if (equalsIndex < 0) continue;
            const key = entry.substring(0, equalsIndex);
            const value = entry.substring(equalsIndex + 1);
            if (!Message.validTraceStateKey(key) || !Message.validTraceStateValue(value)) continue;
            if (seen.has(key)) continue;
            seen.add(key);
            entries.push(entry);
            if (entries.length === 32) break;
        }
        return entries.length ? entries.join(',') : undefined;
    }

    private static setTraceContext(msg: Message, traceparent?: string | null, tracestate?: string | null) {
        const trace = Message.parseTraceparent(traceparent);
        if (!trace) {
            msg.setHeader('traceparent', Message.newTraceparent());
            msg.removeHeader('tracestate');
            return;
        }

        msg.setHeader('traceparent', `00-${trace.traceId}-${trace.parentId}-${trace.traceFlags}`);
        const sanitizedTracestate = Message.sanitizeTracestate(tracestate);
        if (sanitizedTracestate) {
            msg.setHeader('tracestate', sanitizedTracestate);
        } else {
            msg.removeHeader('tracestate');
        }
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
            this.setHeader('traceparent', Message.newTraceparent());
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
        msg.cookies = { ...this.cookies };
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
        const tracestate = this.getHeader('tracestate');
        if (tracestate) {
            msg.setHeader('tracestate', tracestate);
        } else {
            msg.removeHeader('tracestate');
        }
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
            .forEach(([k, v]) => {
                const headerName = this.headerCase(k);
                if (k.toLowerCase() === "set-cookie") {
                    headers.append(headerName, v);
                } else {
                    headers.set(headerName, v);
                }
            });
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
            || ((!this.data || [ "GET", "HEAD" ].includes(this.method)) && h.startsWith('content-'));

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

    setStatus(status: number, message?: string | boolean): Message {
        if (typeof message === 'string') {
            this.setData(message, 'text/plain');
        } else if (message === true) {
            this.setData(httpStatusMessages[status], 'text/plain');
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

    getHeader(header: string): string | undefined {
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
        if (urlPosition >= 0 && this.url.servicePathElements.length > urlPosition) {
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
        const trace = Message.parseTraceparent(traceparent);
        if (trace) {
            const newSpanId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
            this.setHeader('traceparent', `00-${trace.traceId}-${newSpanId}-${trace.traceFlags}`);
            const sanitizedTracestate = Message.sanitizeTracestate(tracestate);
            if (sanitizedTracestate) this.setHeader('tracestate', sanitizedTracestate);
        }
        return this;
    }

    loggerArgs(service?: string) {
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
        return [ this.tenant, service || '?', this.user?.email || '?', traceId, spanId ];
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

    async divertToSpec(spec: string | string[], defaultMethod?: MessageMethod, effectiveUrl?: Url, inheritMethod?: MessageMethod, headers?: object, auxData?: Record<string, unknown>): Promise<Message | Message[]> {
        if (Array.isArray(spec)) {
            const unflatMsgs = await Promise.all(spec.flatMap(stg => this.divertToSpec(stg, defaultMethod, effectiveUrl, inheritMethod, headers, auxData)));

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
        const msgs = Message.fromSpec(spec, this.tenant, effectiveUrl || this.url, obj, defaultMethod, this.name, inheritMethod, headers, auxData);
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
        Message.setTraceContext(msg, req.headers.get('traceparent'), req.headers.get('tracestate'));
        return msg;
    }
 
    static fromResponse(resp: Response, tenant: string) {
        const msg = new Message(resp.url, tenant, "", null, resp.headers,
            resp.body
                ? new MessageBody(resp.body, resp.headers.get('content-type') || 'text/plain')
                : undefined);
        msg.setStatus(resp.status);
        Message.setTraceContext(msg, resp.headers.get('traceparent'), resp.headers.get('tracestate'));
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
    static fromSpec(spec: string, tenant: string, referenceUrl?: Url, data?: any, defaultMethod?: MessageMethod, name?: string, inheritMethod?: MessageMethod, headers?: object, auxData?: Record<string, unknown>) {
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
                    postData = jsonPath(data, propertyPath);
                }
                url = parts.slice(2).join(' ');
            } else {
                console.error('bad req spec: ' + spec);
                throw new Error('Bad request spec');
            }
        }
        if (referenceUrl || data) {
            const refUrl = referenceUrl || new Url('/');
            const urls = resolvePathPatternWithUrl(url, refUrl, data, name, undefined, auxData);
            if (Array.isArray(urls)) {
                return urls.map((url) => new Message(Url.inheritingBase(referenceUrl, url), tenant, method, null, { ...headers }, postData ? MessageBody.fromObject(postData) : undefined));
            }
            url = urls;
        }
        return new Message(Url.inheritingBase(referenceUrl, url), tenant, method, null, { ...headers }, postData ? MessageBody.fromObject(postData) : undefined);
    }
}

