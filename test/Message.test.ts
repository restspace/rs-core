import { Message } from "../Message.ts";
import { assertEquals } from "std/testing/asserts.ts";

Deno.test('GET encode/decode to array', async function () {
    const msg = new Message("/abc", "test", "GET", null);
    msg.setHeader("X-Hdr", "abcdef");
    const ser = await msg.toUint8Array();
    const msgOut = Message.fromUint8Array(ser, "test");
    assertEquals(msgOut.getHeader("x-hdr"), "abcdef");
    assertEquals(msgOut.method, "GET");
    assertEquals(msgOut.url.toString(), "/abc");
});

Deno.test('POST encode/decode to array', async function () {
    const msg = new Message("/abc?x=y", "test", "POST", null);
    msg.setHeader("X-Hdr", "abcdef");
    msg.setDataJson({ "attr": "abc" });
    const ser = await msg.toUint8Array();
    const msgOut = Message.fromUint8Array(ser, "test");
    assertEquals(msgOut.getHeader("x-hdr"), "abcdef");
    assertEquals(msgOut.method, "POST");
    assertEquals(msgOut.url.toString(), "/abc?x=y");
    const body = await msgOut.data!.asJson();
    assertEquals(body, { attr: "abc" });
});

Deno.test('response encode/decode to array', async function () {
    const msg = new Message("/", "test", "", null);
    msg.setHeader("X-Hdr", "abcdef");
    msg.setDataJson({ "attr": "abc" });
    msg.setStatus(404, "Not found");
    const ser = await msg.toUint8Array();
    const msgOut = Message.fromUint8Array(ser, "test");
    assertEquals(msgOut.getHeader("x-hdr"), "abcdef");
    assertEquals(msgOut.method, "");
    assertEquals(msgOut.url.toString(), "/");
    assertEquals(msgOut.status, 404);
    const body = await msgOut.data!.asString();
    assertEquals(body, "Not found");
});