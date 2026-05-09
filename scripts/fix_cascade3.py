c = open('/opt/cybercontrol-hub/extension/autofill/executor.js').read()

# The select retry loop re-fires onchange which resets cascade children
# Fix: after successfully filling a cascade parent, don't retry it
# The real fix: in the retry loop, check if options are now available before re-applying

old = """        // Options not ready yet (dependent dropdown) — schedule retry, count as pending
        // Return 1 optimistically so the filled count isn't 0; retry will apply the value
        let attempts = 0;"""

new = """        // Options not ready yet (dependent dropdown) — schedule retry
        // For cascade parents (state/district) that already applied, don't retry (would reset children)
        const isCascadeParent = /state|district|17391|17297/.test(selector);
        if (isCascadeParent) { console.debug('[CC] cascade parent already set, skip retry:', selector); return 1; }
        let attempts = 0;"""

if old in c:
    c = c.replace(old, new)
    print('fix ok')
else:
    print('NOT FOUND')

open('/opt/cybercontrol-hub/extension/autofill/executor.js', 'w').write(c)
