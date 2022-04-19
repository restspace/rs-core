export type ApiPattern = "store" | "transform" | "storeTransform" | "view" | "operation";

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

export interface StoreSpec extends StoreDetails {
    pattern: "store"
}

export interface TransformSpec extends TransformDetails {
    pattern: "transform"
}

export interface StoreTransformSpec extends StoreDetails, TransformDetails {
    pattern: "store-transform",
}

export interface ViewSpec {
    pattern: "view",
    respMimeType: string
}

export interface OperationSpec {
    pattern: "operation",
    reqMimeType: string
}

export type ApiSpec = StoreSpec | TransformSpec | StoreTransformSpec | ViewSpec | OperationSpec;

export type PathInfo = [ name: string, dateModified?: number, mimeType?: string, writeMimeType?: string ]
                       | [ name: string, dateModified?: number, spec?: ApiSpec ];

export interface DirDescriptor {
    path: string;
    paths: PathInfo[];
    spec?: ApiSpec;
}