import { ArrayQueue } from "./asyncQueue.ts";

export type Limiter = (fn: (...args: any[]) => any, ...args: any[]) => Promise<any>

export function limitConcurrency(concurrency: number): Limiter {
	if (!((Number.isInteger(concurrency) || concurrency === Number.POSITIVE_INFINITY) && concurrency >= 0)) {
		throw new TypeError('Expected `concurrency` to be a number from 0 and up');
	}
	if (concurrency === 0) concurrency = Number.POSITIVE_INFINITY;

	const queue = new ArrayQueue<any>();
	let activeCount = 0;

	const next = () => {
		activeCount--;

		if (queue.length > 0) {
			queue.dequeue()();
		}
	};

	const run = async (fn: (...args: any[]) => any, resolve: (val: any) => void, args: any[]) => {
		activeCount++;

		const result: any = (async () => fn(...args))();

		resolve(result);

		try {
			await result;
		} catch {}

		next();
	};

	const enqueue = (fn: (...args: any[]) => any, resolve: (val: any) => void, args: any[]) => {
		queue.enqueue(run.bind(undefined, fn, resolve, args));

		(async () => {
			// This function needs to wait until the next microtask before comparing
			// `activeCount` to `concurrency`, because `activeCount` is updated asynchronously
			// when the run function is dequeued and called. The comparison in the if-statement
			// needs to happen asynchronously as well to get an up-to-date value for `activeCount`.
			await Promise.resolve();

			if (activeCount < concurrency && queue.length > 0) {
				queue.dequeue()();
			}
		})();
	};

	const generator = (fn: (...args: any[]) => any, ...args: any[]) => new Promise<any>(resolve => {
		enqueue(fn, resolve, args);
	});

	Object.defineProperties(generator, {
		activeCount: {
			get: () => activeCount,
		},
		pendingCount: {
			get: () => queue.length,
		},
		clearQueue: {
			value: () => {
				while (queue.length) queue.pop();
			},
		},
	});

	return generator;
}