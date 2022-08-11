export function ab2str(buf: ArrayBuffer): string {
    return new TextDecoder().decode(new Uint8Array(buf));
}
  
export function str2ab(str: string): ArrayBuffer {
    return new TextEncoder().encode(str).buffer;
}
  
export function ab2b64(buf: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buf);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode( bytes[ i ] );
    }
    return btoa(binary);
}

export function b642ab(buf: ArrayBuffer): ArrayBuffer {
    const b64str = new TextDecoder().decode(buf);
    const bstr = atob(b64str);
    const bytes = new Uint8Array(bstr.length);
    for (let i = 0; i < bytes.byteLength; i++) {
        bytes[i] = bstr.charCodeAt(i);
    }
    return bytes.buffer;
}