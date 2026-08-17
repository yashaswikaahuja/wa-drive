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
    else if (a === '--id' || a === '--session') flags.id = next();
    else if (a === '--limit') flags.limit = Number(next());
    else if (a === '--poll-ms') flags.pollMs = Number(next());
    else if (a === '--progressive') flags.progressive = true;
    else if (a === '--batch') flags.progressive = false;
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
cc-debug — LIVE operator fill recording (no product extension patches)
DEBUG BRANCH ONLY (debug/cc-cli). Never merge to master.
Does NOT edit files under extension/ — only extension-dev/cli/.

PRIMARY WORKFLOW (live record)
  1. Use the NORMAL production extension (or whatever you ship)
  2. Operator logs in, opens REAL form, clicks Fill Form
  3. Extension already posts fill-plan + fill-observation + sessions to the LIVE API
  4. This CLI reads that live data and prints a detailed report

  # Auth (optional if file present):
  #   auto backend: https://api.cybercontrol.fun/api
  #   auto token:   extension-dev/cli/out/ramishwar-access.jwt  (gitignored)
  # Or set explicitly:
  #   $env:CC_BACKEND_URL = "https://api.cybercontrol.fun/api"
  #   $env:CC_ACCESS_TOKEN = (Get-Content extension-dev\\cli\\out\\ramishwar-access.jwt -Raw).Trim()

  # stream new sessions as the operator fills:
  node extension-dev/cli/cc-debug.mjs live

  # list recent fills (shows sum step ms):
  node extension-dev/cli/cc-debug.mjs sessions

  # one session detail (per-field ms + TIMING block + timeline):
  node extension-dev/cli/cc-debug.mjs session --id <session-uuid>

  # env check (backend health + token present):
  node extension-dev/cli/cc-debug.mjs status

LAB (optional — does not replace live operator path)
  fill --url ... --profile ...              CLI-driven fill
  fill ... --progressive                    live per-step clock (watch field-by-field)
  fill ... --batch                          one-shot APE (product-like)
  status                                    env check

TIMING NOTES
  Product fill: perceive → /fill-plan → execute ALL steps → POST /fill-observation ONCE.
  Sessions API only updates after that final post (not mid-fill).
  Each record still has durationMs for how long that field's act took.
  Legacy (5.91) also has absolute ts → wall timeline in session report.

Never: patch extension/*.js for debug. Keep product version-independent.
`);
}
