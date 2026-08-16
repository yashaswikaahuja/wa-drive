/**
 * Optional local sink — NOT used for product extension hooks.
 * Reserved for future external tools. Prefer: cc-debug live (API poll).
 */
export async function startWatchServer() {
  throw new Error(
    'Local watch-server is disabled. Product extension must not be patched.\n' +
      'Use: node extension-dev/cli/cc-debug.mjs live\n' +
      'which records from the LIVE server as the real extension posts fill data.'
  );
}
