import { ItemMetadata } from "../ItemMetadata.ts";
import { IAdapter } from "./IAdapter.ts";

export interface IReadOnlySchemaAdapter extends IAdapter {
    readSchema(dataset: string): Promise<Record<string, unknown> | number>;
    checkSchema(dataset: string): Promise<ItemMetadata>;
    instanceContentType(dataset: string, baseUrl: string): Promise<string>;
}

export interface ISchemaAdapter extends IReadOnlySchemaAdapter {
    writeSchema(dataset: string, schema: Record<string, unknown>): Promise<number>;
}