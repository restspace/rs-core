import { IAdapter } from "./IAdapter.ts";

export interface ITemplateAdapter extends IAdapter {
	fillTemplate(data: any, template: string): Promise<string>;
}