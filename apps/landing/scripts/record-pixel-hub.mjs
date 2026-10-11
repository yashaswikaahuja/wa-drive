/**
 * Pixel-exact Hub proof clips: real apps/frontend + local stub API (#331).
 * Fictional demo data only.
 */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startDemoApiServer, DEMO_OPERATOR } from "./demo-api-server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const landingRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(landingRoot, "../..");
const frontendRoot = path.join(repoRoot, "apps/frontend");
const proofDir = path.join(landingRoot, "public", "proof");
const tmpRoot = path.join(proofDir, "_private-rec", "_rec_hub");

fs.mkdirSync(tmpRoot, { recursive: true });

const { server: apiServer, apiBase, port: apiPort } = await startDemoApiServer(0);
if (/cybercontrol\.fun/i.test(apiBase)) throw new Error("REFUSED production API");
console.log("stub API", apiBase);

const hubPort = 5179;
const hubOrigin = `http://127.0.0.1:${hubPort}`;

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForHttp(url, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 404) return;
    } catch { /* retry */ }
    await wait(400);
  }
  throw new Error(`Hub not up: ${url}`);
}

const viteBin = path.join(frontendRoot, "node_modules", "vite", "bin", "vite.js");
const vite = spawn(
  process.execPath,
  [viteBin, "--host", "127.0.0.1", "--port", String(hubPort), "--strictPort"],
  {
    cwd: frontendRoot,
    env: {
      ...process.env,
      VITE_API_URL: apiBase,
      VITE_SOCKET_URL: `http://127.0.0.1:${apiPort}`,
      VITE_PUBLIC_DOMAIN: "cybercontrol.local",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);vite.stdout.on("data", (d) => process.stdout.write(`[vite] ${d}`));
vite.stderr.on("data", (d) => process.stderr.write(`[vite] ${d}`));

const authFixture = {
  state: {
    accessToken: "demo-token",
    refreshToken: "demo-refresh",
    user: DEMO_OPERATOR,
    isAuthenticated: true,
  },
  version: 0,
};

const clips = [
  {
    name: "clip-workspace",
    path: "/app",
    seconds: 9,
    act: async (page) => {
      await page.waitForTimeout(2000);
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(800);
      const link = page.getByRole("link", { name: "Customers" }).first();
      if (await link.isVisible().catch(() => false)) {
        await link.hover();
        await page.waitForTimeout(600);
      }
      await page.waitForTimeout(2000);
    },
  },
  {
    name: "clip-customers",
    path: "/app/customers",
    seconds: 10,
    act: async (page) => {
      await page.waitForTimeout(1500);
      const row = page.getByText("Ananya Demo").first();
      if (await row.isVisible({ timeout: 8000 }).catch(() => false)) {
        await row.click();
        await page.waitForTimeout(2500);
      } else {
        await page.waitForTimeout(3000);
      }
    },
  },
  {
    name: "clip-files",
    path: "/app/files",
    seconds: 9,
    act: async (page) => {
      await page.waitForTimeout(2000);
      await page.mouse.wheel(0, 180);
      await page.waitForTimeout(1500);
      await page.mouse.wheel(0, -80);
      await page.waitForTimeout(2000);
    },
  },
  {
    name: "clip-whatsapp",
    path: "/app/whatsapp",
    seconds: 9,
    act: async (page) => {
      await page.waitForTimeout(2500);
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(2500);
    },
  },
  {
    name: "clip-photos",
    path: "/app/photos",
    seconds: 9,
    act: async (page) => {
      await page.waitForTimeout(2500);
      const tile = page.getByText(/Photo Editor|Passport|PDF/i).first();
      if (await tile.isVisible({ timeout: 4000 }).catch(() => false)) {
        await tile.hover();
        await page.waitForTimeout(1200);
      }
      await page.waitForTimeout(2000);
    },
  },
];

try {
  await waitForHttp(hubOrigin);
  console.log("hub up", hubOrigin);

  for (const clip of clips) {
    const dir = path.join(tmpRoot, clip.name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: { dir, size: { width: 1280, height: 720 } },
    });
    const page = await context.newPage();
    await page.addInitScript((payload) => {
      localStorage.setItem("cc-auth", JSON.stringify(payload));
    }, authFixture);

    await page.goto(`${hubOrigin}${clip.path}`, { waitUntil: "networkidle", timeout: 60000 });
    // Skip login if auth inject worked
    if (page.url().includes("/login")) {
      throw new Error(`Auth inject failed for ${clip.name} — landed on login`);
    }
    await clip.act(page);
    await page.waitForTimeout(Math.max(500, clip.seconds * 200));
    await context.close();
    await browser.close();

    const videos = fs.readdirSync(dir).filter((f) => f.endsWith(".webm"));
    if (!videos.length) throw new Error(`No video for ${clip.name}`);
    const dest = path.join(proofDir, `${clip.name}.webm`);
    fs.copyFileSync(path.join(dir, videos[0]), dest);
    console.log("OK", clip.name, Math.round(fs.statSync(dest).size / 1024) + "KB");
    fs.rmSync(dir, { recursive: true, force: true });
  }
} finally {
  vite.kill("SIGTERM");
  apiServer.close();
}

console.log("Hub pixel clips done (stub API only)");
