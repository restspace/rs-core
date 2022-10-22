import { IAdapter } from "./IAdapter.ts";

export interface ILogReaderAdapter extends IAdapter {
	tail(nLines: number): Promise<string[]>
	search(maxLines: number, search: string): Promise<string[]>
}