import { createHash } from "node:crypto";

/** Hash raw single-use privacy authorization tokens before persistence. */
export function hashAuthorizationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
