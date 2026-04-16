import { Message } from "../Message.ts";
import { assertEquals, assertMatch, assertNotEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { Url } from "../Url.ts";

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

Deno.test('fromSpec url only', async function () {
    const msg = Message.fromSpec("/abc", "test") as Message;
    assertEquals(msg.method, "GET");
    assertEquals(msg.url.toString(), "/abc");
});

Deno.test('fromSpec url only with space', async function () {
    const msg = Message.fromSpec("/abc def", "test", new Url("/xxx"), { x: 2 }, "POST") as Message;
    assertEquals(msg.method, "POST");
    assertEquals(msg.url.toString(), "/abc def");
});

Deno.test('fromSpec method and url', async function () {
    const msg = Message.fromSpec("PUT /abc", "test", new Url("/xxx"), { x: 2 }, "POST") as Message;
    assertEquals(msg.method, "PUT");
    assertEquals(msg.url.toString(), "/abc");
});

Deno.test('fromSpec method and url with space', async function () {
    const msg = Message.fromSpec("POST /abc def", "test", new Url("/xxx"), { x: 2 }, "POST") as Message;
    assertEquals(msg.method, "POST");
    assertEquals(msg.url.toString(), "/abc def");
});

Deno.test('fromSpec method, data and url with space', async function () {
    const msg = Message.fromSpec("PUT x /abc def", "test", new Url("/xxx"), { x: 2 }, "POST") as Message;
    assertEquals(msg.method, "PUT");
    assertEquals(msg.url.toString(), "/abc def");
    assertEquals(msg.data?.asStringSync(), "2");
});

Deno.test('fromSpec method, data and local url', async function () {
    // note this case is ambiguous: we assume no local url with space and no slash
    const msg = Message.fromSpec("PUT x y", "test", new Url("/xxx"), { x: 2 }, "POST") as Message;
    assertEquals(msg.method, "PUT");
    assertEquals(msg.url.toString(), "y");
    assertEquals(msg.data?.asStringSync(), "2");
});

Deno.test('fromSpec method, data and local url', async function () {
    // note this case is ambiguous: but we resolve as a url because of the slash
    const msg = Message.fromSpec("PUT x/y y", "test", new Url("/xxx"), { x: 2 }, "POST") as Message;
    assertEquals(msg.method, "PUT");
    assertEquals(msg.url.toString(), "x/y y");
});

Deno.test('fromRequest preserves valid W3C trace context and sanitizes tracestate', function () {
    const traceparent = '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01';
    const msg = Message.fromRequest(new Request('https://example.com/', {
        headers: {
            traceparent,
            tracestate: 'vendor=value,Invalid=bad,dup=first,dup=second,tenant@sys=ok'
        }
    }), 'test');

    assertEquals(msg.getHeader('traceparent'), traceparent);
    assertEquals(msg.getHeader('tracestate'), 'vendor=value,dup=first,tenant@sys=ok');
    assertEquals(msg.traceId, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
});

Deno.test('fromRequest restarts trace context and drops tracestate when traceparent is invalid', function () {
    const msg = Message.fromRequest(new Request('https://example.com/', {
        headers: {
            traceparent: '00-00000000000000000000000000000000-bbbbbbbbbbbbbbbb-01',
            tracestate: 'vendor=value'
        }
    }), 'test');

    assertMatch(msg.getHeader('traceparent') || '', /^00-[0-9a-f]{32}-[0-9a-f]{16}-00$/);
    assertNotEquals(msg.traceId, '00000000000000000000000000000000');
    assertEquals(msg.getHeader('tracestate'), undefined);
});

Deno.test('fromRequest restarts trace context when traceparent uses uppercase id characters', function () {
    const msg = Message.fromRequest(new Request('https://example.com/', {
        headers: {
            traceparent: '00-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA-bbbbbbbbbbbbbbbb-01'
        }
    }), 'test');

    assertMatch(msg.getHeader('traceparent') || '', /^00-[0-9a-f]{32}-[0-9a-f]{16}-00$/);
    assertNotEquals(msg.traceId, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
});

Deno.test('fromRequest drops tracestate when traceparent is absent', function () {
    const msg = Message.fromRequest(new Request('https://example.com/', {
        headers: {
            tracestate: 'vendor=value'
        }
    }), 'test');

    assertMatch(msg.getHeader('traceparent') || '', /^00-[0-9a-f]{32}-[0-9a-f]{16}-00$/);
    assertEquals(msg.getHeader('tracestate'), undefined);
});

Deno.test('startSpan preserves sampled flag while replacing span id', function () {
    const msg = new Message('/', 'test', 'GET', null);
    msg.setHeader('traceparent', '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01');

    msg.startSpan();

    const parts = msg.getHeader('traceparent')!.split('-');
    assertEquals(parts[0], '00');
    assertEquals(parts[1], 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    assertNotEquals(parts[2], 'bbbbbbbbbbbbbbbb');
    assertEquals(parts[3], '01');
});
