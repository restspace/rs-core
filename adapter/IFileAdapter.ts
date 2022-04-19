import { MessageBody } from "../MessageBody.ts";
import { ItemMetadata } from "../ItemMetadata.ts";

export interface IFileAdapter {
    read: (path: string, extensions?: string[], startByte?: number, endByte?: number) => Promise<MessageBody>;
    readDirectory: (path: string, getUpdateTime?: boolean) => Promise<MessageBody>;
    write: (path: string, data: MessageBody, extensions?: string[]) => Promise<number>;
    delete: (path: string, extensions?: string[]) => Promise<number>;
    /** Won't delete subdirectories, or contained files other than those whose names end in deleteableFileSuffix */
    deleteDirectory: (path: string, deleteableFileSuffix?: string) => Promise<number>;
    check: (path: string, extensions?: string[]) => Promise<ItemMetadata>;
    extensions?: string[];
    canonicalisePath?: (path: string) => string;
    decanonicalisePath?: (canonPath: string) => string;
}