// background.js — Chrome MV3 service worker entry point.
// All logic lives in packages/cc-background/ — edit there, run pnpm build.
//
// Guard: Chrome may evaluate the SW entry more than once in the same global
// during registration/reload. Re-running importScripts re-executes those files;
// top-level `const` then throws "Identifier has already been declared" (status 15).
if (!globalThis.__CC_SW_SCRIPTS_LOADED) {
  globalThis.__CC_SW_SCRIPTS_LOADED = true;
  try { importScripts('knowledge-sync.js');  } catch (e) { console.warn('[CC] knowledge-sync load failed:', e.message); }
  try { importScripts('sw/wss-bundle.js');   } catch (e) { console.warn('[CC] wss-bundle load failed:', e.message); }
  try { importScripts('sw/wss-bridge.js');   } catch (e) { console.warn('[CC] wss-bridge load failed:', e.message); }
  try { importScripts('sw/auth-refresh.js'); } catch (e) { console.warn('[CC] auth-refresh load failed:', e.message); }
  try { importScripts('sw/bg-bundle.js');    } catch (e) { console.warn('[CC] bg-bundle load failed:', e.message); }
}
