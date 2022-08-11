import { IAdapter } from "./adapter/IAdapter.ts";
import { IProxyAdapter } from "./adapter/IProxyAdapter.ts";
import { DirDescriptor, PathInfo } from "./DirDescriptor.ts";
import { IServiceConfig } from "./IServiceConfig.ts";
import { Message, MessageMethod } from "./Message.ts";
import { resolvePathPatternWithUrl } from "./PathPattern.ts";
import { Service, ServiceFunction } from "./Service.ts";
import { transformation } from "./transformation/transformation.ts";
import { Url } from "./Url.ts";
import { pathCombine, slashTrim, upToLast } from "./utility/utility.ts";

export type MapUrl = string | ((msg: Message) => string | [ string, MessageMethod ]);
export type Transform<TConfig> = any | ((msg: Message, config: TConfig, json: any) => any);

// Tools for automating adding standard API patterns to a Service which wraps an underlying API

const applyMapUrl = (mapUrl: MapUrl, msg: Message, config: IServiceConfig, createTest?: (msg: Message) => boolean, createMapUrl?: MapUrl): [ string, MessageMethod ] | Message => {
	if (createTest && createMapUrl) {
		if (createTest(msg)) mapUrl = createMapUrl;
	}
	if (typeof mapUrl === 'string') {
		return [ resolvePathPatternWithUrl(mapUrl, msg.url, config) as string, msg.method ];
	} else {
		const mappedUrl = mapUrl(msg);
		if (typeof mappedUrl === 'string') return msg.setStatus(400, mappedUrl);
		const [ url, method ] = mappedUrl;
		return [ resolvePathPatternWithUrl(url, msg.url, config) as string, method ];
	}
};

const applyTransform = async <TConfig extends IServiceConfig = IServiceConfig>(transform: Transform<TConfig>, resp: Message, config: TConfig) => {
	if (!resp.ok || !resp.data) return resp;
	const json = await resp.data.asJson();
	if (transform) {
		if (typeof transform == "function") {
			return transform(json, resp, config);
		} else {
			return transformation(transform, { json, config, resp }, resp.url);
		}
	} else {
		return await resp.data.asJson();
	}
}

const schemaInstanceMime = (url: Url) => {
	const schemaUrl = pathCombine(url.baseUrl(), upToLast(url.servicePath, '/'), ".schema.json");
	return `application/json; schema="${schemaUrl}"`;
};

export interface BuildDefaultDirectoryParams<TAdapter extends IAdapter = IAdapter, TConfig extends IServiceConfig = IServiceConfig> {
	basePath: string;
	service: Service<TAdapter, TConfig>;
}

/**
 * Build a default directory handler that lists only other registered subdirectories
 * @param {string} basePath - The base path of the handler relative to the base path of the service
 * @param {Service<TAdapter, TConfig>} service - The service to which to add the handler
 * */
 export const buildDefaultDirectory = <TAdapter extends IAdapter = IAdapter, TConfig extends IServiceConfig = IServiceConfig>({
	basePath,
	service
 }: BuildDefaultDirectoryParams<TAdapter, TConfig>
 ) => {
	service.getDirectoryPath(basePath, (msg) => {
		const dirJson = {
			path: msg.url.servicePath,
			// add in subdirectory paths already registered on the service
			paths: service.pathsAt(basePath),
			spec: {
				pattern: "view",
				respMimeType: "text/plain"
			}
		} as DirDescriptor;
		msg.setDataJson(dirJson);
		msg.data!.setIsDirectory();
		return Promise.resolve(msg);
	});
 }

export interface BuildStoreParams<TAdapter extends IAdapter = IAdapter, TConfig extends IServiceConfig = IServiceConfig> {
	basePath: string;
	service: Service<TAdapter, TConfig>;
	schema: Record<string, unknown>;
	mapUrlRead?: MapUrl;
	mapUrlWrite?: MapUrl;
	mapUrlDelete?: MapUrl;
	createTest?: (msg: Message) => boolean;
	mapUrlCreate?: MapUrl;
	mapUrlDirectoryRead?: MapUrl;
	mapUrlDirectoryDelete?: MapUrl;
	transformDirectory?: Transform<TConfig>;
	transformRead?: Transform<TConfig>;
	transformWrite?: Transform<TConfig>;
}

/**
 * Build a store pattern on a given base path of a service
 * @param {string} basePath - The base path of the store relative to the base path of the service
 * @param {Service<TAdapter, TConfig>} service - The service to which to add the store pattern
 * @param {Record<string, unknown>} schema - The schema of data stored
 * @param {MapUrl} mapUrlRead - Map the called url into the underlying API url for read
 * @param {MapUrl} mapUrlWrite - Map the called url into the underlying API url for write
 * @param {MapUrl} mapUrlDelete - Map the called url into the underlying API url for deletion
 * @param {[ (msg: Message) => boolean, MapUrl ]} mapUrlCreate - Map the called url into the underlying API url for creation
 * @param {MapUrl} mapUrlDirectoryRead - Map the called url into the underlying API url for reading a directory
 * @param {MapUrl} mapUrlDirectoryDelete - Map the called url into the underlying API url for directory deletion
 * @param {Transform<TConfig>} transformDirectory - Transform the directory list from the underlying API
 * @param {Transform<TConfig>} transformRead - Transform the read data from the underlying API
 * @param {Transform<TConfig>} transformWrite - Transform the incoming data for writing as appropriate for the underlying API
 * */
export const buildStore = <TAdapter extends IAdapter = IAdapter, TConfig extends IServiceConfig = IServiceConfig>({
	basePath,
	service,
	schema,
	mapUrlRead,
	mapUrlWrite,
	mapUrlDelete,
	createTest,
	mapUrlCreate,
	mapUrlDirectoryRead,
	mapUrlDirectoryDelete,
	transformDirectory,
	transformRead,
	transformWrite
}: BuildStoreParams<TAdapter, TConfig>
) => {
	service.getDirectoryPath(basePath, async (msg, context, config) => {
		if (!mapUrlDirectoryRead) return msg.setStatus(500, 'No mapping for directory read configured when building store');
		const transformedUrl = applyMapUrl(mapUrlDirectoryRead, msg, config);
		if (transformedUrl instanceof Message) return transformedUrl;
		const [ url, method ] = transformedUrl;
		const reqMsg = new Message(url, context.tenant, method);
		const dirResp = await context.makeProxyRequest!(reqMsg);

		const dirJson = await applyTransform(transformDirectory, dirResp, config) as DirDescriptor | Message;
		if (dirJson instanceof Message) return dirJson;

		dirJson.path = msg.url.servicePath;
		const dirPath = pathCombine(basePath, msg.url.servicePath);
		// add in subdirectory paths already registered on the service
		dirJson.paths.push(...service.pathsAt(dirPath));
		dirJson.spec = {
			pattern: "store",
			storeMimeTypes: [ schemaInstanceMime(msg.url) ],
			createDirectory: false,
			createFiles: true,
			exceptionMimeTypes: {
				"/.schema.json": [ "application/schema+json", "" ]
			}
		};
		msg.setDataJson(dirJson);
		msg.data!.setIsDirectory();
		return msg;
	});

	const mapPath: (mapUrl: MapUrl,
		transformRead: any,
		transformWrite: any,
		createTest?: (msg: Message) => boolean,
		mapUrlCreate?: MapUrl) => ServiceFunction<TAdapter, TConfig> = 
	(mapUrl: MapUrl,
		transformRead: any,
		transformWrite: any,
		createTest?: (msg: Message) => boolean,
		mapUrlCreate?: MapUrl) => async (msg, context, config) =>
	{
		// return schema from req for .schema.json on any resource path
		if (msg.url.resourceName === ".schema.json" && msg.method === "GET") {
			return msg.setDataJson(schema, "application/schema+json");
		}

		const mappedUrl = applyMapUrl(mapUrl, msg, config, createTest, mapUrlCreate);
		if (mappedUrl instanceof Message) return mappedUrl;
		const [ url, method ] = mappedUrl;
		const reqMsg = new Message(url, context.tenant, method);
		if (msg.method === "PUT" || msg.method === "POST") {
			if (!msg.data) return msg.setStatus(400, "No body in write operation");
			if (transformWrite) {
				let writeJson = await msg.data.asJson();
				writeJson = transformation(transformWrite, writeJson, msg.url);
				reqMsg.setDataJson(writeJson, "application/json");
			} else {
				reqMsg.setData(msg.data!.data, msg.data!.mimeType);
			}
		}
		const resp = await context.makeProxyRequest!(reqMsg);
		if (!resp.ok) {
			await resp.data?.ensureDataIsArrayBuffer();
			return resp;
		}
		if (msg.method === "GET") {
			if (!resp.data) return resp.setStatus(400, "No body in GET response");
			if (transformRead) {
				const json = await applyTransform(transformRead, resp, config);
				if (json instanceof Message) return json;
				resp.setDataJson(json, "application/json");
			} else {
				const mimeType = schemaInstanceMime(msg.url);
				resp.data.setMimeType(mimeType);
			}
		} else {
			resp.data = undefined;
		}
		return resp;
	};

	if (mapUrlRead) service.getPath(basePath, mapPath(mapUrlRead, transformRead, undefined));
	if (mapUrlWrite) service.putPath(basePath, mapPath(mapUrlWrite, undefined, transformWrite, createTest, mapUrlCreate));
	if (mapUrlDelete) service.deletePath(basePath, mapPath(mapUrlDelete, undefined, undefined));
	if (mapUrlDirectoryDelete) service.deleteDirectoryPath(basePath, mapPath(mapUrlDirectoryDelete, undefined, undefined));
}

export interface BuildStateMapParams<TData, TAdapter extends IAdapter = IAdapter, TConfig extends IServiceConfig = IServiceConfig> {
	basePath: string;
	service: Service<TAdapter, TConfig>;
	stateData: Record<string, TData>;
	readOnly?: boolean;
	schema: any;
}

export const buildStateMap = <TData, TAdapter extends IAdapter = IAdapter, TConfig extends IServiceConfig = IServiceConfig>({
	basePath,
	service,
	stateData,
	readOnly,
	schema
}: BuildStateMapParams<TData, TAdapter, TConfig>) => {
	service.getDirectoryPath(basePath, (msg) => {
		let dirJson: DirDescriptor;
		const ensureLeadingSlash = (s: string) => s.startsWith('/') ? s : '/' + s;

		const paths = Object.keys(stateData).map(key => [ ensureLeadingSlash(key) ] as PathInfo);
		if (readOnly === false) {
			dirJson = {
				path: msg.url.servicePath,
				paths,
				spec: {
					pattern: "store",
					storeMimeTypes: [ schemaInstanceMime(msg.url) ],
					createDirectory: false,
					createFiles: true,
					exceptionMimeTypes: {
						".json.schema": [ "application/schema+json", "" ]
					}
				}
			};
		} else {
			dirJson = {
				path: msg.url.servicePath,
				paths,
				spec: {
					pattern: "view",
					respMimeType: schemaInstanceMime(msg.url)
				}
			};
		}
		msg.setDataJson(dirJson);
		msg.data!.setIsDirectory();
		return Promise.resolve(msg);
	});

	service.getPath(basePath, (msg) => {
		if (msg.url.resourceName === ".schema.json" && msg.method === "GET") {
			return Promise.resolve(msg.setDataJson(schema, "application/schema+json"));
		}

		const val = stateData[msg.url.resourcePath] || stateData[slashTrim(msg.url.resourcePath)];
		if (!val) {
			return Promise.resolve(msg.setStatus(404, 'Not found'));
		} else {
			return Promise.resolve(msg.setDataJson(val, schemaInstanceMime(msg.url)));
		}
	});

	if (readOnly === false) {
		const writePath: ServiceFunction<TAdapter, TConfig> = (msg) => {
			if (!msg.data) return Promise.resolve(msg.setStatus(400, 'No data to write'));
			const item = stateData[msg.url.resourcePath] || stateData[slashTrim(msg.url.resourcePath)];
			if (!item) {
				return Promise.resolve(msg.setStatus(404, 'Not found'));
			} else {
				return Promise.resolve(msg.setDataJson(item, schemaInstanceMime(msg.url)));
			}
		}

		service.postPath(basePath, writePath);
		service.putPath(basePath, writePath);
	}
}