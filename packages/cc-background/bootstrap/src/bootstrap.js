/**
 * cc-background/bootstrap — MUST be first in bg-bundle.js.
 * Loads all external dependencies via importScripts.
 * Paths are relative to extension/sw/ where bg-bundle.js lives.
 */
try { importScripts('../knowledge-sync.js'); } catch (e) { console.warn('[CC] knowledge-sync load failed:', e.message); }
try { importScripts('../shared-bundle.js');  } catch (e) { console.warn('[CC] shared-bundle load failed:', e.message); }
try { importScripts('wss-bundle.js');        } catch (e) { console.warn('[CC] wss-bundle load failed:', e.message); }
try { importScripts('wss-bridge.js');        } catch (e) { console.warn('[CC] wss-bridge load failed:', e.message); }
try { importScripts('auth-refresh.js');      } catch (e) { console.warn('[CC] auth-refresh load failed:', e.message); }
