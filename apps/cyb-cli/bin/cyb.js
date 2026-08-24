#!/usr/bin/env node
import { main } from '../src/index.mjs';

main(process.argv.slice(2)).catch((e) => {
  console.error(`\nError: ${e?.message || e}`);
  process.exit(1);
});
