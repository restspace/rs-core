import { IAdapter } from "./adapter/IAdapter.ts";
import { IServiceManifest } from "./IManifest.ts";
import { PrePost } from "./IServiceConfig.ts";
import { Message } from "./Message.ts";
import { PipelineSpec } from "./PipelineSpec.ts";
import { Url } from "./Url.ts";
import * as log from "https://deno.land/std@0.185.0/log/mod.ts";
import { Source } from "./Source.ts";

export type StateFunction = <T extends BaseStateClass>(cons: StateClass<T>, context: BaseContext, config: unknown) => Promise<T>;

export interface BaseContext {
    tenant: string;
    primaryDomain: string;
    prePost?: PrePost;
    makeRequest: (msg: Message, source?: Source) => Promise<Message>;
    runPipeline: (msg: Message, pipelineSpec: PipelineSpec, contextUrl?: Url, concurrencyLimit?: number) => Promise<Message>;
    logger: log.Logger;
    getAdapter: <T extends IAdapter>(url: string, config: unknown) => Promise<T>;
    makeProxyRequest?: (msg: Message) => Promise<Message>;
    state: StateFunction;
    metadataOnly?: boolean;
    traceparent?: string; // standard tracing header
    tracestate?: string; // standard tracing header
    user?: string;
    registerAbortAction: (msg: Message, action: () => void) => void;
}

export function contextLoggerArgs(context: BaseContext) {
    let traceId = 'x'.repeat(32);
    let spanId = 'x'.repeat(16);
    const traceparent = context.traceparent;
    if (traceparent) {
        const parts = traceparent.split('-');
        if (parts.length >= 3) {
            traceId = parts[1];
            spanId = parts[2];
        }
    }
    return [ context.tenant, context.user || '?', traceId, spanId ];
}

export interface SimpleServiceContext extends BaseContext {
    manifest: IServiceManifest;
}

export interface ServiceContext<TAdapter extends IAdapter> extends SimpleServiceContext {
    adapter: TAdapter;
}

export class BaseStateClass {
    load(_context: BaseContext, _config: unknown) {
        return Promise.resolve();
    }
    unload(newState?: BaseStateClass) {
        return Promise.resolve();
    }
}

export class MultiStateClass<S extends BaseStateClass, C> extends BaseStateClass {
    states: Record<string, S> = {};

    substate(key: string, cons: new(config: C) => S, config: C) {
        if (!this.states[key]) {
            this.states[key] = new cons(config);
        }
        return this.states[key];
    }
}

export type StateClass<T extends BaseStateClass> = new() => T;

export type AdapterContext = BaseContext;

export const nullState = <T>(_cons: new() => T) => {
    throw new Error('State not set');
}