export async function* readerToAsyncGenerator<T>(reader: ReadableStreamDefaultReader<T>) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield value;
      }
    } finally {
      // Always release the lock when done to free the stream for other uses.
      reader.releaseLock();
    }
}

/**
 * Converts a ReadableStreamDefaultReader of Uint8Array chunks to an AsyncGenerator of decoded string chunks.
 * @param reader The ReadableStreamDefaultReader that yields Uint8Array chunks
 * @param encoding The text encoding to use for decoding (default: 'utf-8')
 * @returns An AsyncGenerator that yields decoded string chunks
 */
export async function* textReaderToAsyncGenerator(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  encoding: string = 'utf-8'
): AsyncGenerator<string> {
  const decoder = new TextDecoder(encoding);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
  } catch (err) {
    console.error("Error in textReaderToAsyncGenerator:", err);
    throw err;
  } finally {
    // Flush any remaining bytes in the decoder
    const finalChunk = decoder.decode(undefined, { stream: false });
    if (finalChunk) {
      yield finalChunk;
    }
    // Always release the lock when done to free the stream for other uses.
    reader.releaseLock();
  }
}

async function ensureBuffer(reader: ReadableStreamDefaultReader<Uint8Array>, buffer: string, offset: number): Promise<[string, IParseResult | null]> {
    try {
        const decoder = new TextDecoder();
        while (offset > buffer.length) {
            const result = await reader.read();
            if (result.done) {
                return [buffer, {
                    buffer: buffer,
                    offset: -1,
                    matched: ''
                }];
            }
            buffer += decoder.decode(result.value);
        }        
    } catch (error) {
        console.error("Error in fetchIfBeyondBuffer:", error);
        return [buffer, {
            buffer: buffer,
            offset: -1,
            matched: ''
        }];
    }
    return [buffer, null];
}

interface IParseResult {
    buffer: string;
    offset: number;
    matched: string;
}

/**
 * Parses an async generator of strings to find a match from an array of possible match strings.
 * 
 * @param generator - The async generator of strings to parse
 * @param buffer - The current buffer string containing previous output from the generator
 * @param offset - The position in the buffer from which to start scanning
 * @param matchStrings - Array of strings to match against
 * @returns An object containing the updated buffer, new offset position, and the matched string
 */
export async function asyncHeadParser(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    buffer: string,
  offset: number,
  matchStrings: string[]
): Promise<IParseResult> {
  // Handle negative offset - treat it as 0 but preserve the original behavior
  // where it finds matches at the start of the buffer
  const isNegativeOffset = offset < 0;
  let currentOffset = isNegativeOffset ? 0 : offset;
  let currentBuffer = buffer;
  let result: IParseResult | null = null;
  if (matchStrings.length === 0 || matchStrings.some(str => str === '')) {
    return {
      buffer: currentBuffer,
      offset: currentOffset,
      matched: ''
    };
  }
  const checkAheadChars = Math.max(...matchStrings.map(str => str.length));
  let bufferExhausted = false;
  
  // Function to check if any match string is present at the current offset
  const checkForMatch = (position: number): IParseResult | null => {
    for (const matchStr of matchStrings) {
      if (currentBuffer.startsWith(matchStr, currentOffset)) {
        return {
          buffer: currentBuffer,
          offset: currentOffset + matchStr.length,
          matched: matchStr
        };
      }
    }
    return null;
  };
  
  // Start scanning from the current offset
  try {
    while (true) {
        if (!bufferExhausted) {
            [currentBuffer, result] = await ensureBuffer(reader, currentBuffer, currentOffset + checkAheadChars);
            if (result) {
                bufferExhausted = true;
                if (currentOffset >= currentBuffer.length) return result;
            }
        } else {
            if (currentOffset >= currentBuffer.length) return result!;
        }
        const match = checkForMatch(currentOffset);
        if (match) {
            return match;
        }
        currentOffset++;
    }
  } catch (error) {
    console.error("Error in asyncHeadParser:", error);
    return {
      buffer: currentBuffer,
      offset: -1,
      matched: ''
    };
  }
}

export async function asyncSkipBytes(reader: ReadableStreamDefaultReader<Uint8Array>, buffer: string, offset: number, bytesToSkip: number): Promise<{buffer: string, offset: number}> {
    let currentBuffer = buffer;
    let bytesCount = 0;
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const remainingBuffer = currentBuffer.slice(offset);
    let bytes = encoder.encode(remainingBuffer);
    let lastStrLen = remainingBuffer.length;

    while (true) {
        if (bytes.length >= bytesToSkip - bytesCount) {
            bytes = bytes.slice(0, bytesToSkip - bytesCount);
            break;
        }
        offset += lastStrLen;
        bytesCount += bytes.length;
        const result = await reader.read();
        if (result.done) {
            return {buffer: currentBuffer, offset: -1};
        }
        const str = decoder.decode(result.value);
        currentBuffer += str;
        lastStrLen = str.length;
        bytes = result.value;
    }

    let str = new TextDecoder('utf-8').decode(bytes);
    return {buffer: currentBuffer, offset: offset + str.length};
}

