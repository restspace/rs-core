import { writeAll } from "https://deno.land/std@0.185.0/streams/mod.ts";
import { ensureDir } from "https://deno.land/std@0.185.0/fs/ensure_dir.ts";
import { dirname } from "https://deno.land/std@0.185.0/path/mod.ts";
import type { Reader } from "jsr:@std/io/types";

const BUF_SIZE = 64 * 1024;

export async function* limitBytes(itbl: AsyncIterable<Uint8Array>, limit: number) {
    let bytes = 0;
    for await (let chunk of itbl) {
        bytes += chunk.byteLength;
        if (bytes > limit) {
            const remainingBytes = limit - (bytes - chunk.byteLength);
            yield chunk.slice(0, remainingBytes);
            return;
        } else if (bytes === limit) {
            yield chunk;
            return;
        } else {
            yield chunk;
        }
    }
}

export async function* toBlockChunks(stringItbl: AsyncIterable<string>) {
    let buffer = new Uint8Array(BUF_SIZE);
    let pointer = 0;
    const encoder = new TextEncoder();

    for await (const stringChunk of stringItbl) {
        const bytes = encoder.encode(stringChunk);
        let start = 0;
        let bytesRemaining = bytes.length - start;
        let bufferRemaining = BUF_SIZE - pointer;
        while (bytesRemaining >= bufferRemaining) {
            buffer.set(bytes.slice(start, start + bufferRemaining), pointer);
            yield buffer;
            start += bufferRemaining;
            bytesRemaining = bytes.length - start;
            pointer = 0;
            bufferRemaining = BUF_SIZE - pointer;
            buffer = new Uint8Array(BUF_SIZE);
        }
        if (bytesRemaining > 0) {
            buffer.set(bytes.slice(start), pointer);
            pointer += bytesRemaining;
        }
    }

    yield buffer.slice(0, pointer);
}

export async function* toLines(stringItbl: AsyncIterable<Uint8Array>) {
    const iterator = stringItbl[Symbol.asyncIterator]() as AsyncIterator<Uint8Array, Uint8Array, Uint8Array>;
    let {value: binChunk, done: readerDone} = await iterator.next();
    const decoder = new TextDecoder();
    let chunk = decoder.decode(binChunk);
  
    const re = /\r\n|\n|\r/gm;
    let startIndex = 0;
  
    for (;;) {
      const result = re.exec(chunk);
      if (!result) {
        if (readerDone) {
          break;
        }
        const remainder = chunk.substring(startIndex);
        const nextResult = await iterator.next();
        chunk = decoder.decode(nextResult.value);
        readerDone = nextResult.done;
        
        chunk = remainder + (chunk || "");
        startIndex = re.lastIndex = 0;
        continue;
      }
      yield chunk.substring(startIndex, result.index);
      startIndex = re.lastIndex;
    }
    if (startIndex < chunk.length) {
      // last line didn't end in a newline char
      yield chunk.substring(startIndex);
    }
  }

// local copy of std library iterateReader which allocates a new buffer
// for each block to avoid async overwrites of a shared buffer
export async function* iterateReader(
    r: Reader,
    options?: {
      bufSize?: number;
    },
  ): AsyncIterableIterator<Uint8Array> {
    const bufSize = options?.bufSize ?? BUF_SIZE;
    while (true) {
      const b = new Uint8Array(bufSize);
      const result = await r.read(b);
      if (result === null) {
        break;
      }
  
      yield b.subarray(0, result);
    }
  }

export function readerToStream(r: Reader): ReadableStream<Uint8Array> {
    const itbl = iterateReader(r, { bufSize: BUF_SIZE });
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
        await f.seek(startByte, Deno.SeekMode.Start);
    }
    let itbl = iterateReader(f, { bufSize: BUF_SIZE });
    if (endByte > -1) {
        itbl = limitBytes(itbl, endByte - startByte + 1);
    }
    const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                const { value, done } = await itbl.next();
                if (done) {
                    if (value) controller.enqueue(value);
                    controller.close();
                    f.close();
                } else {
                    controller.enqueue(value);
                }
            } catch (err) {
                controller.error(err);
                console.log('stream error: ' + JSON.stringify(err));
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