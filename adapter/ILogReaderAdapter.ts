import { IAdapter } from "./IAdapter.ts";

/**
 * Adapter interface for performing actions on a log
 */
export interface ILogReaderAdapter extends IAdapter {
	/**
     * Gets the last lines from a log file
     * @param {number} nLines - The number of lines at the end of the file to fetch.
     * @param {(line: string) => boolean} filter - Optional filter function to apply to each line fetched
     * @returns {Promise<string[]>} - array of lines fetched
     */
	tail(nLines: number, filter?: (line: string) => boolean): Promise<string[]>
	/**
     * Fetches from the last lines in a log file, the lines which contain a search string
     * @param {number} maxLines - The maximum number of lines at the end of the file to fetch.
	 * @param {string} search - Only lines which contain the search string are fetched (case sensitive)
     * @returns {Promise<string[]>} - array of lines fetched
     */
	search(maxLines: number, search: string): Promise<string[]>
}