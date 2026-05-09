c = open('/opt/cybercontrol-hub/extension/autofill/executor.js').read()

# Fix 1: Add sub_division to PRIORITY_KEYS in correct order
old = "  const PRIORITY_KEYS = ['state', 'district', 'block', 'panchayat'];"
new = "  const PRIORITY_KEYS = ['state', 'district', 'sub_division', 'subdivision', 'block', 'panchayat', 'village_panchayat'];"
if old in c:
    c = c.replace(old, new)
    print('fix1 ok')
else:
    print('fix1 NOT FOUND')

# Fix 2: Increase delay for cascading selects (native select needs more time for onchange to load options)
old2 = "    } else if (isDependent && filled > 0) {\n      setTimeout(() => fillOne(selector, value, type), delay);\n      delay += 600;"
new2 = "    } else if (isDependent && filled > 0) {\n      setTimeout(() => fillOne(selector, value, type), delay);\n      delay += 2500; // cascading selects need time for onchange to load child options"
if old2 in c:
    c = c.replace(old2, new2)
    print('fix2 ok')
else:
    print('fix2 NOT FOUND')

open('/opt/cybercontrol-hub/extension/autofill/executor.js', 'w').write(c)
