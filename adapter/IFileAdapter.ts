import { MessageBody } from "../MessageBody.ts";
import { ItemMetadata } from "../ItemMetadata.ts";
import { IAdapter } from "./IAdapter.ts";

/**
 * Adapter interface for reading/writing files to a filesystem.
 */
export interface IFileAdapter extends IAdapter {
    /**
     * Reads a file from a path.
     * @param {string} path - The path of the file.
     * @param {string[]} [extensions] - The file extensions that can exist in this filesystem. The first extension is used if the file has no extension.
     * @param {number} [startByte] - The starting byte for reading.
     * @param {number} [endByte] - The ending byte for reading.
     * @returns {Promise<MessageBody>} - The content of the file.
     */
    read: (path: string, extensions?: string[], startByte?: number, endByte?: number) => Promise<MessageBody>;

    /**
     * Reads a directory.
     * @param {string} path - The path of the directory.
     * @param {boolean} [getUpdateTime] - Whether to get the update time of the directory.
     * @returns {Promise<MessageBody>} - Directory listing as an HTTP message body containing JSON of type PathInfo[].
     */
    readDirectory: (path: string, getUpdateTime?: boolean) => Promise<MessageBody>;

    /**
     * Writes a file.
     * @param {string} path - The path to write to.
     * @param {MessageBody} data - The data to write as an HTTP message body.
     * @param {string[]} [extensions] - The file extensions that can exist in this filesystem. The first extension is used if the file has no extension.
     * @returns {Promise<number>} - HTTP status code of the operation, 200 if success.
     */
    write: (path: string, data: MessageBody, extensions?: string[]) => Promise<number>;

    /**
     * Deletes a file.
     * @param {string} path - The path of the file to delete.
     * @param {string[]} [extensions] - The file extensions that can exist in this filesystem. The first extension is used if the file has no extension.
     * @returns {Promise<number>} - HTTP status code of the operation, 200 if success.
     */
    delete: (path: string, extensions?: string[]) => Promise<number>;

    /**
     * Deletes a directory. Will fail if it contains any files unless these files have the specified suffix.
     * @param {string} path - The path of the directory to delete.
     * @param {string} [deleteableFileSuffix] - The suffix of files that can be deleted.
     * @returns {Promise<number>} - HTTP status code of the operation, 200 if success.
     */
    deleteDirectory: (path: string, deleteableFileSuffix?: string) => Promise<number>;

    /**
     * Tells you if a file, directory or nothing exists at a specified path.
     * @param {string} path - The path of the file.
     * @param {string[]} [extensions] - The file extensions that can exist in this filesystem. The first extension is used if the file has no extension.
     * @returns {Promise<ItemMetadata>} - The metadata of the file or directory at the path, or empty metadata if nothing exists.
     */
    check: (path: string, extensions?: string[]) => Promise<ItemMetadata>;

    /**
     * Canonicalises a path to work with the underlying storage system. In some cases different path strings may have the same
     * canonical path, losing information.
     * @param {string} path - The path to canonicalise.
     * @returns {string} - The canonicalised path.
     */
    canonicalisePath?: (path: string) => string;

    /**
     * Decanonicalises a path. It's possible the decanoncialised path may not be the same as the original path.
     * @param {string} canonPath - The canonicalised path to decanonicalise.
     * @returns {string} - The decanonicalised path.
     */
    decanonicalisePath?: (canonPath: string) => string;
}