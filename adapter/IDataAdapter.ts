import { PathInfo } from "../DirDescriptor.ts";
import { ItemMetadata } from "../ItemMetadata.ts";
import { MessageBody } from "../MessageBody.ts";
import { IAdapter } from "./IAdapter.ts";

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
     * @param key the key within the dataset on which to store the data object
     * @param data the data object
     * @returns an HTTP status code for any error or 0 for success
     */
    writeKey: (dataset: string, key: string, data: MessageBody) => Promise<number>;
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