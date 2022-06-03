import { IAdapter } from "./adapter/IAdapter.ts";
import { IProxyAdapter } from "./adapter/IProxyAdapter.ts";
import { DirDescriptor } from "./DirDescriptor.ts";
import { IServiceConfig } from "./IServiceConfig.ts";
import { Message, MessageMethod } from "./Message.ts";
import { resolvePathPatternWithUrl } from "./PathPattern.ts";
import { Service, ServiceFunction } from "./Service.ts";
import { transformation } from "./transformation/transformation.ts";
import { Url } from "./Url.ts";
import { pathCombine } from "./utility/utility.ts";

export type MapUrl = string | ((msg: Message) => string | [ Url, MessageMethod ]);
export type Transform<TConfig> = any | ((msg: Message, config: TConfig, json: any) => any);

// Tools for automating adding standard API patterns to a Service which wraps an underlying API

const applyMapUrl = (mapUrl: MapUrl, msg: Message, createTest?: (msg: Message) => boolean, createMapUrl?: MapUrl): [ string, MessageMethod ] | Message => {
	if (createTest && createMapUrl) {
		if (createTest(msg)) mapUrl = createMapUrl;
	}
	if (typeof mapUrl === 'string') {
		return [ resolvePathPatternWithUrl(mapUrl, msg.url) as string, msg.method ];
	} else {
		const mappedUrl = mapUrl(msg);
		if (typeof mappedUrl === 'string') return msg.setStatus(400, mappedUrl);
		const [ url, method ] = mappedUrl;
		return [ url.toString(), method ];
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

export interface BuildStoreParams<TAdapter extends IAdapter = IAdapter, TConfig extends IServiceConfig = IServiceConfig> {
	basePath: string;
	service: Service<TAdapter, TConfig>;
	schema: Record<string, unknown>;
	mapUrlRead?: MapUrl;
	mapUrlWrite?: MapUrl;
	mapUrlDelete?: MapUrl;
	createTest?: (msg: Message) => boolean;
	mapUrlCreate?: MapUrl;
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
 * @param {[ (msg: Message) => boolean, MapUrl ]} mapUrlCreate - Map the caleld url into the underlying API url for creation
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
	mapUrlDirectoryDelete,
	transformDirectory,
	transformRead,
	transformWrite
}: BuildStoreParams<TAdapter, TConfig>
) => {
	const schemaInstanceMime = (baseUrl: string) => {
		const schemaUrl = pathCombine(baseUrl, ".schema.json");
		return `application/json; schema="${schemaUrl}"`;
	};

	service.getPath(basePath + "/.schema.json", msg =>
		Promise.resolve(msg.setDataJson(schema, "application/schema+json")));

	service.getDirectoryPath(basePath, async (msg, context, config) => {
		const transformedUrl = applyMapUrl(mapUrlDirectoryDelete!, msg);
		if (transformedUrl instanceof Message) return transformedUrl;
		const [ url, method ] = transformedUrl;
		const reqMsg = new Message(url, context.tenant, method);
		const dirResp = await context.makeProxyRequest!(reqMsg);

		const dirJson = await applyTransform(transformDirectory, dirResp, config) as DirDescriptor | Message;
		if (dirJson instanceof Message) return dirJson;

		dirJson.path = msg.url.servicePath;
		// add in subdirectory paths already registered on the service
		dirJson.paths.push(...service.pathsAt(basePath));
		dirJson.spec = {
			pattern: "store",
			storeMimeTypes: [ schemaInstanceMime(msg.url.baseUrl()) ],
			createDirectory: false,
			createFiles: true
		};
		return msg.setDataJson(dirJson);
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
		const mappedUrl = applyMapUrl(mapUrl, msg, createTest, mapUrlCreate);
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
			if (!msg.data) return msg.setStatus(400, "No body in GET response");
			if (transformRead) {
				const json = await applyTransform(transformRead, msg, config);
				if (json instanceof Message) return json;
				reqMsg.setDataJson(json, "application/json");
			} else {
				const schemaUrl = pathCombine(msg.url.baseUrl(), basePath, ".schema.json");
				const mimeType = `application/json; schema="${schemaUrl}"`;
				reqMsg.setData(resp.data!.data, mimeType);
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