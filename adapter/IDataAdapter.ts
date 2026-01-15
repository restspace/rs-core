import { PathInfo } from "../DirDescriptor.ts";
import { ItemMetadata } from "../ItemMetadata.ts";
import { MessageBody } from "../MessageBody.ts";
import { IAdapter } from "./IAdapter.ts";

/**
 * Filter for data-field authorization, used to filter records at the adapter level
 */
export interface DataFieldFilter {
    dataFieldName: string;
    userFieldValue: unknown;
}

/**
 * Extended adapter interface for adapters that support server-side data field filtering.
 * Adapters implementing this can efficiently filter records at the database level.
 */
export interface IDataFieldFilterableAdapter extends IDataAdapter {
    /** Whether this adapter supports server-side data field filtering */
    supportsDataFieldFiltering: boolean;

    /**
     * List dataset with data field filters applied at the database level
     * @param dataset the dataset name
     * @param filters the data field filters to apply
     * @param take maximum number of records
     * @param skip records to skip
     * @returns filtered records or error code
     */
    listDatasetWithFilter: (
        dataset: string,
        filters: DataFieldFilter[],
        take?: number,
        skip?: number
    ) => Promise<PathInfo[] | number>;
}

/**
 * The data adapter specifies an adapter which wraps a service which provides key-value storage of
 * JSON objects
 */
export interface IDataAdapter extends IAdapter { 
    /**
     * Read the json object with a given key
     * @param dataset the name of the dataset within which the key exists
     * @param key the string key of the data object
     * @returns either the data object or an http status error code
     */
    readKey: (dataset: string, key: string) => Promise<Record<string, unknown> | number>;
    /**
     * List all the keys in a given dataset with paging
     * @param dataset the name of the dataset whose keys will be listed
     * @param take the maximum number of keys to read
     * @param skip the number of keys to skip before starting to read
     * @returns keys in the dataset in the range specified by skip and take
     */
    listDataset: (dataset: string, take?: number, skip?: number) => Promise<PathInfo[] | number>;
    /**
     * Write a json data object to the given key in a dataset
     * @param dataset the dataset to write to
     * @param key the key within the dataset on which to store the data object (if undefined, the store generates the key)
     * @param data the data object
     * @returns an HTTP status code for any error or 200 for updated, 201 for created
     */
    writeKey: (dataset: string, key: string | undefined, data: MessageBody) => Promise<number>;
    /**
     * delete a key and it's data object
     * @param dataset delete from this dataset
     * @param key delete the object at this key
     * @returns an HTTP status code for any error or 0 for success
     */
    deleteKey: (dataset: string, key: string) => Promise<number>;
    deleteDataset: (dataset: string) => Promise<number>;
    checkKey: (dataset: string, key: string) => Promise<ItemMetadata>;
}