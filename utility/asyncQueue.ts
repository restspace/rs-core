import { EventEmitter } from "events";

export class ArrayQueue<T> extends Array<T> {
    enqueue(value: T) {
        // Add at the end
        return this.push(value);
    }
    dequeue() {
        // Remove first element
        return this.shift();
    }
}

interface ResolveReject<T> {
    resolve: (value: IteratorResult<T, T> | PromiseLike<IteratorResult<T, T>>) => void,
    reject: (reason?: any) => void
}

type AsyncQueueState = "running" | "no-enqueue" | "all-enqueued" | "closed";

type AsyncQueueEvent<T> = { statechange( state: string ): any, enqueue(value: T | Error | null | AsyncQueue<T>): any };

export class AsyncQueue<T> implements AsyncIterator<T> {
    private _values: ArrayQueue<T | Error>;
    private _settlers: ArrayQueue<ResolveReject<T>>;
    private _nPassed = 0;
    private _nActiveChildren = 0;
    private _state: AsyncQueueState = "running";

    static queueCount = 0;
    private _qid: number;

    private emitter = new EventEmitter<AsyncQueueEvent<T>>();

    get nRemaining() {
        return this.maxPassed ? this.maxPassed - this._nPassed : 1;
    }

    constructor(public maxPassed?: number) {
        // enqueues > dequeues
        this._values = new ArrayQueue<T | Error>();
        // dequeues > enqueues
        this._settlers = new ArrayQueue<ResolveReject<T>>();
        this._qid = AsyncQueue.queueCount++;
        this.updateState();
    }

    private updateState(closeRequested: boolean = false) {
        const initState = this._state;
        if (this._state === "running"
            && (this.maxPassed && this._nPassed >= this.maxPassed || closeRequested)) {
            this.emitter.emit('statechange', 'no-enqueue');
            this._state = "no-enqueue";
        }
        if (this._state === "no-enqueue"
            && this._nActiveChildren === 0) {
            this.emitter.emit('statechange', 'all-enqueued');
            this._state = "all-enqueued";
        }
        if (this._state === "all-enqueued"
            && this._values.length === 0) {
            this.emitter.emit('statechange', 'closed');
            this._state = "closed";
            this.finalClose();
        }
    }

    [Symbol.asyncIterator]() {
        return this;
    }

    enqueue(value: T | Error | null | Promise<T | AsyncQueue<T>> | AsyncQueue<T>): AsyncQueue<T> {
        if (this._state !== "running") {
            throw new Error('Closed');
        }
        
        if (value instanceof Promise) {
            value
                .then(res => this.innerEnqueue(res, false))
                .catch(reason => {
                    if (!(reason instanceof Error)) reason = new Error(reason.toString());
                    this.innerEnqueue(reason as Error, false);
                });
        } else {
            this.innerEnqueue(value, false);
        }
        return this;
    }

    private innerEnqueue(value: T | Error | null | AsyncQueue<T>, fromChild: boolean) {
        if (this._state !== "running"
            && !(this._state === 'no-enqueue' && fromChild)) {
            throw new Error('Illegal internal enqueue after closed');
        }

        if (value instanceof AsyncQueue) {
            if (fromChild) return; // don't re-enqueue AsyncQueues queued on children
            this.attachSubqueue(value);
        } else {
            if (value !== null) { // null means reduce count but don't actually enqueue anything
                if (this._settlers.length > 0) {
                    if (this._values.length > 0) {
                        throw new Error('Illegal internal state');
                    }
                    const settler = this._settlers.dequeue() as ResolveReject<T>;
                    if (value instanceof Error) {
                        settler.reject(value);
                    } else {
                        settler.resolve({value});
                    }
                } else {
                    this._values.enqueue(value);
                }
            }
        }

        this.emitter.emit('enqueue', value);

        if (!fromChild) this._nPassed++;
        this.updateState();
    }

    // ensure future items enqueued on the subqueue are enqueued on this queue
    // parent can only terminate when children will not enqueue further items
    private attachSubqueue(subqueue: AsyncQueue<T>) {
        
        subqueue._values.forEach(val => this.innerEnqueue(val, true));

        // only if subqueue is not all enqueued
        if (subqueue._state === "running" || subqueue._state === "no-enqueue") {
            subqueue.on('enqueue', (val) => this.innerEnqueue(val, true));

            this._nActiveChildren++; // will not change state as can only occur when running
            const decrementActiveChildren = (newState: AsyncQueueState) => {
                if (newState === 'all-enqueued') {
                    this._nActiveChildren--;
                    this.updateState();
                    subqueue.off('statechange', decrementActiveChildren);
                }
            };
            subqueue.on('statechange', decrementActiveChildren);
        }
    }

    /**
     * @returns a Promise for an IteratorResult
     */
    next() {
        if (this._values.length > 0) {
            const value = this._values.dequeue();
            this.updateState();
            if (value instanceof Error) {
                return Promise.reject(value);
            } else {
                return Promise.resolve({ value } as IteratorResult<T, T>);
            }
        } else if (this._state === 'closed') {
            if (this._settlers.length > 0) {
                throw new Error('Illegal internal state');
            }
            return Promise.resolve({ done: true } as IteratorResult<T, T>);
        } else {
            // Wait for new values to be enqueued
            return new Promise<IteratorResult<T, T>>((resolve, reject) => {
                this._settlers.enqueue({resolve, reject});
            });
        }
    }

    close() {
        this.updateState(true);
    }

    private finalClose() {
        while (this._settlers.length > 0) {
            (this._settlers.dequeue() as ResolveReject<T>).resolve({done: true} as IteratorResult<T>);
        }
    }

    on(event: keyof AsyncQueueEvent<T>, listener: (...args: any[]) => void) {
        this.emitter.on(event, listener);
    }
    off(event: keyof AsyncQueueEvent<T>, listener: (...args: any[]) => void) {
        this.emitter.off(event, listener);
    }

    // returns an asyncqueue which is will return the outputs of the asyncqueue passed in after application
    // of a function passed in to their outputs
    flatMap(mapper: (item: T) => T | AsyncQueue<T> | Promise<T | AsyncQueue<T>> | Error | null | undefined): AsyncQueue<T> {
        const newAsq = new AsyncQueue<T>();
        const getResultsAsync = async () => {
            try
            {
                for await (const item of this) {
                    let res: T | AsyncQueue<T> | Promise<T | AsyncQueue<T>> | Error | null | undefined;
                    try {
                        res = mapper(item);
                        if (res instanceof Promise) {
                            res = await res;
                        }
                        if (res !== undefined) {
                            newAsq.enqueue(res);
                        }
                    } catch (err) {
                        newAsq.enqueue(err);
                    }
                }
            } catch (err) {
                newAsq.enqueue(err);
            }
            newAsq.close();
        };
        getResultsAsync();
        return newAsq;
    }

    static fromPromises<T>(...promises: Promise<T | null | undefined>[]): AsyncQueue<T> {
        const asq = new AsyncQueue<T>(promises.length);
        promises.forEach(promise => promise
            .then(val => {
                if (val !== null && val !== undefined) asq.enqueue(val);
            })
            .catch(reason => asq.enqueue(reason)));
        return asq;
    }
}