/**
 * keystroke-input plugin — types values char-by-char with full key+input event sequence.
 *
 * Why: some sites (UIDAI Aadhaar entry, banking OTP, captcha, masked inputs)
 * reject values set via `el.value = X` because they listen to `keydown`/
 * `keypress`/`input(inputType=insertText)` events and validate digit-by-digit.
 * The "value+dispatch input/change" approach passes synthetic events that
 * those listeners ignore (or worse: reset the field on next input).
 *
 * What: focuses, clears, then dispatches for each character:
 *   1. keydown            — code/key/keyCode set to char's keycode
 *   2. beforeinput        — inputType='insertText', data=char
 *   3. nativeValueSetter  — append char (works around React/Angular trapped setter)
 *   4. input              — InputEvent with inputType='insertText', data=char
 *   5. keypress
 *   6. keyup
 * Then a final `change` event after the loop completes.
 *
 * Per-char delay is configurable (default 12ms = ~80 chars/sec, near human typing).
 *
 * Use as a FALLBACK after the standard nativeInputValueSetter fill — if the
 * verification check `el.value === expected` fails, retry with this.
 */
;(function() {
  if (window._ccKeystrokeFillLoaded) return;
  window._ccKeystrokeFillLoaded = true;

  function keyCodeFor(ch) {
    if (/\d/.test(ch)) return ch.charCodeAt(0);
    if (/[a-z]/i.test(ch)) return ch.toUpperCase().charCodeAt(0);
    return ch.charCodeAt(0);
  }

  function codeFor(ch) {
    if (/\d/.test(ch)) return 'Digit' + ch;
    if (/[a-z]/i.test(ch)) return 'Key' + ch.toUpperCase();
    return '';
  }

  /**
   * Type `value` into `el` using a full keystroke event sequence.
   * Returns a Promise<boolean> resolving to true if final value matches.
   */
  window.keystrokeFill = async function keystrokeFill(el, value, opts) {
    if (!el) return false;
    const delay = (opts && opts.delay) || 12;
    const str = String(value);
    const isTextarea = el.tagName === 'TEXTAREA';
    const proto = isTextarea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    const setVal = desc ? (v) => desc.set.call(el, v) : (v) => { el.value = v; };

    el.focus();
    el.click();

    // Clear existing
    if (el.value) {
      try { el.select(); } catch (e) {}
      setVal('');
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    }

    let current = '';
    for (const ch of str) {
      const kc = keyCodeFor(ch);
      const code = codeFor(ch);
      el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ch, code, keyCode: kc, which: kc, charCode: 0 }));
      try {
        el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: ch }));
      } catch (e) {}
      current += ch;
      setVal(current);
      try {
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch }));
      } catch (e) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      el.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: ch, code, keyCode: kc, which: kc, charCode: kc }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ch, code, keyCode: kc, which: kc }));
      if (delay > 0) await new Promise(r => setTimeout(r, delay));
    }

    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    return el.value === str;
  };

  /**
   * Heuristic: should this field need keystroke fill PRIMARILY (vs as fallback)?
   * Yes for: aadhaar/UID fields, OTP, captcha, masked numeric fields with maxLength<=16.
   */
  window.shouldUseKeystroke = function shouldUseKeystroke(el, label) {
    if (!el) return false;
    const lower = ((label || '') + ' ' + (el.id || '') + ' ' + (el.name || '') + ' ' + (el.placeholder || '')).toLowerCase();
    if (/aadhaar|aadhar|uid\b|आधार|otp|captcha|verification\s*code|enrolment|enrollment/i.test(lower)) return true;
    return false;
  };
})();
