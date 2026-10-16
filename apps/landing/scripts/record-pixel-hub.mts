/**
 * Pixel-exact Hub proof clips with DemoFx cursor animation (#331).
 * Real apps/frontend + local stub API + visible mouse/click polish.
 */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startDemoApiServer, DEMO_OPERATOR } from "./demo-api-server.mts";
import { injectDemoFx, fxClick, fxMove } from "./lib/inject-demo-fx.mts";

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
);
vite.stdout.on("data", (d) => process.stdout.write(`[vite] ${d}`));
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
    act: async (page) => {
      await page.waitForTimeout(900);
      const customers = page.getByRole("link", { name: "Customers" }).first();
      if (await customers.isVisible().catch(() => false)) {
        await fxMove(page, customers, 700);
        await page.waitForTimeout(300);
        await fxClick(page, customers, 550);
        await page.waitForTimeout(1200);
        // back to Today
        const today = page.getByRole("link", { name: "Today" }).first();
        if (await today.isVisible().catch(() => false)) {
          await fxClick(page, today, 600);
          await page.waitForTimeout(900);
        }
      }
      const files = page.getByRole("link", { name: "File Manager" }).first();
      if (await files.isVisible().catch(() => false)) {
        await fxMove(page, files, 550);
        await page.waitForTimeout(500);
      }
      await page.waitForTimeout(800);
    },
  },
  {
    name: "clip-customers",
    path: "/app/customers",
    act: async (page) => {
      await page.waitForTimeout(1000);
      const search = page.getByPlaceholder(/Search by name or phone/i).first();
      if (await search.isVisible().catch(() => false)) {
        await fxClick(page, search, 600);
        await search.fill("Ananya");
        await page.waitForTimeout(500);
      }
      const row = page.getByText("Ananya Demo").first();
      if (await row.isVisible({ timeout: 8000 }).catch(() => false)) {
        await fxClick(page, row, 700);
        await page.waitForTimeout(2200);
      } else {
        await page.waitForTimeout(2500);
      }
    },
  },
  {
    name: "clip-files",
    path: "/app/files",
    act: async (page) => {
      await page.waitForTimeout(1200);
      // hover/click first clickable tile or folder-ish control
      const candidates = [
        page.getByText(/Ananya Demo/i).first(),
        page.locator("button, a, [role='button']").filter({ hasText: /Demo|Aadhaar|folder|Folder/i }).first(),
        page.locator("main button, main a").first(),
      ];
      for (const c of candidates) {
        if (await c.isVisible({ timeout: 1500 }).catch(() => false)) {
          await fxMove(page, c, 650);
          await page.waitForTimeout(250);
          await fxClick(page, c, 500);
          await page.waitForTimeout(1400);
          break;
        }
      }
      await page.mouse.wheel(0, 160);
      await page.waitForTimeout(900);
      await page.mouse.wheel(0, -80);
      await page.waitForTimeout(700);
    },
  },
  {
    name: "clip-whatsapp",
    path: "/app/whatsapp",
    act: async (page) => {
      await page.waitForTimeout(1400);
      const item = page.getByText(/Ananya|Demo|aadhaar|document/i).first();
      if (await item.isVisible({ timeout: 4000 }).catch(() => false)) {
        await fxMove(page, item, 650);
        await page.waitForTimeout(300);
        await fxClick(page, item, 500);
        await page.waitForTimeout(1600);
      } else {
        await page.mouse.wheel(0, 140);
        await page.waitForTimeout(1200);
      }
      await page.waitForTimeout(800);
    },
  },
  {
    name: "clip-photos",
    path: "/app/photos",
    act: async (page) => {
      await page.waitForTimeout(1200);
      const tile = page.getByText(/Photo Editor|Passport|PDF Tool|Photos/i).first();
      if (await tile.isVisible({ timeout: 5000 }).catch(() => false)) {
        await fxMove(page, tile, 700);
        await page.waitForTimeout(280);
        await fxClick(page, tile, 550);
        await page.waitForTimeout(1800);
      } else {
        await page.waitForTimeout(2000);
      }
      await page.waitForTimeout(700);
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
    if (page.url().includes("/login")) {
      throw new Error(`Auth inject failed for ${clip.name}`);
    }
    await injectDemoFx(page);
    await clip.act(page);
    await page.waitForTimeout(600);
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
  try { vite.kill("SIGTERM"); } catch { /* ignore */ }
  apiServer.close();
}

console.log("Hub animated pixel clips done");
