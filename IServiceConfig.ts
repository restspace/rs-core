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
}

export const schemaIServiceConfig = {
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
        "adapterConfig": { "type": "object", "description": "Configuration for the adapter", "properties": {} }
    },
    "required": [ "name", "source", "basePath", "access" ]
};

export const schemaIChordServiceConfig = {
    "type": "object",
    "properties": {
        ...schemaIServiceConfig.properties
    },
    "required": [ "name", "source", "basePath" ]
};

export const schemaIServiceConfigExposedProperties = [ "name", "source", "basePath", "access", "caching", "adapterSource" ]; 