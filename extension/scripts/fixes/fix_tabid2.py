c = open('/opt/cybercontrol-hub/extension/background.js').read()

old = """  // If tabId is missing, find the tab by hostname
  if (!job.tabId || job.tabId === 0) {
    const foundTabs = await chrome.tabs.query({url: '*://' + job.hostname + '/*'}).catch(() => []);
    if (foundTabs.length > 0) { job.tabId = foundTabs[0].id; console.log('[CC] resolved tabId:', job.tabId); }
  }"""

new = """  // If tabId is missing, find the tab by hostname (resolved inside runTeachSession which is async)"""

if old in c:
    c = c.replace(old, new)
    print('fix1 ok')
else:
    print('fix1 NOT FOUND')

# Fix in runTeachSession (which IS async) - add tabId resolution at start
old2 = "async function runTeachSession({ tabId, fields, backendUrl, hostname, groqKey }) {\n  _teachRunning = true;\n  startKeepalive();"
new2 = """async function runTeachSession({ tabId, fields, backendUrl, hostname, groqKey }) {
  _teachRunning = true;
  startKeepalive();
  // Resolve tabId if missing
  if (!tabId || tabId === 0) {
    try {
      const foundTabs = await chrome.tabs.query({url: '*://' + hostname + '/*'});
      if (foundTabs.length > 0) { tabId = foundTabs[0].id; console.log('[CC] resolved tabId from hostname:', tabId); }
    } catch(e) { console.warn('[CC] tab query failed:', e.message); }
  }
  if (!tabId) { console.error('[CC] no tabId, aborting teach'); _teachRunning = false; stopKeepalive(); return; }"""

if old2 in c:
    c = c.replace(old2, new2)
    print('fix2 ok')
else:
    print('fix2 NOT FOUND')

open('/opt/cybercontrol-hub/extension/background.js', 'w').write(c)
