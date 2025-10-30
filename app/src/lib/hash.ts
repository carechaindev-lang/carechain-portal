/* eslint-disable @typescript-eslint/no-explicit-any */
import { blake2b } from "blakejs";
export const blake2b256 = (data: Uint8Array | string) =>
  blake2b(
    typeof data === "string" ? new TextEncoder().encode(data) : data,
    null as any,
    32
  );
