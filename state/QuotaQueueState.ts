import { Delayer, ensureDelay } from "../utility/ensureDelay.ts";
import { BaseStateClass, SimpleServiceContext } from "../ServiceContext.ts";

export interface QuotaQueueConfig {
	reqSec?: number;
	reqMin?: number;
}

export class QuotaQueueState extends BaseStateClass {
    delayer?: Delayer;

    async load(_context: SimpleServiceContext, config: QuotaQueueConfig) {
        const secDelayMs = config?.reqSec && (1000 / (config.reqSec || 1) + 1);
        const minDelayMs = config?.reqMin && (60000 / (config.reqMin || 1) + 1);
        let delayMs: number;
        if (secDelayMs && minDelayMs) {
            delayMs = Math.min(secDelayMs, minDelayMs);
        } else {
            delayMs = secDelayMs || minDelayMs || 0;
        }
        this.delayer = ensureDelay(delayMs, 0);
    }
}