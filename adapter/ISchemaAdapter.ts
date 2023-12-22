import { ItemMetadata } from "../ItemMetadata.ts";
import { IAdapter } from "./IAdapter.ts";

/**
 * Adapter interface to read the schema of a dataset from a data store
 */
export interface IReadOnlySchemaAdapter extends IAdapter {
    /**
     * Gets the schema for the data in the dataset for a data store
	 * @param {string} dataset - The name of the dataset for which to fetch the schema
     * @returns {Promise<Record<string, unknown> | number} - the schema of the data in the dataset, or an HTTP status if error
     */
    readSchema(dataset: string): Promise<Record<string, unknown> | number>;
    /**
     * Gets the item metadata for the schema indicating whether it exists
     * @param {string} dataset - The name of the dataset for which to fetch the schema
     * @returns {Promise<ItemMetadata>} - The item metadata for the schema
     */
    checkSchema(dataset: string): Promise<ItemMetadata>;
    /**
     * Gets a content type for instances held in the dataset, including a the schema url
     * @param {string} dataset - The name of the dataset for which to fetch the schema
     * @param {string} baseUrl - The absolute url on which to base the schema url (often the url of the dataset root)
     * @returns {Promise<string>} - The content type for the dataset instances
     */
    instanceContentType(dataset: string, baseUrl: string): Promise<string>;
}

/**
 * Adapter which allows reading and writing of the schema of a dataset
 */
export interface ISchemaAdapter extends IReadOnlySchemaAdapter {
    /**
     * Writes the schema for the data in a dataset for a data store
     * @param {string} dataset - The name of the dataset for which to fetch the schema
     * @param {Record<string, unknown} schema - The schema to write to the dataset
     * @returns {Promise<number>} - HTTP status code for the operation
     */
    writeSchema(dataset: string, schema: Record<string, unknown>): Promise<number>;
}