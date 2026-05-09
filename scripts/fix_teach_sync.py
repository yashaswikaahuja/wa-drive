c = open('/opt/cybercontrol-hub/extension/popup.js').read()

old = """  const job = {
    tabId: tab.id,
    fields: failedFields,
    backendUrl,
    hostname: new URL(tab.url).hostname,
    groqKey: groqKey || null,
    ts: Date.now(),
  };
  // Try sendMessage first (wakes sleeping SW reliably), fall back to storage
  console.log('[CC] popup: sending teach job to SW');
  try {
    await chrome.runtime.sendMessage({ type: 'TEACH_JOB', job });
  } catch (e) {
    console.warn('[CC] sendMessage failed, using storage fallback:', e.message);
    await chrome.storage.local.set({ _cc_teach_job: job });
  }"""

new = """  const job = {
    tabId: tab.id,
    fields: failedFields,
    backendUrl,
    hostname: new URL(tab.url).hostname,
    groqKey: groqKey || null,
    ts: Date.now(),
  };
  // Write to storage FIRST (synchronous-ish) before popup closes
  console.log('[CC] popup: writing teach job');
  chrome.storage.local.set({ _cc_teach_job: job }, () => {
    console.log('[CC] teach job written to storage');
  });
  // Also try sendMessage to wake SW immediately
  chrome.runtime.sendMessage({ type: 'TEACH_JOB', job }).catch(() => {});"""

if old in c:
    c = c.replace(old, new)
    open('/opt/cybercontrol-hub/extension/popup.js', 'w').write(c)
    print('ok')
else:
    print('NOT FOUND')
