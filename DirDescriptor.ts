export type ApiPattern = "store" | "transform" | "storeTransform" | "view" | "operation" | "directory";

export interface StoreDetails {
    storeMimeTypes: string[],
    createDirectory: boolean,
    createFiles: boolean,
    exceptionMimeTypes?: Record<string, [ string, string ]>
}

export interface TransformDetails {
    reqMimeType: string,
    respMimeType: string
}

/**
 * A store is a directory which allows resources to be dynamically created and deleted.
 * PUT requests create resources, GET requests read the current value and DELETE requests delete the resource.
 */
export interface StoreSpec extends StoreDetails {
    pattern: "store"
}

/**
 * A transform is a resource which transforms data it receives via a POST request
 */
export interface TransformSpec extends TransformDetails {
    pattern: "transform"
}

/**
 * A store-transform is a directory where each resource defines a transform which
 * can be used to transform data sent to the resource via a POST request.
 */
export interface StoreTransformSpec extends StoreDetails, TransformDetails {
    pattern: "store-transform",
}

/**
 * A view is a resource which returns data to a GET request only
 */
export interface ViewSpec {
    pattern: "view",
    respMimeType: string
}

/**
 * An operation is a resource to which you POST or PUT data which takes an action but does not return data
 */
export interface OperationSpec {
    pattern: "operation",
    reqMimeType: string
}

/**
 * A directory is a directory which contains a number of fixed urls which are
 */
export interface DirectorySpec {
    pattern: "directory",
}

export type ApiSpec = StoreSpec | TransformSpec | StoreTransformSpec | ViewSpec | OperationSpec | DirectorySpec;

export type PathInfo = [ name: string, dateModified?: number, mimeType?: string, writeMimeType?: string ]
                       | [ name: string, dateModified?: number, spec?: ApiSpec ];

export interface DirDescriptor {
    path: string;
    paths: PathInfo[];
    spec?: ApiSpec;
}