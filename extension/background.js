// background.js — Chrome MV3 service worker entry point.
// All logic lives in packages/cc-background/ — edit there, run pnpm build.
try { importScripts('knowledge-sync.js');  } catch (e) { console.warn('[CC] knowledge-sync load failed:', e.message); }
try { importScripts('shared-bundle.js');   } catch (e) { console.warn('[CC] shared-bundle load failed:', e.message); }
try { importScripts('sw/wss-bundle.js');   } catch (e) { console.warn('[CC] wss-bundle load failed:', e.message); }
try { importScripts('sw/wss-bridge.js');   } catch (e) { console.warn('[CC] wss-bridge load failed:', e.message); }
try { importScripts('sw/auth-refresh.js'); } catch (e) { console.warn('[CC] auth-refresh load failed:', e.message); }
try { importScripts('sw/bg-bundle.js');    } catch (e) { console.warn('[CC] bg-bundle load failed:', e.message); }
