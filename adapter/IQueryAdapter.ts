import { IAdapter } from "./IAdapter.ts";

export interface IQueryAdapter extends IAdapter { 
    runQuery: (query: string) => Promise<Record<string, unknown>[] | number>;
    quoteString: (s: string) => string;
}