c = open('/opt/cybercontrol-hub/extension/background.js').read()

# Add message listener to background.js
old = "chrome.storage.onChanged.addListener((changes, area) => {"
new = """// Also wake via message (more reliable than storage for sleeping SW)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TEACH_JOB') {
    const job = msg.job;
    if (job.ts === _lastTeachTs || _teachRunning) { sendResponse({ ok: false }); return; }
    _lastTeachTs = job.ts;
    sendResponse({ ok: true });
    runTeachSession(job).catch(console.error);
  }
  return true;
});

chrome.storage.onChanged.addListener((changes, area) => {"""

if 'chrome.runtime.onMessage.addListener' not in c:
    c = c.replace(old, new)
    open('/opt/cybercontrol-hub/extension/background.js', 'w').write(c)
    print('bg ok')
else:
    print('already added')
