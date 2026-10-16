/**
 * Emit public/proof/demo-fx.js from scripts/demo-fx.ts (browser IIFE).
 * HTML fixtures keep loading ./demo-fx.js.
 *
 * Run: node --experimental-strip-types scripts/emit-demo-fx.mts
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const landingRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(landingRoot, "../..");
const require = createRequire(path.join(repoRoot, "package.json"));
const esbuild = require("esbuild") as typeof import("esbuild");

const entry = path.join(landingRoot, "scripts", "demo-fx.ts");
const outfile = path.join(landingRoot, "public", "proof", "demo-fx.js");

if (!fs.existsSync(entry)) {
  throw new Error(`missing ${entry}`);
}

await esbuild.build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2018",
  legalComments: "inline",
  logLevel: "info",
  banner: {
    js: "// Generated from scripts/demo-fx.ts — edit the .ts source, then pnpm emit:demo-fx.\n",
  },
});

console.log("Wrote", path.relative(landingRoot, outfile));
