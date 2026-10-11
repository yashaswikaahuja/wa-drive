/**
 * Record silent WebM of REAL CyberControl extension AutoFill
 * against a Bihar-style gov application form (live Lalita Devi profile).
 * Output: public/proof/clip-form-fill.webm
 */
import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const landingRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(landingRoot, "../..");
const proofDir = path.join(landingRoot, "public", "proof");
const extPath = path.resolve(repoRoot, "apps/extension");
const authPath = path.resolve(repoRoot, "apps/frontend/.tmp-cc-auth.json");
const userDataDir = path.join(proofDir, "_ext_userdata");
const tmpVideoDir = path.join(proofDir, "_rec_ext_fill");
const PROFILE_ID = "c2e88474-2b7d-425d-833c-de1311596163";
const BACKEND = "https://api.cybercontrol.fun/api";

fs.mkdirSync(proofDir, { recursive: true });
fs.rmSync(userDataDir, { recursive: true, force: true });
fs.rmSync(tmpVideoDir, { recursive: true, force: true });
fs.mkdirSync(tmpVideoDir, { recursive: true });

const auth = JSON.parse(fs.readFileSync(authPath, "utf8"));
const state = auth.state || auth;
const accessToken = state.accessToken;
if (!accessToken) throw new Error("No accessToken");

// Prefetch full profile for diagnostics / fallback inject
const profRes = await fetch(`${BACKEND}/profiles/${PROFILE_ID}`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
if (!profRes.ok) throw new Error("profile fetch " + profRes.status);
const fullProfile = await profRes.json();
console.log("profile", fullProfile.name, "fields", Object.keys(fullProfile.data || {}).length);

function startStatic() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const file = path.join(proofDir, urlPath === "/" ? "gov-bihar-application.html" : urlPath.replace(/^\//, ""));
    if (!file.startsWith(proofDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end("missing"); return;
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}

const { server, port } = await startStatic();
const formUrl = `http://127.0.0.1:${port}/gov-bihar-application.html`;

const context = await chromium.launchPersistentContext(userDataDir, {
  channel: "chromium",
  headless: true,
  viewport: { width: 1280, height: 720 },
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
  recordVideo: { dir: tmpVideoDir, size: { width: 1280, height: 720 } },
});

let ok = false;
try {
  // Close leftover blank tab from persistent context
  for (const p of context.pages()) {
    const u = p.url();
    if (!u || u === "about:blank") await p.close().catch(() => {});
  }

  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 30000 });
  const extensionId = sw.url().split("/")[2];
  console.log("extensionId", extensionId);

  await sw.evaluate(async ({ accessToken, backendUrl, user }) => {
    await chrome.storage.local.set({ accessToken, backendUrl, user });
  }, {
    accessToken,
    backendUrl: BACKEND,
    user: state.user || { name: "kishynay", email: "kishynay@gmail.com", role: "admin" },
  });

  const formPage = await context.newPage();
  // Only record the form page: close others' videos later by size, but keep form as primary
  await formPage.goto(formUrl, { waitUntil: "domcontentloaded" });
  await formPage.waitForSelector("#full_name");
  await formPage.waitForTimeout(500);

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "domcontentloaded" });

  // Wait for profile list
  await popup.waitForSelector(".profile-item", { timeout: 60000 });
  console.log("profiles_visible", await popup.locator(".profile-item").count());

  await popup.locator("#search").fill("Lalita");
  await popup.waitForTimeout(700);
  const item = popup.locator(`.profile-item[data-id="${PROFILE_ID}"]`).first();
  if (await item.count()) {
    await item.click();
  } else {
    await popup.getByText("Lalita Devi").first().click();
  }
  await popup.waitForTimeout(500);

  // Ensure fill enabled
  await popup.waitForFunction(() => {
    const b = document.getElementById("fill-btn");
    return b && !b.disabled;
  }, null, { timeout: 10000 });

  // Make form the active page tab, then click fill from popup
  await formPage.bringToFront();
  await formPage.waitForTimeout(300);
  await popup.bringToFront();
  await popup.locator("#fill-btn").click();
  const anyway = popup.locator("#fill-anyway");
  if (await anyway.isVisible({ timeout: 2000 }).catch(() => false)) await anyway.click();
  console.log("fill_clicked");

  // Switch to form so recording shows typing; wait for many fields
  await formPage.bringToFront();
  await formPage.waitForFunction(() => {
    const ids = ["full_name","father_name","dob","aadhaar_number","phone","address","district","state","pincode"];
    let n = 0;
    for (const id of ids) {
      const v = document.getElementById(id)?.value || "";
      if (String(v).trim()) n++;
    }
    return n >= 5;
  }, null, { timeout: 120000 });

  const values = await formPage.evaluate(() => {
    const ids = ["full_name","father_name","dob","gender","aadhaar_number","phone","address","village","district","state","pincode","post_office"];
    const out = {};
    for (const id of ids) out[id] = document.getElementById(id)?.value || "";
    return out;
  });
  console.log("filled_values", JSON.stringify(values));
  const filledCount = Object.values(values).filter((v) => String(v).trim()).length;
  if (filledCount < 5) throw new Error("too few fields: " + filledCount);

  // Pause on completed form for the clip
  await formPage.waitForTimeout(5000);
  ok = true;

  // Capture popup status for logs
  const status = await popup.locator("#status").textContent().catch(() => "");
  console.log("popup_status", status);

  await popup.close().catch(() => {});
  await formPage.close();
} catch (e) {
  console.error("FAIL", e.message);
  // dump popup body if available
  try {
    const pages = context.pages();
    for (const p of pages) {
      console.log("page", p.url(), (await p.locator("body").innerText().catch(() => "")).slice(0, 400));
    }
  } catch {}
  throw e;
} finally {
  await context.close();
  server.close();
}

const videos = fs.readdirSync(tmpVideoDir).filter((f) => f.endsWith(".webm"));
if (!videos.length) throw new Error("No webm");
videos.sort((a, b) => fs.statSync(path.join(tmpVideoDir, b)).size - fs.statSync(path.join(tmpVideoDir, a)).size);
const dest = path.join(proofDir, "clip-form-fill.webm");
fs.copyFileSync(path.join(tmpVideoDir, videos[0]), dest);
console.log("OK", dest, Math.round(fs.statSync(dest).size / 1024) + "KB", "from", videos.join(","));
fs.rmSync(tmpVideoDir, { recursive: true, force: true });
fs.rmSync(userDataDir, { recursive: true, force: true });
if (!ok) process.exit(1);
console.log("done");
