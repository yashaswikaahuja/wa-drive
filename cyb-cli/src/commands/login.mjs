import { createInterface } from 'node:readline';
import { resolveApiBase, credentialsPath, CLI_VERSION } from '../config.mjs';
import { saveCredentials } from '../credentials.mjs';
import { startDeviceLogin, pollDeviceLogin, passwordLogin } from '../api.mjs';
import { openBrowser } from '../open.mjs';

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      rl.close();
      resolve(String(ans || '').trim());
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Browser device-code login (primary).
 * Fallbacks: --email/--password, --token
 */
export async function cmdLogin(flags) {
  const apiBase = resolveApiBase(flags);

  if (flags.token) {
    const path = saveCredentials({
      accessToken: flags.token,
      refreshToken: null,
      user: null,
      apiBase,
    });
    console.log(`Logged in with token → ${path}`);
    return;
  }

  if (flags.email || flags.password) {
    const email = flags.email || (await ask('Email or phone: '));
    const password = flags.password || (await ask('Password: '));
    const data = await passwordLogin(apiBase, email, password);
    const path = saveCredentials({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
      apiBase,
    });
    console.log(`Logged in as ${data.user?.email || data.user?.name || data.user?.id || 'user'}`);
    console.log(`Credentials → ${path}`);
    return;
  }

  // ── Browser device flow ──────────────────────────────────────────
  console.log(`cyb login  (v${CLI_VERSION})`);
  console.log(`API       ${apiBase}`);
  console.log('');

  let device;
  try {
    device = await startDeviceLogin(apiBase);
  } catch (e) {
    console.error(e.message);
    console.error('');
    console.error('Trying password login instead…');
    const email = await ask('Email or phone: ');
    const password = await ask('Password: ');
    const data = await passwordLogin(apiBase, email, password);
    const path = saveCredentials({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
      apiBase,
    });
    console.log(`Logged in as ${data.user?.email || data.user?.name || data.user?.id || 'user'}`);
    console.log(`Credentials → ${path}`);
    return;
  }

  const verifyUrl = device.verification_uri_complete || `${device.verification_uri}?user_code=${device.user_code}`;
  console.log('To authenticate, open this URL in a browser (if it does not open automatically):');
  console.log('');
  console.log(`  ${verifyUrl}`);
  console.log('');
  console.log(`  Device code:  ${device.user_code}`);
  console.log('');
  console.log('Waiting for browser authorization…  (Ctrl+C to cancel)');

  const opened = openBrowser(verifyUrl);
  if (!opened) console.log('(Could not auto-open browser — paste the URL above.)');

  const intervalMs = Math.max(2, Number(device.interval) || 3) * 1000;
  const deadline = Date.now() + (Number(device.expires_in) || 900) * 1000;

  while (Date.now() < deadline) {
    await sleep(intervalMs);
    let poll;
    try {
      poll = await pollDeviceLogin(apiBase, device.device_code);
    } catch (e) {
      process.stdout.write('.');
      continue;
    }
    if (poll.status === 'pending') {
      process.stdout.write('.');
      continue;
    }
    if (poll.status === 'expired') {
      console.log('\nCode expired. Run: cyb login');
      process.exit(1);
    }
    if (poll.status === 'approved' && poll.accessToken) {
      const path = saveCredentials({
        accessToken: poll.accessToken,
        refreshToken: poll.refreshToken,
        user: poll.user,
        apiBase,
      });
      console.log('\n');
      console.log(`✓ Logged in as ${poll.user?.email || poll.user?.name || poll.user?.id || 'operator'}`);
      if (poll.user?.workspaceId) console.log(`  workspace  ${poll.user.workspaceId}`);
      console.log(`  credentials ${path}`);
      console.log(`  (also: ${credentialsPath()})`);
      return;
    }
    process.stdout.write('.');
  }
  console.log('\nTimed out waiting for authorization. Run: cyb login');
  process.exit(1);
}
