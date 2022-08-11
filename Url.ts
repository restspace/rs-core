import { slashTrim, pathCombine, decodeURIComponentAndPlus, last, arrayEqual } from "./utility/utility.ts";
import { resolvePathPatternWithUrl } from "./PathPattern.ts";

export type QueryStringArgs = Record<string, string[]>;

/** Internal url class, note it does not accept relative urls (except site relative) as there is no context
 * for them
 */
export class Url {
    scheme = '';
    domain = '';
    fragment = '';
    isRelative = false;

    get path(): string {
        return (this.isRelative ? '' : '/') + this.pathElements.join('/') + (this.isDirectory && this.pathElements.length > 0 ? '/' : '');
    }
    set path(val: string) {
        this.pathElements = decodeURI(slashTrim(val)).split('/').filter(el => !!el);
        this._isDirectory = val.endsWith('/') || val === '';
    }
    pathElements: string[] = [];

    private _isDirectory = false;
    get isDirectory(): boolean {
        return this._isDirectory;
    }

    get resourceName(): string {
        return this._isDirectory ? '' : last(this.pathElements);
    }
    set resourceName(val: string) {
        let resName = val;
        const wasDirectory = this._isDirectory;
        if (val.endsWith('/')) {
            this._isDirectory = true;
            resName = val.slice(0, -1);
        } else {
            this._isDirectory = false;
        }
        if (wasDirectory) {
            this.pathElements.push(val);
        } else {
            this.pathElements[this.pathElements.length - 1] = resName;
        }
    }

    get resourcePath(): string {
        const resPathEls = this._isDirectory ? this.pathElements : this.pathElements.slice(0, -1);
        return '/' + resPathEls.join('/');
    }

    get resourceParts(): string[] {
        return this.resourceName.split('.');
    }

    get resourceExtension(): string {
        return (this.resourceParts.length > 1) ? last(this.resourceParts) : '';
    }

    query: QueryStringArgs = {};

    private encodeQueryValue(s: string) {
        //const enc = encodeURI(s);
        return s.replace('&', '%26').replace('=', '%3D').replace('#', '%23');
    }

    get queryString(): string {
        return Object.entries(this.query).flatMap(([key, vals]) =>
            vals.map(val => `${key}=${this.encodeQueryValue(val)}`)
        ).join('&') || '';
    }
    set queryString(qs: string) {
        this.query = !qs ? {} : qs.split('&').filter(part => !!part).reduce((res, queryPart) => {
            const [ key, val ] = queryPart.split('=');
            if (res[key]) {
                if (val) res[key].push(decodeURIComponentAndPlus(val));
            } else {
                res[key] = val ? [ decodeURIComponentAndPlus(val) ] : [];
            }
            return res;
        }, {} as QueryStringArgs);
    }

    basePathElementCount = 0;
    get basePathElements(): string[] {
        return this.pathElements.slice(0, this.basePathElementCount);
    }
    set basePathElements(els: string[]) {
        if (els.length <= this.pathElements.length && arrayEqual(els, this.pathElements.slice(0, els.length)))
            this.basePathElementCount = els.length;
        else
            this.basePathElementCount = 0;
    }

    get servicePath(): string {
        return this.servicePathElements.join('/') + (this.isDirectory ? '/' : '');
    }
    set servicePath(path: string) {
        this.pathElements = [ ...this.basePathElements, ...slashTrim(path).split('/') ];
        this._isDirectory = path.endsWith('/') || (this.pathElements.length === 0 && path === '');
    }

    get adapterPath(): string {
        return this.servicePath + ( this.queryString ? '?' + this.queryString : '' );
    }

    get servicePathElements(): string[] {
        return this.pathElements.slice(this.basePathElementCount);
    }

    subPathElementCount = 0;
    get subPathElements(): string[] {
        return this.pathElements.slice(-this.subPathElementCount);
    }
    set subPathElements(els: string[]) {
        if (els.length <= this.pathElements.length && arrayEqual(els, this.pathElements.slice(-els.length)))
            this.subPathElementCount = els.length;
        else
            this.subPathElementCount = 0;
    }

    get mainPathElementCount() {
        return this.pathElements.length - this.basePathElementCount - this.subPathElementCount;
    }
    set mainPathElementCount(count: number) {
        this.subPathElementCount = this.pathElements.length - this.basePathElementCount - count;
    }

    constructor(urlString?: string | Url) {
        if (!urlString) return;
        if (typeof urlString !== 'string') urlString = urlString.toString();

        const urlParse = urlString.match(Url.urlRegex);
        if (!urlParse) throw new Error('bad url');

        this.scheme = urlParse[2];
        this.domain = urlParse[3];
        this.isRelative = (!this.domain && urlParse[1] !== '/');
        this.path = urlParse[4];
        this._isDirectory = this.path.endsWith('/');
        const qs = urlParse[5];
        this.queryString = qs ? decodeURI(qs.substr(1)) : '';
        this.fragment = urlParse[6];
        this.fragment = this.fragment ? this.fragment.substr(1) : '';
    }

    hasBase(base: string) {
        return this.path.startsWith(base === '/' ? base : base + '/') || this.path === base;
    }

    copy() {
        const newUrl = new Url();
        newUrl.scheme = this.scheme;
        newUrl.domain = this.domain;
        newUrl.path = this.path;
        newUrl.queryString = this.queryString;
        newUrl.basePathElementCount = this.basePathElementCount;
        newUrl.subPathElementCount = this.subPathElementCount;
        newUrl.fragment = this.fragment;
        newUrl.isRelative = this.isRelative;

        return newUrl;
    }

    toString(mode: "absolute path" | "absolute url" = "absolute url") {
        const host = `${this.scheme || ''}${this.domain || ''}`;
        return `${this.isRelative || mode === "absolute path" ? '' : host}${this.path}${this.queryString ? '?' + this.queryString : ''}${this.fragment ? '#' + this.fragment : ''}`;
    }

    baseUrl() {
        return `${this.scheme || ''}${this.domain || ''}/${this.basePathElements.join('/')}`;
    }

    follow(relativeUrl: string) {
        const newUrl = this.copy();
        if (!relativeUrl) return newUrl;
        for (const part of relativeUrl.split('/')) {
            if (part === '..') {
                newUrl.pathElements.pop();
            } else if (part && part !== '.') {
                newUrl.pathElements.push(part);
            }
        }
        newUrl._isDirectory = relativeUrl.endsWith('/');
        return newUrl;
    }

    static urlRegex = /^((https?:\/\/)([^?#\/]+)|\/)?([^?#]*)(\?[^#]*)?(#.*)?$/;

    static fromPath(path: string): Url {
        return new Url(pathCombine('/', path));
    }

    static fromPathPattern(pathPattern: string, url: Url, obj?: Record<string, unknown>) {
        return new Url(resolvePathPatternWithUrl(pathPattern, url, obj) as string);
    }

    static inheritingBase(baseUrl: string | Url | undefined, url: string | Url) {
        const newUrl = new Url(url);
        if (baseUrl) {
            baseUrl = new Url(baseUrl);
            newUrl.scheme = newUrl.scheme || baseUrl.scheme;
            newUrl.domain = newUrl.domain || baseUrl.domain;
        }
        return newUrl;
    }
}