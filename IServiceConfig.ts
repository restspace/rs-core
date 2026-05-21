import { PipelineSpec } from "./PipelineSpec.ts";

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>
type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

export type PrePost = "pre" | "post";

export interface RetryPolicy {
    enabled?: boolean;
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    jitter?: "none" | "full";
    retryMethods?: string[];
    retryStatuses?: number[];
    retryOnNetworkError?: boolean;
    respectRetryAfter?: boolean;
}

export interface IServiceConfig {
    name: string;
    description?: string;
    source: string;
    basePath: string;
    access: IAccessControl;
    caching?: ICacheControl;
    adapterSource?: string;
    infraName?: string;
    adapterConfig?: Record<string, unknown>;
    proxyAdapterConfig?: Record<string, unknown>;
    prePipeline?: PipelineSpec;
    postPipeline?: PipelineSpec;
    retry?: RetryPolicy;
    manifestConfig?: IConfigFromManifest;
    userUrlPattern?: string;
    datasetName?: string;
    schema?: Record<string, unknown>;
    store?: {
        infraName?: string;
        adapterConfig?: Record<string, unknown>;
    };
}

export interface ITriggerServiceConfig extends IServiceConfig {
    triggerUrl: string;
}

export type IChordServiceConfig = PartialBy<IServiceConfig, "access">;

// TODO: Need to distinguish read/write data and change script/code
export interface IAccessControl {
    readRoles: string;
    writeRoles: string;
    manageRoles?: string;
    createRoles?: string;
}

export interface ICacheControl {
    maxAge?: number;
    cache?: boolean;
    sendETag?: boolean;
}

export interface ManualMimeTypes {
	requestMimeType: string;
	requestSchema: Record<string, unknown>;
	responseMimeType: string;
	responseSchema: Record<string, unknown>;
}

export interface IConfigFromManifest {
    privateServiceConfigs?: Record<string, IServiceConfig>;
    prePipeline?: PipelineSpec;
    postPipeline?: PipelineSpec;
}

export interface IServiceConfigTemplate {
    name: string;
    description?: string;
    source: string;
    basePath: unknown;
    access: IAccessControl;
    caching?: ICacheControl;
    adapterSource?: string;
    infraName?: string;
    adapterConfig?: Record<string, unknown>;
    proxyAdapterConfig?: Record<string, unknown>;
    prePipeline?: PipelineSpec;
    postPipeline?: PipelineSpec;
    retry?: RetryPolicy;
}

export const schemaRetryPolicy = {
    "type": "object",
    "properties": {
        "enabled": { "type": "boolean", "description": "Whether retry is enabled. Defaults to true when a retry policy is present." },
        "maxAttempts": { "type": "number", "description": "Maximum attempts including the first try. Defaults to 1." },
        "baseDelayMs": { "type": "number", "description": "Initial backoff delay in milliseconds. Defaults to 250." },
        "maxDelayMs": { "type": "number", "description": "Maximum backoff delay in milliseconds. Defaults to 5000." },
        "backoffMultiplier": { "type": "number", "description": "Exponential backoff multiplier. Defaults to 2." },
        "jitter": { "type": "string", "enum": [ "none", "full" ], "description": "Jitter mode. Defaults to full." },
        "retryMethods": {
            "type": "array",
            "items": { "type": "string" },
            "description": "HTTP methods eligible for retry. Defaults to GET, HEAD, OPTIONS."
        },
        "retryStatuses": {
            "type": "array",
            "items": { "type": "number" },
            "description": "HTTP response statuses eligible for retry. Defaults to 408, 429, 500, 502, 503, 504."
        },
        "retryOnNetworkError": { "type": "boolean", "description": "Retry failed network requests. Defaults to true." },
        "respectRetryAfter": { "type": "boolean", "description": "Use Retry-After response headers when present. Defaults to true." }
    }
};

export const schemaIServiceConfig = {
    "$id": "http://restspace.io/services/serviceConfig",
    "definitions": {
        "pipeline": {
            "type": "array",
            "items": {
                "type": [ "string", "array", "object" ],
                "oneOf": [
                    { "title": "request", "type": "string" },
                    { "title": "subpipeline", "$ref": "#/definitions/pipeline" },
                    { "title": "transform", "type": "object" }
                ],
                "editor": "oneOfRadio"
            }
        }
    },
    "type": "object",
    "properties": {
        "name": { "type": "string" },
        "description": { "type": "string", "description": "Human-readable description of this configured service" },
        "source": { "type": "string", "description": "Url from which to request source code" },
        "basePath": { "type": "string", "description": "Base path prefixing all paths used by the service" },
        "access": { "type": "object",
            "properties": {
                "readRoles": { "type": "string" },
                "writeRoles": { "type": "string" },
                "manageRoles": { "type": "string" },
                "createRoles": { "type": "string" }
            },
            "required": [ "readRoles", "writeRoles" ]
        },
        "caching": { "type": "object",
            "properties": {
                "cache": { "type": "boolean" },
                "sendETag": { "type": "boolean" },
                "maxAge": { "type": "number" }
            }
        },
        "adapterSource": { "type": "string", "description": "Url from which to request adapter manifest" },
        "infraName": { "type": "string", "description": "Infrastructure adapter to use instead of an adapter source" },
        "adapterConfig": { "type": "object", "description": "Configuration for the adapter", "properties": {} },
        "proxyAdapterConfig": { "type": "object", "description": "Configuration for the proxy adapter", "properties": {} },
        "prePipeline": { "$ref": "#/definitions/pipeline" },
        "postPipeline": { "$ref": "#/definitions/pipeline" },
        "retry": schemaRetryPolicy
    },
    "required": [ "name", "source", "basePath", "access" ]
};

export const schemaIChordServiceConfig = {
    "$id": "https://restspace.io/chords/chordServiceConfig",
    "type": "object",
    "definitions": { ...schemaIServiceConfig.definitions },
    "properties": {
        ...schemaIServiceConfig.properties
    },
    "required": [ "name", "source", "basePath" ]
};

export const schemaIServiceConfigExposedProperties = [ "name", "description", "source", "basePath", "access", "caching", "adapterSource", "prePipeline", "postPipeline", "retry" ]; 
