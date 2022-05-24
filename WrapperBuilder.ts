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

type TransformUrl = string | ((msg: Message) => string | [ Url, MessageMethod ]);

// Tools for automating adding standard API patterns to a Service which wraps an underlying API

const applyTransformUrl = (transformUrl: TransformUrl, msg: Message): [ string, MessageMethod ] | Message => {
	if (typeof transformUrl === 'string') {
		return [ resolvePathPatternWithUrl(transformUrl, msg.url) as string, msg.method ];
	} else {
		const transformedUrl = transformUrl(msg);
		if (typeof transformedUrl === 'string') return msg.setStatus(400, transformedUrl);
		const [ url, method ] = transformedUrl;
		return [ url.toString(), method ];
	}
};

/**
 * Build a store pattern on a given base path of a service
 * @param {string} basePath - The base path of the store relative to the base path of the service
 * @param {Service<TAdapter, TConfig>} service - The service to which to add the store pattern
 * @param {directory map} directoryMap - How to map a directory request onto the underlying API
 * @param {string} proxyAdapterSource - Location of a proxy adapter to preprocess requests to the underlying API
 * @param {Record<string, unknown>} schema - The schema of data stored
 * @param {TransformUrl} transformUrlRead - Transform the called url into the underlying API url for read
 * @param {TransformUrl} transformUrlWrite - Transform the called url into the underlying API url for write
 * @param {TransformUrl} transformUrlDelete - Transform the called url into the underlying API url for deletion
 * */
export const buildStore = <TAdapter extends IAdapter = IAdapter, TConfig extends IServiceConfig = IServiceConfig>(
	basePath: string,
	service: Service<TAdapter, TConfig>,
	directoryMap: { pathPattern: string, transform: any },
	proxyAdapterSource: string,
	schema: Record<string, unknown>,
	transformUrlRead: TransformUrl,
	transformUrlWrite: TransformUrl,
	transformUrlDelete: TransformUrl
) => {
	const schemaInstanceMime = (baseUrl: string) => {
		const schemaUrl = pathCombine(baseUrl, ".schema.json");
		return `application/json; schema="${schemaUrl}"`;
	};

	service.getPath(basePath + "/.schema.json", msg =>
		Promise.resolve(msg.setDataJson(schema, "application/schema+json")));

	service.getDirectoryPath(basePath, async (msg, context, config) => {
		const reqPath = resolvePathPatternWithUrl(directoryMap.pathPattern, msg.url) as string;
		let reqMsg = new Message(reqPath, context.tenant, "GET");
		const proxyAdapter = await context.getAdapter<IProxyAdapter>(proxyAdapterSource, config);
		reqMsg = await proxyAdapter.buildMessage(reqMsg);
		const dirResp = await context.makeRequest(reqMsg);
		if (!dirResp.ok || !dirResp.data) return dirResp;
		const dirJson = await dirResp.data.asJson();
		const outDirJson = transformation(directoryMap.transform, dirJson, msg.url) as DirDescriptor;
		outDirJson.path = msg.url.servicePath;
		outDirJson.paths.push(...service.pathsAt(basePath));
		outDirJson.spec = {
			pattern: "store",
			storeMimeTypes: [ schemaInstanceMime(msg.url.baseUrl()) ],
			createDirectory: false,
			createFiles: true
		};
		return msg;
	});

	const mapPath: (transformUrl: TransformUrl) => ServiceFunction<TAdapter, TConfig> = 
	(transformUrl: TransformUrl) => async (msg, context, config) => {
		const transformedUrl = applyTransformUrl(transformUrl, msg);
		if (transformedUrl instanceof Message) return transformedUrl;
		const [ url, method ] = transformedUrl;
		let reqMsg = new Message(url, context.tenant, method);
		const proxyAdapter = await context.getAdapter<IProxyAdapter>(proxyAdapterSource, config);
		reqMsg = await proxyAdapter.buildMessage(reqMsg);
		const resp = await context.makeRequest(reqMsg);
		if (!resp.ok) {
			await resp.data?.ensureDataIsArrayBuffer();
			return resp;
		}
		if (msg.method === "GET") {
			const schemaUrl = pathCombine(msg.url.baseUrl(), basePath, ".schema.json");
			resp.data!.mimeType = `application/json; schema="${schemaUrl}"`;
		} else {
			resp.data = undefined;
		}
		return resp;
	};

	service.getPath(basePath, mapPath(transformUrlRead));
	service.putPath(basePath, mapPath(transformUrlWrite));
	service.deletePath(basePath, mapPath(transformUrlDelete));
}