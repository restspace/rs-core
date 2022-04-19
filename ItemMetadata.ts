export type ItemStatus = 'none' | 'directory' | 'file';

export interface ItemNone {
    status: "none";
}

export interface ItemDirectory {
    status: "directory";
    dateModified?: Date;
}

export interface ItemFile {
    status: "file";
    dateModified: Date;
    size: number;
}

export type ItemMetadata = ItemNone | ItemDirectory | ItemFile;

export const getEtag = (file: ItemFile) => {
    return `${file.dateModified.getTime()}-${file.size}`;
}