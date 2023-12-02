export interface ISmsAdapter {
  send(phoneNumber: string, message: string): Promise<number>;
}
