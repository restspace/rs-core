import { IAdapter } from "./IAdapter.ts";

/**
 * Adapter interface for sending a query to an external data store
 */
export interface IQueryAdapter extends IAdapter {
    /**
     * Runs a query specified in the external service's query language
     * @param {string} query - The query in the external service's query language
     * @param {Record<string, unknown>} variables - Variable values to be substituted into the query for the string ${<property Name>}
	 * @param {number?} take - The maximum number of query results to return
     * @param {number?} skip - Skip this number of query results before returning the first result
     * @returns {Promise<Record<string, unknown>[] | number>} - Array of query results or an HTTP status number if an error
     */
    runQuery: (query: string, variables: Record<string, unknown>, take?: number, skip?: number) => Promise<Record<string, unknown>[] | number>;
    /**
     * Prepares a variable value for substitution into the query string
     * @param {any} obj - The value to be injected
     * @returns {string | Error} - the string to be substituted into the query (or Error if a problem)
     */
    quote?: (obj: any) => string | Error;
}