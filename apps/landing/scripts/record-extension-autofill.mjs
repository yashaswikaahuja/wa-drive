/**
 * Pixel-exact AutoFill proof: REAL unpacked apps/extension + local stub API.
 * Fictional Ananya Demo only — refuses production hosts (#331).
 *
 * Output: apps/landing/public/proof/clip-form-fill.webm
 * Re-record: node scripts/record-extension-autofill.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { startDemoApiServer, DEMO_PROFILE, DEMO_OPERATOR } from "./demo-api-server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const landingRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(landingRoot, "../..");
const proofDir = path.join(landingRoot, "public", "proof");
const extPath = path.resolve(repoRoot, "apps/extension");
const formFile = path.join(proofDir, "gov-bihar-application.html");
const userDataDir = path.join(proofDir, "_private-rec", "_ext_userdata");
const tmpVideoDir = path.join(proofDir, "_private-rec", "_rec_ext_fill");

function assertLocalOnly(url) {
  const u = String(url);
  if (/cybercontrol\.fun|amazonaws|\.prod\./i.test(u)) {
    throw new Error(`REFUSED (#331): production URL not allowed in pixel recorder: ${u}`);
  }
  if (!/127\.0\.0\.1|localhost/i.test(u)) {
    throw new Error(`REFUSED (#331): stub must be local: ${u}`);
  }
}

fs.mkdirSync(path.join(proofDir, "_private-rec"), { recursive: true });
fs.rmSync(userDataDir, { recursive: true, force: true });
fs.rmSync(tmpVideoDir, { recursive: true, force: true });
fs.mkdirSync(tmpVideoDir, { recursive: true });

if (!fs.existsSync(path.join(extPath, "manifest.json"))) {
  throw new Error(`Extension missing at ${extPath}`);
}
if (!fs.existsSync(formFile)) {
  throw new Error(`Demo form missing: ${formFile}`);
}

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
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

const { server: formServer, port: formPort } = await startFormServer();
const formUrl = `http://127.0.0.1:${formPort}/gov-bihar-application.html`;
assertLocalOnly(formUrl);

const context = await chromium.launchPersistentContext(userDataDir, {
  channel: "chromium",
  headless: true,
  viewport: { width: 1280, height: 720 },
  args: [
    `--disable-extensions-except=${extPath}`,
    `--load-extension=${extPath}`,
    "--no-first-run",
    "--no-default-browser-check",
  ],
  ignoreDefaultArgs: ["--disable-extensions"],
  recordVideo: { dir: tmpVideoDir, size: { width: 1280, height: 720 } },
});

let ok = false;
try {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 45000 });
  const extensionId = sw.url().split("/")[2];
  console.log("extensionId", extensionId);

  // Seed auth on the real popup page (more reliable than SW evaluate after blank-tab churn)
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: "domcontentloaded",
  });
  await popup.evaluate(async ({ accessToken, backendUrl, user }) => {
    await chrome.storage.local.set({ accessToken, backendUrl, user });
  }, {
    accessToken: "demo-token",
    backendUrl: apiBase,
    user: DEMO_OPERATOR,
  });
  await popup.reload({ waitUntil: "domcontentloaded" });

  const formPage = await context.newPage();
  await formPage.goto(formUrl, { waitUntil: "domcontentloaded" });
  await formPage.waitForSelector("#full_name");
  await formPage.evaluate(() => {
    const b = document.createElement("div");
    b.textContent = "DEMO PORTAL · fictional data · CyberControl proof clip";
    b.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;background:#f98a1e;color:#111;font:700 11px Inter,sans-serif;text-align:center;padding:6px;";
    document.body.prepend(b);
  });
  await formPage.waitForTimeout(400);

  // WSS will fail → HTTPS fallback to stub /profiles
  await popup.waitForSelector(".profile-item", { timeout: 60000 });
  console.log("profiles_visible", await popup.locator(".profile-item").count());

  const item = popup.locator(`.profile-item[data-id="${DEMO_PROFILE.id}"]`).first();
  if (await item.count()) {
    await item.click();
  } else {
    await popup.getByText("Ananya Demo").first().click();
  }
  await popup.waitForTimeout(400);

  await popup.waitForFunction(() => {
    const b = document.getElementById("fill-btn");
    return b && !b.disabled;
  }, null, { timeout: 15000 });

  await formPage.bringToFront();
  await formPage.waitForTimeout(250);
  await popup.bringToFront();
  await popup.locator("#fill-btn").click();
  const anyway = popup.locator("#fill-anyway");
  if (await anyway.isVisible({ timeout: 2500 }).catch(() => false)) await anyway.click();
  console.log("fill_clicked");

  await formPage.bringToFront();
  await formPage.waitForFunction(() => {
    const ids = ["full_name", "father_name", "dob", "aadhaar_number", "phone", "address", "state", "pincode"];
    let n = 0;
    for (const id of ids) {
      const v = document.getElementById(id)?.value || "";
      if (String(v).trim()) n++;
    }
    return n >= 5;
  }, null, { timeout: 120000 });

  const values = await formPage.evaluate(() => {
    const ids = ["full_name", "father_name", "dob", "gender", "aadhaar_number", "phone", "address", "state", "pincode"];
    const out = {};
    for (const id of ids) out[id] = document.getElementById(id)?.value || "";
    return out;
  });
  console.log("filled_values", JSON.stringify(values));

  const blob = JSON.stringify(values);
  if (/Lalita|kishynay|@[a-z0-9.-]+\.(com|in)/i.test(blob) && !/demo@cybercontrol\.local/i.test(blob)) {
    throw new Error("PII guard: unexpected non-demo values in filled form");
  }
  if (!/Ananya Demo|000011112222|9000000001/i.test(blob)) {
    throw new Error("PII guard: expected Ananya Demo fixture values missing");
  }

  await formPage.waitForTimeout(2800);
  await popup.waitForTimeout(800);
  ok = true;

  await popup.close().catch(() => {});
  await formPage.close();
} catch (e) {
  console.error("FAIL", e.message);
  try {
    for (const p of context.pages()) {
      console.log("page", p.url(), (await p.locator("body").innerText().catch(() => "")).slice(0, 500));
    }
  } catch { /* ignore */ }
  throw e;
} finally {
  await context.close().catch(() => {});
  formServer.close();
  apiServer.close();
}

const videos = fs.readdirSync(tmpVideoDir).filter((f) => f.endsWith(".webm"));
if (!videos.length) throw new Error("No webm recorded");

// Prefer the largest (form page with fill motion); optionally hstack with popup if ffmpeg exists
videos.sort((a, b) => fs.statSync(path.join(tmpVideoDir, b)).size - fs.statSync(path.join(tmpVideoDir, a)).size);
const dest = path.join(proofDir, "clip-form-fill.webm");
const primary = path.join(tmpVideoDir, videos[0]);

let ffmpeg = "ffmpeg";
const which = spawnSync(process.platform === "win32" ? "where" : "which", [ffmpeg], { encoding: "utf8" });
const hasFfmpeg = which.status === 0;
if (hasFfmpeg && videos.length >= 2) {
  const formVid = primary;
  const popupVid = path.join(tmpVideoDir, videos[1]);
  const stacked = path.join(tmpVideoDir, "stacked.webm");
  const ff = spawnSync(ffmpeg, [
    "-y",
    "-i", formVid,
    "-i", popupVid,
    "-filter_complex",
    "[0:v]scale=900:720:force_original_aspect_ratio=decrease,pad=900:720:(ow-iw)/2:(oh-ih)/2[left];[1:v]scale=380:720:force_original_aspect_ratio=decrease,pad=380:720:(ow-iw)/2:(oh-ih)/2[right];[left][right]hstack=inputs=2[v]",
    "-map", "[v]",
    "-an",
    "-c:v", "libvpx-vp9",
    "-b:v", "1M",
    stacked,
  ], { encoding: "utf8" });
  if (ff.status === 0 && fs.existsSync(stacked)) {
    fs.copyFileSync(stacked, dest);
    console.log("OK stacked form|popup", dest, Math.round(fs.statSync(dest).size / 1024) + "KB");
  } else {
    console.warn("ffmpeg hstack failed, using primary form video", ff.stderr?.slice(-400));
    fs.copyFileSync(primary, dest);
  }
} else {
  fs.copyFileSync(primary, dest);
  console.log("OK", dest, Math.round(fs.statSync(dest).size / 1024) + "KB", "from", videos.join(","));
}

fs.rmSync(tmpVideoDir, { recursive: true, force: true });
fs.rmSync(userDataDir, { recursive: true, force: true });
if (!ok) process.exit(1);
console.log("done — fictional Ananya Demo only, stub API port", apiPort);
