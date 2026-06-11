import { validateSignature } from "@line/bot-sdk";

export function verifyLineSignature(
  body: Buffer,
  signature: string | undefined,
  channelSecret: string
): boolean {
  if (!signature) {
    return false;
  }
  return validateSignature(body, channelSecret, signature);
}
