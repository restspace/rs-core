export enum SameSiteValue {
    strict = "Strict",
    lax = "Lax",
    none = "None"
}
export class CookieOptions {
    expires?: Date;
    maxAge?: Number;
    domain?: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: SameSiteValue;

    constructor(obj: object) {
        obj && Object.assign(this, obj);
    }

    public toString(): string {
        const opts: string[] = [];
        if (this.expires) opts.push(`Expires=${this.expires.toUTCString()}`);
        if (this.maxAge) opts.push(`Max-Age=${this.maxAge}`);
        if (this.domain) opts.push(`Domain=${this.domain}`);
        opts.push(this.path ? `Path=${this.path}` : "Path=/"); // we default to the whole domain as the standard default is confusing
        if (this.secure) opts.push("Secure");
        if (this.httpOnly) opts.push("HttpOnly");
        if (this.sameSite) opts.push(`SameSite=${this.sameSite}`);
        return opts.length ? '; ' + opts.join('; ') : '';
    }
}