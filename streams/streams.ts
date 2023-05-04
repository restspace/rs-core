import { writeAll } from "https://deno.land/std@0.185.0/streams/mod.ts";
import { ensureDir } from "https://deno.land/std@0.185.0/fs/ensure_dir.ts";
import { dirname } from "https://deno.land/std@0.185.0/path/mod.ts";

const BUF_SIZE = 64 * 1024;

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
    const buffer = new Uint8Array(BUF_SIZE);
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
        }
        if (bytesRemaining > 0) {
            buffer.set(bytes.slice(start), pointer);
            pointer += bytesRemaining;
        }
    }

    yield buffer.slice(0, pointer);
}

export async function* toLines(stringItbl: AsyncIterable<string>) {
    const iterator = stringItbl[Symbol.asyncIterator]();
    let {value: chunk, done: readerDone} = await iterator.next()
  
    const re = /\r\n|\n|\r/gm;
    let startIndex = 0;
  
    for (;;) {
      const result = re.exec(chunk);
      if (!result) {
        if (readerDone) {
          break;
        }
        const remainder = chunk.substr(startIndex);
        const nextResult = await iterator.next();
        chunk = nextResult.value;
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
      yield chunk.substr(startIndex);
    }
  }

// local copy of std library iterateReader which allocates a new buffer
// for each block to avoid async overwrites of a shared buffer
export async function* iterateReader(
    r: Deno.Reader,
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

export function readerToStream(r: Deno.Reader): ReadableStream<Uint8Array> {
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
        await Deno.seek(f.rid, startByte, Deno.SeekMode.Start);
    }
    let itbl = iterateReader(f, { bufSize: BUF_SIZE });
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