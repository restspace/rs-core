import { IAdapter } from "./adapter/IAdapter.ts";
import { IProxyAdapter } from "./adapter/IProxyAdapter.ts";
import { DirDescriptor, StoreSpec } from "./DirDescriptor.ts";
import { IServiceConfig } from "./IServiceConfig.ts";
import { Message } from "./Message.ts";
import { resolvePathPatternWithUrl } from "./PathPattern.ts";
import { Service } from "./Service.ts";
import { transformation } from "./transformation/transformation.ts";
import { pathCombine } from "./utility/utility.ts";

export const buildStore = <TAdapter extends IAdapter = IAdapter, TConfig extends IServiceConfig = IServiceConfig>(
	basePath: string,
	service: Service<TAdapter, TConfig>,
	directoryMap: { pathPattern: string, transform: Record<string, unknown> },
	proxyAdapterSource: string,
	schema: Record<string, unknown>
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
}