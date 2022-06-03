import { IAdapter } from "./adapter/IAdapter.ts";
import { IServiceManifest } from "./IManifest.ts";
import { PrePost } from "./IServiceConfig.ts";
import { Message } from "./Message.ts";
import { PipelineSpec } from "./PipelineSpec.ts";
import { Url } from "./Url.ts";
import * as log from "std/log/mod.ts";

export interface SimpleServiceContext {
    tenant: string;
    prePost?: PrePost;
    makeRequest: (msg: Message) => Promise<Message>;
    runPipeline: (msg: Message, pipelineSpec: PipelineSpec, contextUrl?: Url, concurrencyLimit?: number) => Promise<Message>;
    logger: log.Logger;
    manifest: IServiceManifest;
    getAdapter: <T extends IAdapter>(url: string, config: unknown) => Promise<T>;
    makeProxyRequest?: (msg: Message) => Promise<Message>;
}

export interface ServiceContext<TAdapter extends IAdapter> extends SimpleServiceContext {
    adapter: TAdapter;
}

export type AdapterContext = Omit<SimpleServiceContext, "manifest">;