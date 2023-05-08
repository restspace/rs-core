import { IAdapter } from "./adapter/IAdapter.ts";
import { IServiceConfig } from "./IServiceConfig.ts";
import { Message } from "./Message.ts";
import { longestMatchingPath, PathMap } from "./PathMap.ts";
import { Url } from "./Url.ts";
import Ajv, { Schema } from "https://cdn.skypack.dev/ajv?dts";
import { getErrors } from "./utility/errors.ts";
import { BaseStateClass, ServiceContext } from "./ServiceContext.ts";
import { PathInfo } from "./DirDescriptor.ts";
import { IProxyAdapter } from "./adapter/IProxyAdapter.ts";
import { after } from "./utility/utility.ts";

export type ServiceFunction<TAdapter extends IAdapter = IAdapter, TConfig extends IServiceConfig = IServiceConfig> =
    (msg: Message, context: ServiceContext<TAdapter>, config: TConfig) => Message | Promise<Message>;

export enum AuthorizationType {
    none, read, write, create
}

const ajv = new Ajv({ allErrors: true, strictSchema: false, allowUnionTypes: true });

export class Service<TAdapter extends IAdapter = IAdapter, TConfig extends IServiceConfig = IServiceConfig> {
    /** Returns a Service which returns every message unchanged */
    static Identity = (new Service()).setMethodPath("all", "/", msg => Promise.resolve(msg));
    
    methodFuncs: { [ method: string ]: PathMap<ServiceFunction<TAdapter, TConfig>> } = {};
    schemas: { [ method: string ]: PathMap<Schema> } = {};
    initFunc: (context: ServiceContext<TAdapter>, config: TConfig, oldState?: BaseStateClass) => Promise<void> = () => Promise.resolve();

    /** Get a service function by the base url, preferring the longest matching url */
    funcByUrl(method: string, url: Url) : [ string[], ServiceFunction<TAdapter, TConfig> ] | undefined {
        const pathMap = this.methodFuncs[method];
        if (!pathMap) return undefined;
        const matchPath = longestMatchingPath(pathMap, url.servicePath);
        if (!matchPath) return undefined;
        const matchPathElements = matchPath.split('/').filter(el => !!el);
        return [ matchPathElements, pathMap[matchPath] ];
    }

    /** Service component definitions set up handlers at different base paths. This returns PathInfos for directory
     * listing which describe the paths we know exist because of registered handlers in a directory at the specified path
     */
    pathsAt(path: string) : PathInfo[] {
        if (!path.startsWith('/')) path = '/' + path;
        if (!path.endsWith('/')) path += '/';
        const paths: Set<string> = new Set<string>();
        const isMatch = (p: string) => {
            const rest = after(p, path);
            return rest && !rest.includes('/');
        }
        // scan all PathMaps for ones which exist in the directory at path parameter, create unique Set
        Object.values(this.methodFuncs)
            .forEach(pm =>
                Object.keys(pm)
                    .filter(p => isMatch(p))
                    .forEach(p => paths.add(p))
            );
        // convert to an array, adding a directory indicator (trailing /) if there's a getDirectory handler
        // registered for the path
        return Array.from(paths.values()).map(p => {
            const name = after(p, path);
            return Object.keys(this.methodFuncs["getDirectory"]).some(k => k === p)
            ? [ `${name}/` ]
            : [ name ] as PathInfo;
        });
    }

    /** Add custom updates to the ServiceContext which require the config or message headers to be available */
    enhanceContext(context: ServiceContext<TAdapter>, config: TConfig, msg?: Message): ServiceContext<TAdapter> {
        const proxyAdapterSource = context.manifest.proxyAdapterSource;
        if (proxyAdapterSource) {
            context.makeProxyRequest = async (msg: Message) => {
                const proxyAdapter = await context.getAdapter<IProxyAdapter>(proxyAdapterSource, config.proxyAdapterConfig || {});
                const proxyMsg = await proxyAdapter.buildMessage(msg);
                return await context.makeRequest(proxyMsg);
            };
        }
        context.traceparent = msg?.getHeader('traceparent') || undefined;
        context.tracestate = msg?.getHeader('tracestate') || undefined;
        return context;
    }

    /** This ServiceFunction handles any message with a url at or under this Service's configured base path by looking up the appropriate
     * registered ServiceFunction and forwarding to it
     */
    func: ServiceFunction<TAdapter, TConfig> = (msg: Message, context: ServiceContext<TAdapter>, config: TConfig) => {
        const method = msg.method.toLowerCase();
        const callMethodFunc = ([ matchPathElements, methodFunc ]: [ string[], ServiceFunction<TAdapter, TConfig> ],
            msg: Message, context: ServiceContext<TAdapter>, config: TConfig) => {
            msg.url.basePathElements = msg.url.basePathElements.concat(matchPathElements);
            const enhancedContext = this.enhanceContext(context, config, msg);
            return Promise.resolve(methodFunc(msg, enhancedContext, config));
        }

        if (method === 'options') return Promise.resolve(msg);
        if (msg.url.isDirectory) {
            const pathFunc = this.funcByUrl(method + 'Directory', msg.url);
            if (pathFunc) {
                return callMethodFunc(pathFunc, msg, context, config);
            }
        }
        let pathFunc = this.funcByUrl(method, msg.url);
        if (pathFunc) return callMethodFunc(pathFunc, msg, context, config);
        // default put is post with no returned body
        if (method === 'put' && this.methodFuncs['post'] && !context.manifest.isFilter) {
            pathFunc = this.funcByUrl('post', msg.url);
            if (!pathFunc) return Promise.resolve(msg.setStatus(404, 'Not found'));
            return callMethodFunc(pathFunc, msg, context, config).then(msg => {
                if (msg.data) msg.data = undefined;
                return msg;
            });
        }
        if (method === 'head') {
            pathFunc = this.funcByUrl('get', msg.url) || this.funcByUrl('all', msg.url);
            if (pathFunc) {
                return callMethodFunc(pathFunc, msg, context, config).then(msg => {
                    if (msg.data) msg.data = undefined;
                    return msg;
                });
            } else {
                return Promise.resolve(msg.setStatus(404, 'Not found'));
            }
        }
        if (this.methodFuncs['all']) {
            pathFunc = this.funcByUrl('all', msg.url);
            if (!pathFunc) return Promise.resolve(msg.setStatus(404, 'Not found'));
            return callMethodFunc(pathFunc, msg, context, config);
        }
        return Promise.resolve(context.manifest.isFilter
            ? msg
            : msg.setStatus(404, 'Not found')
        );
    }

    /** Override this to customise which configured role list applies for a given incoming message (generally by
     * looking at the HTTP method)
     */
    authType: (msg: Message) => Promise<AuthorizationType> = (msg: Message) => { // returns promise as overrides may need to be async
        switch (msg.method) {
            case "OPTIONS": return Promise.resolve(AuthorizationType.none);
            case "GET": case "HEAD": case "POST": return Promise.resolve(AuthorizationType.read);
            default: return Promise.resolve(AuthorizationType.write);
        }
    }

    setMethodPath(method: string, path: string, func: ServiceFunction<TAdapter, TConfig>, schema?: Schema) {
        if (!path.startsWith('/')) path = '/' + path;
        if (schema) {  
            const validator = ajv.compile(schema);
            const innerFunc = func;
            func = async (msg, context, config) => {
                if (!(await msg.validate(validator))) {
                    return msg.setStatus(400, getErrors(validator));
                } else {
                    return innerFunc(msg, context, config);
                }
            };
            if (this.schemas[method]) {
                this.schemas[method][path] = schema;
            } else {
                this.schemas[method] = { [path]: schema };
            }
        }
        if (this.methodFuncs[method]) {
            this.methodFuncs[method][path] = func;
        } else {
            this.methodFuncs[method] = { [path]: func };
        }
        return this;
    }

    /** Set the initialization function which will be called for every instance of this service created when a tenant starts up */
    initializer(initFunc: (context: ServiceContext<TAdapter>, config: TConfig, oldState?: BaseStateClass) => Promise<void>) {

        this.initFunc = (context: ServiceContext<TAdapter>, config: TConfig, oldState?: BaseStateClass) => {
            this.enhanceContext(context, config);
            return initFunc(context, config, oldState);
        };
    }

    /** Handle all GET method messages at or under the configured base path using the supplied ServiceFunction */
    get = (func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('get', '/', func);

    /** Handle GET method messages at or under the configured base path concatenated with the path parameter using the supplied ServiceFunction */
    getPath = (path: string, func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('get', path, func);

    /** Handle all GET method messages to a directory (i.e. url ends with '/') at or under the configured base path using the supplied ServiceFunction */
    getDirectory = (func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('getDirectory', '/', func);

    /** Handle GET method messages to a directory (i.e. url ends with '/') at or under the configured base path concatenated with the path parameter using the supplied ServiceFunction */
    getDirectoryPath = (path: string, func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('getDirectory', path, func);
    

    /** Handle all POST method messages at or under the configured base path using the supplied ServiceFunction */
    post = (func: ServiceFunction<TAdapter, TConfig>, schema?: Schema) => this.setMethodPath('post', '/', func, schema);

    /** Handle POST method messages at or under the configured base path concatenated with the path parameter using the supplied ServiceFunction */
    postPath = (path: string, func: ServiceFunction<TAdapter, TConfig>, schema?: Schema) => this.setMethodPath('post', path, func, schema);
    
    /** Handle all POST method messages to a directory (i.e. url ends with '/') at or under the configured base path using the supplied ServiceFunction */
    postDirectory = (func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('postDirectory', '/', func);

    /** Handle POST method messages to a directory (i.e. url ends with '/') at or under the configured base path concatenated with the path parameter using the supplied ServiceFunction */
    postDirectoryPath = (path: string, func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('postDirectory', path, func);


    /** Handle all PUT method messages at or under the configured base path using the supplied ServiceFunction */
    put = (func: ServiceFunction<TAdapter, TConfig>, schema?: Schema) => this.setMethodPath('put', '/', func, schema);

    /** Handle PUT method messages at or under the configured base path concatenated with the path parameter using the supplied ServiceFunction */
    putPath = (path: string, func: ServiceFunction<TAdapter, TConfig>, schema?: Schema) => this.setMethodPath('put', path, func, schema);

    /** Handle all PUT method messages to a directory (i.e. url ends with '/') at or under the configured base path using the supplied ServiceFunction */
    putDirectory = (func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('putDirectory', '/', func);

    /** Handle PUT method messages to a directory (i.e. url ends with '/') at or under the configured base path concatenated with the path parameter using the supplied ServiceFunction */
    putDirectoryPath = (path: string, func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('putDirectory', path, func);


    /** Handle all DELETE method messages at or under the configured base path using the supplied ServiceFunction */
    delete = (func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('delete', '/', func);

    /** Handle DELETE method messages at or under the configured base path concatenated with the path parameter using the supplied ServiceFunction */
    deletePath = (path: string, func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('delete', path, func);

    /** Handle all DELETE method messages to a directory (i.e. url ends with '/') at or under the configured base path using the supplied ServiceFunction */
    deleteDirectory = (func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('deleteDirectory', '/', func);

    /** Handle DELETE method messages to a directory (i.e. url ends with '/') at or under the configured base path concatenated with the path parameter using the supplied ServiceFunction */
    deleteDirectoryPath = (path: string, func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('deleteDirectory', path, func);


    /** Handle all PATCH method messages at or under the configured base path using the supplied ServiceFunction */
    patch = (func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('patch', '/', func);

    /** Handle PATCH method messages at or under the configured base path concatenated with the path parameter using the supplied ServiceFunction */
    patchPath = (path: string, func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('patch', path, func);


    /** Handle all messages at or under the configured base path using the supplied ServiceFunction */
    all = (func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('all', '/', func);

    /** Handle all messages at or under the configured base path concatenated with the path parameter using the supplied ServiceFunction */
    allPath = (path: string, func: ServiceFunction<TAdapter, TConfig>) => this.setMethodPath('all', path, func);
}

export class AuthService<TAdapter extends IAdapter = IAdapter, TConfig extends IServiceConfig = IServiceConfig> extends Service<TAdapter, TConfig> {
    setUser = (func: ServiceFunction<TAdapter, TConfig>) => {
        this.setUserFunc = func;
    }

    setUserFunc: ServiceFunction<TAdapter, TConfig> = (msg: Message) => Promise.resolve(msg);
}

export type MessageFunction = (msg: Message) => Promise<Message>;