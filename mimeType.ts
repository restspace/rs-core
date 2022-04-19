import { extension, lookup } from "https://deno.land/x/media_types/mod.ts";

const textTypes = [
    "text/",
    "application/javascript",
    "application/xml",
    "application/xhtml+xml"
]

export const isJson = (mimeType: string | null | undefined) => !!mimeType && (mimeType.indexOf("/json") > 0 ||  mimeType.indexOf("+json") > 0 || mimeType === 'inode/directory');
export const isText = (mimeType: string | null | undefined) => !!mimeType && textTypes.some(tt => mimeType.startsWith(tt));
export const isZip = (mimeType: string | null | undefined) => !!mimeType && (mimeType.startsWith("application/") && mimeType.includes('zip'));
const multiExtensions: { [ mimeType: string]: string[] } = {
    'image/jpeg': [ 'jpg', 'jpeg' ]
}

const mappings: { [ mimeType: string]: string } = {
    "text/x.nunjucks": "njk"
}

export function getExtension(mimeType: string): string | undefined {
    if (mimeType.startsWith("application/schema-instance+json")
        || mimeType.startsWith("application/schema+json")) {
        return "json";
    }
    if (mappings[mimeType]) {
        return mappings[mimeType];
    }
    return extension(mimeType);
}

export function addExtension(resourceName: string, mimeType: string) {
    let ext = getExtension(mimeType);
    if (ext === null) return resourceName;
    ext = '.' + ext;
    return resourceName + (resourceName.endsWith(ext) ? '' : ext);
}

export function getExtensions(mimeType: string): string[] | undefined {
    if (multiExtensions[mimeType]) {
        return multiExtensions[mimeType]
    } else {
        const ext = extension(mimeType);
        return ext ? [ ext ] : undefined;
    }
}

/** return mime type of a path or an extension */
export function getType(path: string): string | null {
    let mimeType = lookup(path);
    if (mimeType) return mimeType;

    const ext = path.indexOf('.') >= 0 ? path.split(".").pop() as string : path;
    let [key, ] = Object.entries(mappings).find(([,value]) => value === ext) || [ null, null ];
    if (!key) [key, ] = Object.entries(multiExtensions).find(([,values]) => values.indexOf(ext) >= 0) || [ null, null ];
    return key;
}