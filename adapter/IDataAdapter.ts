import { PathInfo } from "../DirDescriptor.ts";
import { ItemMetadata } from "../ItemMetadata.ts";
import { MessageBody } from "../MessageBody.ts";
import { IAdapter } from "./IAdapter.ts";

export interface IDataAdapter extends IAdapter { 
    readKey: (dataset: string, key: string) => Promise<Record<string, unknown> | number>;
    listDataset: (dataset: string) => Promise<PathInfo[] | number>;
    writeKey: (dataset: string, key: string, data: MessageBody) => Promise<number>;
    deleteKey: (dataset: string, key: string) => Promise<number>;
    deleteDataset: (dataset: string) => Promise<number>;
    checkKey: (dataset: string, key: string) => Promise<ItemMetadata>;
}