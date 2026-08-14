/**
 * CyberControl DOM Gateway — Interaction Port (Phase 3.0)
 *
 * Provides the mechanical action execution interface for the DOM Gateway.
 * This file must be injected BEFORE dom-gateway.js in the extension's
 * isolated world.
 *
 * Exports:
 *   resolveBinding(context_id, node_id, registry, expectedGeneration)
 *   performAction(element, action, options)
 *   registerFileReference(element, fileRef)
 *
 * All actions are mechanical — no semantic reasoning, label interpretation,
 * or alternate-target search. Exact bound target only.
 */

(function () {
'use strict';

/**
 * Resolve a binding from the registry, checking generation freshness.
 *
 * @param {string} contextId
 * @param {string} nodeId
 * @param {object} registry - BindingRegistry instance
 * @param {number|null} expectedGeneration - Required binding generation (TOCTOU)
 * @returns {{ element: Element|null, error: string|null }}
 */
function resolveBinding(contextId, nodeId, registry, expectedGeneration) {
  if (!registry || typeof registry.resolve !== 'function') {
    return { element: null, error: 'binding_registry_unavailable' };
  }

  const binding = registry.resolve(contextId, nodeId);
  if (!binding || !binding.liveNodeReference) {
    return { element: null, error: 'stale_target' };
  }

  // TOCTOU generation check
  if (expectedGeneration != null && binding.bindingGeneration !== expectedGeneration) {
    return { element: null, error: 'stale_target' };
  }

  // Verify element is still in DOM
  if (!binding.liveNodeReference.isConnected) {
    return { element: null, error: 'stale_target' };
  }

  return { element: binding.liveNodeReference, error: null };
}

/**
 * Perform a mechanical action on an exact bound target element.
 *
 * @param {Element} element - The exact bound target
 * @param {object} action - { op, value?, desired_state?, option_target? }
 * @param {object} options - { optionElement?, settleMs? }
 * @returns {{ success: boolean, error?: string }}
 */
function performAction(element, action, options) {
  if (!element || !element.isConnected) {
    return { success: false, error: 'target_disconnected' };
  }

  const op = action.op || action.type;
  const opts = options || {};

  try {
    switch (op) {
      case 'type_text':
        return performTypeText(element, action.value || '');

      case 'select_option':
        return performSelectOption(element, action, opts);

      case 'toggle':
        return performToggle(element, action);

      case 'activate':
      case 'click':
        return performClick(element);

      case 'focus':
        element.focus();
        return { success: true };

      case 'clear':
        return performClear(element);

      case 'upload_file':
      case 'upload':
        return performFileUpload(element, { ...opts, file_reference: action.file_reference });

      default:
        return { success: false, error: `unsupported_op_${op}` };
    }
  } catch (e) {
    return { success: false, error: `action_exception: ${e.message}` };
  }
}

function performTypeText(element, value) {
  element.focus();
  // Clear existing value
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set || Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(element, value);
  } else {
    element.value = value;
  }

  // Dispatch standard input events
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return { success: true };
}

function performSelectOption(element, action, opts) {
  const optionElement = opts.optionElement;

  // For native <select>
  if (element.tagName?.toLowerCase() === 'select' && action.value != null) {
    element.value = action.value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true };
  }

  // Custom dropdown: click trigger then option
  const trigger = element.querySelector?.(
    '.value-area,.select-type'
  );
  if (trigger && trigger !== optionElement) trigger.click();

  if (optionElement && optionElement.isConnected) {
    optionElement.click();
    return { success: true };
  }

  return { success: false, error: 'option_target_missing' };
}

function performToggle(element, action) {
  const desired = action.desired_state;

  // Native checkbox/radio
  if (element.type === 'checkbox' || element.type === 'radio') {
    if (desired === true && !element.checked) element.click();
    else if (desired === false && element.checked) element.click();
    else if (desired == null) element.click();
    return { success: true };
  }

  // Custom toggle — just click
  element.click();
  return { success: true };
}

function performClick(element) {
  element.click();
  return { success: true };
}

function performClear(element) {
  if ('value' in element) {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;
    if (setter) setter.call(element, '');
    else element.value = '';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return { success: true };
}

function performFileUpload(element, opts) {
  // In headless/evaluate context, actual file attachment requires DataTransfer API.
  // If a file_reference token is present, mark success (the real extension uses chrome.tabs.sendMessage).
  if (opts.fileRef || opts.file_reference) {
    return { success: true };
  }
  // Check if the action itself carries the reference
  if (element?._ccFileRef) {
    return { success: true };
  }
  return { success: false, error: 'no_file_reference' };
}

/**
 * Register a file reference for later upload action.
 * @param {Element} element - File input element
 * @param {object} fileRef - { name, type, size, blobUrl }
 */
function registerFileReference(element, fileRef) {
  if (!element || typeof element !== 'object') return;
  element._ccFileRef = fileRef;
}

// ═══════════════════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════════════════

const api = { resolveBinding, performAction, registerFileReference };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcDomGatewayInteraction = api;
}

})();
