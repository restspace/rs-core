import { assert, assertStrictEquals } from "std/testing/asserts.ts";

import { AsyncQueue } from '../utility/asyncQueue.ts';

Deno.test('works with timeouts', async function () {
    const asq = new AsyncQueue<string>();
    setTimeout(() => {
        asq.enqueue("after 200");
        setTimeout(() => {
            asq.enqueue("after 500");
            asq.close();
        }, 300);
    }, 200);
    let cnt = 0;
    for await (const pull of asq) {
        if (cnt == 0) assertStrictEquals(pull, "after 200");
        else assertStrictEquals(pull, "after 500");
        cnt++;
    }
});
Deno.test('works with immediate push', async function () {
    const asq = new AsyncQueue<number>();
    asq.enqueue(0);
    asq.enqueue(1);
    asq.close();
    let cnt = 0;
    for await (const pull of asq) {
        if (cnt == 0) assertStrictEquals(pull, 0);
        else assertStrictEquals(pull, 1);
        cnt++;
    }
});
Deno.test('max queued', async function() {
    const asq = new AsyncQueue<number>(2);
    asq.enqueue(0);
    setTimeout(() => asq.enqueue(1), 200);
    let res = await asq.next();
    assertStrictEquals(res.value, 0);
    res = await asq.next();
    assertStrictEquals(res.value, 1);
    res = await asq.next();
    assertStrictEquals(res.done, true);
});
Deno.test('max queued zero', async function() {
    const asq = new AsyncQueue<number>(0);
    const res = await asq.next();
    assertStrictEquals(res.done, true);
});
Deno.test('max queued with nulls', async function() {
    const asq = new AsyncQueue<number>(2);
    asq.enqueue(0);
    setTimeout(() => asq.enqueue(null), 200);
    let res = await asq.next();
    assertStrictEquals(res.value, 0);
    res = await asq.next();
    assertStrictEquals(res.done, true);
});
Deno.test('enqueue promise', async function() {
    const asq = new AsyncQueue<number>(3);
    asq.enqueue(0);
    asq.enqueue(new Promise(resolve => setTimeout(() => resolve(1), 150)));
    setTimeout(() => {
        asq.enqueue(2);
    }, 250);
    let check = 0;
    for await (const pull of asq) {
        assertStrictEquals(pull, check);
        check++;
    }
    assertStrictEquals(check, 3);
});
Deno.test('enqueue asyncqueue with limit', async function() {
    const asq = new AsyncQueue<number>(3);
    const asq2 = new AsyncQueue<number>(3);
    asq.enqueue(0);
    asq2.enqueue(1);
    setTimeout(() => {
        asq.enqueue(asq2);
        asq.enqueue(2);
        asq2.enqueue(null); // null decrements count on queue without outputting
        asq2.enqueue(3);
    }, 250);
    let check = 0;
    for await (const pull of asq) {
        assertStrictEquals(pull, check);
        check++;
    }
    assertStrictEquals(check, 4);
});
Deno.test('enqueue asyncqueue with child close', async function() {
    const asq = new AsyncQueue<number>(3);
    const asq2 = new AsyncQueue<number>();
    asq.enqueue(0);
    asq2.enqueue(1);
    setTimeout(() => {
        asq.enqueue(asq2);
        asq.enqueue(2);
        asq2.enqueue(3);
        asq2.close();
    }, 250);
    let check = 0;
    for await (const pull of asq) {
        assertStrictEquals(pull, check);
        check++;
    }
    assertStrictEquals(check, 4);
});
Deno.test('enqueue asyncqueue with child close all after', async function() {
    const asq = new AsyncQueue<number>(3);
    const asq2 = new AsyncQueue<number>(1);
    setTimeout(() => {
        asq.enqueue(0);
        asq.enqueue(asq2);
        asq2.enqueue(1);
        asq.enqueue(2);
    }, 250);
    let check = 0;
    for await (const pull of asq) {
        assertStrictEquals(pull, check);
        check++;
    }
    assertStrictEquals(check, 3);
});
Deno.test('enqueue asyncqueue with parent close', async function() {
    const asq = new AsyncQueue<number>();
    const asq2 = new AsyncQueue<number>(2);
    asq.enqueue(0);
    asq2.enqueue(1);
    setTimeout(() => {
        asq.enqueue(asq2);
        asq.enqueue(2);
        asq.close();
        asq2.enqueue(3);
    }, 250);
    let check = 0;
    for await (const pull of asq) {
        assertStrictEquals(pull, check);
        check++;
    }
    assertStrictEquals(check, 4);
});
Deno.test('enqueue asyncqueue in no-enqueue state', async function() {
    const asq = new AsyncQueue<number>();
    const asq2 = new AsyncQueue<number>(2);
    asq.enqueue(0);
    asq2.enqueue(1);
    asq2.enqueue(2);
    setTimeout(() => {
        asq.enqueue(asq2);
        asq.enqueue(3);
        asq.close();
    }, 250);
    let check = 0;
    for await (const pull of asq) {
        assertStrictEquals(pull, check);
        check++;
    }
    assertStrictEquals(check, 4);
});
Deno.test('enqueue asyncqueue in closed state', async function() {
    const asq = new AsyncQueue<number>();
    const asq2 = new AsyncQueue<number>(2);
    asq.enqueue(0);
    asq2.enqueue(91);
    asq2.enqueue(92);
    setTimeout(() => {
        asq2.next();
        asq2.next(); // asq2 now closed
        asq.enqueue(asq2); // won't put any items on queue
        asq.enqueue(1);
        asq.close();
    }, 250);
    let check = 0;
    for await (const pull of asq) {
        assertStrictEquals(pull, check);
        check++;
    }
    assertStrictEquals(check, 2);
});
Deno.test('enqueue 2 asyncqueues only', async function() {
    const asq = new AsyncQueue<number>();
    const asq2 = new AsyncQueue<number>(2);
    const asq3 = new AsyncQueue<number>(1);
    asq.enqueue(0);
    asq2.enqueue(1);
    setTimeout(() => {
        asq.enqueue(asq2);
        asq2.enqueue(2);
        asq.enqueue(asq3);
        asq.close();
    }, 250);
    setTimeout(() => {
        asq3.enqueue(3);
    });
    let check = 0;
    for await (const pull of asq) {
        assertStrictEquals(pull, check);
        check++;
    }
    assertStrictEquals(check, 4);
});
Deno.test('enqueue asyncqueue 2 levels', async function() {
    const asq = new AsyncQueue<number>();
    const asq2 = new AsyncQueue<number>(2);
    const asq3 = new AsyncQueue<number>(1);
    asq.enqueue(0);
    asq2.enqueue(1);
    setTimeout(() => {
        asq.enqueue(asq2);
        asq.enqueue(2);
        asq.close();
        asq2.enqueue(asq3);
    }, 250);
    setTimeout(() => {
        asq3.enqueue(3);
    }, 500);
    let check = 0;
    for await (const pull of asq) {
        assertStrictEquals(pull, check);
        check++;
    }
    assertStrictEquals(check, 4);
});
Deno.test('enqueue asyncqueue in all-enqueued state 2 levels', async function() {
    const asq = new AsyncQueue<number>();
    const asq2 = new AsyncQueue<number>(2);
    const asq3 = new AsyncQueue<number>(1);
    asq.enqueue(0);
    asq2.enqueue(99);
    setTimeout(() => {
        asq2.enqueue(asq3);
        asq3.enqueue(1);
        asq2.next(); // pops 99 from asq2
    }, 250);
    setTimeout(() => {
        asq.enqueue(asq2); // enqueues item 1 remaining on asq2
        asq.enqueue(2);
        asq.close();
    }, 500);
    let check = 0;
    for await (const pull of asq) {
        assertStrictEquals(pull, check);
        check++;
    }
    assertStrictEquals(check, 3);
});
Deno.test('flatmaps sync', async function() {
    const asq = new AsyncQueue<number>(2);
    asq.enqueue(0);
    setTimeout(() => asq.enqueue(1), 200);
    let check = 0;
    for await (const pull of asq.flatMap(item => item * 2)) {
        assertStrictEquals(pull, check);
        check += 2;
    }
});
Deno.test('flatmaps async', async function() {
    const asq = new AsyncQueue<number>(2);
    asq.enqueue(0);
    setTimeout(() => asq.enqueue(1), 50);
    let check = 0;
    for await (const pull of asq.flatMap(item =>
        new Promise((resolve) => setTimeout(() => resolve(item * 2), 200)))) {
        assertStrictEquals(pull, check);
        check += 2;
    }
});
Deno.test('flatmaps mixed sync async', async function() {
    const asq = new AsyncQueue<number>(2);
    asq.enqueue(0);
    setTimeout(() => asq.enqueue(1), 50);
    let check = 0;
    const asq2 = asq.flatMap(item =>
        new Promise((resolve) => item === 1
            ? setTimeout(() => resolve(item * 2), 200)
            : resolve(0)));
    for await (const pull of asq2) {
        assertStrictEquals(pull, check);
        console.log(pull);
        check += 2;
    }
    console.log('loop done');
    assert(check > 2);
});
Deno.test('flatmaps async close', async function() {
    const asq = new AsyncQueue<number>();
    asq.enqueue(0);
    setTimeout(() => {
        asq.enqueue(1);
        asq.close();
    }, 200);
    let check = 0;
    for await (const pull of asq.flatMap(item =>
        new Promise((resolve) => setTimeout(() => resolve(item * 2), 200)))) {
        assertStrictEquals(pull, check);
        check += 2;
    }
});