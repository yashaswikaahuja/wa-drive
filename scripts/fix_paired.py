c = open('/opt/cybercontrol-hub/extension/autofill/executor.js').read()

old = "        // ServicePlus: trigger jQuery keyup to activate Google Transliteration for fullName fields\n        if (el.getAttribute('data-type') === 'fullName' && typeof $ !== 'undefined') {\n          setTimeout(() => $(el).trigger('keyup'), 100);\n        }"

new = """        // ServicePlus: fill paired Hindi field (same data-groupno, data-type=text) with same value
        if (el.getAttribute('data-type') === 'fullName') {
          const groupNo = el.getAttribute('data-groupno');
          if (groupNo) {
            const paired = document.querySelector('[data-groupno="'+groupNo+'"][data-type="text"]');
            if (paired && paired !== el) {
              const niv2 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
              if (niv2) niv2.set.call(paired, value); else paired.value = value;
              ['input','change'].forEach(ev => paired.dispatchEvent(new Event(ev, {bubbles:true})));
            }
          }
        }"""

if old in c:
    c = c.replace(old, new)
    open('/opt/cybercontrol-hub/extension/autofill/executor.js', 'w').write(c)
    print('ok')
else:
    print('NOT FOUND')
    # show what's there
    for i, line in enumerate(c.split('\n')):
        if 'ServicePlus' in line or 'fullName' in line or 'trigger' in line:
            print(i, repr(line))
