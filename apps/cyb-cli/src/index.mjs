import { CLI_VERSION } from './config.mjs';
import { cmdLogin } from './commands/login.mjs';
import { cmdLogout } from './commands/logout.mjs';
import { cmdWhoami } from './commands/whoami.mjs';
import { cmdSessions, cmdSession } from './commands/sessions.mjs';
import { cmdLive } from './commands/live.mjs';
import { cmdStatus } from './commands/status.mjs';

function parseArgs(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v == null || v.startsWith('-')) throw new Error(`Missing value after ${a}`);
      return v;
    };
    if (a === '--help' || a === '-h') flags.help = true;
    else if (a === '--version' || a === '-V') flags.version = true;
    else if (a === '--api' || a === '--backend-url') flags.api = next();
    else if (a === '--token') flags.token = next();
    else if (a === '--email') flags.email = next();
    else if (a === '--password') flags.password = next();
    else if (a === '--limit') flags.limit = Number(next());
    else if (a === '--poll-ms') flags.pollMs = Number(next());
    else if (a === '--id' || a === '--session') flags.id = next();
    else if (a === '--local-only') flags.localOnly = true;
    else if (a.startsWith('-')) throw new Error(`Unknown flag: ${a}`);
    else flags._.push(a);
  }
  flags.command = flags._[0] || null;
  if (flags.command) flags._ = flags._.slice(1);
  return flags;
}

export function printHelp() {
  console.log(`
cyb — CyberControl operator CLI  v${CLI_VERSION}

Install:
  curl -fsSL https://raw.githubusercontent.com/yashaswikaahuja/wa-drive/debug/cc-cli/cyb-cli/install.sh | bash
  # Windows PowerShell:
  irm https://raw.githubusercontent.com/yashaswikaahuja/wa-drive/debug/cc-cli/cyb-cli/install.ps1 | iex

Auth:
  cyb login                 Browser device login (opens browser, like gh / grok)
  cyb login --email you@x   Password login in terminal
  cyb login --token <jwt>   Paste an access JWT
  cyb logout
  cyb whoami
  cyb status

Sessions (live operator fills):
  cyb sessions [--limit 20]
  cyb session <uuid>
  cyb live                  WSS field-by-field stream (fallback: HTTPS poll)
  cyb live --poll-ms 3000   HTTPS poll interval if WSS unavailable

Global flags:
  --api <url>     API base (default https://api.cybercontrol.fun/api)
  --token <jwt>   One-shot token (does not replace saved login for other cmds unless login --token)

Credentials file: platform config dir / cybercontrol / credentials.json
  Windows: %APPDATA%\\cybercontrol\\credentials.json
  macOS/Linux: ~/.config/cybercontrol/credentials.json
`);
}

export async function main(argv) {
  const flags = parseArgs(argv);

  if (flags.version) {
    console.log(CLI_VERSION);
    return;
  }
  if (flags.help || !flags.command) {
    printHelp();
    if (!flags.command && !flags.help) process.exitCode = 1;
    return;
  }

  switch (flags.command) {
    case 'login':
      await cmdLogin(flags);
      break;
    case 'logout':
      await cmdLogout(flags);
      break;
    case 'whoami':
    case 'me':
      await cmdWhoami(flags);
      break;
    case 'status':
      await cmdStatus(flags);
      break;
    case 'sessions':
    case 'ls':
      await cmdSessions(flags);
      break;
    case 'session':
    case 'show':
      await cmdSession(flags);
      break;
    case 'live':
    case 'watch':
      await cmdLive(flags);
      break;
    case 'help':
      printHelp();
      break;
    case 'version':
      console.log(CLI_VERSION);
      break;
    default:
      console.error(`Unknown command: ${flags.command}`);
      printHelp();
      process.exit(1);
  }
}
