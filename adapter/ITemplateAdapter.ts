import { Url } from "../Url.ts";
import { IAdapter } from "./IAdapter.ts";

export interface ITemplateAdapter extends IAdapter {
	fillTemplate(data: any, template: string, url: Url): Promise<string>;
}