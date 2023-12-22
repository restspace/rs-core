import { Message } from "../Message.ts";
import { IAdapter } from "./IAdapter.ts";

/**
 * Adapter interface for preparing a message to be forwarded to an external service
 */
export interface IProxyAdapter extends IAdapter {
    /**
     * Takes the incoming message to the proxy and modifies it so it is ready to be sent to the external service
     * @param {Message} msg - The plain message received or created by the service.
     * @returns {Promise<Message>} - The message which is ready to be sent to the proxied external service
     */
    buildMessage(msg: Message): Promise<Message>;
}