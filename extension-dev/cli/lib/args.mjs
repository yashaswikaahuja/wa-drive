/**
 * Minimal argv parser for cc-debug (no external deps).
 */

export function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {
    _: [],
    mode: 'offline',
    headed: false,
    keepOpen: false,
    timeoutMs: 60000,
    maxSteps: 5,
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
    else if (a === '--execution-preference') flags.executionPreference = next();
    else if (a === '--plan') flags.plan = next();
    else if (a === '--step-id') flags.stepId = next();
    else if (a === '--max-steps') flags.maxSteps = Number(next());
    else if (a === '--force-lie') flags.forceLie = true; // offline debug: claim filled without execute
    else if (a.startsWith('-')) throw new Error(`Unknown flag: ${a}`);
    else flags._.push(a);
  }

  flags.command = flags._[0] || null;
  return flags;
}

export function printHelp() {
  console.log(`
cc-debug — CyberControl product-path debug CLI (DEBUG BRANCH ONLY)

  NEVER merge this branch to master. Debug tooling only.

Usage:
  node extension-dev/cli/cc-debug.mjs <command> [options]

Commands:
  status       Chrome path, git SHA, fixture roots, optional service health
  perceive     Inject product path; dump Page IR snapshot
  plan         Build offline plan (or load --plan); live mode Phase 2
  execute      Run ActionPlan via CcActionPlanExecutor; dump EO
  observe-dom  Read live DOM values for plan step targets
  fill-e2e     perceive → plan → execute → DOM truth gate

Options:
  --fixture <name|path>   HTML under extension-dev/tests/fixtures or absolute path
  --url <url>             Page URL (file:// or https://)
  --out <dir>             Artifact directory (default: extension-dev/cli/out/<id>)
  --chrome-path <path>    Chrome executable
  --headed                Show browser
  --keep-open             Pause after run (implies --headed)
  --timeout-ms <n>        Default 60000
  --mode offline|live     Default offline
  --plan <json>           Use existing ActionPlan
  --max-steps <n>         Offline plan max type_text steps (default 5)
  --step-id <id>          Filter execute/observe to one step
  --backend-url <url>     Live mode
  --token <jwt>           Live mode
  --token-env <VAR>       Live mode token from env (default ACCESS_TOKEN / CC_ACCESS_TOKEN)
  --profile <json>        Live mode profile file
  --execution-preference AUTO|STATIC|DYNAMIC
  --force-lie             Debug only: skip execute but claim filled (tests truth gate)

Examples:
  node extension-dev/cli/cc-debug.mjs status
  node extension-dev/cli/cc-debug.mjs fill-e2e --fixture perception-native.html
  node extension-dev/cli/cc-debug.mjs perceive --fixture perception-native.html --headed
`);
}
