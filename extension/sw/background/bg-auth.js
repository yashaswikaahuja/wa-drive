/** AUTO-GENERATED — source: packages/cc-bg-auth/src/auth.js */
/**
 * cc-bg-auth — Authentication and trust guards for the service worker.
 *
 * Public API (on globalThis):
 *   isLegacyClientFillAllowed()  => Promise<boolean>
 *   legacyClientFillDenied(pathName) => { ok, code, error }
 *   ccSenderOrigin(sender)       => string
 *   ccIsTrustedFrontend(sender)  => boolean
 *   CC_TRUSTED_FRONTEND_ORIGINS  => string[]
 *   CC_TRUSTED_ONLY_TYPES        => object
 */

const CC_TRUSTED_FRONTEND_ORIGINS = ['https://app.cybercontrol.fun'];

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
