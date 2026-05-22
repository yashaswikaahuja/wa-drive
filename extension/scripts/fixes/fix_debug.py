c = open('/opt/cybercontrol-hub/extension/background.js').read()

# Add debug storage write on inject failure
old = "    }).catch(e => console.error('[CC] teachOneField inject failed:', e.message));"
new = """    }).catch(e => {
      console.error('[CC] teachOneField inject failed:', e.message);
      chrome.storage.local.set({_cc_teach_debug: 'inject_failed:' + e.message});
      notifyPopup({ type: 'TEACH_PROGRESS', status: '⚠ Inject error: ' + e.message, done: true });
    });"""

# Also add debug at SW entry point
old2 = "  console.log('[CC] SW teach job received:', job.hostname, job.fields?.length, 'fields');"
new2 = """  console.log('[CC] SW teach job received:', job.hostname, job.fields?.length, 'fields');
  chrome.storage.local.set({_cc_teach_debug: 'received:' + job.hostname + ':' + job.fields?.length});"""

for o, n, name in [(old, new, 'inject_err'), (old2, new2, 'sw_entry')]:
    if o in c:
        c = c.replace(o, n)
        print(name, 'ok')
    else:
        print(name, 'NOT FOUND')

open('/opt/cybercontrol-hub/extension/background.js', 'w').write(c)
