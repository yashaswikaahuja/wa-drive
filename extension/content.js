// Content script - listens for messages from popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'ping') sendResponse({ ok: true });
});
