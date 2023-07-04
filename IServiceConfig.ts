import { PipelineSpec } from "./PipelineSpec.ts";

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>
type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

export type PrePost = "pre" | "post";

export interface IServiceConfig {
    name: string;
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
    manifestConfig?: IConfigFromManifest;
}

export interface ITriggerServiceConfig extends IServiceConfig {
    triggerUrl: string;
}

export type IChordServiceConfig = PartialBy<IServiceConfig, "access">;

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
}

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
        "postPipeline": { "$ref": "#/definitions/pipeline" }
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

export const schemaIServiceConfigExposedProperties = [ "name", "source", "basePath", "access", "caching", "adapterSource", "prePipeline", "postPipeline" ]; 