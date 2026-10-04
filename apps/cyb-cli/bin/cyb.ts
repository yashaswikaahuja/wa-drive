import { main } from '../src/index.js';

main(process.argv.slice(2)).catch((e: unknown) => {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`\nError: ${message || e}`);
  process.exit(1);
});
