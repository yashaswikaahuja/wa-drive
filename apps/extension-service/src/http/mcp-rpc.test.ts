import assert from 'node:assert/strict';
import { respondToMcp } from './mcp-rpc.ts';
import '../../../../packages/cc-wss/src/page-shot.ts';
import '../../../../packages/cc-wss/src/pointer-keys.ts';
import '../../../../packages/cc-wss/src/scroll-page.ts';

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
assert.deepEqual(names, ['open_url', 'read_form', 'fill_form', 'click', 'list_profiles', 'read_profile', 'fill', 'snapshot', 'list_tabs', 'close_tab', 'focus_tab', 'scroll', 'history', 'mouse_click', 'hover', 'drag', 'keyboard']);

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
assert.equal(calls[0].body.newTab, true);
assert.equal(JSON.parse(opened.body.result.content[0].text).ok, true);

const reused = await respondToMcp({
  jsonrpc: '2.0',
  id: '4b',
  method: 'tools/call',
  params: { name: 'open_url', arguments: { url: 'https://the-internet.herokuapp.com/iframe', tabId: 12 } },
}, 'ws-1', run);
assert.equal(calls[calls.length - 1].body.task, 'open_url');
assert.equal(calls[calls.length - 1].body.tabId, 12);
assert.equal(calls[calls.length - 1].body.newTab, false);
assert.equal(JSON.parse(reused.body.result.content[0].text).ok, true);

const bad = await respondToMcp({
  jsonrpc: '2.0',
  id: 5,
  method: 'tools/call',
  params: { name: 'open_url', arguments: {} },
}, 'ws-1', run);
assert.equal(bad.body.result.isError, true);
assert.equal(calls.length, 2);

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

const closed = await respondToMcp({
  jsonrpc: '2.0',
  id: '9b',
  method: 'tools/call',
  params: { name: 'close_tab', arguments: { tabId: 12 } },
}, 'ws-9', run);
assert.equal(calls[calls.length - 1].body.task, 'close_tab');
assert.equal(calls[calls.length - 1].body.tabId, 12);
assert.equal(JSON.parse(closed.body.result.content[0].text).ok, true);

const beforeNav = calls.length;
const missingClose = await respondToMcp({
  jsonrpc: '2.0',
  id: '9c',
  method: 'tools/call',
  params: { name: 'close_tab', arguments: {} },
}, 'ws-9', run);
assert.equal(missingClose.body.result.isError, true);

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

const hovered = await respondToMcp({
  jsonrpc: '2.0',
  id: '15h',
  method: 'tools/call',
  params: { name: 'hover', arguments: { selector: '#menu', tabId: 9 } },
}, 'ws-9', run);
assert.equal(calls[calls.length - 1].body.task, 'hover');
assert.equal(calls[calls.length - 1].body.selector, '#menu');
assert.equal(calls[calls.length - 1].body.action, 'hover');
assert.equal(JSON.parse(hovered.body.result.content[0].text).ok, true);

const dragged = await respondToMcp({
  jsonrpc: '2.0',
  id: '15d',
  method: 'tools/call',
  params: { name: 'drag', arguments: { x: 40, y: 12, x2: 180, y2: 12, tabId: 9 } },
}, 'ws-9', run);
assert.equal(calls[calls.length - 1].body.task, 'drag');
assert.equal(calls[calls.length - 1].body.x2, 180);
assert.equal(calls[calls.length - 1].body.y2, 12);
assert.equal(calls[calls.length - 1].body.action, 'drag');
assert.equal(JSON.parse(dragged.body.result.content[0].text).ok, true);

const missingDragEnd = await respondToMcp({
  jsonrpc: '2.0',
  id: '15e',
  method: 'tools/call',
  params: { name: 'drag', arguments: { x: 40, y: 12 } },
}, 'ws-9', run);
assert.equal(missingDragEnd.body.result.isError, true);

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
const hoverEvents = [];
hit.dispatchEvent = (ev) => { hoverEvents.push(ev.type); return true; };
const hoveredAt = clickAt({ x: 30, y: 25, action: 'hover' });
assert.equal(hoveredAt.ok, true);
assert.equal(hoveredAt.action, 'hover');
assert.equal(hoveredAt.hovered, 'Search');
assert.equal(hoverEvents.includes('mouseover'), true);
assert.equal(hoverEvents.includes('click'), false);
const dragEvents = [];
hit.dispatchEvent = (ev) => { dragEvents.push(ev.type); return true; };
const draggedAt = clickAt({ x: 10, y: 20, x2: 90, y2: 20, action: 'drag' });
assert.equal(draggedAt.ok, true);
assert.equal(draggedAt.action, 'drag');
assert.equal(draggedAt.x2, 90);
assert.equal(draggedAt.dragged, true);
assert.equal(dragEvents.includes('pointerdown'), true);
assert.equal(dragEvents.includes('pointerup'), true);
assert.equal(dragEvents.includes('dragstart'), true);
assert.equal(dragEvents.includes('drop'), true);
assert.equal(dragEvents.includes('dragend'), true);
const colA: any = {
  tagName: 'DIV',
  id: 'column-a',
  draggable: true,
  innerHTML: '<header>A</header>',
  events: [],
  getBoundingClientRect: () => ({ left: 10, top: 20, width: 40, height: 40 }),
  getAttribute: (name) => name === 'draggable' ? 'true' : '',
  dispatchEvent: (ev) => { colA.events.push(ev.type); return true; },
  scrollIntoView: () => {},
};
const colB: any = {
  tagName: 'DIV',
  id: 'column-b',
  draggable: true,
  innerHTML: '<header>B</header>',
  events: [],
  getBoundingClientRect: () => ({ left: 90, top: 20, width: 40, height: 40 }),
  getAttribute: (name) => name === 'draggable' ? 'true' : '',
  dispatchEvent: (ev) => { colB.events.push(ev.type); return true; },
  scrollIntoView: () => {},
};
const hiddenDrop: any = {
  tagName: 'DIV',
  id: 'droppable',
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
  getAttribute: () => '',
};
const shownDrop: any = {
  tagName: 'DIV',
  id: 'droppable',
  innerText: 'Drop here',
  getBoundingClientRect: () => ({ left: 200, top: 20, width: 80, height: 80 }),
  getAttribute: () => '',
  dispatchEvent: () => true,
  scrollIntoView: () => {},
};
(globalThis as any).document.querySelectorAll = (sel) => {
  const s = String(sel);
  if (s === '#column-a') return [colA];
  if (s === '#column-b') return [colB];
  if (s === '#droppable') return [hiddenDrop, shownDrop];
  if (String(sel).includes('search_query')) return [inputEl];
  return [inputEl];
};
(globalThis as any).document.querySelector = (sel) => {
  const s = String(sel);
  if (s === '#column-a') return colA;
  if (s === '#column-b') return colB;
  if (s.includes('search_query')) return inputEl;
  return hit;
};
(globalThis as any).document.elementFromPoint = (x) => (x >= 90 ? colB : colA);
const swapped = clickAt({ selector: '#column-a', toSelector: '#column-b', action: 'drag' });
assert.equal(swapped.ok, true);
assert.equal(colA.innerHTML, '<header>B</header>');
assert.equal(colB.innerHTML, '<header>A</header>');
assert.equal(colA.events.includes('dragstart'), true);
assert.equal(colB.events.includes('drop'), true);
const pickedVisible = clickAt({ selector: '#droppable', x: 240, y: 60 });
assert.equal(pickedVisible.ok, true);
assert.equal(pickedVisible.error == null, true);
(globalThis as any).document.querySelectorAll = () => [inputEl];
(globalThis as any).document.elementFromPoint = () => hit;
const keyed = pressKeys({ selector: '[name="search_query"]', text: 'govind', key: 'Enter' });
assert.equal(keyed.ok, true);
assert.equal(inputEl.value, 'govind');
assert.equal(keyed.typed, 'govind');
const rangeEl = {
  tagName: 'INPUT',
  type: 'range',
  min: '0',
  max: '5',
  step: '0.5',
  value: '0',
  id: 'range',
  name: 'range',
  disabled: false,
  readOnly: false,
  dispatchEvent: () => true,
  focus: () => {},
  click: () => {},
  getAttribute: () => '',
  scrollIntoView: () => {},
};
(globalThis as any).document.querySelector = (sel) => {
  if (String(sel).includes('search_query')) return inputEl;
  if (String(sel).includes('range')) return rangeEl;
  return hit;
};
(globalThis as any).document.querySelectorAll = (sel) => {
  if (String(sel).includes('search_query')) return [inputEl];
  if (String(sel).includes('range')) return [rangeEl];
  return [inputEl];
};
const slid = pressKeys({ selector: '#range', key: 'ArrowRight' });
assert.equal(slid.ok, true);
assert.equal(rangeEl.value, '0.5');
pressKeys({ selector: '#range', key: 'ArrowRight' });
assert.equal(rangeEl.value, '1');
pressKeys({ selector: '#range', key: 'End' });
assert.equal(rangeEl.value, '5');
assert.equal(keyed.key, 'Enter');

const scrollPage = (globalThis as any).CcScrollPage.scrollPage;
const inner = {
  tagName: 'DIV',
  scrollHeight: 4000,
  clientHeight: 600,
  scrollTop: 80,
  scrollLeft: 0,
};
(globalThis as any).document = {
  title: 'DemoQA',
  scrollingElement: { scrollHeight: 700, clientHeight: 700 },
  documentElement: { scrollHeight: 700, clientHeight: 700 },
  body: { scrollHeight: 700 },
  querySelectorAll: () => [inner],
  querySelector: () => null,
};
(globalThis as any).window = {
  scrollX: 0,
  scrollY: 0,
  innerHeight: 700,
  getComputedStyle: (el) => el === inner ? { overflowY: 'auto' } : { overflowY: 'visible' },
  scrollTo(x, y) { this.scrollX = x; this.scrollY = y; },
  scrollBy(dx, dy) { this.scrollY += dy; },
};
(globalThis as any).location = { href: 'https://demoqa.com/text-box' };
const nested = await scrollPage({ to: 'top' });
assert.equal(nested.ok, true);
assert.equal(nested.scrollRoot, 'element');
assert.equal(nested.moved, true);
assert.equal(inner.scrollTop, 0);

const sidebar = {
  tagName: 'DIV',
  className: 'left-pannel',
  scrollHeight: 4000,
  clientHeight: 600,
  clientWidth: 220,
  scrollTop: 316,
  scrollLeft: 0,
  closest(sel) { return String(sel).indexOf('left-pannel') !== -1 ? sidebar : null; },
};
const page = { scrollHeight: 1369, clientHeight: 700, scrollTop: 316, scrollLeft: 0 };
(globalThis as any).document = {
  title: 'DEMOQA',
  scrollingElement: page,
  documentElement: page,
  body: page,
  querySelectorAll: () => [sidebar],
  querySelector: () => null,
};
(globalThis as any).window = {
  scrollX: 0,
  scrollY: 316,
  innerHeight: 700,
  innerWidth: 1280,
  getComputedStyle: (el) => el === sidebar ? { overflowY: 'auto' } : { overflowY: 'visible' },
  scrollTo(x, y) { this.scrollX = x; this.scrollY = y; },
  scrollBy(dx, dy) { this.scrollY += dy; },
};
(globalThis as any).location = { href: 'https://demoqa.com/text-box' };
const pageScroll = await scrollPage({ dy: 400 });
assert.equal(pageScroll.ok, true);
assert.equal(pageScroll.scrollRoot, 'window');
assert.equal(pageScroll.moved, true);
assert.equal(pageScroll.scrollY, 716);
assert.equal(sidebar.scrollTop, 316);

const stuckWin = {
  scrollX: 0,
  scrollY: 0,
  innerHeight: 598,
  innerWidth: 1280,
  getComputedStyle: (el) => {
    if (el === sidebar) return { overflowY: 'auto' };
    if (el && el.id === 'main') return { overflowY: 'auto' };
    return { overflowY: 'visible' };
  },
  scrollTo() { /* DemoQA html/body do not move */ },
  scrollBy() {},
};
const mainPane = {
  id: 'main',
  tagName: 'DIV',
  scrollHeight: 1369,
  clientHeight: 598,
  clientWidth: 980,
  scrollTop: 0,
  scrollLeft: 0,
  closest() { return null; },
};
const deadPage = { scrollHeight: 1369, clientHeight: 598, scrollTop: 0, scrollLeft: 0 };
(globalThis as any).document = {
  title: 'DEMOQA',
  scrollingElement: deadPage,
  documentElement: deadPage,
  body: deadPage,
  querySelectorAll: () => [sidebar, mainPane],
  querySelector: () => null,
};
(globalThis as any).window = stuckWin;
(globalThis as any).location = { href: 'https://demoqa.com/text-box' };
const innerPage = await scrollPage({ dy: 400 });
assert.equal(innerPage.ok, true);
assert.equal(innerPage.scrollRoot, 'element');
assert.equal(innerPage.moved, true);
assert.equal(innerPage.scrollY, 400);
assert.equal(mainPane.scrollTop, 400);
assert.equal(sidebar.scrollTop, 316);

sidebar.scrollTop = 316;
const chromeOnlyWin = {
  scrollX: 0,
  scrollY: 316,
  innerHeight: 598,
  innerWidth: 1280,
  getComputedStyle: (el) => el === sidebar ? { overflowY: 'auto' } : { overflowY: 'visible' },
  scrollTo() {},
  scrollBy() {},
};
(globalThis as any).document = {
  title: 'DEMOQA',
  scrollingElement: { scrollHeight: 1369, clientHeight: 598, scrollTop: 316, scrollLeft: 0 },
  documentElement: { scrollHeight: 1369, clientHeight: 598, scrollTop: 316, scrollLeft: 0 },
  body: { scrollHeight: 1369, clientHeight: 598, scrollTop: 316, scrollLeft: 0 },
  querySelectorAll: () => [sidebar],
  querySelector: () => null,
};
(globalThis as any).window = chromeOnlyWin;
const skipNav = await scrollPage({ dy: 400 });
assert.equal(skipNav.ok, true);
assert.equal(skipNav.scrollRoot, 'window');
assert.equal(sidebar.scrollTop, 316);

const jscroll = {
  tagName: 'DIV',
  className: 'jscroll-inner',
  scrollHeight: 4000,
  clientHeight: 582,
  clientWidth: 980,
  scrollTop: 109,
  scrollLeft: 0,
  closest() { return null; },
};
const infPage = { scrollHeight: 691, clientHeight: 598, scrollTop: 109, scrollLeft: 0 };
(globalThis as any).document = {
  title: 'Infinite Scroll',
  scrollingElement: infPage,
  documentElement: infPage,
  body: infPage,
  querySelectorAll: () => [jscroll],
  querySelector: () => null,
};
(globalThis as any).window = {
  scrollX: 0,
  scrollY: 109,
  innerHeight: 598,
  innerWidth: 1280,
  getComputedStyle: (el) => el === jscroll ? { overflowY: 'auto' } : { overflowY: 'visible' },
  scrollTo(x, y) { this.scrollX = x; this.scrollY = y; },
  scrollBy(dx, dy) { this.scrollY += dy; },
};
(globalThis as any).location = { href: 'https://the-internet.herokuapp.com/infinite_scroll' };
const inf = await scrollPage({ to: 'bottom' });
assert.equal(inf.ok, true);
assert.equal(inf.scrollRoot, 'window');
assert.equal(inf.moved, true);
assert.equal(jscroll.scrollTop, 109);

console.log('MCP_RPC_OK');
