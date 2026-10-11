/**
 * Pixel-exact AutoFill proof with visible cursor animation (#331).
 * Real unpacked extension + stub API + DemoFx cursor/ripples.
 * Records form + popup, hstacks when ffmpeg-static is available.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { startDemoApiServer, DEMO_PROFILE, DEMO_OPERATOR } from "./demo-api-server.mjs";
import { injectDemoFx, fxClick, fxMove, animateFieldsFilling } from "./lib/inject-demo-fx.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const landingRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(landingRoot, "../..");
const proofDir = path.join(landingRoot, "public", "proof");
const extPath = path.resolve(repoRoot, "apps/extension");
const formFile = path.join(proofDir, "gov-bihar-application.html");
// Keep Chromium profile + raw WebMs outside public/ so Vite does not watch Cookies/etc.
const recRoot = path.join(landingRoot, ".tmp-rec");
const userDataDir = path.join(recRoot, "_ext_userdata");
const tmpVideoDir = path.join(recRoot, "_rec_ext_fill");

const FIELD_IDS = [
  "full_name", "father_name", "dob", "gender", "aadhaar_number",
  "phone", "address", "village", "district", "state", "pincode", "post_office",
];

function assertLocalOnly(url) {
  const u = String(url);
  if (/cybercontrol\.fun|amazonaws|\.prod\./i.test(u)) {
    throw new Error(`REFUSED (#331): production URL not allowed: ${u}`);
  }
  if (!/127\.0\.0\.1|localhost/i.test(u)) {
    throw new Error(`REFUSED (#331): stub must be local: ${u}`);
  }
}

function resolveFfmpeg() {
  const candidates = [];
  try {
    const require = createRequire(path.join(landingRoot, "package.json"));
    candidates.push(require("ffmpeg-static"));
  } catch { /* optional */ }
  const which = spawnSync(process.platform === "win32" ? "where.exe" : "which", ["ffmpeg"], {
    encoding: "utf8",
  });
  if (which.status === 0) {
    const line = String(which.stdout || "").split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    if (line) candidates.push(line);
  }
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

async function hstack(formWebm, popupWebm, dest) {
  const ffmpeg = resolveFfmpeg();
  if (!ffmpeg) {
    fs.copyFileSync(formWebm, dest);
    return "form-only";
  }
  await new Promise((resolve, reject) => {
    const args = [
      "-y", "-i", formWebm, "-i", popupWebm,
      "-filter_complex",
      "[0:v]scale=900:720:force_original_aspect_ratio=decrease,pad=900:720:(ow-iw)/2:(oh-ih)/2:color=0xe8eef5,setsar=1[left];" +
        "[1:v]scale=380:720:force_original_aspect_ratio=decrease,pad=380:720:(ow-iw)/2:(oh-ih)/2:color=0xf7f3eb,setsar=1[right];" +
        "[left][right]hstack=inputs=2[v]",
      "-map", "[v]", "-an", "-c:v", "libvpx-vp9", "-b:v", "1.4M", "-row-mt", "1", dest,
    ];
    const p = spawn(ffmpeg, args, { stdio: "inherit" });
    p.on("error", reject);
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
  });
  return "hstack";
}

fs.mkdirSync(recRoot, { recursive: true });
fs.rmSync(userDataDir, { recursive: true, force: true });
fs.rmSync(tmpVideoDir, { recursive: true, force: true });
fs.mkdirSync(tmpVideoDir, { recursive: true });

if (!fs.existsSync(path.join(extPath, "manifest.json"))) throw new Error(`Extension missing at ${extPath}`);
if (!fs.existsSync(formFile)) throw new Error(`Demo form missing: ${formFile}`);

const { server: apiServer, apiBase, port: apiPort } = await startDemoApiServer(0);
assertLocalOnly(apiBase);
console.log("stub API", apiBase);

function startFormServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const file = path.join(
      proofDir,
      urlPath === "/" ? "gov-bihar-application.html" : urlPath.replace(/^\//, ""),
    );
    if (!file.startsWith(proofDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    const ext = path.extname(file);
    const type =
      ext === ".html" ? "text/html" :
      ext === ".js" ? "text/javascript" :
      ext === ".css" ? "text/css" :
      "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

const { server: formServer, port: formPort } = await startFormServer();
const formUrl = `http://127.0.0.1:${formPort}/gov-bihar-application.html`;
assertLocalOnly(formUrl);

const formVidDir = path.join(tmpVideoDir, "form");
const popupVidDir = path.join(tmpVideoDir, "popup");
fs.mkdirSync(formVidDir, { recursive: true });
fs.mkdirSync(popupVidDir, { recursive: true });

const context = await chromium.launchPersistentContext(userDataDir, {
  channel: "chromium",
  headless: true,
  viewport: { width: 900, height: 720 },
  args: [
    `--disable-extensions-except=${extPath}`,
    `--load-extension=${extPath}`,
    "--no-first-run",
    "--no-default-browser-check",
  ],
  ignoreDefaultArgs: ["--disable-extensions"],
  // record per-page via newContext-like: persistent records all pages into one dir
  recordVideo: { dir: tmpVideoDir, size: { width: 900, height: 720 } },
});

let ok = false;
try {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 45000 });
  const extensionId = sw.url().split("/")[2];
  console.log("extensionId", extensionId);

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 380, height: 720 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "domcontentloaded" });
  await popup.evaluate(async ({ accessToken, backendUrl, user }) => {
    await chrome.storage.local.set({ accessToken, backendUrl, user });
  }, {
    accessToken: "demo-token",
    backendUrl: apiBase,
    user: DEMO_OPERATOR,
  });
  await popup.reload({ waitUntil: "domcontentloaded" });
  await injectDemoFx(popup);

  const formPage = await context.newPage();
  await formPage.setViewportSize({ width: 900, height: 720 });
  await formPage.goto(formUrl, { waitUntil: "domcontentloaded" });
  await formPage.waitForSelector("#full_name");
  await formPage.evaluate(() => {
    const b = document.createElement("div");
    b.textContent = "DEMO PORTAL · fictional data · CyberControl proof clip";
    b.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;background:#f98a1e;color:#111;font:700 11px Inter,sans-serif;text-align:center;padding:6px;";
    document.body.prepend(b);
  });
  await injectDemoFx(formPage);
  await formPage.waitForTimeout(500);

  // Show empty form briefly with cursor idle
  await formPage.bringToFront();
  await fxMove(formPage, "#full_name", 700);
  await formPage.waitForTimeout(400);

  // Popup choreography with visible cursor
  await popup.bringToFront();
  await popup.waitForSelector(".profile-item", { timeout: 60000 });
  console.log("profiles_visible", await popup.locator(".profile-item").count());

  const profileItem = popup.locator(`.profile-item[data-id="${DEMO_PROFILE.id}"]`).first();
  const profileTarget = (await profileItem.count())
    ? profileItem
    : popup.getByText("Ananya Demo").first();
  await fxClick(popup, profileTarget, 700);
  await popup.waitForTimeout(350);

  await popup.waitForFunction(() => {
    const b = document.getElementById("fill-btn");
    return b && !b.disabled;
  }, null, { timeout: 15000 });

  await fxMove(popup, "#fill-btn", 600);
  await popup.waitForTimeout(200);
  await fxClick(popup, "#fill-btn", 500);
  const anyway = popup.locator("#fill-anyway");
  if (await anyway.isVisible({ timeout: 2500 }).catch(() => false)) {
    await fxClick(popup, anyway, 400);
  }
  console.log("fill_clicked");

  // Form: animate cursor across fields as they populate
  await formPage.bringToFront();
  const filledIds = await animateFieldsFilling(formPage, FIELD_IDS, {
    minFilled: 5,
    timeoutMs: 120000,
  });
  console.log("animated_fields", filledIds.join(","));

  const values = await formPage.evaluate((ids) => {
    const out = {};
    for (const id of ids) out[id] = document.getElementById(id)?.value || "";
    return out;
  }, FIELD_IDS);
  console.log("filled_values", JSON.stringify(values));

  const blob = JSON.stringify(values);
  if (/Lalita|kishynay/i.test(blob)) throw new Error("PII guard: live name leaked");
  if (!/Ananya Demo|000011112222|9000000001/i.test(blob)) {
    throw new Error("PII guard: expected Ananya Demo values missing");
  }

  // Hold on completed form + success moment
  await fxMove(formPage, "#full_name", 400);
  await formPage.waitForTimeout(1800);
  await popup.bringToFront();
  await popup.waitForTimeout(900);
  await formPage.bringToFront();
  await formPage.waitForTimeout(700);
  ok = true;

  await popup.close().catch(() => {});
  await formPage.close();
} catch (e) {
  console.error("FAIL", e.message);
  try {
    for (const p of context.pages()) {
      console.log("page", p.url(), (await p.locator("body").innerText().catch(() => "")).slice(0, 400));
    }
  } catch { /* ignore */ }
  throw e;
} finally {
  await context.close().catch(() => {});
  formServer.close();
  apiServer.close();
}

const videos = fs.readdirSync(tmpVideoDir)
  .filter((f) => f.endsWith(".webm"))
  .map((f) => ({ f, size: fs.statSync(path.join(tmpVideoDir, f)).size }))
  .sort((a, b) => b.size - a.size);

if (!videos.length) throw new Error("No webm recorded");

const dest = path.join(proofDir, "clip-form-fill.webm");
const primary = path.join(tmpVideoDir, videos[0].f);
const secondary = videos[1] ? path.join(tmpVideoDir, videos[1].f) : null;

let mode = "form-only";
if (secondary) {
  try {
    mode = await hstack(primary, secondary, dest);
  } catch (e) {
    console.warn("hstack failed:", e.message);
    fs.copyFileSync(primary, dest);
    mode = "form-only-fallback";
  }
} else {
  fs.copyFileSync(primary, dest);
}

console.log("OK", dest, Math.round(fs.statSync(dest).size / 1024) + "KB", mode);
fs.rmSync(tmpVideoDir, { recursive: true, force: true });
fs.rmSync(userDataDir, { recursive: true, force: true });
if (!ok) process.exit(1);
console.log("done — animated AutoFill, stub port", apiPort);
