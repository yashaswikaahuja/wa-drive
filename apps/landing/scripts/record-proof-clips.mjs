/**
 * Record silent product proof clips (WebM) with Playwright.
 * Output: apps/landing/public/proof/*.webm
 */
import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const proofDir = path.join(root, "public", "proof");
fs.mkdirSync(proofDir, { recursive: true });

function startStaticServer() {
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    let file = path.join(root, "public", urlPath === "/" ? "proof/record-form-fill.html" : urlPath);
    if (!file.startsWith(path.join(root, "public"))) {
      res.writeHead(403); res.end(); return;
    }
    if (!fs.existsSync(file)) {
      res.writeHead(404); res.end("missing"); return;
    }
    const ext = path.extname(file);
    const type = ext === ".html" ? "text/html" : ext === ".js" ? "text/javascript" : "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

async function recordPage({ name, url, width = 1280, height = 720, seconds = 8, afterOpen }) {
  const tmpDir = path.join(proofDir, `_rec_${name}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir: tmpDir, size: { width, height } },
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (afterOpen) await afterOpen(page);
  await page.waitForTimeout(seconds * 1000);
  await context.close();
  await browser.close();

  const videos = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".webm"));
  if (!videos.length) throw new Error(`No video for ${name}`);
  const dest = path.join(proofDir, `${name}.webm`);
  fs.renameSync(path.join(tmpDir, videos[0]), dest);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  const size = fs.statSync(dest).size;
  console.log(`OK ${name}.webm (${Math.round(size / 1024)} KB)`);
  return dest;
}

const { server, port } = await startStaticServer();
const base = `http://127.0.0.1:${port}`;

try {
  await recordPage({
    name: "clip-form-fill",
    url: `${base}/proof/record-form-fill.html`,
    seconds: 11,
    afterOpen: async (page) => {
      await page.waitForFunction(() => window.__ready === true);
    },
  });

  const featurePages = [
    ["clip-whatsapp", "record-whatsapp.html", 5],
    ["clip-customers", "record-customers.html", 4],
    ["clip-files", "record-files.html", 4],
    ["clip-photos", "record-photos.html", 5],
    ["clip-workspace", "record-workspace.html", 4],
  ];
  for (const [name, file, seconds] of featurePages) {
    const full = path.join(proofDir, file);
    if (!fs.existsSync(full)) {
      console.warn(`SKIP missing ${file}`);
      continue;
    }
    await recordPage({ name, url: `${base}/proof/${file}`, seconds });
  }
} finally {
  server.close();
}

console.log("Clips ready in", proofDir);
