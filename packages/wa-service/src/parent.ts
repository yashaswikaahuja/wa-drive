/**
 * Parent hub + resolver HTTP helpers.
 */
export function createParentBridge(config: any) {
  const { PARENT_URL, SERVICE_SECRET, WA_SECRET, RESOLVER_URL } = config;

  async function uploadToParent(workspaceId: any, buffer: any, fileName: any, phone: any, pushName: any, profilePicUrl: any) {
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

    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (res.status >= 400) throw new Error(`Upload failed: ${res.status} ${res.body.substring(0, 100)}`);
  }

  async function notifyParent(workspaceId: any, event: any, data: any) {
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

  async function resolverFetch(pathname: any, options = {}) {
    // @ts-expect-error TS(2339): Property 'attempts' does not exist on type '{}'.
    const { attempts = 2, timeoutMs = 8000, ...fetchOpts } = options;
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const r = await fetch(`${RESOLVER_URL}${pathname}`, {
          ...fetchOpts,
          signal: controller.signal,
        });
        if (r.ok || ![502, 503, 504].includes(r.status) || attempt === attempts) return r;
        lastError = new Error(`resolver HTTP ${r.status}`);
      } catch (e) {
        lastError = e;
        if (attempt === attempts) throw e;
      } finally {
        clearTimeout(timer);
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
    throw lastError || new Error('resolver request failed');
  }

  async function resolveLid(lidNum: any) {
    const r = await resolverFetch(`/resolve?lid=${encodeURIComponent(lidNum)}`, {
      headers: { 'x-service-secret': WA_SECRET },
      attempts: 3,
      timeoutMs: 10000,
    });
    if (!r.ok) {
      const err = new Error(`resolver HTTP ${r.status}`);
      // @ts-expect-error TS(2339): Property 'status' does not exist on type 'Error'.
      err.status = r.status;
      throw err;
    }
    return r.json();
  }

  async function fetchContactName(phone: any) {
    const r = await resolverFetch(`/contact?phone=${encodeURIComponent(phone)}`, {
      headers: { 'x-service-secret': WA_SECRET },
      attempts: 2,
      timeoutMs: 8000,
    });
    if (!r.ok) {
      const err = new Error(`resolver HTTP ${r.status}`);
      // @ts-expect-error TS(2339): Property 'status' does not exist on type 'Error'.
      err.status = r.status;
      throw err;
    }
    return r.json();
  }

  async function sendHeartbeatPayload(body: any) {
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
