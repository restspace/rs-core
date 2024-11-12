import { IAdapter } from "./IAdapter.ts";

/**
 * Interface for SMS operations.
 */
export interface ISmsAdapter extends IAdapter {
  /**
   * Sends an SMS message.
   * @param {string} phoneNumber - The phone number to send the SMS to.
   * @param {string} message - The message to send.
   * @returns {Promise<number>} - A promise that resolves to an HTTP status code for the request.
   */
  send(phoneNumber: string, message: string): Promise<number>;
}
