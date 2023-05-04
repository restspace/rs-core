import { IServiceConfig, IServiceConfigTemplate } from "./IServiceConfig.ts";
import { PipelineSpec } from "./PipelineSpec.ts";

export interface IManifest {
    name: string;
    description: string;
    // Url or relative file path to module's .ts file
    moduleUrl?: string;
    // JSON Schema for configuration
    configSchema?: Record<string, unknown>;
    configTemplate?: IServiceConfigTemplate,
    defaults?: Partial<IServiceConfig>;
}

export interface IServiceManifest extends IManifest {
    apis?: string[];
    adapterInterface?: string;
    privateServices?: Record<string, IServiceConfigTemplate>;
    prePipeline?: PipelineSpec;
    postPipeline?: PipelineSpec;
    exposedConfigProperties?: string[];
    isFilter?: boolean; // whether service passes unhandled message unchanged rather than returning 404
    isTrigger?: boolean; // whether service has a triggerUrl config property and can initiate a request to this url
    proxyAdapterSource?: string;
}

export interface IAdapterManifest extends IManifest {
    adapterInterfaces: string[];
}