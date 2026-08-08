c = open('/opt/cybercontrol-hub/extension/autofill/executor.js').read()

old = """        // ServicePlus: fill paired Hindi field (next text input after fullName in DOM order)
        if (el.getAttribute('data-type') === 'fullName') {
          const allInputs = Array.from(document.querySelectorAll('input[type="text"]'));
          const idx = allInputs.indexOf(el);
          const next = allInputs[idx + 1];
          if (next && next.getAttribute('data-type') === 'text') {
            const niv2 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
            if (niv2) niv2.set.call(next, value); else next.value = value;
            ['input','change'].forEach(ev => next.dispatchEvent(new Event(ev, {bubbles:true})));
          }
        }"""

new = """        // ServicePlus: transliterate English→Hindi for paired Hindi field
        if (el.getAttribute('data-type') === 'fullName') {
          const allInputs = Array.from(document.querySelectorAll('input[type="text"]'));
          const idx = allInputs.indexOf(el);
          const next = allInputs[idx + 1];
          if (next && next.getAttribute('data-type') === 'text') {
            const fillHindi = (hindiVal) => {
              const niv2 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
              if (niv2) niv2.set.call(next, hindiVal); else next.value = hindiVal;
              ['input','change'].forEach(ev => next.dispatchEvent(new Event(ev, {bubbles:true})));
            };
            // Call Google transliteration API
            fetch('https://inputtools.google.com/request?text='+encodeURIComponent(value)+'&itc=hi-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8')
              .then(r=>r.json())
              .then(d=>{ const hindi = d?.[1]?.[0]?.[1]?.[0]; fillHindi(hindi || value); })
              .catch(()=>fillHindi(value));
          }
        }"""

if old in c:
    c = c.replace(old, new)
    open('/opt/cybercontrol-hub/extension/autofill/executor.js', 'w').write(c)
    print('ok')
else:
    print('NOT FOUND')
    for i, line in enumerate(c.split('\n')):
        if 'ServicePlus' in line or 'fullName' in line:
            print(i, repr(line))
