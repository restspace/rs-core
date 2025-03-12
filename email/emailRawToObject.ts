import { Email } from "../adapter/IEmailStoreAdapter.ts";

interface MimePart {
    headers: string;
    body: string;
}

interface ParsedBody {
    text?: string;
    html?: string;
    attachments?: Record<string, string>;
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
        if (line === '') {
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
            body += line + '\n';
        }
    }

    // Save last header if exists
    if (currentHeader && currentValue) {
        headers[currentHeader.toLowerCase()] = currentValue;
    }

    // Parse the body based on content type
    const parsedBody = parseBody(body, contentType, boundary, headers);

    return {
        id: headers['message-id'] || '',
        mailboxId: 0,
        from: headers['from'] || '',
        to: headers['to'] || '',
        date: new Date(headers['date'] || ''),
        subject: headers['subject'] || '',
        body: parsedBody.html || parsedBody.text || '',
        contentType: contentType,
        charset: charset,
        textBody: parsedBody.text,
        attachments: parsedBody.attachments,
        references: headers['references'] || '',
        replyToId: headers['in-reply-to'] || '',
    };
}

function decodeQuotedPrintable(input: string): string {
    let output = '';
    let i = 0;
    
    while (i < input.length) {
        if (input[i] === '=') {
            // Handle soft line breaks
            if (input[i + 1] === '\r' && input[i + 2] === '\n') {
                i += 3;
                continue;
            }
            if (input[i + 1] === '\n') {
                i += 2;
                continue;
            }
            
            // Handle encoded characters
            if (i + 2 < input.length) {
                const hex = input.substring(i + 1, i + 3);
                if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
                    output += String.fromCharCode(parseInt(hex, 16));
                    i += 3;
                    continue;
                }
            }
        }
        output += input[i];
        i++;
    }
    
    return output;
}

function parseBody(body: string, contentType: string, boundary: string, headers: Record<string, string>): ParsedBody {
    const result: ParsedBody = {};
    
    if (!boundary) {
        // Simple text or html email
        const transferEncoding = headers['content-transfer-encoding']?.toLowerCase() || '';
        const decodedBody = transferEncoding === 'quoted-printable' ? decodeQuotedPrintable(body) : body;
        result.text = contentType === 'text/plain' ? decodedBody : undefined;
        result.html = contentType === 'text/html' ? decodedBody : undefined;
        return result;
    }

    // Handle multipart emails
    const parts = splitMimeParts(body, boundary);
    let attachmentIndex = 0;

    for (const part of parts) {
        const partHeaders = parseHeaders(part.headers);
        if (!partHeaders['content-type']) {
            continue;
        }
        const partContentType = partHeaders['content-type']?.split(';')[0].toLowerCase();
        const contentDisposition = partHeaders['content-disposition']?.toLowerCase() || '';
        const contentId = partHeaders['content-id']?.replace(/[<>]/g, '') || '';
        const transferEncoding = partHeaders['content-transfer-encoding']?.toLowerCase() || '';
        const isAttachment = contentDisposition.includes('attachment');
        const isInline = contentDisposition.includes('inline');

        // Decode the body based on transfer encoding
        const decodedBody = transferEncoding === 'quoted-printable' ? decodeQuotedPrintable(part.body) : part.body;

        if (partContentType === 'text/plain' && !isAttachment) {
            result.text = decodedBody;
        } else if (partContentType === 'text/html' && !isAttachment) {
            result.html = decodedBody;
        } else if (isAttachment || isInline) {
            // Handle attachments
            if (!result.attachments) {
                result.attachments = {};
            }

            let filename = '';
            const filenameMatch = contentDisposition.match(/filename=([^;]+)/i);
            if (filenameMatch) {
                filename = filenameMatch[1].replace(/"/g, '');
            }

            if (contentType === 'multipart/related' && contentId) {
                result.attachments[contentId] = decodedBody;
            } else {
                const key = filename || `attachment${++attachmentIndex}`;
                result.attachments[key] = decodedBody;
            }
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
    const lines = headerString.split('\r\n');
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
    const hasAttachments = email.attachments && Object.keys(email.attachments).length > 0;
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
        
        // Add attachments if any
        if (hasAttachments) {
            for (const [filename, content] of Object.entries(email.attachments || {})) {
                lines.push('Content-Type: application/octet-stream');
                lines.push(`Content-Disposition: attachment; filename="${filename}"`);
                lines.push('Content-Transfer-Encoding: base64');
                lines.push('');
                lines.push(content);
                lines.push('');
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


