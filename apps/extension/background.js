// Generated from background.ts — edit background.ts, then pnpm build.
const g = globalThis;
if (!g.__CC_SW_SCRIPTS_LOADED) {
  g.__CC_SW_SCRIPTS_LOADED = true;
  try {
    importScripts("knowledge-sync.ts");
  } catch (e) {
    console.warn("[CC] knowledge-sync load failed:", e.message);
  }
  try {
    importScripts("sw/wss-bundle.js");
  } catch (e) {
    console.warn("[CC] wss-bundle load failed:", e.message);
  }
  try {
    importScripts("sw/wss-bridge.js");
  } catch (e) {
    console.warn("[CC] wss-bridge load failed:", e.message);
  }
  try {
    importScripts("sw/auth-refresh.js");
  } catch (e) {
    console.warn("[CC] auth-refresh load failed:", e.message);
  }
  try {
    importScripts("sw/bg-bundle.js");
  } catch (e) {
    console.warn("[CC] bg-bundle load failed:", e.message);
  }
}
