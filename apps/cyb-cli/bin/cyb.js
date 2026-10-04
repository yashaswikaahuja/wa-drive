#!/usr/bin/env node
// Generated from cyb.ts — edit cyb.ts, then pnpm build.

import { main } from "../src/index.mjs";
main(process.argv.slice(2)).catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`
Error: ${message || e}`);
  process.exit(1);
});
