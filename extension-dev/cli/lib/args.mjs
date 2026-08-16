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

PRIMARY COMMAND
  fill     Open a real page (or fixture), run product fill, print:
           what was planned, what claimed ok/fail, what the DOM shows

  node extension-dev/cli/cc-debug.mjs fill --url "https://portal.../form" ^
    --profile .\\my-profile.json ^
    --backend-url https://api.../api ^
    --token YOUR_JWT

  # env alternatives:
  #   CC_BACKEND_URL, CC_ACCESS_TOKEN (or ACCESS_TOKEN)

  node extension-dev/cli/cc-debug.mjs fill --url "..." --profile p.json --headed --keep-open

REQUIRED for live fill (default for "fill")
  --url <https://...>          Real form page
  --profile <json-file>        Profile object or { id, data: {...} }
  --backend-url <url>          Extension-service base (…/api)
  --token <jwt>                Or CC_ACCESS_TOKEN / ACCESS_TOKEN

OPTIONAL
  --execution-preference AUTO|STATIC|DYNAMIC
  --headed / --headless        fill defaults to headed
  --keep-open                  Leave browser open ~60s after report
  --out <dir>                  Artifact folder
  --chrome-path <path>
  --timeout-ms <n>

LAB / SECONDARY (not the main goal)
  fill-e2e --fixture …         Offline fixture truth-gate harness
  perceive / plan / execute    Stage tools
  status                       Chrome + inject list + optional health

ARTIFACTS (every fill)
  extension-dev/cli/out/<run-id>/
    report.txt          ← human fill report (start here)
    snapshot.json plan.json execution.json
    dom-after.json main-world-after.json truth.json meta.json

Exit code: 0 only if no fails and no DOM lies.
`);
}
