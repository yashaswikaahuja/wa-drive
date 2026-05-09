c = open('/opt/cybercontrol-hub/extension/background.js').read()

# Add GET_TAB_ID handler and fix tabId resolution in message handler
old = """// Also wake via message (more reliable than storage for sleeping SW)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TEACH_JOB') {
    const job = msg.job;
    if (job.ts === _lastTeachTs || _teachRunning) { sendResponse({ ok: false }); return; }
    _lastTeachTs = job.ts;
    sendResponse({ ok: true });
    runTeachSession(job).catch(console.error);
  }
  return true;
});"""

new = """// Also wake via message (more reliable than storage for sleeping SW)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TEACH_JOB') {
    const job = msg.job;
    // Use sender tab ID if job tabId is missing/invalid
    if (sender?.tab?.id && (!job.tabId || job.tabId === 0)) job.tabId = sender.tab.id;
    if (job.ts === _lastTeachTs || _teachRunning) { sendResponse({ ok: false }); return; }
    _lastTeachTs = job.ts;
    sendResponse({ ok: true });
    runTeachSession(job).catch(console.error);
  }
  if (msg.type === 'GET_TAB_ID') {
    sendResponse({ tabId: sender?.tab?.id });
  }
  return true;
});"""

if old in c:
    c = c.replace(old, new)
    print('msg handler ok')
else:
    print('msg handler NOT FOUND')

# Fix storage handler to also resolve tabId
old2 = """  console.log('[CC] SW teach job received:', job.hostname, job.fields?.length, 'fields');
  chrome.storage.local.set({_cc_teach_debug: 'received:' + job.hostname + ':' + job.fields?.length});"""

new2 = """  console.log('[CC] SW teach job received:', job.hostname, job.fields?.length, 'fields, tabId:', job.tabId);
  chrome.storage.local.set({_cc_teach_debug: 'received:' + job.hostname + ':' + job.fields?.length + ':tab:' + job.tabId});
  // If tabId is missing, find the tab by hostname
  if (!job.tabId || job.tabId === 0) {
    const foundTabs = await chrome.tabs.query({url: '*://' + job.hostname + '/*'}).catch(() => []);
    if (foundTabs.length > 0) { job.tabId = foundTabs[0].id; console.log('[CC] resolved tabId:', job.tabId); }
  }"""

if old2 in c:
    c = c.replace(old2, new2)
    print('storage handler ok')
else:
    print('storage handler NOT FOUND')

open('/opt/cybercontrol-hub/extension/background.js', 'w').write(c)
