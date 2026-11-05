import assert from "node:assert/strict";
import { hashAuthorizationToken } from "./service.ts";

const token = "a".repeat(43);
const hash = hashAuthorizationToken(token);
assert.match(hash, /^[a-f0-9]{64}$/);
assert.equal(hashAuthorizationToken(token), hash);
assert.notEqual(hashAuthorizationToken(token + "b"), hash);
console.log("PRIVACY_LIFECYCLE_HELPERS_OK");
