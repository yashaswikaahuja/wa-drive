#!/usr/bin/env node
// Generated from cyb.ts — edit sources, then pnpm build.


// src/config.ts
import { homedir, platform } from "node:os";
import { join } from "node:path";
var PUBLIC_DOMAIN = (process.env.PUBLIC_DOMAIN || process.env.CYB_PUBLIC_DOMAIN || "cybercontrol.fun").replace(/^\./, "");
var DEFAULT_API = process.env.CYB_API_URL || process.env.CC_BACKEND_URL || `https://api.${PUBLIC_DOMAIN}/api`;
var CLI_VERSION = "0.1.0";
function configDir() {
  if (process.env.CYB_CONFIG_DIR) return process.env.CYB_CONFIG_DIR;
  if (platform() === "win32") {
    const base = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
    return join(base, "cybercontrol");
  }
  const xdg = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(xdg, "cybercontrol");
}
function credentialsPath() {
  return join(configDir(), "credentials.json");
}
function resolveApiBase(flags = {}) {
  return (flags.api || process.env.CYB_API_URL || process.env.CC_BACKEND_URL || process.env.BACKEND_URL || DEFAULT_API).replace(/\/$/, "");
}

// src/commands/login.ts
import { createInterface } from "node:readline";

// src/credentials.ts
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, chmodSync } from "node:fs";

// src/jwt.ts
function peekJwtClaims(token) {
  try {
    const mid = String(token || "").split(".")[1];
    if (!mid) return null;
    const json = Buffer.from(mid.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}
function jwtTtlSeconds(token) {
  const claims = peekJwtClaims(token);
  if (!claims?.exp) return null;
  return Number(claims.exp) - Math.floor(Date.now() / 1e3);
}
function isJwtExpired(token, skewSeconds = 30) {
  const ttl = jwtTtlSeconds(token);
  if (ttl == null) return false;
  return ttl <= skewSeconds;
}

// src/api.ts
async function apiRequest(apiBase, path, { method = "GET", token, body, form, timeoutMs = 45e3 } = {}) {
  const base = String(apiBase || "").replace(/\/$/, "");
  const url = path.startsWith("http") ? path : base + path;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(form).toString();
  } else if (body !== void 0) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: payload,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (e) {
    const cause = e?.cause?.message || e?.message || String(e);
    throw new Error(`Network error ${method} ${url}
  ${cause}`);
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data, text, url };
}
async function apiGet(apiBase, token, path) {
  const { ok, status, data, url } = await apiRequest(apiBase, path, { token });
  if (!ok) {
    if (status === 401 || status === 403) {
      throw new Error(`Auth failed HTTP ${status} for ${url}
  Run: cyb login`);
    }
    throw new Error(`GET ${path} HTTP ${status}: ${JSON.stringify(data).slice(0, 400)}`);
  }
  return data;
}
async function authMe(apiBase, token) {
  return apiGet(apiBase, token, "/auth/me");
}
async function listSessions(apiBase, token, { limit = 20, offset = 0 } = {}) {
  const data = await apiGet(apiBase, token, `/sessions?limit=${limit}&offset=${offset}`);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.sessions)) return data.sessions;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  throw new Error(`Unexpected sessions shape: ${typeof data}`);
}
async function getSession(apiBase, token, id) {
  return apiGet(apiBase, token, `/sessions/${id}`);
}
async function startDeviceLogin(apiBase) {
  const { ok, status, data } = await apiRequest(apiBase, "/auth/cli/device", { method: "POST", body: {} });
  if (!ok) {
    throw new Error(
      `Device login not available (HTTP ${status}).
  ${JSON.stringify(data).slice(0, 200)}
  Backend needs /api/auth/cli/* deployed.
  Fallbacks:  cyb login --email you@x.com   or   cyb login --token <jwt>`
    );
  }
  return data;
}
async function pollDeviceLogin(apiBase, deviceCode) {
  const { ok, status, data } = await apiRequest(
    apiBase,
    `/auth/cli/poll?device_code=${encodeURIComponent(deviceCode)}`,
    { method: "GET", timeoutMs: 2e4 }
  );
  if (!ok && status !== 404) {
    throw new Error(`Poll failed HTTP ${status}: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data || { status: "expired" };
}
async function passwordLogin(apiBase, emailOrPhone, password) {
  const body = emailOrPhone.includes("@") ? { email: emailOrPhone.trim().toLowerCase(), password } : { phone: emailOrPhone.trim(), password };
  const { ok, status, data } = await apiRequest(apiBase, "/auth/login", { method: "POST", body });
  if (!ok) {
    throw new Error(data?.error || `Login failed HTTP ${status}`);
  }
  return data;
}
async function refreshTokens(apiBase, refreshToken) {
  const { ok, data } = await apiRequest(apiBase, "/auth/refresh", {
    method: "POST",
    body: { refreshToken }
  });
  if (!ok) return null;
  return data;
}

// src/types.ts
var AuthError = class extends Error {
  constructor(message, code) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
};

// src/credentials.ts
function loadCredentials() {
  const path = credentialsPath();
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (!raw?.accessToken) return null;
    return raw;
  } catch {
    return null;
  }
}
function saveCredentials({
  accessToken,
  refreshToken,
  user,
  apiBase
}) {
  const dir = configDir();
  mkdirSync(dir, { recursive: true });
  const path = credentialsPath();
  const payload = {
    accessToken,
    refreshToken: refreshToken || null,
    user: user || null,
    apiBase: (apiBase || resolveApiBase()).replace(/\/$/, ""),
    savedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  writeFileSync(path, JSON.stringify(payload, null, 2), "utf8");
  try {
    chmodSync(path, 384);
  } catch {
  }
  return path;
}
function clearCredentials() {
  const path = credentialsPath();
  if (existsSync(path)) unlinkSync(path);
  return path;
}
async function requireAuth(flags = {}) {
  const apiBase = resolveApiBase(flags).replace(/\/$/, "");
  if (flags.token) {
    if (isJwtExpired(flags.token)) {
      throw new AuthError(
        "Token expired (--token).\n  Run:  cyb login\n  Or paste a fresh JWT from the caf\xE9 app.",
        "TOKEN_EXPIRED"
      );
    }
    return { apiBase, accessToken: flags.token, user: null, source: "flag" };
  }
  if (process.env.CC_ACCESS_TOKEN || process.env.CYB_TOKEN || process.env.ACCESS_TOKEN) {
    const accessToken2 = (process.env.CYB_TOKEN || process.env.CC_ACCESS_TOKEN || process.env.ACCESS_TOKEN || "").trim();
    if (isJwtExpired(accessToken2)) {
      throw new AuthError(
        "Token expired (env).\n  Run:  cyb login\n  Or set a fresh CYB_TOKEN / CC_ACCESS_TOKEN.",
        "TOKEN_EXPIRED"
      );
    }
    return { apiBase, accessToken: accessToken2, user: null, source: "env" };
  }
  const creds = loadCredentials();
  if (!creds?.accessToken) {
    throw new AuthError(
      `Not logged in.
  Run:  cyb login
  Or:   cyb login --token <jwt>
  Creds: ${credentialsPath()}`,
      "NOT_LOGGED_IN"
    );
  }
  let accessToken = creds.accessToken;
  let refreshToken = creds.refreshToken || null;
  let user = creds.user || null;
  const resolvedApi = (creds.apiBase || apiBase).replace(/\/$/, "");
  if (isJwtExpired(accessToken)) {
    const ttl = jwtTtlSeconds(accessToken);
    const claims = peekJwtClaims(accessToken);
    console.warn(
      `Access token expired${ttl != null ? ` (${Math.abs(ttl)}s ago)` : ""}` + (claims?.workspaceId ? ` workspace=${claims.workspaceId}` : "")
    );
    if (refreshToken) {
      console.warn("Trying refresh\u2026");
      try {
        const data = await refreshTokens(resolvedApi, refreshToken);
        if (data?.accessToken) {
          accessToken = data.accessToken;
          refreshToken = data.refreshToken || refreshToken;
          user = data.user || user;
          saveCredentials({
            accessToken,
            refreshToken,
            user,
            apiBase: resolvedApi
          });
          console.warn("Token refreshed.\n");
        } else {
          throw new AuthError(
            `Access token expired and refresh failed.
  Run:  cyb login
  Creds: ${credentialsPath()}`,
            "TOKEN_EXPIRED"
          );
        }
      } catch (e) {
        if (e.code === "TOKEN_EXPIRED") throw e;
        throw new AuthError(
          `Access token expired; refresh error: ${e.message}
  Run:  cyb login
  Creds: ${credentialsPath()}`,
          "TOKEN_EXPIRED"
        );
      }
    } else {
      throw new AuthError(
        `Access token expired (no refresh token saved).
  Run:  cyb login
  Creds: ${credentialsPath()}`,
        "TOKEN_EXPIRED"
      );
    }
  }
  return {
    apiBase: resolvedApi,
    accessToken,
    refreshToken,
    user,
    source: "file",
    claims: peekJwtClaims(accessToken)
  };
}

// src/open.ts
import { spawn } from "node:child_process";
import { platform as platform2 } from "node:os";
function openBrowser(url) {
  const p = platform2();
  try {
    if (p === "win32") {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
      return true;
    }
    if (p === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
      return true;
    }
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    return true;
  } catch {
    return false;
  }
}

// src/commands/login.ts
function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      rl.close();
      resolve(String(ans || "").trim());
    });
  });
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function cmdLogin(flags) {
  const apiBase = resolveApiBase(flags);
  if (flags.token) {
    const path = saveCredentials({
      accessToken: flags.token,
      refreshToken: null,
      user: null,
      apiBase
    });
    console.log(`Logged in with token \u2192 ${path}`);
    return;
  }
  if (flags.email || flags.password) {
    const email = flags.email || await ask("Email or phone: ");
    const password = flags.password || await ask("Password: ");
    const data = await passwordLogin(apiBase, email, password);
    const path = saveCredentials({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
      apiBase
    });
    console.log(`Logged in as ${data.user?.email || data.user?.name || data.user?.id || "user"}`);
    console.log(`Credentials \u2192 ${path}`);
    return;
  }
  console.log(`cyb login  (v${CLI_VERSION})`);
  console.log(`API       ${apiBase}`);
  console.log("");
  let device;
  try {
    device = await startDeviceLogin(apiBase);
  } catch (e) {
    console.error(e.message);
    console.error("");
    console.error("Trying password login instead\u2026");
    const email = await ask("Email or phone: ");
    const password = await ask("Password: ");
    const data = await passwordLogin(apiBase, email, password);
    const path = saveCredentials({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
      apiBase
    });
    console.log(`Logged in as ${data.user?.email || data.user?.name || data.user?.id || "user"}`);
    console.log(`Credentials \u2192 ${path}`);
    return;
  }
  const verifyUrl = device.verification_uri_complete || `${device.verification_uri}?user_code=${device.user_code}`;
  console.log("To authenticate, open this URL in a browser (if it does not open automatically):");
  console.log("");
  console.log(`  ${verifyUrl}`);
  console.log("");
  console.log(`  Device code:  ${device.user_code}`);
  console.log("");
  console.log("Waiting for browser authorization\u2026  (Ctrl+C to cancel)");
  const opened = openBrowser(verifyUrl);
  if (!opened) console.log("(Could not auto-open browser \u2014 paste the URL above.)");
  const intervalMs = Math.max(2, Number(device.interval) || 3) * 1e3;
  const deadline = Date.now() + (Number(device.expires_in) || 900) * 1e3;
  while (Date.now() < deadline) {
    await sleep(intervalMs);
    let poll;
    try {
      poll = await pollDeviceLogin(apiBase, device.device_code);
    } catch {
      process.stdout.write(".");
      continue;
    }
    if (poll.status === "pending") {
      process.stdout.write(".");
      continue;
    }
    if (poll.status === "expired") {
      console.log("\nCode expired. Run: cyb login");
      process.exit(1);
    }
    if (poll.status === "approved" && poll.accessToken) {
      const path = saveCredentials({
        accessToken: poll.accessToken,
        refreshToken: poll.refreshToken,
        user: poll.user,
        apiBase
      });
      console.log("\n");
      console.log(`\u2713 Logged in as ${poll.user?.email || poll.user?.name || poll.user?.id || "operator"}`);
      if (poll.user?.workspaceId) console.log(`  workspace  ${poll.user.workspaceId}`);
      console.log(`  credentials ${path}`);
      console.log(`  (also: ${credentialsPath()})`);
      return;
    }
    process.stdout.write(".");
  }
  console.log("\nTimed out waiting for authorization. Run: cyb login");
  process.exit(1);
}

// src/commands/logout.ts
async function cmdLogout(flags) {
  const creds = loadCredentials();
  if (creds?.accessToken && creds?.apiBase && !flags.localOnly) {
    try {
      await apiRequest(creds.apiBase, "/auth/logout", {
        method: "POST",
        token: creds.accessToken,
        body: {},
        timeoutMs: 1e4
      });
    } catch {
    }
  }
  const path = clearCredentials();
  console.log(`Logged out. Removed ${path || credentialsPath()}`);
}

// src/commands/whoami.ts
async function cmdWhoami(flags) {
  const auth = await requireAuth(flags);
  let me;
  try {
    me = await authMe(auth.apiBase, auth.accessToken);
  } catch (e) {
    throw new Error(`${e.message}
  Token may be expired \u2014 run: cyb login`);
  }
  console.log(`cyb v${CLI_VERSION}`);
  console.log(`API        ${auth.apiBase}`);
  console.log(`Auth       ${auth.source}`);
  console.log(`Creds      ${credentialsPath()}`);
  console.log(`User       ${me.name || "\u2014"}  <${me.email || me.phone || me.id}>`);
  console.log(`User id    ${me.id}`);
  console.log(`Workspace  ${me.workspace_id || me.workspaceId || "\u2014"}`);
  console.log(`Role       ${me.role || "\u2014"}`);
  console.log(`Status     ${me.status || "\u2014"}`);
}

// src/report.ts
function durationMs(r) {
  const v = r?.durationMs ?? r?.duration_ms ?? null;
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function extensionVersionOf(session) {
  return session.runtimeVersion || session.runtime_version || session.extensionVersion || session.extension_version || null;
}
function pathHint(records) {
  if (!records?.length) return "unknown";
  const r0 = records[0] || {};
  if (r0.selector != null || r0.strategy != null) return "legacy-style";
  if (r0.planId != null || r0.stepId != null || r0.nodeId != null) return "ActionPlan/EO";
  return "unknown";
}
function analyzeTiming(records) {
  const durs = [];
  let wall = null;
  const withTs = [];
  for (const r of records || []) {
    const ms = durationMs(r);
    if (ms != null) durs.push(ms);
    if (r.ts != null && Number.isFinite(Number(r.ts))) withTs.push(Number(r.ts));
  }
  const sum = durs.reduce((a, b) => a + b, 0);
  if (withTs.length >= 2) {
    withTs.sort((a, b) => a - b);
    wall = withTs[withTs.length - 1] - withTs[0];
  }
  const avg = durs.length ? Math.round(sum / durs.length) : null;
  const sorted = [...durs].sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)] : null;
  return { sum, avg, p95, count: durs.length, wall, max: sorted.length ? sorted[sorted.length - 1] : null };
}
function plannedOf(r) {
  if (r.value != null && r.value !== "") return String(r.value);
  if (r.plannedValue != null) return String(r.plannedValue);
  if (r.expected != null) return String(r.expected);
  return null;
}
function actualOf(r) {
  if (r.actualValue != null && r.actualValue !== "") return String(r.actualValue);
  if (r.actual_value != null && r.actual_value !== "") return String(r.actual_value);
  if (r.observedValue != null && r.observedValue !== "") return String(r.observedValue);
  return r.actualValue === "" || r.actual_value === "" ? "" : null;
}
function norm(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function isMaskedActual(actual) {
  const a = String(actual || "");
  if (!a) return false;
  const maskChars = (a.match(/[•*xX#]/g) || []).length;
  return maskChars >= 4 && maskChars >= a.length * 0.4;
}
function valuesAgree(planned, actual) {
  if (planned == null || actual == null || actual === "") return false;
  const p = String(planned);
  const a = String(actual);
  const np = norm(p);
  const na = norm(a);
  if (np && na && np === na) return true;
  if (isMaskedActual(a) && np.length >= 4) {
    const tail = np.slice(-4);
    const aDigits = a.replace(/\D/g, "");
    const aAlnum = na;
    if (tail && (aDigits.endsWith(tail) || aAlnum.endsWith(tail) || a.endsWith(p.slice(-4)))) {
      return true;
    }
  }
  if (np.length >= 6 && na.length >= 6) {
    if (na.includes(np) || np.includes(na)) return true;
  }
  const d1 = p.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  const d2 = a.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (d1 && d2) {
    const isoFromP = `${d1[3]}-${d1[2].padStart(2, "0")}-${d1[1].padStart(2, "0")}`;
    const isoFromA = `${d2[1]}-${d2[2].padStart(2, "0")}-${d2[3].padStart(2, "0")}`;
    if (isoFromP === isoFromA) return true;
  }
  const d3 = a.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  const d4 = p.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (d3 && d4) {
    const isoA = `${d3[3]}-${d3[2].padStart(2, "0")}-${d3[1].padStart(2, "0")}`;
    const isoP = `${d4[1]}-${d4[2].padStart(2, "0")}-${d4[3].padStart(2, "0")}`;
    if (isoA === isoP) return true;
  }
  return false;
}
function auditValue(r) {
  const result = String(r.result || r.status || "?");
  const label = String(r.label || r.nodeId || "");
  const planned = plannedOf(r);
  const actual = actualOf(r);
  const flags = [];
  if (result === "filled" || result === "succeeded") {
    if (actual == null) flags.push("MISSING_ACTUAL");
    else if (actual === "") flags.push("EMPTY_ACTUAL");
    if (planned != null && actual != null && actual !== "") {
      if (!valuesAgree(planned, actual)) {
        flags.push("VALUE_MISMATCH");
      } else if (isMaskedActual(actual)) {
        flags.push("PORTAL_MASKED");
      }
    }
    if (r.verified === true && flags.includes("VALUE_MISMATCH")) {
      flags.push("VERIFIED_LIE");
    }
    if (planned != null) {
      if (/email|ईमेल|e-?mail/i.test(label) && planned && !String(planned).includes("@")) {
        flags.push("SUSPECT_EMAIL");
      }
      if (/mobile|phone|मोबाइल|tel/i.test(label) && planned && !/^\+?[\d\s-]{8,}$/.test(String(planned).trim())) {
        flags.push("SUSPECT_PHONE");
      }
      if (/pin|pincode|zip/i.test(label) && planned && !/^\d{5,6}$/.test(String(planned).replace(/\s/g, ""))) {
        flags.push("SUSPECT_PIN");
      }
      if (/husband|पति/i.test(label) && /father|पिता|jairam/i.test(planned)) {
        flags.push("SUSPECT_HUSBAND_EQ_FATHER");
      }
    }
  }
  if (result === "unmapped" || r.failReason === "no-mapping") {
    flags.push("NO_MAPPING");
  }
  return { planned, actual, flags };
}
function analyzeValues(records) {
  let missingActual = 0;
  let mismatch = 0;
  let suspect = 0;
  let withPlanned = 0;
  let withActual = 0;
  const issues = [];
  for (let i = 0; i < (records || []).length; i++) {
    const r = records[i];
    const a = auditValue(r);
    if (a.planned != null) withPlanned++;
    if (a.actual != null && a.actual !== "") withActual++;
    if (a.flags.includes("MISSING_ACTUAL") || a.flags.includes("EMPTY_ACTUAL")) missingActual++;
    if (a.flags.includes("VALUE_MISMATCH") || a.flags.includes("VERIFIED_LIE")) mismatch++;
    if (a.flags.some((f) => f.startsWith("SUSPECT_"))) suspect++;
    if (a.flags.length && (r.result === "filled" || a.flags.includes("VALUE_MISMATCH"))) {
      issues.push({
        n: i + 1,
        label: String(r.label || r.nodeId || "?").slice(0, 48),
        result: r.result,
        planned: a.planned,
        actual: a.actual,
        flags: a.flags,
        verified: r.verified
      });
    }
  }
  return { missingActual, mismatch, suspect, withPlanned, withActual, issues };
}
function classifyDropdownRecords(records) {
  const rows = [];
  const counts = {};
  const ajaxFails = [];
  const neverTried = [];
  for (const r of records || []) {
    const type = String(r.type || "");
    const strategy = String(r.strategy || "");
    const fr = String(r.failReason || "");
    const label = String(r.label || r.selector || "?");
    const looksSelect = /dropdown|select|cascade|option/i.test(type + strategy) || strategy.includes("cascade") || strategy.includes("wait-engine") || strategy.includes("native-select") || fr.includes("option") || fr.includes("wait-timeout") || /state|district|block|division|circle|जिला|प्रखंड|राज्य|अनुमंडल|office|panchayat/i.test(label);
    if (!looksSelect && type !== "dropdown" && type !== "select") continue;
    let kind = "OTHER";
    let bucket = "OTHER";
    if (strategy === "planner" || r.result === "unmapped" || fr.startsWith("no-mapping") || fr === "selector_not_bound" || fr === "duplicate_hierarchy" || fr === "no_profile_value_for_selector" || fr.startsWith("selector_not_bound")) {
      kind = fr === "duplicate_hierarchy" ? "DUP-HIERARCHY" : "NEVER-TRIED";
      bucket = "NEVER_TRIED";
      neverTried.push(label);
    } else if (strategy.includes("cascade") || strategy.includes("wait-engine") || fr === "wait-timeout" || fr === "ajax_options_not_loaded" || fr === "ajax_option_mismatch" || r.loadMode === "ajax") {
      kind = fr === "ajax_option_mismatch" || fr === "no-matching-option" ? "AJAX/MISMATCH" : strategy.includes("cascade") ? "AJAX/CASCADE" : "AJAX-WAIT";
      bucket = r.result === "filled" ? "AJAX_TRY" : "AJAX_FAIL";
      if (r.result !== "filled") ajaxFails.push(label);
    } else if (strategy.includes("native-select") || strategy.includes("mat-select") || type === "dropdown") {
      kind = "STATIC-SELECT";
      bucket = r.result === "filled" ? "STATIC_OK" : "STATIC_FAIL";
    } else if (fr === "no-matching-option" || fr === "no-options-loaded") {
      kind = "AJAX/OPTIONS";
      bucket = "AJAX_FAIL";
      ajaxFails.push(label);
    }
    counts[bucket] = (counts[bucket] || 0) + 1;
    rows.push({
      kind,
      result: r.result,
      reason: fr || (r.result === "filled" ? "ok" : "-"),
      strategy: strategy || "-",
      label: label.slice(0, 52),
      planned: r.value ?? null,
      actual: r.actualValue ?? r.actual_value ?? null
    });
  }
  return { rows, counts, ajaxFails, neverTried };
}
function formatSessionListLine(session) {
  const records = Array.isArray(session.records) ? session.records : [];
  const ver = extensionVersionOf(session) || "?";
  const t = analyzeTiming(records);
  const v = analyzeValues(records);
  const timeBit = t.count ? ` step_sum=${t.sum}ms avg=${t.avg}ms` + (t.wall != null ? ` wall=${t.wall}ms` : "") : "";
  const valBit = v.mismatch || v.missingActual || v.suspect ? `  values: mismatch=${v.mismatch} missing_actual=${v.missingActual} suspect=${v.suspect}` : `  values: planned=${v.withPlanned} actual=${v.withActual}`;
  return `${session.id}
  extension=${ver}  filled=${session.totalFilled ?? session.total_filled ?? "?"}  failed=${session.totalFailed ?? session.total_failed ?? "?"}
  host=${session.hostname || "(empty)"}  at=${session.receivedAt || session.created_at || session.submitted_at || "?"}
  path=${pathHint(records)}  records=${records.length}${timeBit}
  ${valBit}`;
}
function normalizeSessionRecords(session) {
  const raw = session?.records;
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.records)) return raw.records;
  return [];
}
function reportFromSession(session) {
  const records = normalizeSessionRecords(session);
  const ver = extensionVersionOf(session) || "?";
  const t = analyzeTiming(records);
  const valStats = analyzeValues(records);
  const lines = [];
  lines.push("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  lines.push("  CYB SESSION REPORT");
  lines.push("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  lines.push(`Session            ${session.id}`);
  lines.push(`When               ${session.receivedAt || session.created_at || session.submitted_at || "?"}`);
  lines.push(`Extension version  ${ver}`);
  lines.push(`Path               ${pathHint(records)}`);
  lines.push(`Host               ${session.hostname || "(empty)"}`);
  lines.push(
    `Totals             filled=${session.totalFilled ?? session.total_filled ?? "?"}  failed=${session.totalFailed ?? session.total_failed ?? "?"}`
  );
  if (t.count) {
    lines.push(
      `Step time sum      ${t.sum} ms  avg=${t.avg}  p95=${t.p95}` + (t.wall != null ? `  wall=${t.wall}ms` : "")
    );
  }
  lines.push(
    `Values             planned_on=${valStats.withPlanned}/${records.length}  actual_on=${valStats.withActual}/${records.length}  mismatch=${valStats.mismatch}  missing_actual=${valStats.missingActual}  suspect=${valStats.suspect}`
  );
  lines.push("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  lines.push("  #  result   type       label");
  lines.push("     PLANNED (meant to fill)     ACTUAL (on page after fill)");
  lines.push("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  let ok = 0;
  let fail = 0;
  records.forEach((r, i) => {
    const result = String(r.result || r.status || "?");
    if (result === "filled" || result === "succeeded") ok++;
    else if (result === "failed" || result === "error") fail++;
    const op = r.type || r.op || r.strategy || "?";
    const label = r.label || r.nodeId || r.node_id || r.stepId || r.selector || "?";
    const { planned, actual, flags } = auditValue(r);
    const ms = durationMs(r);
    lines.push(
      `  ${String(i + 1).padStart(2)}  ${result.padEnd(8)} ${String(op).padEnd(10)} ${String(label).slice(0, 48)}`
    );
    const pShow = planned != null && planned !== "" ? planned : "(none)";
    let aShow = "(not recorded)";
    if (actual === "") aShow = "(empty on page)";
    else if (actual != null) aShow = actual;
    lines.push(`     planned: ${String(pShow).slice(0, 70)}`);
    lines.push(`     actual:  ${String(aShow).slice(0, 70)}`);
    const bits = [];
    if (ms != null) bits.push(`${ms}ms`);
    if (r.strategy && r.strategy !== op) bits.push(`strategy=${r.strategy}`);
    if (r.verified === true) bits.push("verified=true");
    if (r.verified === false) bits.push("verified=false");
    if (r.failReason || r.failure_code) bits.push(`fail=${r.failReason || r.failure_code}`);
    if (flags.length) bits.push(`\u26A0 ${flags.join(",")}`);
    if (bits.length) lines.push(`     ${bits.join("  ")}`);
  });
  if (!records.length) lines.push("  (no records)");
  if (valStats.issues.length) {
    lines.push("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
    lines.push("  VALUE AUDIT (wrong / missing / suspicious fills)");
    lines.push("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
    lines.push("  If planned was already wrong (bad mapping), verified=true hides the bug.");
    lines.push("  MISSING_ACTUAL on filled rows = cannot prove what the page shows.");
    for (const iss of valStats.issues.slice(0, 40)) {
      lines.push(
        `  #${iss.n} ${iss.result}  ${iss.label}
      planned=${JSON.stringify(iss.planned)}
      actual =${JSON.stringify(iss.actual)}
      flags  =${iss.flags.join(", ")}  verified=${iss.verified}`
      );
    }
    if (valStats.issues.length > 40) lines.push(`  \u2026 ${valStats.issues.length - 40} more`);
  }
  const dd = classifyDropdownRecords(records);
  if (dd.rows.length) {
    lines.push("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
    lines.push("  DROPDOWNS: STATIC vs AJAX (CLI inference from strategy/failReason)");
    lines.push("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
    lines.push("  IMPORTANT: no-mapping is often MISLEADING for cascades (use codes below).");
    lines.push("  \u2022 NEVER-TRIED / selector_not_bound / duplicate_hierarchy = this SELECTOR not in map");
    lines.push("    (profile may still HAVE the value \u2014 twin control used it, or label mismatch).");
    lines.push("  \u2022 ajax_options_not_loaded / wait-timeout = mapping existed; AJAX options never ready.");
    lines.push("  \u2022 ajax_option_mismatch / no-matching-option = options present; text/value did not match.");
    lines.push("  \u2022 STATIC-SELECT = native select path with actualValue when recorded.");
    lines.push(
      `  counts  static_ok=${dd.counts.STATIC_OK || 0}  static_fail=${dd.counts.STATIC_FAIL || 0}  ajax_try=${dd.counts.AJAX_TRY || 0}  ajax_fail=${dd.counts.AJAX_FAIL || 0}  never_tried=${dd.counts.NEVER_TRIED || 0}`
    );
    for (const row of dd.rows.slice(0, 35)) {
      lines.push(
        `  ${row.kind.padEnd(12)} ${String(row.result).padEnd(8)} ${row.label}
      reason=${row.reason}  strat=${row.strategy}  planned=${JSON.stringify(row.planned)}  actual=${JSON.stringify(row.actual)}`
      );
    }
    if (dd.rows.length > 35) lines.push(`  \u2026 ${dd.rows.length - 35} more dropdown rows`);
    if (dd.ajaxFails.length && dd.neverTried.length) {
      lines.push("  HINT: If District appears both as AJAX_FAIL (English STATE/DISTRICT) and");
      lines.push("        NEVER_TRIED (Hindi \u091C\u093F\u0932\u093E), the form has TWO hierarchies \u2014 map/fill one,");
      lines.push("        the other is leftover detection, not \u201Cprofile missing district\u201D.");
    }
  }
  lines.push("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  lines.push(`RESULT    ok=${ok}  fail=${fail}  rows=${records.length}`);
  lines.push("  Note: product posts observation after all steps (legacy too).");
  lines.push("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  return {
    lines,
    summary: {
      id: session.id,
      extensionVersion: ver,
      ok,
      fail,
      timing: t,
      values: valStats
    }
  };
}

// src/commands/sessions.ts
async function cmdSessions(flags) {
  const auth = await requireAuth(flags);
  const limit = flags.limit || 20;
  console.log(`API ${auth.apiBase}  (limit=${limit})
`);
  const rows = await listSessions(auth.apiBase, auth.accessToken, { limit });
  if (!rows.length) {
    console.log("(no sessions)");
    return;
  }
  for (const s of rows) {
    let full = s;
    if (!s.records || !(s.runtimeVersion || s.runtime_version)) {
      try {
        full = await getSession(auth.apiBase, auth.accessToken, s.id);
      } catch {
        full = s;
      }
    }
    console.log(formatSessionListLine(full));
    console.log("");
  }
  console.log(`Detail:  cyb session <id>`);
}
async function cmdSession(flags) {
  const auth = await requireAuth(flags);
  const id = flags.id || flags._[0];
  if (!id) throw new Error("Usage: cyb session <session-uuid>");
  const session = await getSession(auth.apiBase, auth.accessToken, id);
  const { lines } = reportFromSession(session);
  console.log(lines.join("\n"));
}

// src/commands/live.ts
function deriveWsUrl(apiBase) {
  const origin = String(apiBase || "").replace(/\/$/, "").replace(/\/api$/i, "");
  return origin.replace(/^http/i, "ws") + "/ws";
}
async function openWebSocket(url) {
  if (typeof WebSocket !== "undefined") {
    return new WebSocket(url);
  }
  try {
    const mod = await import("ws");
    const WS = mod.default || mod.WebSocket;
    return new WS(url);
  } catch {
    throw new Error(
      "No WebSocket in this Node. Use Node 22+ or: npm i ws -g / in cyb-cli"
    );
  }
}
function fmtLive(msg) {
  const ev = msg.event || "?";
  const label = (msg.label || msg.selector || "").toString().slice(0, 48);
  const planned = msg.planned != null ? String(msg.planned).slice(0, 36) : "";
  const actual = msg.actual != null ? String(msg.actual).slice(0, 36) : "";
  const fr = msg.failReason ? ` fail=${msg.failReason}` : "";
  const host = msg.hostname ? ` @${msg.hostname}` : "";
  if (ev === "fill.start") return `\u25B6 FILL START${host} fields\u2026`;
  if (ev === "fill.end") return `\u25A0 FILL END${host}`;
  if (ev === "fill.session_saved") {
    return `\u2605 SESSION SAVED ${msg.sessionId || ""} filled=${msg.filled} failed=${msg.failed}${host}`;
  }
  if (ev === "field.start") return `  \u2192 start  ${label}  planned=${planned}`;
  if (ev === "field.done") return `  \u2713 done   ${label}  ${planned}${actual ? " \u2192 " + actual : ""}`;
  if (ev === "field.fail") return `  \u2717 fail   ${label}  ${planned}${fr}`;
  if (ev === "field.wait") return `  \u2026 wait   ${label}  ${planned}${fr}`;
  return `  \xB7 ${ev} ${label} ${planned}${fr}`;
}
function attach(sock, event, fn) {
  if (typeof sock.addEventListener === "function") {
    sock.addEventListener(event, fn);
  } else if (event === "message") {
    sock.on("message", (data) => fn({ data }));
  } else {
    sock.on(event, fn);
  }
}
async function cmdLive(flags) {
  const auth = await requireAuth(flags);
  const pollMs = flags.pollMs || 3e3;
  const claims = peekJwtClaims(auth.accessToken) || auth.claims || null;
  const wsHint = claims?.workspaceId || claims?.wid || null;
  const ttl = jwtTtlSeconds(auth.accessToken);
  console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  console.log("  CYB LIVE \u2014 WSS field-by-field fill stream");
  console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  console.log(`  API    ${auth.apiBase}`);
  console.log(`  WSS    ${deriveWsUrl(auth.apiBase)}`);
  if (wsHint) console.log(`  WS ID  ${wsHint}  (must match extension login workspace)`);
  if (ttl != null) console.log(`  Token  expires in ${Math.max(0, ttl)}s`);
  console.log(`  Stop   Ctrl+C`);
  console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
  console.log("Expect during fill: \u25B6 FILL START \u2192 field.start/done \u2192 \u25A0 FILL END");
  console.log("(If you only see \u2605 SESSION SAVED, field debug is still not reaching WSS.)\n");
  try {
    const me = await authMe(auth.apiBase, auth.accessToken);
    console.log(
      `Auth OK: ${me.email || me.name || me.id}` + (me.workspaceId || me.workspace_id ? `  workspace=${me.workspaceId || me.workspace_id}` : "") + "\n"
    );
  } catch (e) {
    console.error(`Auth check failed: ${e.message}`);
    console.error("  Token is invalid/expired for HTTPS \u2014 WSS will also fail.");
    console.error("  Run:  cyb login\n");
    process.exitCode = 1;
    return;
  }
  const seenSessions = /* @__PURE__ */ new Set();
  try {
    const existing = await listSessions(auth.apiBase, auth.accessToken, { limit: 50 });
    for (const s of existing) seenSessions.add(s.id);
  } catch {
  }
  const wsUrl = `${deriveWsUrl(auth.apiBase)}?token=${encodeURIComponent(auth.accessToken)}`;
  let attempt = 0;
  const maxBackoffMs = 15e3;
  while (true) {
    attempt += 1;
    let sock;
    try {
      sock = await openWebSocket(wsUrl);
    } catch (e) {
      console.warn(`WSS open failed (${e.message}) \u2014 HTTPS poll fallback.
`);
      break;
    }
    const handshakeOk = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), 12e3);
      attach(sock, "message", (raw) => {
        let msg;
        try {
          msg = JSON.parse(typeof raw.data === "string" ? raw.data : raw.data?.toString?.() || raw.toString());
        } catch {
          return;
        }
        if (msg.type === "connected") {
          clearTimeout(t);
          console.log(
            `${attempt > 1 ? "[re]connected" : "WSS connected"} session=${msg.sessionId || "?"}
Waiting for fill_live events\u2026
`
          );
          resolve(true);
        }
        if (msg.type === "error" && !msg.ref) {
          clearTimeout(t);
          console.warn(`[wss handshake error] ${msg.code || ""} ${msg.message || ""}`);
          resolve(false);
        }
      });
      attach(sock, "error", () => {
        clearTimeout(t);
        resolve(false);
      });
      attach(sock, "close", (ev) => {
        clearTimeout(t);
        const code = ev?.code ?? ev;
        const reason = ev?.reason || "";
        if (code) console.warn(`[wss] closed during handshake code=${code} ${reason}`);
        resolve(false);
      });
    });
    if (!handshakeOk) {
      try {
        sock.close();
      } catch {
      }
      const backoff = Math.min(maxBackoffMs, 1e3 * Math.pow(1.5, Math.min(attempt, 8)));
      console.warn(`WSS handshake failed \u2014 retry in ${Math.round(backoff / 1e3)}s (Ctrl+C to stop)
`);
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }
    attempt = 1;
    const closed = await new Promise((resolve) => {
      const handle = async (raw) => {
        let msg;
        try {
          const data = typeof raw.data === "string" ? raw.data : raw.data?.toString?.() || raw.toString();
          msg = JSON.parse(data);
        } catch {
          return;
        }
        if (msg.type === "fill_live") {
          console.log(fmtLive(msg));
          if (msg.event === "fill.session_saved" && msg.sessionId && !seenSessions.has(msg.sessionId)) {
            seenSessions.add(msg.sessionId);
            try {
              const full = await getSession(auth.apiBase, auth.accessToken, msg.sessionId);
              console.log("\n>>> SESSION REPORT");
              console.log(formatSessionListLine(full));
              const { lines } = reportFromSession(full);
              console.log(lines.join("\n"));
              console.log("");
            } catch (e) {
              console.warn(`(report fetch failed: ${e.message})`);
            }
          }
        } else if (msg.type === "connected") {
          console.log(`[wss] (re)connected session=${msg.sessionId || "?"}`);
        } else if (msg.type === "pong" || msg.type === "ping") {
        } else if (msg.type === "error") {
          console.warn(`[wss error] ${msg.code || ""} ${msg.message || ""}`);
          if (String(msg.code || "").includes("auth") || /401|403|token|jwt/i.test(msg.message || "")) {
            console.warn("  Auth error on socket \u2014 run: cyb login");
          }
        } else if (msg.type && msg.type !== "fill_debug_ack") {
          console.log(`[wss] ${msg.type}`);
        }
      };
      attach(sock, "message", handle);
      attach(sock, "close", (ev) => {
        const code = ev?.code ?? "?";
        const reason = (ev?.reason || "").toString();
        resolve({ code, reason });
      });
      attach(sock, "error", () => {
      });
      const pingTimer = setInterval(() => {
        try {
          if (sock.readyState === 1) {
            sock.send(
              JSON.stringify({
                v: 1,
                id: `ping.${Date.now()}`,
                type: "ping",
                purpose: "cyb_live"
              })
            );
          }
        } catch {
        }
      }, 15e3);
      attach(sock, "close", () => clearInterval(pingTimer));
    });
    console.warn(
      `
WSS closed code=${closed.code} ${closed.reason || ""} \u2014 reconnecting\u2026` + (closed.code === 4002 || closed.code === 4003 ? "\n  Auth close from server \u2014 run: cyb login" : "")
    );
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(`HTTPS poll every ${pollMs}ms (no field-by-field stream)
`);
  while (true) {
    try {
      const rows = await listSessions(auth.apiBase, auth.accessToken, { limit: 15 });
      for (const s of [...rows].reverse()) {
        if (seenSessions.has(s.id)) continue;
        seenSessions.add(s.id);
        console.log(`
>>> NEW SESSION`);
        try {
          const full = await getSession(auth.apiBase, auth.accessToken, s.id);
          console.log(formatSessionListLine(full));
          const { lines } = reportFromSession(full);
          console.log(lines.join("\n"));
        } catch (e) {
          console.error(`Failed to load ${s.id}: ${e.message}`);
        }
      }
    } catch (e) {
      console.warn(`[poll] ${e.message}`);
      if (/Auth failed|401|403|expired/i.test(e.message)) {
        console.warn("  Run: cyb login");
      }
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

// src/commands/status.ts
async function cmdStatus(flags) {
  const apiBase = resolveApiBase(flags);
  const creds = loadCredentials();
  console.log(`cyb v${CLI_VERSION}`);
  console.log(`API        ${apiBase}`);
  console.log(`Config     ${configDir()}`);
  console.log(`Creds file ${credentialsPath()}`);
  console.log(`Logged in  ${creds?.accessToken ? "yes" : "no"}`);
  if (creds?.user) {
    console.log(`Saved user ${creds.user.email || creds.user.name || creds.user.id || "\u2014"}`);
  }
  try {
    const h = await apiRequest(apiBase, "/extension/health", { timeoutMs: 1e4 });
    console.log(`Health     HTTP ${h.status} ${h.ok ? "ok" : "fail"}`);
  } catch (e) {
    console.log(`Health     ${e.message.slice(0, 120)}`);
  }
  try {
    const d = await apiRequest(apiBase, "/auth/cli/authorize", { timeoutMs: 1e4 });
    const ready = d.ok && d.status === 200 && String(d.text || "").includes("CyberControl CLI");
    console.log(
      `CLI auth   ${ready ? "browser device-flow ready" : `HTTP ${d.status} (use cyb login --email or --token until /auth/cli deployed)`}`
    );
  } catch (e) {
    console.log(`CLI auth   unreachable (${e.message.slice(0, 80)})`);
  }
  if (creds?.accessToken) {
    try {
      const me = await authMe(creds.apiBase || apiBase, creds.accessToken);
      console.log(`Whoami     ${me.email || me.name || me.id}  role=${me.role}`);
    } catch (e) {
      console.log(`Whoami     token invalid \u2014 run cyb login  (${e.message.slice(0, 60)})`);
    }
  }
}

// src/index.ts
function parseArgs(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v == null || v.startsWith("-")) throw new Error(`Missing value after ${a}`);
      return v;
    };
    if (a === "--help" || a === "-h") flags.help = true;
    else if (a === "--version" || a === "-V") flags.version = true;
    else if (a === "--api" || a === "--backend-url") flags.api = next();
    else if (a === "--token") flags.token = next();
    else if (a === "--email") flags.email = next();
    else if (a === "--password") flags.password = next();
    else if (a === "--limit") flags.limit = Number(next());
    else if (a === "--poll-ms") flags.pollMs = Number(next());
    else if (a === "--id" || a === "--session") flags.id = next();
    else if (a === "--local-only") flags.localOnly = true;
    else if (a.startsWith("-")) throw new Error(`Unknown flag: ${a}`);
    else flags._.push(a);
  }
  flags.command = flags._[0] || null;
  if (flags.command) flags._ = flags._.slice(1);
  return flags;
}
function printHelp() {
  console.log(`
cyb \u2014 CyberControl operator CLI  v${CLI_VERSION}

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
  --api <url>     API base (default from PUBLIC_DOMAIN / CYB_API_URL, else https://api.<domain>/api)
  --token <jwt>   One-shot token (does not replace saved login for other cmds unless login --token)

Credentials file: platform config dir / cybercontrol / credentials.json
  Windows: %APPDATA%\\cybercontrol\\credentials.json
  macOS/Linux: ~/.config/cybercontrol/credentials.json
`);
}
async function main(argv) {
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
    case "login":
      await cmdLogin(flags);
      break;
    case "logout":
      await cmdLogout(flags);
      break;
    case "whoami":
    case "me":
      await cmdWhoami(flags);
      break;
    case "status":
      await cmdStatus(flags);
      break;
    case "sessions":
    case "ls":
      await cmdSessions(flags);
      break;
    case "session":
    case "show":
      await cmdSession(flags);
      break;
    case "live":
    case "watch":
      await cmdLive(flags);
      break;
    case "help":
      printHelp();
      break;
    case "version":
      console.log(CLI_VERSION);
      break;
    default:
      console.error(`Unknown command: ${flags.command}`);
      printHelp();
      process.exit(1);
  }
}

// bin/cyb.ts
main(process.argv.slice(2)).catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`
Error: ${message || e}`);
  process.exit(1);
});
