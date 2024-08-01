import { Validate } from "https://cdn.skypack.dev/@exodus/schemasafe?dts";

export function getErrors<T = unknown>(validator: Validate): string {
    return (validator.errors || []).map(e => `keyword: ${e.keywordLocation} instance: ${e.instanceLocation}`).join('; ');
}