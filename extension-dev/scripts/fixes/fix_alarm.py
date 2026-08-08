c = open('/opt/cybercontrol-hub/extension/background.js').read()

# Add alarm listener to wake SW
old = "// Also wake via message (more reliable than storage for sleeping SW)"
new = """// Alarm-based wake — most reliable way to wake sleeping SW in MV3
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'cc_teach_wake') return;
  const data = await chrome.storage.local.get('_cc_teach_job');
  const job = data._cc_teach_job;
  if (!job) return;
  if (job.ts === _lastTeachTs || _teachRunning) return;
  _lastTeachTs = job.ts;
  chrome.storage.local.remove('_cc_teach_job');
  console.log('[CC] alarm woke SW for teach:', job.hostname);
  runTeachSession(job).catch(console.error);
});

// Also wake via message (more reliable than storage for sleeping SW)"""

if 'chrome.alarms.onAlarm' not in c:
    c = c.replace(old, new)
    print('alarm ok')
else:
    print('already added')

open('/opt/cybercontrol-hub/extension/background.js', 'w').write(c)
