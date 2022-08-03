import { IAdapter } from "./adapter/IAdapter.ts";
import { IServiceManifest } from "./IManifest.ts";
import { PrePost } from "./IServiceConfig.ts";
import { Message } from "./Message.ts";
import { PipelineSpec } from "./PipelineSpec.ts";
import { Url } from "./Url.ts";
import * as log from "std/log/mod.ts";
import { StateFunction } from "../rs-runtime/tenant.ts";

export interface SimpleServiceContext {
    tenant: string;
    prePost?: PrePost;
    makeRequest: (msg: Message) => Promise<Message>;
    runPipeline: (msg: Message, pipelineSpec: PipelineSpec, contextUrl?: Url, concurrencyLimit?: number) => Promise<Message>;
    logger: log.Logger;
    manifest: IServiceManifest;
    getAdapter: <T extends IAdapter>(url: string, config: unknown) => Promise<T>;
    makeProxyRequest?: (msg: Message) => Promise<Message>;
    state?: StateFunction;
}

export interface ServiceContext<TAdapter extends IAdapter> extends SimpleServiceContext {
    adapter: TAdapter;
}

export interface IStateClass<T> {
    load(context: SimpleServiceContext, config: unknown): Promise<void>;
    unload(): Promise<void>;
}

export type StateClass<T extends IStateClass<T>> = new() => T;

export type AdapterContext = Omit<SimpleServiceContext, "manifest">;