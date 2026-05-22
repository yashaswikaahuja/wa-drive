c = open('/opt/cybercontrol-hub/extension/popup.js').read()

old = """  // Write to storage FIRST (synchronous-ish) before popup closes
  console.log('[CC] popup: writing teach job');
  chrome.storage.local.set({ _cc_teach_job: job }, () => {
    console.log('[CC] teach job written to storage');
  });
  // Also try sendMessage to wake SW immediately
  chrome.runtime.sendMessage({ type: 'TEACH_JOB', job }).catch(() => {});"""

new = """  // Write to storage + create alarm to wake SW (most reliable in MV3)
  console.log('[CC] popup: writing teach job + alarm');
  chrome.storage.local.set({ _cc_teach_job: job }, () => {
    // Create alarm 0.1 min = 6s delay (minimum is 1 min in some contexts, use 0 for immediate)
    chrome.alarms.create('cc_teach_wake', { delayInMinutes: 0.1 });
    console.log('[CC] teach job written, alarm created');
  });
  // Also try sendMessage (works if SW is already awake)
  chrome.runtime.sendMessage({ type: 'TEACH_JOB', job }).catch(() => {});"""

if old in c:
    c = c.replace(old, new)
    open('/opt/cybercontrol-hub/extension/popup.js', 'w').write(c)
    print('ok')
else:
    print('NOT FOUND')
