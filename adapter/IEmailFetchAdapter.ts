import { IAdapter } from "./IAdapter.ts";

export interface Email {
    id: string;
    from: string;
    to: string;
    date: Date;
    subject: string;
    body: string;
}

export interface IEmailFetchAdapter extends IAdapter {
    fetchEmails: (folder: string, since: Date) => Promise<Email[]>;
}