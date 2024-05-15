import { getProp, slashTrim } from "./utility/utility.ts";
import { QueryStringArgs, Url } from "./Url.ts";
import { jsonPath } from "./jsonPath.ts";

function queryString(args?: QueryStringArgs) {
    return Object.entries((args || {}))
        .flatMap(([key, vals]) => vals.map(val => key + (val ? '=' + encodeURIComponent(val) : '')))
        .join('&');
}

function fullQueryString(args?: QueryStringArgs) {
    return args && Object.values(args).length !== 0 ? "?" + queryString(args) : '';
}

export function resolvePathPattern(pathPattern: string,
        currentPath: string, basePath?: string, subPath?: string, fullUrl?: string,
        query?: QueryStringArgs, name?: string, isDirectory?: boolean, decode?: boolean) {
    if (!pathPattern) return '';
    const getParts = (path?: string) => slashTrim(path || '')
        .split('/')
        .filter(part => part !== '')
        .map(part => decode ? decodeURIComponent(part) : part);
    const pathParts = getParts(currentPath);
    const basePathParts = getParts(basePath);
    const subPathParts = getParts(subPath);
    const fullPathParts = basePathParts.concat(pathParts);
    const nameParts = getParts(name);
    const getPartsMatch = (section: string, position0: string, position1: string) => {
        try {
            let parts = pathParts;
            if (section === 'B') parts = basePathParts;
            if (section === 'S') parts = subPathParts;
            if (section === 'N') parts = nameParts;
            if (section === 'P') parts = fullPathParts;
            let pos0 = parseInt(position0.substring(1));
            if (position0.startsWith('<')) pos0 = -pos0 - 1;
            let match: string | undefined = '';
            if (position1) {
                let pos1 = parseInt(position1.substr(1));
                if (position1.startsWith('<')) pos1 = -pos1 - 1;
                match = (pos1 === -1 ? parts.slice(pos0) : parts.slice(pos0, pos1 + 1)).join('/');
            } else {
                match = pos0 >= 0 ? parts[pos0] : parts[parts.length + pos0];
            }
            return match || '';
        } catch {
            return '';
        }
    }

    const result = pathPattern
        .replace('$*', currentPath + (isDirectory && !currentPath.endsWith('/') ? "/" : "") + fullQueryString(query))
        .replace('$$', encodeURIComponent(fullUrl || ''))
        .replace('$P*', fullPathParts.join('/') + (isDirectory ? "/" : "") + fullQueryString(query))
        .replace('$N*', name || '')
        .replace(/\$([BSNP])?([<>]\d+)([<>]\d+)?(:\((.+?)\)|:\$([BSNP])?([<>]\d+)([<>]\d+)?)?/g, (_match, p1, p2, p3, p4, p5, p6, p7, p8) => {
            const partsMatch = getPartsMatch(p1, p2, p3);
            if (partsMatch || !p4) return partsMatch || '$$';
            if (p4.startsWith(':(')) return p5;
            return getPartsMatch(p6, p7, p8) || '$$';
        })
        .replace(/\$\?(\*|\((.+?)\))/g, (_match, p1, p2) => {
            if (p1 === '*') return queryString(query);
            return (query?.[p2] || []).length === 0 ? '$$' : ((query || {})[p2] || []).join(',') || '$$'
        })
        .replace('/$$', '') // empty substitutions eat an immediately previous / to avoid unintentional double or trailing /
        .replace('$$', '');
    return result;
}

export function resolvePathPatternWithUrl(pathPattern: string, url: Url, obj?: object, name?: string, decode?: boolean) {
    if (obj) {
        return resolvePathPatternWithObject(pathPattern, obj, [], url.servicePath, url.basePathElements.join('/'), url.subPathElements.join('/'), url.toString(), url.query, name, url.isDirectory, decode);
    } else {
        return resolvePathPattern(pathPattern, url.servicePath, url.basePathElements.join('/'), url.subPathElements.join('/'), url.toString(), url.query, name, url.isDirectory, decode);
    }
}

// given a set of path segments (maybe previously multiplied) which all point to an aggregate value,
// create a new set of path segments following all paths into the aggregate value by adding the keys in
// the aggregate value to each of the starting path segments
function multiplyVariableSegments(currentSegments: string[], newSegment: string, sourceObject: any) {
    return currentSegments.flatMap((seg) => {
        const valAtSeg = seg ? getProp(sourceObject, seg) : sourceObject;
        return Object.keys(valAtSeg).map((key) => `${seg}[${key}]${newSegment}`);
    });
}

function resolvePathPatternWithObjectInner2(pathPattern: string, regex: RegExp, partialResolutions: string[], sourceObject: any, sourcePath: string[]): [ string[], boolean ] {
    const match = regex.exec(pathPattern);
    if (match) {
        const path = match[1];
        let substitutions = jsonPath(sourceObject, path);
        let isMultiplied = true;

        if (!Array.isArray(substitutions)) {
            substitutions = [ substitutions ];
            isMultiplied = false;
        }
        const newPartialResolutions = partialResolutions.flatMap((pr) =>
            substitutions.map((subs: any) => {
                if (subs === undefined || subs === null) {
                    throw new Error(`In path pattern ${pathPattern}, the data path '${path}' is not present in the data`);
                }
                if (typeof subs === 'object') {
                    throw new Error(`In path pattern ${pathPattern}, the data path '${path}' is an object`)
                }
                if (subs.toString() === '') {
                    throw new Error(`In path pattern ${pathPattern}, the data path '${path}' is an empty string`)
                }
                return pr.replace(new RegExp(regex.source), subs.toString());
            }));
        const [ prs, wasMultiplied ] = resolvePathPatternWithObjectInner2(pathPattern, regex, newPartialResolutions, sourceObject, sourcePath);
        return [ prs, wasMultiplied || isMultiplied ];
    } else {
        return [ partialResolutions, false ];
    }
}

export function resolvePathPatternWithObject(pathPattern: string, sourceObject: any, sourcePath: string[], currentPath: string, basePath?: string, subPath?: string, fullUrl?: string, query?: QueryStringArgs, name?: string, isDirectory?: boolean, decode?: boolean): string[] | string {
    const regex = /\${([^}]*)}/g;
    const partResolvedPattern = resolvePathPattern(pathPattern, currentPath, basePath, subPath, fullUrl, query, name, isDirectory, decode);
    const [ resolved, wasMultiplied ] = resolvePathPatternWithObjectInner2(partResolvedPattern, regex, [ partResolvedPattern ], sourceObject, sourcePath);
    return wasMultiplied ? resolved : resolved[0];
}