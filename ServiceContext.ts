import { IAdapter } from "./adapter/IAdapter.ts";
import { IServiceManifest } from "./IManifest.ts";
import { PrePost } from "./IServiceConfig.ts";
import { Message } from "./Message.ts";
import { PipelineSpec } from "./PipelineSpec.ts";
import { Url } from "./Url.ts";
import * as log from "std/log/mod.ts";
import { StateFunction } from "../rs-runtime/tenant.ts";
import { Externality } from "../rs-runtime/pipeline/pipelineStep.ts";

export interface SimpleServiceContext {
    tenant: string;
    prePost?: PrePost;
    makeRequest: (msg: Message, externality?: Externality) => Promise<Message>;
    runPipeline: (msg: Message, pipelineSpec: PipelineSpec, contextUrl?: Url, concurrencyLimit?: number) => Promise<Message>;
    logger: log.Logger;
    manifest: IServiceManifest;
    getAdapter: <T extends IAdapter>(url: string, config: unknown) => Promise<T>;
    makeProxyRequest?: (msg: Message) => Promise<Message>;
    state: StateFunction;
}

export interface ServiceContext<TAdapter extends IAdapter> extends SimpleServiceContext {
    adapter: TAdapter;
}

export class BaseStateClass {
    load(_context: SimpleServiceContext, _config: unknown) {
        return Promise.resolve();
    }
    unload() {
        return Promise.resolve();
    }
} 

export type StateClass<T extends BaseStateClass> = new() => T;

export type AdapterContext = Omit<SimpleServiceContext, "manifest">;

export const nullState = <T>(_cons: new() => T) => {
    throw new Error('State not set');
}