/**
 * Parent hub + resolver HTTP helpers.
 */
export function createParentBridge(config) {
  const { PARENT_URL, SERVICE_SECRET, WA_SECRET, RESOLVER_URL } = config;

  async function uploadToParent(workspaceId, buffer, fileName, phone, pushName, profilePicUrl) {
    const FormData = (await import('form-data')).default;
    const https = await import('https');
    const http = await import('http');
    const url = new URL(`${PARENT_URL}/api/worker/upload`);

    const form = new FormData();
    form.append('file', buffer, { filename: fileName, contentType: 'application/octet-stream' });
    form.append('phone', phone);
    form.append('senderName', pushName);
    form.append('workspaceId', workspaceId);
    form.append('fileName', fileName);
    if (profilePicUrl) form.append('profilePicUrl', profilePicUrl);

    const mod = url.protocol === 'https:' ? https : http;

    const res = await new Promise((resolve, reject) => {
      const req = mod.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: { ...form.getHeaders(), 'x-worker-secret': SERVICE_SECRET },
        },
        (r) => {
          let d = '';
          r.on('data', (c) => (d += c));
          r.on('end', () => resolve({ status: r.statusCode, body: d }));
        },
      );
      req.on('error', reject);
      form.pipe(req);
    });

    if (res.status >= 400) throw new Error(`Upload failed: ${res.status} ${res.body.substring(0, 100)}`);
  }

  async function notifyParent(workspaceId, event, data) {
    try {
      await fetch(`${PARENT_URL}/api/worker/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-worker-secret': SERVICE_SECRET },
        body: JSON.stringify({ workspaceId, event, ...data }),
      });
    } catch {
      /* hub unreachable */
    }
  }

  async function resolveLid(lidNum) {
    const r = await fetch(`${RESOLVER_URL}/resolve?lid=${lidNum}`, {
      headers: { 'x-service-secret': WA_SECRET },
    });
    if (!r.ok) {
      const err = new Error(`resolver HTTP ${r.status}`);
      err.status = r.status;
      throw err;
    }
    return r.json();
  }

  async function fetchContactName(phone) {
    const r = await fetch(`${RESOLVER_URL}/contact?phone=${phone}`, {
      headers: { 'x-service-secret': WA_SECRET },
    });
    if (!r.ok) {
      const err = new Error(`resolver HTTP ${r.status}`);
      err.status = r.status;
      throw err;
    }
    return r.json();
  }

  async function sendHeartbeatPayload(body) {
    await fetch(`${PARENT_URL}/api/worker/instance-heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-worker-secret': SERVICE_SECRET },
      body: JSON.stringify(body),
    });
  }

  return {
    uploadToParent,
    notifyParent,
    resolveLid,
    fetchContactName,
    sendHeartbeatPayload,
  };
}
