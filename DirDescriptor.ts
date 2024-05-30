import { ManualMimeTypes } from "rs-core/IServiceConfig.ts";

export type StorePattern = "store" | "store-transform" | "store-view" | "store-operation" | "store-directory";
export type ApiPattern = StorePattern | "transform" | "view" | "operation" | "directory";

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

export interface ViewDetails {
    respMimeType: string
}

export interface OperationDetails {
    reqMimeType: string
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
export interface ViewSpec extends ViewDetails {
    pattern: "view"
}

export interface StoreViewSpec extends StoreDetails, ViewDetails {
    pattern: "store-view"
}

/**
 * An operation is a resource to which you POST or PUT data which takes an action but does not return data
 */
export interface OperationSpec extends OperationDetails {
    pattern: "operation"
}

export interface StoreOperationSpec extends StoreDetails, OperationDetails {
    pattern: "store-operation"
}

/**
 * A directory is a directory which contains a number of fixed urls which are
 */
export interface DirectorySpec {
    pattern: "directory",
}

export interface StoreDirectorySpec extends StoreDetails {
    pattern: "store-directory"
}

export type AnyStoreSpec = StoreSpec | StoreTransformSpec | StoreViewSpec | StoreOperationSpec | StoreDirectorySpec;

export type ApiSpec = AnyStoreSpec | TransformSpec
    | ViewSpec
    | OperationSpec
    | DirectorySpec;

export type PathInfo = [ name: string, dateModified?: number, mimeType?: string, writeMimeType?: string ]
                       | [ name: string, dateModified?: number, spec?: ApiSpec ];

export interface DirDescriptor {
    path: string;
    paths: PathInfo[];
    spec?: ApiSpec;
}

export const storeDescriptor = (storePattern: StorePattern, createDirectory: boolean, createFiles: boolean, storeMimeTypes: string[], transformMimeTypes?: ManualMimeTypes) => {
    let spec: AnyStoreSpec;
    const storeProps = {
        storeMimeTypes,
        createDirectory,
        createFiles
    };
    switch (storePattern) {
        case "store-transform":
            spec = {
                pattern: "store-transform",
                ...storeProps,
                reqMimeType: transformMimeTypes?.requestMimeType,
                respMimeType: transformMimeTypes?.responseMimeType
            } as StoreTransformSpec;
            break;
        case "store-directory":
            spec = {
                pattern: "store-directory",
                ...storeProps
            } as StoreDirectorySpec;
            break;
        case "store-operation":
            spec = {
                pattern: "store-operation",
                ...storeProps,
                reqMimeType: transformMimeTypes?.requestMimeType
            } as StoreOperationSpec;
            break;
        case "store-view":
            spec = {
                pattern: "store-view",
                ...storeProps,
                respMimeType: transformMimeTypes?.responseMimeType
            } as StoreViewSpec;
            break;
        default:
            spec = {
                pattern: "store",
                ...storeProps
            } as StoreSpec;
            break;
    }
    return spec;
}