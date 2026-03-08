import { Email, EmailAttachment } from "../adapter/IEmailStoreAdapter.ts";

interface MimePart {
    headers: string;
    body: string;
}

interface ParsedBody {
    text?: string;
    html?: string;
    attachments?: EmailAttachment[];
}

function decodeEncodedWords(input: string): string {
    return input.replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (substring: string, charset: string, encoding: string, encodedText: string) => {
        try {
            if (encoding.toUpperCase() === 'B') {
                // Base64 decoding
                const decoded = atob(encodedText);
                const decoder = new TextDecoder(charset);
                return decoder.decode(new Uint8Array([...decoded].map(char => char.charCodeAt(0))));
            } else if (encoding.toUpperCase() === 'Q') {
                // Quoted-printable decoding
                let decoded = encodedText
                    .replace(/_/g, ' ') // _ is used for spaces in Q-encoded text
                    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
                const decoder = new TextDecoder(charset);
                return decoder.decode(new TextEncoder().encode(decoded));
            }
        } catch (e) {
            console.error("Decoding error:", e);
            return encodedText;
        }
        return substring;
    });
}


export function emailRawToObject(rfc822: string): Email {
    const lines = rfc822.split('\r\n');
    const headers: Record<string, string> = {};
    let body = '';
    let inBody = false;
    let currentHeader = '';
    let currentValue = '';
    let contentType = 'text/plain';
    let charset = 'utf-8';
    let boundary = '';
    let references = '';

    // Parse headers and body
    for (const line of lines) {
        if (!inBody && line === '') {
            inBody = true;
            continue;
        }

        if (!inBody) {
            // Check if this is a continuation line (starts with whitespace)
            if (line.startsWith(' ') || line.startsWith('\t')) {
                if (currentHeader) {
                    currentValue += ' ' + line.trim();
                }
            } else {
                // Save previous header if exists
                if (currentHeader && currentValue) {
                    headers[currentHeader.toLowerCase()] = currentValue;
                    
                    // Parse Content-Type header
                    if (currentHeader.toLowerCase() === 'content-type') {
                        const typeMatch = currentValue.match(/([^;]+)/);
                        if (typeMatch) {
                            contentType = typeMatch[1].toLowerCase();
                        }
                        const charsetMatch = currentValue.match(/charset=([^;]+)/i);
                        if (charsetMatch) {
                            charset = charsetMatch[1].toLowerCase();
                        }
                        const boundaryMatch = currentValue.match(/boundary=([^;]+)/i);
                        if (boundaryMatch) {
                            boundary = boundaryMatch[1].replace(/"/g, '');
                        }
                    }
                }
                
                // Start new header
                const [key, ...values] = line.split(':');
                if (key && values.length > 0) {
                    currentHeader = key;
                    currentValue = values.join(':').trim();
                }
            }
        } else {
            body += line + '\r\n';
        }
    }

    // Save last header if exists
    if (currentHeader && currentValue) {
        headers[currentHeader.toLowerCase()] = currentValue;
    }

    const rootContentType = headers["content-type"];
    if (rootContentType) {
        const typeMatch = rootContentType.match(/([^;]+)/);
        if (typeMatch) {
            contentType = typeMatch[1].toLowerCase().trim();
        }
        const charsetMatch = rootContentType.match(/charset=([^;]+)/i);
        if (charsetMatch) {
            charset = charsetMatch[1].replace(/"/g, "").toLowerCase().trim();
        }
        const boundaryMatch = rootContentType.match(/boundary=([^;]+)/i);
        if (boundaryMatch) {
            boundary = boundaryMatch[1].replace(/"/g, "").trim();
        }
    }

    // Parse the body based on content type
    const parsedBody = parseBody(body, contentType, boundary, headers);

    return {
        id: headers['message-id'] || '',
        mailboxId: 0,
        from: decodeEncodedWords(headers['from'] || ''),
        to: decodeEncodedWords(headers['to'] || ''),
        date: new Date(headers['date'] || ''),
        subject: decodeEncodedWords(headers['subject'] || ''),
        body: parsedBody.html || parsedBody.text || '',
        contentType: contentType,
        charset: charset,
        textBody: parsedBody.text,
        attachments: parsedBody.attachments,
        references: headers['references'] || '',
        replyToId: headers['in-reply-to'] || '',
    };
}

function decodeQuotedPrintableToBytes(input: string): Uint8Array {
    const output: number[] = [];
    let i = 0;

    while (i < input.length) {
        if (input[i] === '=') {
            if (input[i + 1] === '\r' && input[i + 2] === '\n') {
                i += 3;
                continue;
            }
            if (input[i + 1] === '\n') {
                i += 2;
                continue;
            }

            if (i + 2 < input.length) {
                const hex = input.substring(i + 1, i + 3);
                if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
                    output.push(parseInt(hex, 16));
                    i += 3;
                    continue;
                }
            }
        }

        output.push(input.charCodeAt(i) & 0xff);
        i++;
    }

    return new Uint8Array(output);
}

function bytesToBinaryString(bytes: Uint8Array): string {
    let binary = "";
    for (const value of bytes) {
        binary += String.fromCharCode(value);
    }
    return binary;
}

function binaryStringToBytes(binary: string): Uint8Array {
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i) & 0xff;
    }
    return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
    return btoa(bytesToBinaryString(bytes));
}

function normalizeBase64(input: string): string {
    return input.replace(/\s+/g, "");
}

function decodeTransferEncodingToBytes(body: string, transferEncoding: string): Uint8Array {
    if (transferEncoding === "base64") {
        return binaryStringToBytes(atob(normalizeBase64(body)));
    }
    if (transferEncoding === "quoted-printable") {
        return decodeQuotedPrintableToBytes(body);
    }

    return binaryStringToBytes(body);
}

function decodeTransferEncodingToString(
    body: string,
    transferEncoding: string,
    charset: string = "utf-8",
): string {
    const bytes = decodeTransferEncodingToBytes(body, transferEncoding);
    try {
        return new TextDecoder(charset).decode(bytes);
    } catch (_error) {
        return new TextDecoder("utf-8").decode(bytes);
    }
}

function getHeaderParam(headerValue: string | undefined, paramName: string): string {
    if (!headerValue) return "";
    const pattern = new RegExp(`${paramName}\\s*=\\s*(?:"([^"]+)"|([^;]+))`, "i");
    const match = headerValue.match(pattern);
    if (!match) return "";
    return (match[1] || match[2] || "").trim();
}

function foldBase64(base64: string, lineLength = 76): string {
    const canonicalBase64 = normalizeBase64(base64);
    const chunks: string[] = [];
    for (let i = 0; i < canonicalBase64.length; i += lineLength) {
        chunks.push(canonicalBase64.slice(i, i + lineLength));
    }
    return chunks.join("\r\n");
}

function parseBody(body: string, contentType: string, boundary: string, headers: Record<string, string>): ParsedBody {
    const result: ParsedBody = {};

    if (!boundary) {
        const transferEncoding = headers["content-transfer-encoding"]?.toLowerCase() || "";
        const charset = getHeaderParam(headers["content-type"], "charset") || "utf-8";
        const decodedBody = decodeTransferEncodingToString(body, transferEncoding, charset);
        result.text = contentType === "text/plain" ? decodedBody : undefined;
        result.html = contentType === "text/html" ? decodedBody : undefined;
        return result;
    }

    const parts = splitMimeParts(body, boundary);
    let attachmentIndex = 0;

    for (const part of parts) {
        const partHeaders = parseHeaders(part.headers);
        if (!partHeaders["content-type"]) {
            continue;
        }

        const partContentType = partHeaders["content-type"]?.split(";")[0].toLowerCase().trim() || "";
        const partCharset = getHeaderParam(partHeaders["content-type"], "charset") || "utf-8";
        const rawContentDisposition = partHeaders["content-disposition"] || "";
        const normalizedContentDisposition = rawContentDisposition.toLowerCase();
        const transferEncoding = partHeaders["content-transfer-encoding"]?.toLowerCase() || "";
        const isAttachment = normalizedContentDisposition.includes("attachment");
        const isInline = normalizedContentDisposition.includes("inline");

        if (partContentType === "text/plain" && !isAttachment && !isInline) {
            const decodedBody = decodeTransferEncodingToString(part.body, transferEncoding, partCharset);
            result.text = decodedBody;
        } else if (partContentType === "text/html" && !isAttachment && !isInline) {
            const decodedBody = decodeTransferEncodingToString(part.body, transferEncoding, partCharset);
            result.html = decodedBody;
        } else if (isAttachment || isInline) {
            if (!result.attachments) {
                result.attachments = [];
            }

            const contentId = (partHeaders["content-id"] || "").replace(/[<>]/g, "").trim();
            const filename = getHeaderParam(rawContentDisposition, "filename")
                || getHeaderParam(partHeaders["content-type"], "name");
            const fallbackName = contentId || `attachment${++attachmentIndex}`;
            const name = filename || fallbackName;
            const bytes = decodeTransferEncodingToBytes(part.body, transferEncoding);
            const contentBase64 = bytesToBase64(bytes);

            result.attachments.push({
                name,
                contentBase64,
                disposition: isInline ? "inline" : "attachment",
                contentType: partContentType || "application/octet-stream",
                contentId: contentId || undefined,
            });
        }
    }

    return result;
}

function splitMimeParts(body: string, boundary: string): MimePart[] {
    const parts: MimePart[] = [];
    const boundaryRegex = new RegExp(`--${boundary}(?:--)?`);
    const sections = body.split(boundaryRegex).filter(s => s.trim());

    // Common email header names (case-insensitive)
    const commonHeaders = new Set([
        'content-type', 'content-transfer-encoding', 'content-disposition',
        'content-id', 'content-description', 'content-location',
        'from', 'to', 'cc', 'bcc', 'reply-to', 'subject', 'date',
        'mime-version', 'message-id', 'references', 'in-reply-to'
    ]);

    for (const section of sections) {
        const lines = section.split(/\r\n|\n/);
        let headerEndIndex = -1;

        // First try to find double newline
        const doubleNewlineIndex = section.includes('\r\n\r\n') ? 
            lines.findIndex((_, i) => i < lines.length - 1 && lines[i] === '' && lines[i + 1] === '') :
            lines.findIndex((_, i) => i < lines.length - 1 && lines[i] === '' && lines[i + 1] === '');

        if (doubleNewlineIndex !== -1) {
            headerEndIndex = doubleNewlineIndex;
        } else {
            // Fall back to checking for first non-header-like line
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line === '') continue;

                const colonIndex = line.indexOf(':');
                if (colonIndex === -1 || !commonHeaders.has(line.slice(0, colonIndex).toLowerCase().trim())) {
                    headerEndIndex = i - 1;
                    break;
                }
            }
        }

        if (headerEndIndex !== -1) {
            const headers = lines.slice(0, headerEndIndex + 1).join('\r\n');
            const body = lines.slice(headerEndIndex + 1).join('\r\n');
            parts.push({
                headers: headers.trim(),
                body: body.trim()
            });
        }
    }

    return parts;
}

function parseHeaders(headerString: string): Record<string, string> {
    const headers: Record<string, string> = {};
    const lines = headerString.split(/\r\n|\n/);
    let currentHeader = '';
    let currentValue = '';

    for (const line of lines) {
        if (line.startsWith(' ') || line.startsWith('\t')) {
            if (currentHeader) {
                currentValue += ' ' + line.trim();
            }
        } else {
            if (currentHeader && currentValue) {
                headers[currentHeader.toLowerCase()] = currentValue;
            }
            const [key, ...values] = line.split(':');
            if (key && values.length > 0) {
                currentHeader = key;
                currentValue = values.join(':').trim();
            }
        }
    }

    if (currentHeader && currentValue) {
        headers[currentHeader.toLowerCase()] = currentValue;
    }

    return headers;
}

export function objectEmailToRaw(email: Email): string {
    const lines: string[] = [];
    
    // Add standard headers
    if (email.id) lines.push(`Message-ID: ${email.id}`);
    if (email.from) lines.push(`From: ${email.from}`);
    if (email.to) lines.push(`To: ${email.to}`);
    if (email.date) lines.push(`Date: ${email.date.toUTCString()}`);
    if (email.subject) lines.push(`Subject: ${email.subject}`);
    if (email.references) lines.push(`References: ${email.references}`);
    if (email.replyToId) lines.push(`In-Reply-To: ${email.replyToId}`);
    
    // Add MIME headers
    const boundary = generateBoundary();
    const hasAttachments = !!email.attachments && email.attachments.length > 0;
    const hasHtml = email.body && email.contentType === 'text/html';
    const hasText = email.textBody && email.contentType === 'text/plain';
    
    if (hasAttachments || (hasHtml && hasText)) {
        // Multipart message
        lines.push('MIME-Version: 1.0');
        lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
        lines.push('');
        lines.push(`--${boundary}`);
        
        // Add text part if exists
        if (hasText) {
            lines.push('Content-Type: text/plain; charset=utf-8');
            lines.push('Content-Transfer-Encoding: 7bit');
            lines.push('');
            lines.push(email.textBody || '');
            lines.push('');
            lines.push(`--${boundary}`);
        }
        
        // Add HTML part if exists
        if (hasHtml) {
            lines.push('Content-Type: text/html; charset=utf-8');
            lines.push('Content-Transfer-Encoding: 7bit');
            lines.push('');
            lines.push(email.body);
            lines.push('');
            lines.push(`--${boundary}`);
        }
        
        if (hasAttachments) {
            for (const attachment of email.attachments || []) {
                const filename = attachment.name || "attachment";
                const contentType = attachment.contentType || "application/octet-stream";
                const disposition = attachment.disposition || "attachment";

                lines.push(`Content-Type: ${contentType}`);
                lines.push(`Content-Disposition: ${disposition}; filename="${filename}"`);
                if (attachment.contentId) {
                    lines.push(`Content-ID: <${attachment.contentId}>`);
                }
                lines.push("Content-Transfer-Encoding: base64");
                lines.push("");
                lines.push(foldBase64(attachment.contentBase64));
                lines.push("");
                lines.push(`--${boundary}`);
            }
        }
        
        lines.push(`--${boundary}--`);
    } else {
        // Simple message
        lines.push('MIME-Version: 1.0');
        lines.push(`Content-Type: ${email.contentType}; charset=${email.charset}`);
        lines.push('Content-Transfer-Encoding: 7bit');
        lines.push('');
        lines.push(email.body);
    }
    
    return lines.join('\r\n') + '\r\n';
}

function generateBoundary(): string {
    return `----=_Part_${Math.random().toString(36).substring(2)}_${Date.now()}`;
}

function setAsReplyTo(email: Email, replyingToEmail: Email): Email {
    email.references = replyingToEmail.id + (replyingToEmail.references ? ' ' + replyingToEmail.references : '');
    email.replyToId = replyingToEmail.id;
    return email;
}


