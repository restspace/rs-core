import { ArrayQueue } from "./asyncQueue.ts";

export type Delayer = ((fn: () => Promise<any>) => Promise<any>) & { pendingCount: number, clearQueue: () => void, clearTimeout: () => void };

export const ensureDelay = (minDelayMs: number, randomOffsetMs: number) => {
    const queue = new ArrayQueue<any>();
    let delayHandle = null as number | null;

	const delayThenNext = () => {
        delayHandle = setTimeout(() => {
            if (queue.length > 0) {
                queue.dequeue()(); // when first item on queue resolves
            } else {
                delayHandle = null;
            }
        }, minDelayMs + Math.random() * randomOffsetMs);
	};

	const enqueue = (fn: () => Promise<any>, resolve: (val: any) => void) => {
		queue.enqueue(
            async () => {
                delayThenNext();
                resolve(await fn());
            }
        );

        if (delayHandle === null) {
            delayThenNext();
        }
	};

	const generator = (fn: () => Promise<any>) => new Promise<any>(resolve => {
		enqueue(fn, resolve);
	});

	Object.defineProperties(generator, {
		pendingCount: {
			get: () => queue.length,
		},
		clearQueue: {
			value: () => {
				while (queue.length) queue.pop();
			},
		},
        clearTimeout: {
            value: () => {
                if (delayHandle !== null) clearTimeout(delayHandle);
            }
        }
	});

	return generator as Delayer;
}