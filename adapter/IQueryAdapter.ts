import { IAdapter } from "./IAdapter.ts";

export interface IQueryAdapter extends IAdapter { 
    runQuery: (query: string, variables: Record<string, unknown>, take?: number, skip?: number) => Promise<Record<string, unknown>[] | number>;
    quote?: (obj: any) => string | Error;
}