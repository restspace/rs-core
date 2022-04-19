import { ValidateFunction } from "https://cdn.skypack.dev/ajv?dts";

export function getErrors<T = unknown>(validator: ValidateFunction<T>): string {
    return (validator.errors || []).map(e => e.message).join('; ');
}