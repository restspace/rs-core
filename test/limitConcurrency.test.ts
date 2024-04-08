import { assertEquals } from "https://deno.land/std@0.185.0/testing/asserts.ts";

import { limitConcurrency } from '../utility/limitConcurrency.ts';
import { ensureDelay } from '../utility/ensureDelay.ts';

const wait = (ms: number, idx: number, results: number[]) => {
    return new Promise<void>(res => setTimeout(() => {
        results.push(idx);
        res();
    }, ms));
}

Deno.test('null effect limit concurrency', async () => {
    const limit = limitConcurrency(0);
    const results = [] as number[];
    const p0 = limit(() => wait(100, 1, results));
    const p1 = limit(() => wait(75, 2, results));
    const p2 = limit(() => wait(50, 3, results));
    await Promise.all([p0, p1, p2]);
    assertEquals(results, [3, 2, 1]);
});

Deno.test('delay 1 limit concurrency', async () => {
    const limit = limitConcurrency(2);
    const results = [] as number[];
    const p0 = limit(() => wait(100, 1, results));
    const p1 = limit(() => wait(75, 2, results));
    const p2 = limit(() => wait(50, 3, results));
    await Promise.all([p0, p1, p2]);
    assertEquals(results, [2, 1, 3]);
});

Deno.test('on at a time limit concurrency', async () => {
    const limit = limitConcurrency(1);
    const results = [] as number[];
    const p0 = limit(() => wait(100, 1, results));
    const p1 = limit(() => wait(75, 2, results));
    const p2 = limit(() => wait(50, 3, results));
    await Promise.all([p0, p1, p2]);
    assertEquals(results, [1, 2, 3]);
});

Deno.test('delay', async () => {
    const delay = ensureDelay(100, 0);
    const results = [] as number[];
    wait(120, 4, results);
    wait(230, 5, results);
    wait(280, 6, results);
    const p0 = delay(() => wait(50, 1, results));
    const p1 = delay(() => wait(50, 2, results));
    const p2 = delay(() => wait(50, 3, results));
    await Promise.all([p0, p1, p2]);
    delay.clearTimeout();
    assertEquals(results, [4, 1, 5, 2, 6, 3]);
});