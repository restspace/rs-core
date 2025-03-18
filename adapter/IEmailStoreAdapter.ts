import { IAdapter } from "./IAdapter.ts";

export interface Email {
    id: string;
    replyToId?: string;
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
    references?: string;
}

// JSON Schema for Email
export const emailSchema = {
    type: "object",
    properties: {
        id: { type: "string" },
        replyToId: { type: "string" },
        mailboxId: { type: "number" },
        from: { type: "string" },
        to: { type: "string" },
        date: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
        contentType: { type: "string" },
        charset: { type: "string" },
        textBody: { type: "string" },
        attachments: { type: "object" },
        references: { type: "string" },
    },
    required: [ "from", "to", "subject", "date", "body", "contentType" ],
};

export interface IEmailStoreAdapter extends IAdapter {
    fetchEmails: (since: Date, folder?: string, excludeIds?: number[]) => AsyncGenerator<Email>;
    writeEmailToFolder: (email: Email, folder?: string, flags?: string[]) => Promise<number>;
    listFolders: () => Promise<string[]>;
}