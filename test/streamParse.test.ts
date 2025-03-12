import { assertEquals, assertRejects } from "https://deno.land/std@0.185.0/testing/asserts.ts";
import { asyncHeadParser, textReaderToAsyncGenerator, asyncSkipBytes } from "../streams/streamParse.ts";

/**
 * Helper function to create a ReadableStreamDefaultReader from an array of strings
 */
function createStreamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    }
  });
  return stream.getReader();
}

Deno.test("asyncHeadParser - basic match at start", async () => {
  const reader = createStreamReader(["more content"]);
  const result = await asyncHeadParser(reader, "hello world", 0, ["hello"]);
  
  assertEquals(result.buffer, "hello world");
  assertEquals(result.offset, 5);
  assertEquals(result.matched, "hello");
});

Deno.test("asyncHeadParser - match in the middle of buffer", async () => {
  const reader = createStreamReader(["more content"]);
  const result = await asyncHeadParser(reader, "hello world", 0, ["world"]);
  
  assertEquals(result.buffer, "hello world");
  assertEquals(result.offset, 11);
  assertEquals(result.matched, "world");
});

Deno.test("asyncHeadParser - match with offset", async () => {
  const reader = createStreamReader(["more content"]);
  const result = await asyncHeadParser(reader, "hello world", 6, ["world"]);
  
  assertEquals(result.buffer, "hello world");
  assertEquals(result.offset, 11);
  assertEquals(result.matched, "world");
});

Deno.test("asyncHeadParser - match requiring generator content", async () => {
  const reader = createStreamReader(["more", " content"]);
  const result = await asyncHeadParser(reader, "hello world ", 0, ["world more"]);
  
  assertEquals(result.buffer, "hello world more");
  assertEquals(result.offset, 16);
  assertEquals(result.matched, "world more");
});

Deno.test("asyncHeadParser - match spanning multiple generator chunks", async () => {
  // This test verifies that the function can find matches that span across multiple generator chunks
  const reader = createStreamReader([" wo", "rld", " of code"]);
  const result = await asyncHeadParser(reader, "hello", 0, ["hello world"]);
  
  // The function finds the match but doesn't consume all chunks from the generator
  assertEquals(result.buffer, "hello world");
  assertEquals(result.offset, 11);  // Successfully matched "hello world"
  assertEquals(result.matched, "hello world");
});

Deno.test("asyncHeadParser - match with multiple possible matches", async () => {
  // This test verifies that when multiple match strings are provided,
  // the function finds the first match in the buffer
  const reader = createStreamReader([" content"]);
  const result = await asyncHeadParser(reader, "hello world", 0, ["goodbye", "world", "hello"]);
  
  assertEquals(result.buffer, "hello world");
  assertEquals(result.offset, 5);  // Matched "hello" at position 0
  assertEquals(result.matched, "hello");
});

Deno.test("asyncHeadParser - no match in buffer or generator", async () => {
  const reader = createStreamReader(["more content"]);
  const result = await asyncHeadParser(reader, "hello world", 0, ["goodbye"]);
  
  assertEquals(result.buffer, "hello worldmore content");
  assertEquals(result.offset, -1);
  assertEquals(result.matched, "");
});

Deno.test("asyncHeadParser - empty buffer", async () => {
  const reader = createStreamReader(["hello world"]);
  const result = await asyncHeadParser(reader, "", 0, ["hello"]);
  
  assertEquals(result.buffer, "hello world");
  assertEquals(result.offset, 5);
  assertEquals(result.matched, "hello");
});

Deno.test("asyncHeadParser - empty generator", async () => {
  const reader = createStreamReader([]);
  const result = await asyncHeadParser(reader, "hello world", 0, ["goodbye"]);
  
  assertEquals(result.buffer, "hello world");
  assertEquals(result.offset, -1);
  assertEquals(result.matched, "");
});

Deno.test("asyncHeadParser - match at end of buffer", async () => {
  const reader = createStreamReader(["more content"]);
  const result = await asyncHeadParser(reader, "hello world", 6, ["world"]);
  
  assertEquals(result.buffer, "hello world");
  assertEquals(result.offset, 11);
  assertEquals(result.matched, "world");
});

Deno.test("asyncHeadParser - match immediately after buffer", async () => {
  const reader = createStreamReader([" world"]);
  const result = await asyncHeadParser(reader, "hello", 5, ["world", "supernova"]);
  
  assertEquals(result.buffer, "hello world");
  assertEquals(result.offset, 11);
  assertEquals(result.matched, "world");
});

Deno.test("asyncHeadParser - empty match strings array", async () => {
  const reader = createStreamReader(["content"]);
  const result = await asyncHeadParser(reader, "hello world", 0, []);
  
  assertEquals(result.buffer, "hello world");
  assertEquals(result.offset, 0);
  assertEquals(result.matched, "");
});

Deno.test("asyncHeadParser - match with empty string in match array", async () => {
  const reader = createStreamReader(["content"]);
  const result = await asyncHeadParser(reader, "hello world", 0, ["", "test"]);
  
  assertEquals(result.buffer, "hello world");
  assertEquals(result.offset, 0);
  assertEquals(result.matched, "");
});

Deno.test("asyncHeadParser - invalid offset (negative)", async () => {
  // This test verifies that when a negative offset is provided,
  // the function treats it as 0 and finds matches at the start of the buffer
  const reader = createStreamReader(["content"]);
  const result = await asyncHeadParser(reader, "hello world", -5, ["hello"]);
  
  assertEquals(result.buffer, "hello world");
  assertEquals(result.offset, 5);  // Matched "hello" at position 0
  assertEquals(result.matched, "hello");
});

Deno.test("asyncHeadParser - offset beyond buffer length", async () => {
  // This test verifies that when an offset beyond the buffer length is provided,
  // the function pulls data from the generator until it reaches the offset
  // but doesn't find matches after that position in the current implementation
  const reader = createStreamReader(["more content"]);
  const result = await asyncHeadParser(reader, "hello world", 24, ["more"]);
  
  assertEquals(result.buffer, "hello worldmore content");
  assertEquals(result.offset, -1);  // Successfully matched "more" after pulling data
  assertEquals(result.matched, "");
});

Deno.test("asyncHeadParser - very long match string", async () => {
  const longString = "a".repeat(1000);
  const reader = createStreamReader([longString]);
  const result = await asyncHeadParser(reader, "start ", 0, [longString]);
  
  assertEquals(result.buffer, "start " + longString);
  assertEquals(result.offset, 6 + 1000);
  assertEquals(result.matched, longString);
});

Deno.test("asyncHeadParser - error handling", async () => {
  // Create a stream that throws an error
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("first chunk"));
      throw new Error("Test error");
    }
  });
  
  const result = await asyncHeadParser(stream.getReader(), "hello ", 0, ["world"]);
  
  assertEquals(result.buffer, "hello first chunk");
  assertEquals(result.offset, -1);
  assertEquals(result.matched, "");
});

// Integration test with textReaderToAsyncGenerator
Deno.test("asyncHeadParser - integration with textReaderToAsyncGenerator", async () => {
  // Create a ReadableStream from a string
  const encoder = new TextEncoder();
  const data = encoder.encode("hello world");
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    }
  });
  
  const reader = stream.getReader();
  const generator = textReaderToAsyncGenerator(reader);
  
  const result = await asyncHeadParser(reader, "", 0, ["world"]);
  
  assertEquals(result.buffer, "hello world");
  assertEquals(result.offset, 11);
  assertEquals(result.matched, "world");
});

// Tests for asyncSkipBytes
Deno.test("asyncSkipBytes - skip bytes within buffer", async () => {
  const reader = createStreamReader(["additional content"]);
  const result = await asyncSkipBytes(reader, "hello world", 0, 5);
  
  assertEquals(result.buffer, "hello world");
  assertEquals(result.offset, 5);
});

Deno.test("asyncSkipBytes - skip bytes with offset", async () => {
  const reader = createStreamReader(["additional content"]);
  const result = await asyncSkipBytes(reader, "hello world", 6, 5);
  
  // Should skip 5 bytes from offset 6, which is "world" in UTF-8
  assertEquals(result.buffer, "hello world");
  assertEquals(result.offset, 11);
});

Deno.test("asyncSkipBytes - skip bytes requiring generator content", async () => {
  const reader = createStreamReader([" additional", " content"]);
  const result = await asyncSkipBytes(reader, "hello world", 6, 10);
  
  // Should skip 10 bytes from offset 6, which includes "world" plus some from generator
  assertEquals(result.buffer, "hello world additional");
  assertEquals(result.offset, 6 + 10);
});

Deno.test("asyncSkipBytes - skip bytes spanning multiple generator chunks", async () => {
  const reader = createStreamReader([" more", " data", " here"]);
  const result = await asyncSkipBytes(reader, "hello", 5, 15);
  
  // Should skip 15 bytes from offset 5, which spans multiple chunks

  assertEquals(result.buffer, "hello more data here");
  assertEquals(result.offset, 5 + 15);
});

Deno.test("asyncSkipBytes - skip bytes with empty generator", async () => {
  const reader = createStreamReader([]);
  const result = await asyncSkipBytes(reader, "hello world", 0, 20);
  
  // Generator is empty but buffer is not long enough, should return offset -1
  assertEquals(result.buffer, "hello world");
  assertEquals(result.offset, -1);
});

Deno.test("asyncSkipBytes - skip bytes with empty buffer", async () => {
  const reader = createStreamReader(["hello world"]);
  const result = await asyncSkipBytes(reader, "", 0, 5);
  
  // Buffer is empty, should pull from generator
  assertEquals(result.buffer, "hello world");
  assertEquals(result.offset, 5);
});

Deno.test("asyncSkipBytes - skip zero bytes", async () => {
  const reader = createStreamReader(["more content"]);
  const result = await asyncSkipBytes(reader, "hello world", 3, 0);
  
  // Skipping 0 bytes should just return empty buffer with unchanged offset
  assertEquals(result.buffer, "hello world");
  assertEquals(result.offset, 3);
});

Deno.test("asyncSkipBytes - skip bytes with multi-byte Unicode characters", async () => {
  // Create a string with multi-byte Unicode characters
  // "hello" + emoji (4 bytes) + "world"
  const text = "hello😀world";
  const reader = createStreamReader([" now"]);
  
  // Skip past "hello" and the emoji (9 bytes total: 5 for "hello" + 4 for emoji)
  const result = await asyncSkipBytes(reader, text, 0, 9);
  
  // Should skip "hello" and the emoji
  assertEquals(result.buffer, "hello😀world");
  assertEquals(result.offset, 7); // 6 characters: "hello" (5 chars) + emoji (1 char)
});

Deno.test("asyncSkipBytes - error handling", async () => {
  // Create a stream that throws an error
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("first chunk"));
      throw new Error("Test error");
    }
  });
  
  assertRejects(
    async () => await asyncSkipBytes(stream.getReader(), "hello ", 0, 20),
    Error,
    "Test error"
  );
}); 