/**
 * Record silent product proof clips (WebM) from fictional HTML fixtures.
 * Output: apps/landing/public/proof/clip-*.webm
 * Uses DemoFx choreography (__ready / __done). No live app / no real PII (#331).
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

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webm": "video/webm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

function startStaticServer() {
  const publicRoot = path.join(root, "public");
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    let file = path.join(
      publicRoot,
      urlPath === "/" ? "proof/record-form-fill.html" : urlPath.replace(/^\//, ""),
    );
    const resolved = path.resolve(file);
    if (!resolved.startsWith(path.resolve(publicRoot))) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    const ext = path.extname(resolved);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(resolved).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

async function recordPage({ name, url, width = 1280, height = 720, fallbackSeconds = 12 }) {
  const tmpDir = path.join(proofDir, `_rec_${name}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir: tmpDir, size: { width, height } },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

  try {
    await page.waitForFunction(() => window.__ready === true, { timeout: 10000 });
  } catch {
    console.warn(`${name}: __ready timeout — continuing`);
  }

  try {
    await page.waitForFunction(() => window.__done === true, {
      timeout: Math.max(8000, fallbackSeconds * 1000),
    });
    // Brief hold so the last frame / success state is visible in the WebM
    await page.waitForTimeout(400);
  } catch {
    console.warn(`${name}: __done timeout — using fallback ${fallbackSeconds}s`);
    await page.waitForTimeout(fallbackSeconds * 1000);
  }

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

const CLIPS = [
  ["clip-form-fill", "record-form-fill.html", 14],
  ["clip-whatsapp", "record-whatsapp.html", 12],
  ["clip-customers", "record-customers.html", 12],
  ["clip-files", "record-files.html", 12],
  ["clip-photos", "record-photos.html", 12],
  ["clip-workspace", "record-workspace.html", 12],
];

const { server, port } = await startStaticServer();
const base = `http://127.0.0.1:${port}`;
console.log(`Serving fixtures at ${base}/proof/`);

try {
  for (const [name, file, fallbackSeconds] of CLIPS) {
    const full = path.join(proofDir, file);
    if (!fs.existsSync(full)) {
      console.warn(`SKIP missing ${file}`);
      continue;
    }
    await recordPage({
      name,
      url: `${base}/proof/${file}`,
      fallbackSeconds,
    });
  }
} finally {
  server.close();
}

console.log("Fictional proof clips ready in", proofDir);
