import assert from 'node:assert/strict';
import { respondToMcp } from './mcp-rpc.ts';
import '../../../../packages/cc-wss/src/page-shot.ts';
import '../../../../packages/cc-wss/src/pointer-keys.ts';

const calls = [];
const run = async (workspaceId, body) => {
  calls.push({ workspaceId, body });
  return { status: 200, payload: { ok: true, echoed: body.task } };
};

const init = await respondToMcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } }, 'ws', run);
assert.equal(init.kind, 'json');
assert.equal(init.body.result.protocolVersion, '2024-11-05');
assert.equal(init.body.result.serverInfo.name, 'cybercontrol-browser');

const listed = await respondToMcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, 'ws', run);
const names = listed.body.result.tools.map((tool) => tool.name);
assert.deepEqual(names, ['open_url', 'read_form', 'fill_form', 'click', 'list_profiles', 'read_profile', 'fill', 'snapshot', 'list_tabs', 'focus_tab', 'scroll', 'history', 'mouse_click', 'keyboard']);

const note = await respondToMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, 'ws', run);
assert.equal(note.kind, 'accept');

const missing = await respondToMcp({ jsonrpc: '2.0', id: 3, method: 'resources/list' }, 'ws', run);
assert.equal(missing.body.error.code, -32601);

const opened = await respondToMcp({
  jsonrpc: '2.0',
  id: 4,
  method: 'tools/call',
  params: { name: 'open_url', arguments: { url: 'https://www.irctc.co.in/nget/train-search' } },
}, 'ws-1', run);
assert.equal(calls.length, 1);
assert.equal(calls[0].workspaceId, 'ws-1');
assert.equal(calls[0].body.task, 'open_url');
assert.equal(JSON.parse(opened.body.result.content[0].text).ok, true);

const bad = await respondToMcp({
  jsonrpc: '2.0',
  id: 5,
  method: 'tools/call',
  params: { name: 'open_url', arguments: {} },
}, 'ws-1', run);
assert.equal(bad.body.result.isError, true);
assert.equal(calls.length, 1);

const failing = async () => ({ status: 409, payload: { error: 'no_extension_connected' } });
const refused = await respondToMcp({
  jsonrpc: '2.0',
  id: 6,
  method: 'tools/call',
  params: { name: 'read_form', arguments: {} },
}, 'ws-1', failing);
assert.equal(refused.body.result.isError, true);

const listedProfiles = await respondToMcp({
  jsonrpc: '2.0',
  id: 7,
  method: 'tools/call',
  params: { name: 'list_profiles', arguments: {} },
}, 'ws-9', run, {
  listProfiles: async (workspaceId) => [{ id: 'p1', name: 'Asha', workspaceId }],
});
const profileRows = JSON.parse(listedProfiles.body.result.content[0].text).profiles;
assert.equal(profileRows[0].id, 'p1');
assert.equal(profileRows[0].workspaceId, 'ws-9');

const filled = await respondToMcp({
  jsonrpc: '2.0',
  id: 8,
  method: 'tools/call',
  params: { name: 'fill', arguments: { profileId: 'p1' } },
}, 'ws-9', run);
assert.equal(calls[calls.length - 1].body.task, 'fill');
assert.equal(calls[calls.length - 1].body.profileId, 'p1');
assert.equal(JSON.parse(filled.body.result.content[0].text).ok, true);

const pageShotOffsets = (globalThis as any).CcPageShot.pageShotOffsets;
const shotPlan = pageShotOffsets(5000, 800, 6);
assert.deepEqual(shotPlan.offsets, [0, 800, 1600, 2400, 3200, 4000]);
assert.equal(shotPlan.clipped, true);
assert.equal(pageShotOffsets(900, 800, 6).clipped, false);

const shot = await respondToMcp({
  jsonrpc: '2.0',
  id: 9,
  method: 'tools/call',
  params: { name: 'snapshot', arguments: { scope: 'page', selector: 'form-field-1', rect: { x: 1, y: 2, width: 40, height: 20 } } },
}, 'ws-9', async (_workspaceId, body) => {
  assert.equal(body.task, 'snapshot');
  assert.equal(body.scope, 'area');
  assert.equal(body.selector, 'form-field-1');
  return {
    status: 200,
    payload: { ok: true, result: { ok: true, image: 'abc', mimeType: 'image/jpeg', width: 10, height: 20, scope: 'area' } },
  };
});
assert.equal(shot.body.result.isError, false);
assert.equal(shot.body.result.content[1].type, 'image');
assert.equal(shot.body.result.content[1].data, 'abc');
assert.equal(shot.body.result.content[1].mimeType, 'image/jpeg');
assert.equal(JSON.parse(shot.body.result.content[0].text).result.image, undefined);

const beforeNav = calls.length;
const missingTab = await respondToMcp({
  jsonrpc: '2.0',
  id: 10,
  method: 'tools/call',
  params: { name: 'focus_tab', arguments: {} },
}, 'ws-9', run);
assert.equal(missingTab.body.result.isError, true);
assert.equal(calls.length, beforeNav);

const scrolled = await respondToMcp({
  jsonrpc: '2.0',
  id: 11,
  method: 'tools/call',
  params: { name: 'scroll', arguments: { dy: 400, selector: 'form-field-2' } },
}, 'ws-9', run);
assert.equal(calls[calls.length - 1].body.task, 'scroll');
assert.equal(calls[calls.length - 1].body.dy, 400);
assert.equal(calls[calls.length - 1].body.selector, 'form-field-2');
assert.equal(JSON.parse(scrolled.body.result.content[0].text).ok, true);

const backed = await respondToMcp({
  jsonrpc: '2.0',
  id: 12,
  method: 'tools/call',
  params: { name: 'history', arguments: { action: 'back', tabId: 9 } },
}, 'ws-9', run);
assert.equal(calls[calls.length - 1].body.task, 'history');
assert.equal(calls[calls.length - 1].body.action, 'back');
assert.equal(calls[calls.length - 1].body.tabId, 9);
assert.equal(JSON.parse(backed.body.result.content[0].text).ok, true);

const badHistory = await respondToMcp({
  jsonrpc: '2.0',
  id: 13,
  method: 'tools/call',
  params: { name: 'history', arguments: { action: 'close' } },
}, 'ws-9', run);
assert.equal(badHistory.body.result.isError, true);

const beforePointer = calls.length;
const missingPoint = await respondToMcp({
  jsonrpc: '2.0',
  id: 14,
  method: 'tools/call',
  params: { name: 'mouse_click', arguments: {} },
}, 'ws-9', run);
assert.equal(missingPoint.body.result.isError, true);
assert.equal(calls.length, beforePointer);

const pointed = await respondToMcp({
  jsonrpc: '2.0',
  id: 15,
  method: 'tools/call',
  params: { name: 'mouse_click', arguments: { x: 40, y: 12, selector: 'button.ytSearchboxComponentSearchButton', tabId: 9 } },
}, 'ws-9', run);
assert.equal(calls[calls.length - 1].body.task, 'mouse_click');
assert.equal(calls[calls.length - 1].body.x, 40);
assert.equal(calls[calls.length - 1].body.y, 12);
assert.equal(calls[calls.length - 1].body.selector, 'button.ytSearchboxComponentSearchButton');
assert.equal(calls[calls.length - 1].body.button, 'left');
assert.equal(calls[calls.length - 1].body.count, 1);
assert.equal(JSON.parse(pointed.body.result.content[0].text).ok, true);

const missingKey = await respondToMcp({
  jsonrpc: '2.0',
  id: 16,
  method: 'tools/call',
  params: { name: 'keyboard', arguments: { selector: '#search' } },
}, 'ws-9', run);
assert.equal(missingKey.body.result.isError, true);

const typed = await respondToMcp({
  jsonrpc: '2.0',
  id: 17,
  method: 'tools/call',
  params: { name: 'keyboard', arguments: { selector: '[name="search_query"]', text: 'govind bolo', key: 'Enter', tabId: 9 } },
}, 'ws-9', run);
assert.equal(calls[calls.length - 1].body.task, 'keyboard');
assert.equal(calls[calls.length - 1].body.selector, '[name="search_query"]');
assert.equal(calls[calls.length - 1].body.text, 'govind bolo');
assert.equal(calls[calls.length - 1].body.key, 'Enter');
assert.equal(JSON.parse(typed.body.result.content[0].text).ok, true);

const events = [];
const hit = {
  tagName: 'BUTTON',
  innerText: 'Search',
  getBoundingClientRect: () => ({ left: 10, top: 20, width: 40, height: 10 }),
  dispatchEvent: (ev) => { events.push(ev.type); return true; },
  click: () => { events.push('el.click'); },
  focus: () => { events.push('focus'); },
  getAttribute: () => '',
};
const inputEl = {
  tagName: 'INPUT',
  type: 'text',
  name: 'search_query',
  value: '',
  selectionStart: 0,
  selectionEnd: 0,
  disabled: false,
  readOnly: false,
  dispatchEvent: () => true,
  focus: () => {},
  click: () => {},
  setSelectionRange: (a, b) => { inputEl.selectionStart = a; inputEl.selectionEnd = b; },
  getAttribute: () => 'Search',
  scrollIntoView: () => {},
};
(globalThis as any).document = {
  elementFromPoint: () => hit,
  querySelector: (sel) => sel.includes('search_query') ? inputEl : hit,
  activeElement: inputEl,
  title: 'YouTube',
  defaultView: globalThis,
  querySelectorAll: () => [inputEl],
  execCommand: () => false,
};
(globalThis as any).location = { href: 'https://www.youtube.com/results' };
(globalThis as any).window = globalThis;
(globalThis as any).MouseEvent = class {
  constructor(type, init) { this.type = type; Object.assign(this, init || {}); }
};
(globalThis as any).PointerEvent = class {
  constructor(type, init) { this.type = type; Object.assign(this, init || {}); }
};
(globalThis as any).KeyboardEvent = class {
  constructor(type, init) { this.type = type; Object.assign(this, init || {}); }
};
(globalThis as any).InputEvent = class {
  constructor(type, init) { this.type = type; Object.assign(this, init || {}); }
};
(globalThis as any).Event = class {
  constructor(type, init) { this.type = type; Object.assign(this, init || {}); }
};
const clickAt = (globalThis as any).CcPagePointer.clickAt;
const pressKeys = (globalThis as any).CcPagePointer.pressKeys;
const atPoint = clickAt({ x: 30, y: 25 });
assert.equal(atPoint.ok, true);
assert.equal(atPoint.tag, 'button');
assert.equal(atPoint.clicked, 'Search');
assert.equal(events.includes('click'), true);
const keyed = pressKeys({ selector: '[name="search_query"]', text: 'govind', key: 'Enter' });
assert.equal(keyed.ok, true);
assert.equal(inputEl.value, 'govind');
assert.equal(keyed.typed, 'govind');
assert.equal(keyed.key, 'Enter');

console.log('MCP_RPC_OK');
