import { Delayer, ensureDelay } from "../utility/ensureDelay.ts";
import { BaseStateClass, SimpleServiceContext } from "../ServiceContext.ts";

export interface QuotaQueueConfig {
	reqSec?: number;
	reqMin?: number;
}

export class QuotaQueueState extends BaseStateClass {
    delayers: Record<string, Delayer> = {};

    override async load(_context: SimpleServiceContext, config: QuotaQueueConfig) {
    }

    ensureDelayer(key: string, qConfig: QuotaQueueConfig) {
        if (this.delayers[key]) return;
        const secDelayMs = qConfig?.reqSec && (1000 / (qConfig.reqSec || 1) + 1);
        const minDelayMs = qConfig?.reqMin && (60000 / (qConfig.reqMin || 1) + 1);
        let delayMs: number;
        if (secDelayMs && minDelayMs) {
            delayMs = Math.min(secDelayMs, minDelayMs);
        } else {
            delayMs = secDelayMs || minDelayMs || 0;
        }
        this.delayers[key] = ensureDelay(delayMs, 0);
    }

    async wait(key: string) {
        await this.delayers[key](() => Promise.resolve());
    }
}