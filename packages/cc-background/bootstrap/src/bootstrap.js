/**
 * cc-background/bootstrap — MUST be first in bg-bundle.js.
 * Loads all external dependencies via importScripts.
 * NOTE: Chrome MV3 service worker importScripts paths are relative
 * to the extension ROOT, not to the script file location.
 */
try { importScripts('knowledge-sync.js');  } catch (e) { console.warn('[CC] knowledge-sync load failed:', e.message); }
try { importScripts('shared-bundle.js');   } catch (e) { console.warn('[CC] shared-bundle load failed:', e.message); }
try { importScripts('sw/wss-bundle.js');   } catch (e) { console.warn('[CC] wss-bundle load failed:', e.message); }
try { importScripts('sw/wss-bridge.js');   } catch (e) { console.warn('[CC] wss-bridge load failed:', e.message); }
try { importScripts('sw/auth-refresh.js'); } catch (e) { console.warn('[CC] auth-refresh load failed:', e.message); }
