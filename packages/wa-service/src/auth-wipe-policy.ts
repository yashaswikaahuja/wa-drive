/**
 * AUTH WIPE POLICY
 * Delete wa_auth_creds / wa_auth_keys only when WhatsApp itself logged the
 * device out, or when Signal keys are corrupt past recovery
 * ("Over 2000 messages into the future").
 *
 * A timeout (408), a restart (515), a server error (500), a soft decrypt
 * failure, or N reconnect attempts must keep the saved login.
 */

export const HARD_DESYNC_RE = /over 2000 messages into the future/i;

export const SOFT_CRYPTO_RE =
  /failed to decrypt message|invalidmessageexception|bad mac|no matching sessions found/i;

export function isHardDesync(text: unknown): boolean {
  return HARD_DESYNC_RE.test(String(text || ''));
}

export function isSoftCrypto(text: unknown): boolean {
  return SOFT_CRYPTO_RE.test(String(text || ''));
}

/** True only when the saved WhatsApp login must be deleted. */
export function shouldWipeAuthKeys(input: {
  loggedOut: boolean;
  hardDesync: boolean;
}): boolean {
  return input.loggedOut === true || input.hardDesync === true;
}
