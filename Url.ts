import { resolvePathPatternWithUrl } from "./PathPattern.ts";
import { slashTrim, pathCombine, decodeURIComponentAndPlus, last, arrayEqual, pathToArray } from "./utility/utility.ts";

export type QueryStringArgs = Record<string, string[]>;

/** Internal url class, note it does not accept relative urls (except site relative) as there is no context
 * for them
 */
export class Url {
    scheme = '';
    domain = '';
    isRelative = false;

    private _fragment = '';
    get fragment(): string {
        return this._fragment || this.query['$fragment']?.[0] || '';
    }
    set fragment(val: string) {
        this._fragment = val;
    }

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
            vals.length == 0 ? [ key ] : vals.map(val => `${key}=${this.encodeQueryValue(val)}`)
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
        this.pathElements = [ ...this.basePathElements, ...pathToArray(path) ];
        this._isDirectory = path.endsWith('/') || (this.pathElements.length === 0 && path === '');
    }

    get adapterPath(): string {
        return this.servicePath + ( this.queryString ? '?' + this.queryString : '' );
    }

    get servicePathElements(): string[] {
        return this.pathElements.slice(this.basePathElementCount);
    }
    set servicePathElements(els: string[]) {
        this.pathElements = [ ...this.basePathElements, ...els ];
    }

    subPathElementCount = null as number | null;
    get subPathElements(): string[] {
        return this.subPathElementCount === null || this.subPathElementCount <= 0 ? [] : this.pathElements.slice(-this.subPathElementCount);
    }
    set subPathElements(els: string[]) {
        if (els.length <= this.pathElements.length && arrayEqual(els, els.length === 0 ? [] : this.pathElements.slice(-els.length)))
            this.subPathElementCount = els.length;
        else
            this.subPathElementCount = null;
    }

    get mainPathElementCount() {
        return this.pathElements.length - this.basePathElementCount - (this.subPathElementCount || 0);
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
        this.path = urlParse[4];
        this.isRelative = (!this.domain && urlParse[1] !== '/');
        this._isDirectory = this.path.endsWith('/');
        const qs = urlParse[5];
        this.queryString = qs ? qs.substring(1) : '';
        const frag = urlParse[6];
        this.fragment = frag ? frag.substring(1) : '';
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
        const nonLocalBasePathElements = this.basePathElements.filter(el => !el.startsWith('*'));
        return `${this.scheme || ''}${this.domain || ''}/${nonLocalBasePathElements.join('/')}`;
    }

    /** Sets the subpath url based on the provided servicePathUrl, which is an absolute or site-relative url
     * equal to the service path. If this is set to undefined, it indicates there's no subpath. If it's set to
     * the empty string, it means there is a subpath which is /.
     */
    setSubpathFromUrl(servicePathUrl: string | Url | undefined) {
        if (servicePathUrl === undefined) return;
        if (typeof servicePathUrl === 'string') {
            servicePathUrl = servicePathUrl ? new Url(servicePathUrl) : this;
        }
        this.subPathElementCount = this.pathElements.length - servicePathUrl.pathElements.length;
        return this;
    }

    follow(relativeUrl: Url | string) {
        const newUrl = this.copy();
        if (!relativeUrl) return newUrl;
        const followUrl = new Url(relativeUrl);
        if (!followUrl.isRelative) {
            if (!followUrl.domain) {
                followUrl.domain = this.domain;
                followUrl.scheme = this.scheme;
            }
            return followUrl;
        }
        for (const el of followUrl.pathElements) {
            if (el === '..') {
                newUrl.pathElements.pop();
            } else if (el && el !== '.') {
                newUrl.pathElements.push(el);
            }
        }
        if (!relativeUrl.toString().startsWith('#') && relativeUrl !== '.') {
            newUrl.queryString = followUrl.queryString;
        }
        if (relativeUrl !== '.') {
            newUrl.fragment = followUrl.fragment;
        }
        if (followUrl.pathElements.length > 0 && relativeUrl !== '.') {
            newUrl._isDirectory = followUrl._isDirectory;
        }
        return newUrl;
    }

    stripPrivateServices() {
        const newUrl = this.copy();
        newUrl.pathElements = newUrl.pathElements.filter(el => !el.startsWith('*'));
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