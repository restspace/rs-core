import { iter, writeAll } from "std/io/util.ts";
import { ensureDir } from "std/fs/ensure_dir.ts";
import { dirname } from "std/path/mod.ts";

const bufSize = 64 * 1024;

export async function* limitBytes(itbl: AsyncIterable<Uint8Array>, limit: number) {
    let bytes = 0;
    for await (let chunk of itbl) {
        bytes += chunk.byteLength;
        if (bytes > limit) {
            return chunk.slice(0, limit - bytes); // 2nd arg is negative
        } else if (bytes === limit) {
            return chunk;
        } else {
            yield chunk;
        }
    }
}

export async function* toBlockChunks(stringItbl: AsyncIterable<string>) {
    const buffer = new Uint8Array(bufSize);
    let pointer = 0;
    const encoder = new TextEncoder();

    for await (const stringChunk of stringItbl) {
        const bytes = encoder.encode(stringChunk);
        let start = 0;
        let bytesRemaining = bytes.length - start;
        let bufferRemaining = bufSize - pointer;
        while (bytesRemaining >= bufferRemaining) {
            buffer.set(bytes.slice(start, start + bufferRemaining), pointer);
            yield buffer;
            start += bufferRemaining;
            bytesRemaining = bytes.length - start;
            pointer = 0;
            bufferRemaining = bufSize - pointer;
        }
        if (bytesRemaining > 0) {
            buffer.set(bytes.slice(start), pointer);
            pointer += bytesRemaining;
        }
    }

    yield buffer.slice(0, pointer);
}

export function readerToStream(r: Deno.Reader): ReadableStream<Uint8Array> {
    const itbl = iter(r, { bufSize });
    const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
            const { value, done } = await itbl.next();
            if (done) {
                controller.close();
            } else {
                controller.enqueue(value);
            }
        },
    });
    return stream;
}

export async function readFileStream(path: string, startByte = 0, endByte = -1): Promise<ReadableStream<Uint8Array>> {
    const f = await Deno.open(path);
    if (startByte > 0) {
        await Deno.seek(f.rid, startByte, Deno.SeekMode.Start);
    }
    let itbl = iter(f, { bufSize });
    if (endByte > -1) {
        itbl = limitBytes(itbl, endByte - startByte);
    }
    const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                const { value, done } = await itbl.next();
        
                if (done) {
                    controller.close();
                    f.close();
                } else {
                    controller.enqueue(value);
                }
            } catch (err) {
                controller.error(err);
                f.close();
            }
        },
        cancel() {
            f.close();
        }
    });
    return stream;
}

export async function writeFileStream(path: string): Promise<WritableStream<Uint8Array>> {
    await ensureDir(dirname(path));
    let f = await Deno.open(path, { create: true, write: true, truncate: true });
    const stream = new WritableStream({
        async write(chunk) {
          await writeAll(f, chunk);
        },
        close() {
            f.close();
        },
        abort(reason) {
            console.error('Write abort: ', reason);
            f.close();
        }
      });
    return stream;
}