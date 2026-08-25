/* __CC_IIFE_WRAPPED__ — re-injectable isolated-world script */
(function () {
'use strict';

/**
 * CyberControl HIM UI — extension/runtime/him-ui.js
 * Phase 4.0 — Content-script HIM prompt renderer (closed Shadow DOM)
 *
 * Renders the operator-facing HIM interaction prompt in a closed Shadow DOM
 * container that is inaccessible to the page's main world.
 *
 * SECURITY (architecture/him-protocol.yml §security):
 *  - Closed Shadow DOM: page cannot reach into or observe HIM UI
 *  - Nonce NEVER exposed to page DOM or page-accessible storage
 *  - All confirmation flows through chrome.runtime.sendMessage (NOT window.postMessage)
 *  - NEVER reads .value from any page field
 *  - Confirm click is NOT authorization — only visual feedback, server decides
 */

const HIM_PROTOCOL_VERSION = '1.0.0';

/** Interaction type icons and labels. */
const INTERACTION_META = Object.freeze({
  otp_entry: { icon: '🔑', label: 'OTP Entry Required' },
  captcha_solve: { icon: '🧩', label: 'CAPTCHA Solve Required' },
  payment_authorization: { icon: '💳', label: 'Payment Authorization' },
  signature: { icon: '✍️', label: 'Signature Required' },
  manual_review: { icon: '👁️', label: 'Manual Review Required' },
  file_upload: { icon: '📎', label: 'File Upload Required' },
  irreversible_submit: { icon: '⚠️', label: 'Final Submission' },
  custom: { icon: '🔔', label: 'Action Required' },
});

/** Active HIM UI instances keyed by nonce (content-script scoped). */
const _activeInstances = new Map();

/**
 * Show a HIM prompt overlay.
 * @param {object} params — message from background (HIM_SHOW_PROMPT)
 */
function showPrompt(params) {
  const {
    nonce,
    interaction_type,
    prompt,
    expires_at,
    destructive_warning,
    sensitive_field,
  } = params;

  if (!nonce || !prompt) return;

  // Remove any existing prompt for this nonce
  dismissPrompt(nonce);

  // Create host element — minimal footprint in page DOM
  const host = document.createElement('div');
  host.id = `_cc_him_${Date.now()}`;
  host.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;width:100%;height:100%;pointer-events:none;';
  document.documentElement.appendChild(host);

  // Closed Shadow DOM — page cannot access internals
  const shadow = host.attachShadow({ mode: 'closed' });

  const meta = INTERACTION_META[interaction_type] || INTERACTION_META.custom;
  const isDestructive = !!destructive_warning;
  const expiresMs = expires_at ? Date.parse(expires_at) - Date.now() : 300000;

  // Build UI
  shadow.innerHTML = buildHTML(meta, prompt, isDestructive, sensitive_field);
  shadow.adoptedStyleSheets = [];

  const style = document.createElement('style');
  style.textContent = buildCSS(isDestructive);
  shadow.prepend(style);

  // DOM references within shadow (page cannot reach these)
  const overlay = shadow.querySelector('.him-overlay');
  const confirmBtn = shadow.querySelector('.him-confirm');
  const cancelBtn = shadow.querySelector('.him-cancel');
  const timerEl = shadow.querySelector('.him-timer');
  const statusEl = shadow.querySelector('.him-status');

  // Countdown timer (visual only — no local action on zero)
  let remainingMs = Math.max(0, expiresMs);
  let timerInterval = null;

  function updateTimer() {
    remainingMs = Math.max(0, remainingMs - 1000);
    const secs = Math.ceil(remainingMs / 1000);
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    if (timerEl) {
      timerEl.textContent = `${mins}:${String(s).padStart(2, '0')}`;
      if (secs <= 30) timerEl.classList.add('him-timer-warn');
      if (secs <= 10) timerEl.classList.add('him-timer-critical');
    }
    // Visual only — we do NOT take action when timer hits zero
    // Server owns timeout via him_timeout message
  }
  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);

  // Event handlers — all communication via chrome.runtime.sendMessage
  function onConfirm() {
    if (!confirmBtn || confirmBtn.disabled) return;
    confirmBtn.disabled = true;
    if (statusEl) statusEl.textContent = 'Awaiting server authorization...';

    // Send via chrome.runtime.sendMessage — NOT window.postMessage
    chrome.runtime.sendMessage({
      type: 'HIM_CONFIRM',
      nonce,
      confirmation_source: 'him_ui_button',
    });
  }

  function onCancel() {
    chrome.runtime.sendMessage({
      type: 'HIM_CANCEL',
      nonce,
      reason: 'operator_explicit',
    });
  }

  function onKeydown(e) {
    if (e.key === 'Enter' && !confirmBtn?.disabled) {
      e.preventDefault();
      e.stopPropagation();
      if (confirmBtn) confirmBtn.disabled = true;
      if (statusEl) statusEl.textContent = 'Awaiting server authorization...';

      chrome.runtime.sendMessage({
        type: 'HIM_CONFIRM',
        nonce,
        confirmation_source: 'him_ui_keyboard_enter',
      });
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  }

  confirmBtn.addEventListener('click', onConfirm);
  cancelBtn.addEventListener('click', onCancel);
  overlay.addEventListener('keydown', onKeydown);

  // Focus the overlay container for keyboard events
  overlay.setAttribute('tabindex', '0');
  setTimeout(() => overlay.focus(), 100);

  // Store instance for cleanup
  _activeInstances.set(nonce, {
    host,
    shadow,
    timerInterval,
    cleanup: () => {
      clearInterval(timerInterval);
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('keydown', onKeydown);
      try { host.remove(); } catch (e) { /* already removed */ }
    },
  });
}

/**
 * Dismiss (remove) a HIM prompt by nonce.
 * @param {string} nonce
 */
function dismissPrompt(nonce) {
  const instance = _activeInstances.get(nonce);
  if (!instance) return;
  instance.cleanup();
  _activeInstances.delete(nonce);
}

/**
 * Handle state change messages from background.
 * @param {object} msg — { type: 'HIM_STATE_CHANGE', nonce, state, ... }
 */
function handleStateChange(msg) {
  if (!msg || !msg.nonce) return;
  const { nonce, state } = msg;

  if (state === 'continued' || state === 'cancelled' || state === 'expired' || state === 'failed') {
    dismissPrompt(nonce);
  }
}

/**
 * Handle rejection message — re-enable confirm button.
 * @param {object} msg — { type: 'HIM_REJECTED', nonce, reason }
 */
function handleRejection(msg) {
  if (!msg || !msg.nonce) return;
  const instance = _activeInstances.get(msg.nonce);
  if (!instance) return;

  const confirmBtn = instance.shadow.querySelector('.him-confirm');
  const statusEl = instance.shadow.querySelector('.him-status');
  if (confirmBtn) confirmBtn.disabled = false;
  if (statusEl) statusEl.textContent = `Rejected: ${msg.reason || 'try again'}`;
}

// ─── HTML / CSS builders ─────────────────────────────────────────────────

function buildHTML(meta, prompt, isDestructive, sensitive) {
  const truncatedPrompt = String(prompt).slice(0, 500);
  const warnClass = isDestructive ? ' him-destructive' : '';
  const sensitiveNote = sensitive
    ? '<div class="him-sensitive-note">🔒 Sensitive field — value will not be stored</div>'
    : '';

  return `
    <div class="him-overlay${warnClass}" role="dialog" aria-modal="true" aria-label="CyberControl action required">
      <div class="him-card">
        <div class="him-header">
          <span class="him-icon">${meta.icon}</span>
          <span class="him-label">${escapeHtml(meta.label)}</span>
          <span class="him-timer"></span>
        </div>
        <div class="him-body">
          <p class="him-prompt">${escapeHtml(truncatedPrompt)}</p>
          ${sensitiveNote}
        </div>
        <div class="him-status"></div>
        <div class="him-actions">
          <button class="him-cancel" type="button">Cancel</button>
          <button class="him-confirm" type="button">${isDestructive ? '⚠️ Confirm' : 'Confirm'}</button>
        </div>
      </div>
    </div>
  `;
}

function buildCSS(isDestructive) {
  const accentColor = isDestructive ? '#dc2626' : '#7c3aed';
  const accentHover = isDestructive ? '#b91c1c' : '#6d28d9';

  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .him-overlay {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.5);
      pointer-events: auto;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 2147483647;
      outline: none;
    }
    .him-card {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 24px;
      max-width: 420px;
      width: 90vw;
      border: 2px solid ${accentColor};
    }
    .him-destructive .him-card {
      border-color: #dc2626;
      box-shadow: 0 20px 60px rgba(220, 38, 38, 0.2), 0 0 0 4px rgba(220, 38, 38, 0.1);
    }
    .him-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 16px;
    }
    .him-icon {
      font-size: 24px;
      line-height: 1;
    }
    .him-label {
      font-size: 16px;
      font-weight: 600;
      color: #1f2937;
      flex: 1;
    }
    .him-timer {
      font-size: 14px;
      font-weight: 600;
      color: #6b7280;
      font-variant-numeric: tabular-nums;
      padding: 4px 8px;
      background: #f3f4f6;
      border-radius: 6px;
    }
    .him-timer-warn {
      color: #d97706;
      background: #fef3c7;
    }
    .him-timer-critical {
      color: #dc2626;
      background: #fee2e2;
      animation: him-pulse 1s infinite;
    }
    @keyframes him-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
    .him-body {
      margin-bottom: 16px;
    }
    .him-prompt {
      font-size: 14px;
      line-height: 1.5;
      color: #374151;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .him-sensitive-note {
      margin-top: 10px;
      font-size: 12px;
      color: #6b7280;
      padding: 6px 10px;
      background: #f9fafb;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
    }
    .him-status {
      font-size: 12px;
      color: #6b7280;
      min-height: 18px;
      margin-bottom: 12px;
    }
    .him-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }
    .him-cancel {
      padding: 10px 20px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      background: #fff;
      color: #374151;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
    }
    .him-cancel:hover {
      background: #f3f4f6;
    }
    .him-confirm {
      padding: 10px 24px;
      border: none;
      border-radius: 8px;
      background: ${accentColor};
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s, opacity 0.15s;
    }
    .him-confirm:hover:not(:disabled) {
      background: ${accentHover};
    }
    .him-confirm:disabled {
      opacity: 0.6;
      cursor: wait;
    }
    .him-destructive .him-confirm {
      background: #dc2626;
    }
    .him-destructive .him-confirm:hover:not(:disabled) {
      background: #b91c1c;
    }
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Message listener (content script receives from background) ──────────

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'HIM_SHOW_PROMPT':
        showPrompt(msg);
        sendResponse({ ok: true });
        break;
      case 'HIM_STATE_CHANGE':
        handleStateChange(msg);
        sendResponse({ ok: true });
        break;
      case 'HIM_REJECTED':
        handleRejection(msg);
        sendResponse({ ok: true });
        break;
    }
  });
}

// ─── Export ──────────────────────────────────────────────────────────────

const api = {
  showPrompt,
  dismissPrompt,
  handleStateChange,
  handleRejection,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcHimUi = api;
}
})();
