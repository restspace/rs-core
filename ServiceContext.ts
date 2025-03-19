import { IAdapter } from "./adapter/IAdapter.ts";
import { IServiceManifest } from "./IManifest.ts";
import { ITriggerServiceConfig, PrePost } from "./IServiceConfig.ts";
import { Message } from "./Message.ts";
import { PipelineSpec } from "./PipelineSpec.ts";
import { Url } from "./Url.ts";
import * as log from "https://deno.land/std@0.185.0/log/mod.ts";
import { Source } from "./Source.ts";
import { GenericFunction } from "https://deno.land/std@0.185.0/log/logger.ts";
import { BaseHandler } from "https://deno.land/std@0.185.0/log/handlers.ts";
import { MessageBody } from "./MessageBody.ts";
import { IDataAdapter } from "./adapter/IDataAdapter.ts";
import dayjs from "npm:dayjs"
import duration from "npm:dayjs/plugin/duration.js";

dayjs.extend(duration);

export type StateFunction = <T extends BaseStateClass>(cons: StateClass<T>, context: SimpleServiceContext, config: unknown) => Promise<T>;

export interface WrappedLogger {
    critical: <T>(msg: T extends GenericFunction ? never : T, ...args: unknown[]) => T;
    error: <T>(msg: T extends GenericFunction ? never : T, ...args: unknown[]) => T;
    warning: <T>(msg: T extends GenericFunction ? never : T, ...args: unknown[]) => T;
    info: <T>(msg: T extends GenericFunction ? never : T, ...args: unknown[]) => T;
    debug: <T>(msg: T extends GenericFunction ? never : T, ...args: unknown[]) => T;
    handlers: BaseHandler[];
}

export interface BaseContext {
    tenant: string;
    primaryDomain: string;  
    prePost?: PrePost;
    /**
     * Makes a request to the specified URL.
     * If source is provided, it will be used to determine the source of the request.
     */
    makeRequest: (msg: Message, source?: Source) => Promise<Message>;
    /**
     * Verifies that the response is a JSON object and returns the object.
     * If checkPath is provided, it will be used to check that the object has the specified property.
     * If the object is not a JSON object, or the property is not found, an error will be logged and 502 will be returned.
     */
    verifyJsonResponse: (msg: Message, checkPath?: string) => Promise<any>;
    /**
     * Verifies that the response is a MessageBody and returns the body.
     * If mimeType is provided, it will be used to check that the body has the specified MIME type.
     */
    verifyResponse: (msg: Message, mimeType?: string) => Promise<number | MessageBody>;
    runPipeline: (msg: Message, pipelineSpec: PipelineSpec, contextUrl?: Url, concurrencyLimit?: number) => Promise<Message>;
    logger: WrappedLogger;
    baseLogger: log.Logger;
    getAdapter: <T extends IAdapter>(url: string, config: unknown) => Promise<T>;
    makeProxyRequest?: (msg: Message) => Promise<Message>;
    state: StateFunction;
    metadataOnly?: boolean;
    traceparent?: string; // standard tracing header
    tracestate?: string; // standard tracing header
    user?: string;
    serviceName?: string;
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
    return [ context.tenant, context.serviceName, context.user || '?', traceId, spanId ];
}

export function createWrappedLogger(context: BaseContext): WrappedLogger {
    const critical = <T>(msg: T extends GenericFunction ? never : T, ...args: unknown[]) =>
        context.baseLogger.critical(msg, ...contextLoggerArgs(context), ...args);
    const error = <T>(msg: T extends GenericFunction ? never : T, ...args: unknown[]) =>
        context.baseLogger.error(msg, ...contextLoggerArgs(context), ...args);
    const warning = <T>(msg: T extends GenericFunction ? never : T, ...args: unknown[]) =>
        context.baseLogger.warning(msg, ...contextLoggerArgs(context), ...args);
    const info = <T>(msg: T extends GenericFunction ? never : T, ...args: unknown[]) =>
        context.baseLogger.info(msg, ...contextLoggerArgs(context), ...args);
    const debug = <T>(msg: T extends GenericFunction ? never : T, ...args: unknown[]) =>
        context.baseLogger.debug(msg, ...contextLoggerArgs(context), ...args);
    return {
        critical,
        error,
        warning,
        info,
        debug,
        handlers: context.baseLogger.handlers
    };
}

export interface SimpleServiceContext extends BaseContext {
    manifest: IServiceManifest;
}

export interface ServiceContext<TAdapter extends IAdapter> extends SimpleServiceContext {
    adapter: TAdapter;
}

export class BaseStateClass {
    constructor(public context: SimpleServiceContext, protected stateAdapter?: IDataAdapter) {
    }

    private storeKey(key: string) {
        return `${this.context.serviceName || ''}|${this.constructor.name}|${key}`;
    }

    protected async getStore(key: string) {
        if (!this.stateAdapter) {
            this.context.logger.warning('No state adapter found for %s while reading state', this.constructor.name);
            return 500;
        }
        return await this.stateAdapter?.readKey(`_state_${this.context.tenant}`, this.storeKey(key));
    }

    protected async setStore(key: string, value: any) {
        if (!this.stateAdapter) {
            this.context.logger.warning('No state adapter found for %s while writing state', this.constructor.name);
            return 500;
        }
        const storeVal = MessageBody.fromObject(value);
        return await this.stateAdapter?.writeKey(`_state_${this.context.tenant}`, this.storeKey(key), storeVal);
    }

    protected async deleteStore(key: string) {
        if (!this.stateAdapter) {
            this.context.logger.warning('No state adapter found for %s while deleting state', this.constructor.name);
            return 500;
        }
        return await this.stateAdapter?.deleteKey(`_state_${this.context.tenant}`, this.storeKey(key));
    }
    
    load(_context: BaseContext, _config: unknown) {
        return Promise.resolve();
    }

    unload(newState?: BaseStateClass) {
        return Promise.resolve();
    }
}

export class MultiStateClass<S extends BaseStateClass, C> extends BaseStateClass {
    states: Record<string, S> = {};

    substate(key: string, cons: new(context: SimpleServiceContext, stateAdapter?: IDataAdapter) => S, config: C) {
        if (!this.states[key]) {
            this.states[key] = new cons(this.context, this.stateAdapter);
        }
        return this.states[key];
    }
}

export interface ITimerConfig extends ITriggerServiceConfig {
    repeatDuration: string; // ISO 8601 duration
    maxRandomAdditionalMs: number;
    autoStart?: boolean;
}

export abstract class TimedActionState<TContext extends SimpleServiceContext = SimpleServiceContext> extends BaseStateClass {
    paused = false;
    ended = false;
    count = 0;
    timeout?: number;

    protected abstract action(context: TContext, config: ITimerConfig): Promise<void>;

    protected getNextRun(lastRun: any, config: ITimerConfig) {
        const repeatDuration = dayjs.duration(config.repeatDuration);
        const repeatMs = repeatDuration.asMilliseconds();
        const maxRandomAdditionalMs = config.maxRandomAdditionalMs || 0;
        const nextRun = lastRun.add(repeatMs + Math.floor(Math.random() * maxRandomAdditionalMs), "ms");
        return nextRun;
    }

    protected async runLoop(context: TContext, config: ITimerConfig) {
        let nextRun = this.getNextRun(dayjs(), config);
        if (!config.autoStart) this.paused = true;
        while (!this.ended) {
            const delayMs = nextRun.diff(dayjs(), "ms");
            await new Promise((resolve) => this.timeout = setTimeout(resolve, delayMs));
            if (!this.paused && !this.ended) {
                await this.action(context, config);
            }
            nextRun = this.getNextRun(nextRun, config);
        }
    }

    override async load(context: TContext, config: ITimerConfig) {
        this.runLoop(context, config);
        return Promise.resolve();
    }

    override async unload(_newState?: BaseStateClass | undefined): Promise<void> {
        this.ended = true;
        if (this.timeout) clearTimeout(this.timeout);
        return Promise.resolve();
    }
}

export type StateClass<T extends BaseStateClass> = new(context: SimpleServiceContext, stateAdapter?: IDataAdapter) => T;

export type AdapterContext = BaseContext;

export const nullState = <T>(_cons: new(context: SimpleServiceContext, stateAdapter: IDataAdapter) => T) => {
    throw new Error('State not set');
}