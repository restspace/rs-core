// a function which strips all html tags from a string

export function stripHtmlTags(html: string, separatePWithNewline?: boolean): string {
    if (!html) return '';
    if (separatePWithNewline) {
        return html.replace(/<\/p>\s*<p>/g, '\n').replace(/<[^>]*>/g, '');
    } else {
        return html.replace(/<[^>]*>/g, '');
    }
}
