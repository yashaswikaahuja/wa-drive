      } else {
        // Angular/React compatible input filling
        const isTextarea = el.tagName === 'TEXTAREA';
        const niv = isTextarea
          ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
          : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');

        // PRIMARY PATH: keystroke-style fill — mimics real typing with full
        // keydown/beforeinput/input(insertText)/keypress/keyup event sequence.
        // Works on every site we've tested + is required by aadhaar/OTP/captcha
        // fields that reject value+dispatch. v5.67 made this the default.
        if (typeof window.keystrokeFillSync === 'function') {
          const ok = window.keystrokeFillSync(el, value);
          // ServicePlus / RTPS Bihar pattern: typing English into a name field
          // and pressing Tab should auto-fill the paired Hindi field via the
          // site's own transliteration. keystrokeFillSync now dispatches Tab
          // keydown after typing, which triggers RTPS's handler.
          // We add a safety net: 500ms later, check if Hindi sibling is still
          // empty, and if so call Google's transliteration API ourselves.
          if (el.getAttribute && el.getAttribute('data-type') === 'fullName') {
            const allInputs = Array.from(document.querySelectorAll('input[type="text"]'));
            const idx = allInputs.indexOf(el);
            const next = allInputs[idx + 1];
            if (next && next.getAttribute('data-type') === 'text') {
              setTimeout(() => {
                if (next.value && next.value.length > 0) return; // site filled it
                const fillHindi = (hindiVal) => {
                  if (typeof window.keystrokeFillSync === 'function') window.keystrokeFillSync(next, hindiVal);
                };
                fetch('https://inputtools.google.com/request?text='+encodeURIComponent(value)+'&itc=hi-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8')
                  .then(r=>r.json())
                  .then(d=>{ const hindi = d?.[1]?.[0]?.[1]?.[0]; fillHindi(hindi || value); })
                  .catch(()=>fillHindi(value));
              }, 500);
            }
          }
          return ok ? 1 : 0;
        }

        // Legacy fallback (only if keystroke plugin failed to load):
        // value-set + dispatch.
        el.focus();
        if (niv) niv.set.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: value.slice(-1) }));
        return 1;
      }