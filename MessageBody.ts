import { isJson, isText } from "./mimeType.ts";
import { decodeURIComponentAndPlus, getProp } from "./utility/utility.ts";
import { ab2b64, ab2str, str2ab } from "./utility/arrayBufferUtility.ts";
import { stripBom } from "https://deno.land/x/string/mod.ts";
import { readerFromStreamReader } from "https://deno.land/std@0.185.0/streams/reader_from_stream_reader.ts"
import { jsonPath } from "./jsonPath.ts";

export class MessageBody {
    statusCode = 0;
    wasMimeHandled = false;

    private _size?: number;
    /** Size of data in bytes */
    get size() {
        if (this.data instanceof ArrayBuffer) return this.data.byteLength;
        if (!this.data) return 0;
        return this._size || 0;
    }
    set size(newSize: number) {
        this._size = newSize;
    }

    get ok(): boolean {
        return this.statusCode === 0 || (200 <= this.statusCode) && (this.statusCode < 300);
    }

    get isStream(): boolean {
        return this.data instanceof ReadableStream;
    }

    constructor(public data: ArrayBuffer | ReadableStream<Uint8Array> | null, public mimeType: string = "text/plain", size?: number, public dateModified?: Date, public filename?: string) {
        this._size = size;
    }

    copy(): MessageBody {
        let newData = this.data;
        if (this.data && this.data instanceof ReadableStream) {
            [ this.data, newData ] = this.data.tee();
        }
        return new MessageBody(newData, this.mimeType, this.size, this.dateModified, this.filename);
    }

    private convertFormData() {
        if (this.data instanceof ArrayBuffer && this.mimeType === 'application/x-www-form-urlencoded') {
            const formData = ab2str(this.data);
            const lines = formData.split('&');
            const obj = lines.reduce((res, line) => {
                const parts = line.split('=');
                res[decodeURIComponentAndPlus(parts[0])] = parts.length < 2 ? null : decodeURIComponentAndPlus(parts[1]);
                return res;
            }, {} as any);
            this.data = str2ab(JSON.stringify(obj));
            this.mimeType = 'application/json';
        }
    }

    // MessageBody defers converting a stream to a ArrayBuffer until the last minute
    async ensureDataIsArrayBuffer() {
        if (!(this.data instanceof ArrayBuffer)) {
            if (!this.data) {
                const err = new Error('Resource does not exist') as any;
                err['statusCode'] = this.statusCode;
                throw err;
            }
            const resp = new Response(this.data);
            this.data = await resp.arrayBuffer();
        }
    }

    setMimeType(mimeType: string): MessageBody {
        this.mimeType = mimeType;
        return this;
    }

    setIsDirectory(): MessageBody {
        this.mimeType = 'inode/directory+json';
        return this;
    }

    get isDirectory(): boolean {
        return this.mimeType === 'inode/directory+json';
    }

    /** returns the body as an object parsed from the JSON for JSON bodies, or a string otherwise */
    async asJson() {
        if (this.data === null) return null;
        const str = await this.asString();
        if (isJson(this.mimeType)) {
            if (!str) return null;
            const obj = JSON.parse(str);
            return obj;
        } else {
            return str;
        }
    }

    async extractPathIfJson(path: string) {
        if (!isJson(this.mimeType)) return;
        const val = await this.asJson();
        this.data = str2ab(JSON.stringify(jsonPath(val, path)));
    }

    isTextual() {
        return isJson(this.mimeType) || isText(this.mimeType);
    }

    /** returns the body as a UTF8 string for text or json, otherwise base 64 encoded */
    async asString(): Promise<string | null> {
        if (this.data === null) return null;
        let enc = 'base64';
        let str: string;
        if (this.isTextual()) {
            str = ab2str((await this.asArrayBuffer()) as ArrayBuffer);
            return stripBom(str);
        }
        const buf = (await this.asArrayBuffer()) as ArrayBuffer; // this may change mimeType esp if form data
        if (this.isTextual()) enc = 'utf8';
        str = enc === 'base64' ? ab2b64(buf) : ab2str(buf);
        return stripBom(str); // we may get a byte-order-mark at the front of a UTF-8 string read from a file which needs to be stripped
    }

    asStringSync() {
        if (!(this.data instanceof ArrayBuffer)) return "";
        return this.isTextual() ? ab2str(this.data) : ab2b64(this.data);
    }

    async asArrayBuffer(): Promise<ArrayBuffer | null> {
        if (this.data === null) return null;
        await this.ensureDataIsArrayBuffer();
        this.convertFormData();
        return this.data as ArrayBuffer;
    }

    asReadable(): ReadableStream<Uint8Array> | null {
        if (this.data === null) return null;
        if (this.data instanceof ReadableStream) return this.data;
        return new Response(this.data).body;
    }

    asServerResponseBody(): Uint8Array | Deno.Reader | undefined {
        if (this.data === null) return undefined;
        if (this.data instanceof ReadableStream) return readerFromStreamReader(this.data.getReader());
        return new Uint8Array(this.data);
    }

    asAny(): Promise<any> {
        if (this.data === null) {
            return Promise.resolve(null);
        } else if (isJson(this.mimeType)) {
            return this.asJson();
        } else if (isText(this.mimeType)) {
            return this.asString();
        } else {
            return this.asArrayBuffer();
        }
    }

    // pipePromise(outStream: WritableStream): Promise<boolean> {
    //     if (this.statusCode === 404) {
    //         const err = new Error('Not found');
    //         err['code'] = 'ENOENT';
    //         return Promise.reject(err);
    //     }
    //     if (this.data === null) return Promise.reject(new Error('no data to pipe'));
    //     return new Promise<boolean>((resolve, reject) => {
    //         outStream.on('error', (err) => {
    //             reject(err);
    //         });
    //         if (!(this.data instanceof ArrayBuffer)) {
    //             const readStream = this.data as NodeJS.ReadableStream;
    //             readStream
    //                 .on('error', (err) => {
    //                     if (readStream['destroy']) readStream['destroy']();
    //                     reject(err);
    //                 }).on('end', () => {
    //                     resolve(true);
    //                 }).pipe(outStream);
    //         } else {
    //             outStream.end(this.data as ArrayBuffer, () => {
    //                 resolve(true);
    //             });
    //         }
    //     });
    // }

    static fromRequest(req: Request): MessageBody | null {
        const contentLength = req.headers.get('content-length');
        const size = contentLength != null ? parseInt(contentLength) : NaN;
        const contentType = req.headers.get('content-type') || 'application/octet-stream';
        return contentType && req.body
            ? new MessageBody(req.body, contentType, isNaN(size) ? undefined : size)
            : null;
    }

    static fromString(text: string): MessageBody {
        return new MessageBody(str2ab(text), 'text/plain');
    }

    static fromObject(obj: any): MessageBody {
        const msgBody = MessageBody.fromString(JSON.stringify(obj));
        msgBody.mimeType = 'application/json';
        return msgBody;
    }

    static fromError(statusCode: number, statusText?: string): MessageBody {
        const msgBody = MessageBody.fromString(statusText || '');
        msgBody.statusCode = statusCode;
        return msgBody;
    }
}