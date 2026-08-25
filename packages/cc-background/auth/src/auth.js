/**
 * cc-background/auth — Authentication and trust guards for the service worker.
 *
 * Public API (on globalThis):
 *   isLegacyClientFillAllowed()  => Promise<boolean>
 *   legacyClientFillDenied(pathName) => { ok, code, error }
 *   ccSenderOrigin(sender)       => string
 *   ccIsTrustedFrontend(sender)  => boolean
 *   CC_TRUSTED_FRONTEND_ORIGINS  => string[]
 *   CC_TRUSTED_ONLY_TYPES        => object
 */

// Local Vite defaults + prod app origin. Default PUBLIC_DOMAIN matches
// backend-core / frontend / landing. Override via:
//   __CC_APP_ORIGIN / __CC_PUBLIC_DOMAIN / __CC_TRUSTED_FRONTEND_ORIGINS
const DEFAULT_PUBLIC_DOMAIN = 'cybercontrol.fun';
function resolveTrustedFrontendOrigins() {
  if (Array.isArray(globalThis.__CC_TRUSTED_FRONTEND_ORIGINS) && globalThis.__CC_TRUSTED_FRONTEND_ORIGINS.length) {
    return globalThis.__CC_TRUSTED_FRONTEND_ORIGINS.slice();
  }
  const origins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
  try {
    if (typeof globalThis.__CC_APP_ORIGIN === 'string' && globalThis.__CC_APP_ORIGIN) {
      origins.unshift(String(globalThis.__CC_APP_ORIGIN).replace(/\/$/, ''));
    } else {
      const pubDomain = (typeof globalThis.__CC_PUBLIC_DOMAIN === 'string' && globalThis.__CC_PUBLIC_DOMAIN)
        ? String(globalThis.__CC_PUBLIC_DOMAIN).replace(/^\./, '')
        : DEFAULT_PUBLIC_DOMAIN;
      origins.unshift('https://app.' + pubDomain);
    }
  } catch (_) { /* ignore */ }
  return origins;
}
const CC_TRUSTED_FRONTEND_ORIGINS = resolveTrustedFrontendOrigins();

const CC_TRUSTED_ONLY_TYPES = { CONNECT: 1, OPEN_AND_DISPATCH: 1, DISPATCH_JOB_DIRECT: 1 };

/** Phase 4.1: always false — legacy paths permanently disabled. */
async function isLegacyClientFillAllowed() {
  return false;
}

function legacyClientFillDenied(pathName) {
  if (typeof CcLegacyFillGate !== 'undefined' && CcLegacyFillGate.legacyClientFillDenied) {
    return CcLegacyFillGate.legacyClientFillDenied(pathName);
  }
  return {
    ok: false,
    code: 'legacy_client_fill_disabled',
    error: (pathName || 'legacy client fill') + ' is disabled (Phase 0). Use side-panel Fill.',
  };
}

function ccSenderOrigin(sender) {
  if (!sender) return '';
  if (sender.origin) return sender.origin;
  try { return sender.url ? new URL(sender.url).origin : ''; } catch (e) { return ''; }
}

function ccIsTrustedFrontend(sender) {
  return CC_TRUSTED_FRONTEND_ORIGINS.indexOf(ccSenderOrigin(sender)) !== -1;
}

// Expose as globals for service worker scope
globalThis.CC_TRUSTED_FRONTEND_ORIGINS = CC_TRUSTED_FRONTEND_ORIGINS;
globalThis.CC_TRUSTED_ONLY_TYPES       = CC_TRUSTED_ONLY_TYPES;
globalThis.isLegacyClientFillAllowed   = isLegacyClientFillAllowed;
globalThis.legacyClientFillDenied      = legacyClientFillDenied;
globalThis.ccSenderOrigin              = ccSenderOrigin;
globalThis.ccIsTrustedFrontend         = ccIsTrustedFrontend;
