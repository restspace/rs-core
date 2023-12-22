import { Url } from "../Url.ts";
import { IAdapter } from "./IAdapter.ts";

/**
 * Interface for template operations.
 * This adapter is used for injecting data into a text template.
 */
export interface ITemplateAdapter extends IAdapter {
    /**
     * Fills a template with data.
     * @param {any} data - The data to inject into the template.
     * @param {string} template - The template to fill as text.
     * @param {Url} url - The URL of the request in the context of which this adapter is used.
     * @returns {Promise<string>} - A promise that resolves to the filled template text.
     */
    fillTemplate(data: any, template: string, url: Url): Promise<string>;
}