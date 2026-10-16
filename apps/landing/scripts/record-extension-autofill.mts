/**
 * Pixel-exact AutoFill proof with visible cursor animation (#331).
 * Real unpacked extension + stub API + DemoFx cursor/ripples.
 * Records form + popup, hstacks when ffmpeg-static is available.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import http, { type Server } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { startDemoApiServer, DEMO_PROFILE, DEMO_OPERATOR } from "./demo-api-server.mts";
import { injectDemoFx, fxClick, fxMove, animateFieldsFilling } from "./lib/inject-demo-fx.mts";

declare const chrome: {
  storage: { local: { set: (items: Record<string, unknown>) => Promise<void> } };
};

function errMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function listenPort(server: Server): number {
  const addr = server.address();
  if (addr && typeof addr === "object") return addr.port;
  throw new Error("server has no port");
}

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

function assertLocalOnly(url: string) {
  const u = String(url);
  if (/cybercontrol\.fun|amazonaws|\.prod\./i.test(u)) {
    throw new Error(`REFUSED (#331): production URL not allowed: ${u}`);
  }
  if (!/127\.0\.0\.1|localhost/i.test(u)) {
    throw new Error(`REFUSED (#331): stub must be local: ${u}`);
  }
}

function resolveFfmpeg(): string | null {
  const candidates: string[] = [];
  try {
    const require = createRequire(path.join(landingRoot, "package.json"));
    const packed = require("ffmpeg-static") as string | null;
    if (packed) candidates.push(packed);
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

// Final canvas: form (left) + extension panel (right). Both sources are full-bleed.
const FORM_W = 860;
const POPUP_W = 420;
const CLIP_H = 720;
const EXT_UI_W = 400; // natural extension chrome width before zoom-to-fill

function runFfmpeg(args: string[]): Promise<string> {
  const ffmpeg = resolveFfmpeg();
  if (!ffmpeg) throw new Error("ffmpeg-static / ffmpeg not found");
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d.toString(); });
    p.on("error", reject);
    p.on("exit", (code) => (code === 0 ? resolve(err) : reject(new Error(`ffmpeg ${code}: ${err.slice(-500)}`))));
  });
}

/** Probe duration seconds via ffmpeg stderr. */
async function probeDurationSec(webm: string) {
  try {
    const err = await runFfmpeg(["-i", webm]);
    const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
    if (!m) return null;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(msg);
    if (!m) return null;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
}

/**
 * Detect letterboxed content width via cropdetect on the popup reel, then
 * crop → scale to fill the right panel (full extension UI, including Fill).
 */
async function detectPopupContentWidth(popupWebm: string) {
  try {
    const err = await runFfmpeg([
      "-i", popupWebm,
      "-vf", "cropdetect=24:2:0",
      "-frames:v", "40",
      "-f", "null",
      "-",
    ]);
    const crops = [...err.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
    if (!crops.length) return EXT_UI_W;
    // Prefer a crop close to extension width and full height.
    let best = null;
    for (const m of crops) {
      const w = Number(m[1]);
      const h = Number(m[2]);
      if (h >= CLIP_H - 4 && w >= 300 && w <= 520) best = w;
    }
    if (best) return best;
    const last = crops[crops.length - 1];
    return Number(last[1]) || EXT_UI_W;
  } catch (e: unknown) {
    const crops = [...errMessage(e).matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
    if (crops.length) {
      const last = crops[crops.length - 1];
      const w = Number(last[1]);
      if (w >= 300 && w <= 520) return w;
    }
    return EXT_UI_W;
  }
}

async function hstack(formWebm: string, popupWebm: string, dest: string) {
  const ffmpeg = resolveFfmpeg();
  if (!ffmpeg) {
    fs.copyFileSync(formWebm, dest);
    return "form-only";
  }
  let contentW = await detectPopupContentWidth(popupWebm);
  // Playwright often scales the narrow popup viewport to fill the wide video frame
  // (cropdetect then reports full width). Force the known extension width in that case.
  if (contentW > EXT_UI_W + 40) {
    console.log("popup_content_w_oversize", contentW, "→ force", EXT_UI_W);
    contentW = EXT_UI_W;
  } else {
    console.log("popup_content_w", contentW);
  }
  // Playwright stretches the narrow popup viewport across the wide video frame.
  // Scale width back to EXT_UI_W (correct aspect, full height), then to POPUP_W
  // (~5% wider) so the panel is edge-to-edge with the Fill CTA fully visible.
  // Never use force_original_aspect_ratio=increase + crop — that chops the CTA.
  const filter =
    `[0:v]scale=${FORM_W}:${CLIP_H}:force_original_aspect_ratio=decrease,` +
    `pad=${FORM_W}:${CLIP_H}:(ow-iw)/2:(oh-ih)/2:color=0xe8eef5,setsar=1,fps=25[left];` +
    `[1:v]scale=${EXT_UI_W}:${CLIP_H},` +
    `scale=${POPUP_W}:${CLIP_H},setsar=1,fps=25[right];` +
    `[left][right]hstack=inputs=2,trim=duration=14,setpts=PTS-STARTPTS[v]`;
  await runFfmpeg([
    "-y", "-i", formWebm, "-i", popupWebm,
    "-filter_complex", filter,
    "-map", "[v]", "-an", "-c:v", "libvpx-vp9", "-b:v", "1.8M", "-row-mt", "1", dest,
  ]);
  return `hstack-unstretch-fill-${EXT_UI_W}`;
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

function startFormServer(): Promise<{ server: Server; port: number }> {
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
    server.listen(0, "127.0.0.1", () => resolve({ server, port: listenPort(server) }));
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
  viewport: { width: FORM_W, height: CLIP_H },
  args: [
    `--disable-extensions-except=${extPath}`,
    `--load-extension=${extPath}`,
    "--no-first-run",
    "--no-default-browser-check",
  ],
  ignoreDefaultArgs: ["--disable-extensions"],
  // Same size for every page. Popup HTML is zoomed to fill this frame (no letterbox).
  recordVideo: { dir: tmpVideoDir, size: { width: FORM_W, height: CLIP_H } },
});

let ok = false;
try {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 45000 });
  const extensionId = sw.url().split("/")[2];
  console.log("extensionId", extensionId);

  const popup = await context.newPage();
  // Natural extension width; video frame is wider — we crop letterbox in hstack.
  await popup.setViewportSize({ width: EXT_UI_W, height: CLIP_H });
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
  await formPage.setViewportSize({ width: FORM_W, height: CLIP_H });
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
    const b = document.getElementById("fill-btn") as HTMLButtonElement | null;
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

  // Form: animate cursor across fields as they populate (cap wait — empty optional fields)
  await formPage.bringToFront();
  const filledIds = await animateFieldsFilling(formPage, FIELD_IDS, {
    minFilled: 5,
    timeoutMs: 25000,
  });
  console.log("animated_fields", filledIds.join(","));

  const values = await formPage.evaluate((ids: string[]) => {
    const out: Record<string, string> = {};
    for (const id of ids) {
      const el = document.getElementById(id) as HTMLInputElement | null;
      out[id] = el?.value || "";
    }
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

  // Capture video paths before close (Playwright finalizes on page close).
  const formVideo = formPage.video();
  const popupVideo = popup.video();
  await popup.close().catch(() => {});
  await formPage.close();
  const formWebm = formVideo ? await formVideo.path() : null;
  const popupWebm = popupVideo ? await popupVideo.path() : null;
  console.log("videos", { formWebm, popupWebm });

  // New filename avoids Windows file locks / CDN cache on older postage-stamp clips
  const dest = path.join(proofDir, "clip-form-fill-v3.webm");
  const destTmp = path.join(recRoot, "clip-form-fill.next.webm");
  const debugDir = path.join(recRoot, "_debug_last");
  fs.rmSync(debugDir, { recursive: true, force: true });
  fs.mkdirSync(debugDir, { recursive: true });
  if (formWebm && fs.existsSync(formWebm)) fs.copyFileSync(formWebm, path.join(debugDir, "raw-form.webm"));
  if (popupWebm && fs.existsSync(popupWebm)) fs.copyFileSync(popupWebm, path.join(debugDir, "raw-popup.webm"));

  let mode = "form-only";
  if (formWebm && popupWebm && fs.existsSync(formWebm) && fs.existsSync(popupWebm)) {
    mode = await hstack(formWebm, popupWebm, destTmp);
  } else if (formWebm && fs.existsSync(formWebm)) {
    fs.copyFileSync(formWebm, destTmp);
  } else {
    throw new Error("No form webm recorded");
  }

  const size = fs.statSync(destTmp).size;
  const dur = await probeDurationSec(destTmp);
  console.log("OK_tmp", destTmp, Math.round(size / 1024) + "KB", mode, "duration_s", dur);
  if (size < 80_000) throw new Error(`Output too small (${size} bytes) — record failed`);
  if (size > 2_800_000) throw new Error(`Output too large (${size} bytes) — likely unfitted/long take`);
  if (dur != null && dur > 18) throw new Error(`Output too long (${dur}s) — refuse to publish`);

  const framePath = path.join(debugDir, "check.png");
  await runFfmpeg(["-y", "-ss", "00:00:06", "-i", destTmp, "-frames:v", "1", "-update", "1", framePath]);
  console.log("frame_check", framePath);

  // Replace public file (retry if OneDrive/viewer locks it).
  for (let i = 0; i < 8; i++) {
    try {
      fs.copyFileSync(destTmp, dest);
      break;
    } catch (e: unknown) {
      if (i === 7) throw e;
      console.warn("dest locked, retry", errMessage(e));
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  console.log("OK", dest, Math.round(fs.statSync(dest).size / 1024) + "KB", mode);
} catch (e: unknown) {
  console.error("FAIL", errMessage(e));
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

fs.rmSync(tmpVideoDir, { recursive: true, force: true });
fs.rmSync(userDataDir, { recursive: true, force: true });
if (!ok) process.exit(1);
console.log("done — unstretch+pad popup panel, stub port", apiPort);
