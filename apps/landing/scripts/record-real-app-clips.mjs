/**
 * Record silent WebM proof clips from the REAL CyberControl app
 * (https://app.cybercontrol.fun), not HTML stage mocks.
 *
 * Requires apps/frontend/.tmp-cc-auth.json (zustand persist shape for key cc-auth).
 * Output: apps/landing/public/proof/clip-*.webm
 */
import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const landingRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(landingRoot, "../..");
const proofDir = path.join(landingRoot, "public", "proof");
fs.mkdirSync(proofDir, { recursive: true });

const APP = "https://app.cybercontrol.fun";
const authCandidates = [
  path.join(repoRoot, "apps/frontend/.tmp-cc-auth.json"),
  path.join(process.cwd(), "apps/frontend/.tmp-cc-auth.json"),
  path.join(landingRoot, "../../apps/frontend/.tmp-cc-auth.json"),
];

function loadAuth() {
  for (const p of authCandidates) {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8");
      JSON.parse(raw); // validate
      console.log("auth", p);
      return raw;
    }
  }
  throw new Error("Missing .tmp-cc-auth.json — mint a JWT first");
}

const authRaw = loadAuth();

async function withRecording(name, width, height, run) {
  const tmpDir = path.join(proofDir, `_rec_${name}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir: tmpDir, size: { width, height } },
    deviceScaleFactor: 1,
  });

  await context.addInitScript((raw) => {
    try {
      localStorage.setItem("cc-auth", raw);
    } catch {}
  }, authRaw);

  const page = await context.newPage();
  page.setDefaultTimeout(45000);

  try {
    await run(page);
  } finally {
    await context.close();
    await browser.close();
  }

  const videos = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".webm"));
  if (!videos.length) throw new Error(`No video for ${name}`);
  const dest = path.join(proofDir, `${name}.webm`);
  fs.renameSync(path.join(tmpDir, videos[0]), dest);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`OK ${name}.webm (${Math.round(fs.statSync(dest).size / 1024)} KB)`);
  return dest;
}

async function ensureApp(page, route) {
  await page.goto(`${APP}${route}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  // If auth inject failed, login wall appears
  const login = page.locator("#login-identity");
  if (await login.isVisible({ timeout: 2500 }).catch(() => false)) {
    throw new Error(`Auth failed — landed on login for ${route}`);
  }
  await page.waitForTimeout(1800);
}

async function gentleScroll(page) {
  await page.mouse.wheel(0, 320);
  await page.waitForTimeout(700);
  await page.mouse.wheel(0, -160);
  await page.waitForTimeout(500);
}

const W = 1280;
const H = 720;

await withRecording("clip-workspace", W, H, async (page) => {
  await ensureApp(page, "/app");
  await page.waitForTimeout(2500);
  await gentleScroll(page);
  // hover a few nav items if present
  for (const label of ["Customers", "Documents", "File Manager", "Photos"]) {
    const link = page.getByRole("link", { name: label }).first();
    if (await link.isVisible({ timeout: 800 }).catch(() => false)) {
      await link.hover().catch(() => {});
      await page.waitForTimeout(450);
    }
  }
  await page.waitForTimeout(1800);
});

await withRecording("clip-customers", W, H, async (page) => {
  await ensureApp(page, "/app/customers");
  await page.waitForTimeout(2200);
  // click first customer row/card if any
  const row = page.locator("a[href*='/app/customers/'], [data-customer], button, tr").filter({ hasText: /@|\d{10}|Ramesh|Kumar|Devi|Singh/i }).first();
  if (await row.isVisible({ timeout: 2000 }).catch(() => false)) {
    await row.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2500);
  } else {
    const any = page.locator("a[href*='/app/customers/']").first();
    if (await any.isVisible({ timeout: 1500 }).catch(() => false)) {
      await any.click().catch(() => {});
      await page.waitForTimeout(2500);
    }
  }
  await gentleScroll(page);
  await page.waitForTimeout(1500);
});

await withRecording("clip-whatsapp", W, H, async (page) => {
  await ensureApp(page, "/app/whatsapp");
  await page.waitForTimeout(2800);
  // try open first chat in list
  const chat = page.locator("[data-chat], [data-phone], button, a, div").filter({ hasText: /\+?\d{10,}|Inbox|chat/i }).first();
  const listItem = page.locator("aside button, aside a, [role='listitem'], .chat-item").first();
  if (await listItem.isVisible({ timeout: 2000 }).catch(() => false)) {
    await listItem.click().catch(() => {});
    await page.waitForTimeout(2200);
  } else if (await chat.isVisible({ timeout: 1000 }).catch(() => false)) {
    await chat.click().catch(() => {});
    await page.waitForTimeout(1800);
  }
  await page.waitForTimeout(2000);
});

await withRecording("clip-files", W, H, async (page) => {
  await ensureApp(page, "/app/files");
  await page.waitForTimeout(2500);
  // open a folder tile if present
  const folder = page.locator("[data-folder], [data-type='folder'], button, div").filter({ hasText: /Customers|folder|Ramesh|Documents/i }).first();
  const tile = page.locator("[data-file-id], [data-id], .file-tile, button").first();
  if (await folder.isVisible({ timeout: 2000 }).catch(() => false)) {
    await folder.dblclick({ timeout: 4000 }).catch(async () => {
      await folder.click().catch(() => {});
    });
    await page.waitForTimeout(2200);
  } else if (await tile.isVisible({ timeout: 1500 }).catch(() => false)) {
    await tile.click().catch(() => {});
    await page.waitForTimeout(1800);
  }
  await page.waitForTimeout(2000);
});

await withRecording("clip-photos", W, H, async (page) => {
  await ensureApp(page, "/app/photos");
  await page.waitForTimeout(2500);
  // click a tool card if present
  for (const name of [/passport/i, /portal/i, /scan/i, /aadhaar/i, /print/i]) {
    const btn = page.getByRole("link", { name }).or(page.getByRole("button", { name })).first();
    if (await btn.isVisible({ timeout: 900 }).catch(() => false)) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(2200);
      break;
    }
  }
  await gentleScroll(page);
  await page.waitForTimeout(1500);
});

await withRecording("clip-form-fill", W, H, async (page) => {
  // Real product surface for form workflow: Find Form directory, then a customer profile
  // (Chrome extension AutoFill itself needs a gov page + extension — separate later)
  await ensureApp(page, "/app/forms");
  await page.waitForTimeout(2200);
  const search = page.locator("input[type='search'], input[placeholder*='earch' i], input").first();
  if (await search.isVisible({ timeout: 1500 }).catch(() => false)) {
    await search.click().catch(() => {});
    await search.fill("aadhaar").catch(() => {});
    await page.waitForTimeout(1200);
  }
  await gentleScroll(page);
  await page.waitForTimeout(1200);
  // switch to a customer profile — the data AutoFill uses
  await page.goto(`${APP}/app/customers`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const first = page.locator("a[href*='/app/customers/']").first();
  if (await first.isVisible({ timeout: 2500 }).catch(() => false)) {
    await first.click().catch(() => {});
    await page.waitForTimeout(2800);
    await gentleScroll(page);
  }
  await page.waitForTimeout(1800);
});

console.log("Real-app clips ready in", proofDir);
