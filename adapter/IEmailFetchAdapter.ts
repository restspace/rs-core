import { IAdapter } from "./IAdapter.ts";

export interface Email {
    id: string;
    mailboxId: number;
    from: string;
    to: string;
    date: Date;
    subject: string;
    body: string;
    contentType: string;
    charset: string;
    textBody?: string;
    attachments?: Record<string, string>;
}

export interface IEmailFetchAdapter extends IAdapter {
    fetchEmails: (since: Date, folder?: string, excludeIds?: number[]) => AsyncGenerator<Email>;
}