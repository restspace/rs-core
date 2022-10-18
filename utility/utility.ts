import * as path from "std/path/mod.ts"

export function slashTrim(s: string): string {
    let start = 0;
    let end = s.length;
    if (s[start] === '/') start++;
    if (s[end - 1] === '/') end--;
    if (end <= start) return '';
    return s.substring(start, end);
}

export function slashTrimLeft(s: string): string {
    return s.startsWith('/') ? s.substr(1) : s;
}

export function pathToArray(path: string) {
    return slashTrim(path).split('/').filter(s => !!s);
}

export function getExtension(s: string): string {
    let extStart = s.lastIndexOf('.');
    return extStart < 0 ? '' : s.substr(extStart + 1);
}

export function getFirstLine(s: string): string {
    let lineEnd = s.indexOf('\n');
    if (lineEnd < 0) return s;
    if (lineEnd > 0 && s[lineEnd - 1] === '\r') lineEnd--;
    return s.substring(0, lineEnd);
}

export function getTailLines(s: string): string {
    return s.substring(s.indexOf('\n') + 1);
}

export function pathCombine(...args: string[]): string {
    const stripped = args.filter(a => !!a);
    if (stripped.length === 0) return '';
    const startSlash = stripped[0].startsWith('/');
    const endSlash = stripped[stripped.length - 1].endsWith('/');
    let joined = stripped.map(a => slashTrim(a)).filter(a => !!a).join('/');
    if (startSlash) joined = '/' + joined;
    if (endSlash && joined !== '/') joined += '/';
    return joined;
}

export function arrayToStringPath(path: string[]): string {
    const sPath = path.reduce((res, el) => isNaN(Number(el)) ? `${res}.${el}` : `${res}[${el}]`, '');
    return sPath.startsWith('.') ? sPath.substr(1) : sPath;
}

export function decodeURIComponentAndPlus(x: string): string {
    return decodeURIComponent(x.replace(/\+/g, '%20'));
}

/**
 * Given a string, a set of possible matches to search for and a start position, it will
 * find the first best occurence of a match and return the position of the beginning of the
 * match together with the string matched
 */
export function firstMatch(s: string, possMatches: string[], start: number, includePartial = false): [ number, string ] {
    const res = possMatches.reduce(([ bestPos, bestMatch ], match) => {
        let pos = s.indexOf(match, start);
        if (pos < 0 && includePartial) {
            pos = offsetMatch(s, match);
        }
        return (pos >= 0 && (pos < bestPos || bestPos < 0)) ? [ pos, match ] : [ bestPos, bestMatch ];
    }, [ -1, '' ]);
    return res as [ number, string];
}

export function offsetMatch(s: string, search: string): number {
    for (let i = 1; i < search.length; i++) {
        if (s.endsWith(search.substr(0, search.length - i + 1))) return s.length - search.length + i - 1;
    }
    return -1;
}

export function extractProperties(val: { [ key: string ]: any }, properties: string[]) {
    return properties.reduce((res, prop) => {
        res[prop] = val[prop];
        return res;
    }, {} as { [ key: string ]: any });
}

export function jsonQuote(s: string) {
    if (s == null || s.length == 0) {
        return "";
    }

    let sb = '';
    for (let i = 0; i < s.length; i++) {
        const c = s.charAt(i);
        switch (c) {
            case '\\':
            case '"':
                sb += '\\' + c;
                break;
            case '\b':
                sb += "\\b";
                break;
            case '\t':
                sb += "\\t";
                break;
            case '\n':
                sb += "\\n";
                break;
            case '\f':
                sb += "\\f"
                break;
            case '\r':
                sb += "\\r";
                break;
            default:
                if (c.charCodeAt(0) < ' '.charCodeAt(0)) {
                    const t = "000" + c.charCodeAt(0).toString(16);
                    sb += "\\u" + t.slice(-4);
                } else {
                    sb += c;
                }
        }
    }
    return sb;
}

export function matchRange(code: number, range: string) {
    const subParts = range.split(',');
    if (subParts.length > 1) {
        for (let part of subParts) {
            if (matchRange(code, part)) return true;
        }
        return false;
    }
    const rangeParts = range.split('-').map(s => parseInt(s));
    if (rangeParts.length > 1) {
        return rangeParts[0] <= code && code <= rangeParts[1];
    } else {
        return rangeParts[0] === code;
    }
}

export function last<T>(arr: ArrayLike<T>) {
    return arr[arr.length - 1];
}

export function arrayEqual<T>(arr0: ArrayLike<T>, arr1: ArrayLike<T>): boolean {
    if (arr0.length !== arr1.length) return false;
    for (let i = 0; i < arr0.length; i++) {
        if (arr0[i] !== arr1[i]) return false;
    }
    return true;
}

export function isObject(item: any) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}

export function arrayify<T>(item: null | undefined | T | T[]) {
    if (!item) return [] as T[];
    if (!Array.isArray(item)) return [ item ];
    return item;
}

export function hex2array(hex: string) {
    if (hex.length % 2 !== 0) throw new Error('hex string with uneven length');
    const arr = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length / 2; i++) {
        arr[i] = parseInt(hex.substring(i+i, i+i+2), 16);
    }
    return arr;
}

//
// like Object.assign only recursive/deep
//
export function mergeDeep(target: any, ...sources: Record<string, any>[]): any {
    if (!sources.length) return target;
    const source = sources.shift();

    if (isObject(target) && isObject(source)) {
        for (const key in source) {
            if (isObject(source[key])) {
                if (!target[key]) Object.assign(target, { [key]: {} });
                mergeDeep(target[key], source[key]);
            } else {
                Object.assign(target, { [key]: source[key] });
            }
        }
    }

    return mergeDeep(target, ...sources);
}

const strategies = [ 'replace', 'append', 'prepend', 'positional', 'id-replace', 'id-patch' ];

function removePatchConfig(patchData: any): any {
    if (Array.isArray(patchData)) {
        if (typeof patchData[0] === 'object' && '$strategy' in patchData[0] && strategies.includes(patchData[0].$strategy)) {
            patchData.shift();
        }
        
        return patchData.map((item: any) => removePatchConfig(item));
    } else if (typeof patchData === 'object') {
        return Object.fromEntries(
            Object.entries(patchData).map(([k, v]) => [ k, removePatchConfig(v) ]));
    } else {
        return patchData;
    }
}

export function patch(target: any, patchData: any) {
    if (Array.isArray(patchData)) {
        if (!Array.isArray(target)) return removePatchConfig(patchData);
        let strategy = "positional";
        let id = "";
        if (patchData[0]) {
            let config: any = null;
            if (typeof patchData[0] === 'object' && '$strategy' in patchData[0] && strategies.includes(patchData[0].$strategy)) {
                strategy = patchData[0].$strategy;
                config = patchData.shift();
            }
            if (config && '$id' in config && strategy.startsWith('id-')) {
                id = config.$id;
            }
        }

        switch (strategy) {
            case 'positional':
                for (let idx = 0; idx < patchData.length; idx++) {
                    if (idx < target.length) {
                        target[idx] = patch(target[idx], patchData[idx]);
                    } else {
                        target.push(removePatchConfig(patchData[idx]));
                    }
                }
                return target;
            case 'replace':
                return [ ...removePatchConfig(patchData) ];
            case 'append':
                patchData.forEach(val => target.push(removePatchConfig(val)));
                return target;
            case 'prepend': {
                for (let idx = patchData.length - 1; idx >= 0; idx--) {
                    target.unshift(removePatchConfig(patchData[idx]));
                }
                return target;
            }
            case 'id-replace': {
                const newList = [] as any[];
                patchData.forEach(val => {
                    if (val[id]) {
                        const targetItem = target.find(ti => ti[id] === val[id]);
                        if (targetItem) {
                            newList.push(patch(targetItem, val));
                        } else {
                            newList.push(removePatchConfig(val));
                        }
                    }
                });
                return newList;
            }
            case 'id-patch': {
                const newList = [ ...target ];
                patchData.forEach(val => {
                    if (val[id]) {
                        const targetIdx = newList.findIndex(nl => nl[id] === val[id]);
                        if (targetIdx >= 0) {
                            newList[targetIdx] = patch(newList[targetIdx], val);
                        } else {
                            newList.push(removePatchConfig(val));
                        }
                    }
                });
                return newList;
            }
        }
    } else if (typeof patchData === "object") {
        if (Array.isArray(target) || !(typeof target === "object")) return removePatchConfig(patchData);
        for (const prop in patchData) {
            if (target[prop]) {
                if (patchData[prop] === undefined) {
                    delete target[prop];
                } else {
                    target[prop] = patch(target[prop], patchData[prop]);
                }
            } else {
                target[prop] = removePatchConfig(patchData[prop]);
            }
        }
        return target;
    } else {
        return removePatchConfig(patchData);
    }
}

export function deepEqual(obj1: any, obj2: any) {

    if (obj1 === obj2) // it's just the same object. No need to compare.
        return true;

    if (isPrimitive(obj1) && isPrimitive(obj2)) // compare primitives
        return obj1 === obj2;

    if (Object.keys(obj1).length !== Object.keys(obj2).length)
        return false;

    // compare objects with same number of keys
    for (const key in obj1)
    {
        if (!(key in obj2)) return false; //other object doesn't have this prop
        if (!deepEqual(obj1[key], obj2[key])) return false;
    }

    return true;
}

export function deepEqualIfPresent(objSuper: any, objSub: any) {
    if (objSuper === objSub) // it's just the same object. No need to compare.
        return true;

    if (isPrimitive(objSuper) && isPrimitive(objSub)) // compare primitives
        return objSuper === objSub;

    if (Array.isArray(objSuper) && Array.isArray(objSub) && objSuper.length !== objSub.length)
        return false;

    for (const key in objSub)
    {
        if (!deepEqualIfPresent(objSuper[key], objSub[key])) return false;
    }

    return true;
}

//check if value is primitive
function isPrimitive(obj: any)
{
    return (obj !== Object(obj));
}

export function shallowCopy(value: any) {
    if (Array.isArray(value)) return [ ...value ];
    if (typeof value === 'object') return { ...value };
    return value;
}

export function getProp(object: any, path: string[] | string, defaultVal?: any): any {
    if (!Array.isArray(path)) path = path.toString().match(/[^.[\]]+/g) || [];
  
    if (!path.length) {
      return object === undefined ? defaultVal : object
    }
  
    return getProp(object[path.shift() as string], path, defaultVal)
}

export function deleteProp(object: any, path: string[] | string) {
    if (!path.length) return;
    const parent = getProp(object, path.slice(0, -1));
    if (parent === undefined) return;
    delete parent[path.slice(-1)[0]];
}

export const setProp = (obj: any, path: string[] | string, value: any): any => {
    if (Object(obj) !== obj) return obj; // When obj is not an object
    // If not yet an array, get the keys from the string-path
    if (!Array.isArray(path)) path = path.toString().match(/[^.[\]]+/g) || []; 
    path.slice(0,-1).reduce((a, c, i) => // Iterate all of them except the last one
         Object(a[c]) === a[c] // Does the key exist and is its value an object?
             // Yes: then follow that path
             ? a[c] 
             // No: create the key. Is the next key a potential array-index?
             : a[c] = /^\+?(0|[1-9]\d*)$/.test(path[i+1])
                   ? [] // Yes: assign a new array object
                   : {}, // No: assign a new plain object
         obj)[path[path.length-1]] = value; // Finally assign the value to the last key
    return obj; // Return the top-level object to allow chaining
};

export const resolveIfPath = (urlPath: string) => urlPath.startsWith('.') ? path.resolve(urlPath) : urlPath;

/** Starts scanning str at start to find the first match from searches. If multiple matches complete at the
 * same position in str, it prefers the one which is listed first in searches.
 */
export const scanFirst = (str: string, start: number, searches: string[]): [string, number] => {
    const matches: [number, number][] = [];
    for (let idx = start; idx < str.length; idx++) {
        for (let matchIdx = 0; matchIdx < matches.length; matchIdx++) {
            const [ srchIdx, pos ] = matches[matchIdx]
            if (searches[srchIdx][pos + 1] === str[idx]) {
                matches[matchIdx][1]++;
                if (pos + 2 === searches[srchIdx].length) {
                    return [searches[srchIdx], idx + 1];
                }
            } else {
                matches.splice(matchIdx, 1);
                matchIdx--;
            }
        }

        for (let srchIdx = 0; srchIdx < searches.length; srchIdx++) {
            if (searches[srchIdx][0] === str[idx]) {
                matches.push([srchIdx, 0]);
                if (1 === searches[srchIdx].length) {
                    return [searches[srchIdx], idx + 1];
                }
            }
        }
    }
    return [ "", -1 ];
}

type QuoteChars = "'" | "\"" | "`"

const scanCloseJsString = (str: string, start: number, quote: QuoteChars) => {
    const escaped = "\\" + quote;
    let [ match, pos] = [ escaped, start ];
    while (match === escaped) {
        [ match, pos ] = scanFirst(str, pos, [ escaped, quote ]);
    }
    return pos;
}

export const scanCloseJsBracket = (str: string, start: number, brackets: string) => {
    let [ match, pos ] = [ "", start ];
    const quotes = "'\"`";
    while (match !== brackets[1] && pos > 0) {
        [ match, pos ] = scanFirst(str, pos, [ brackets[0], brackets[1], ...quotes ]);
        if (quotes.includes(match) && pos > 0) {
            pos = scanCloseJsString(str, pos, match as QuoteChars);
        } else if (match === brackets[0]) {
            pos = scanCloseJsBracket(str, pos, brackets);
        }
    }
    return pos;
}

export const skipWhitespace = (str: string, start: number) => {
    let pos = start;
    while (' \t\n\r\v'.indexOf(str[pos]) > -1 && pos < str.length) pos++;
    return pos;
}

export const matchFirst = (str: string, start: number, matches: string[]): [ string, number ] => {
    if (matches.length === 0) return [ "", -1 ];
    const match = matches.find(m => str.startsWith(m, start));
    return match ? [ match, start + match.length ] : [ "", -1 ];
}

export const upTo = (str: string, match: string, start?: number) => {
    const pos = str.indexOf(match, start);
    return pos < 0 ? str.substring(start || 0) : str.substring(start || 0, pos);
}

export const upToLast = (str: string, match: string, end?: number) => {
    const pos = str.lastIndexOf(match, end);
    return pos < 0 ? str.substring(0, end || str.length) : str.substring(0, pos);
}

export const after = (str: string, match: string, start?: number) => {
    const pos = str.indexOf(match, start);
    return pos < 0 ? '' : str.substring(pos + match.length);
}

export const afterLast = (str: string, match: string, end?: number) => {
    const pos = str.lastIndexOf(match, end);
    return pos < 0 ? '' : str.substring(pos + match.length, end || str.length);
}

export const applyOrMap = <T>(data: T | T[], func: (item: T) => T) => {
    if (Array.isArray(data)) {
        return data.map(func);
    } else {
        return func(data);
    }
}