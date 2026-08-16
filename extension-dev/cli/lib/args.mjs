/**
 * Minimal argv parser for cc-debug (no external deps).
 */

export function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {
    _: [],
    mode: null, // null → command default (fill defaults to live)
    headed: null, // null → command default (fill defaults headed)
    keepOpen: false,
    timeoutMs: 90000,
    maxSteps: 5,
    extension: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => {
      const v = args[++i];
      if (v == null || v.startsWith('-')) throw new Error(`Missing value after ${a}`);
      return v;
    };

    if (a === '--help' || a === '-h') flags.help = true;
    else if (a === '--headed') flags.headed = true;
    else if (a === '--headless') flags.headed = false;
    else if (a === '--keep-open') flags.keepOpen = true;
    else if (a === '--url') flags.url = next();
    else if (a === '--fixture') flags.fixture = next();
    else if (a === '--out') flags.out = next();
    else if (a === '--chrome-path') flags.chromePath = next();
    else if (a === '--timeout-ms') flags.timeoutMs = Number(next());
    else if (a === '--mode') flags.mode = next();
    else if (a === '--backend-url') flags.backendUrl = next();
    else if (a === '--token') flags.token = next();
    else if (a === '--token-env') flags.tokenEnv = next();
    else if (a === '--profile') flags.profile = next();
    else if (a === '--profile-id') flags.profileId = next();
    else if (a === '--execution-preference') flags.executionPreference = next();
    else if (a === '--plan') flags.plan = next();
    else if (a === '--step-id') flags.stepId = next();
    else if (a === '--max-steps') flags.maxSteps = Number(next());
    else if (a === '--force-lie') flags.forceLie = true;
    else if (a === '--file' || a === '--trace') flags.file = next();
    else if (a === '--extension' || a === '--runtime-extension') flags.extension = true;
    else if (a === '--runtime') {
      const v = next();
      if (v === 'extension' || v === 'ext') flags.extension = true;
      else if (v === 'page' || v === 'inpage') flags.extension = false;
      else throw new Error(`Unknown --runtime ${v} (use page|extension)`);
    } else if (a.startsWith('-')) throw new Error(`Unknown flag: ${a}`);
    else flags._.push(a);
  }

  flags.command = flags._[0] || null;
  return flags;
}

export function printHelp() {
  console.log(`
cc-debug — fill a REAL form and report what happened
DEBUG BRANCH ONLY (debug/cc-cli). Never merge to master.

PRIMARY WORKFLOW (recommended)
  1. Load this branch's extension in Chrome (unpacked: extension/)
  2. Login as the café operator (normal CONNECT / login)
  3. Open a REAL form, pick profile, click Fill Form
  4. Extension downloads cc-fill-trace-*.json (Downloads)
  5. Analyze:

  node extension-dev/cli/cc-debug.mjs report --file %USERPROFILE%\\Downloads\\cc-fill-trace-....json

  Report shows: plan steps, EO claims, binding DOM, MAIN-world DOM, GAPS to fix.

OTHER
  report --file <trace.json>   Analyze a captured operator fill (primary)
  status                       Env check
  fill --url ...               LAB ONLY: CLI-driven fill (not real operator path)

Exit 0 on report if no lies and no fails.
`);
}
