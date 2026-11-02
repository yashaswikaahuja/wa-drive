/**
 * pointer-keys.test.ts — executor CcPagePointer click / hover / drag / type.
 *
 * Run from the package: node --experimental-strip-types ../../tooling/run-package-tests.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcTs = readFileSync(join(__dirname, '../src/pointer-keys.ts'), 'utf8');
const { code: src } = await esbuild.transform(srcTs, { loader: 'ts', target: 'es2018' });
new Function('globalThis', src)(globalThis);
const clickAt = (globalThis as any).CcPagePointer.clickAt;
const pressKeys = (globalThis as any).CcPagePointer.pressKeys;

const events: string[] = [];
const hit: any = {
  tagName: 'BUTTON',
  innerText: 'Search',
  getBoundingClientRect: () => ({ left: 10, top: 20, width: 40, height: 10 }),
  dispatchEvent: (ev: any) => { events.push(ev.type); return true; },
  click: () => { events.push('el.click'); },
  focus: () => { events.push('focus'); },
  getAttribute: () => '',
};
const inputEl: any = {
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
  setSelectionRange: (a: number, b: number) => { inputEl.selectionStart = a; inputEl.selectionEnd = b; },
  getAttribute: () => 'Search',
  scrollIntoView: () => {},
};
(globalThis as any).document = {
  elementFromPoint: () => hit,
  querySelector: (sel: string) => String(sel).includes('search_query') ? inputEl : hit,
  activeElement: inputEl,
  title: 'YouTube',
  defaultView: globalThis,
  querySelectorAll: () => [inputEl],
  execCommand: () => false,
};
(globalThis as any).location = { href: 'https://www.youtube.com/results' };
(globalThis as any).window = globalThis;
(globalThis as any).MouseEvent = class {
  type: string;
  constructor(type: string, init: any) { this.type = type; Object.assign(this, init || {}); }
};
(globalThis as any).PointerEvent = class {
  type: string;
  constructor(type: string, init: any) { this.type = type; Object.assign(this, init || {}); }
};
(globalThis as any).KeyboardEvent = class {
  type: string;
  constructor(type: string, init: any) { this.type = type; Object.assign(this, init || {}); }
};
(globalThis as any).InputEvent = class {
  type: string;
  constructor(type: string, init: any) { this.type = type; Object.assign(this, init || {}); }
};
(globalThis as any).Event = class {
  type: string;
  constructor(type: string, init: any) { this.type = type; Object.assign(this, init || {}); }
};

const atPoint = clickAt({ x: 30, y: 25 });
assert.equal(atPoint.ok, true);
assert.equal(atPoint.tag, 'button');
assert.equal(atPoint.clicked, 'Search');
assert.equal(events.includes('click'), true);

const hoverEvents: string[] = [];
hit.dispatchEvent = (ev: any) => { hoverEvents.push(ev.type); return true; };
const hoveredAt = clickAt({ x: 30, y: 25, action: 'hover' });
assert.equal(hoveredAt.ok, true);
assert.equal(hoveredAt.action, 'hover');
assert.equal(hoveredAt.hovered, 'Search');
assert.equal(hoverEvents.includes('mouseover'), true);
assert.equal(hoverEvents.includes('click'), false);

const dragEvents: string[] = [];
hit.dispatchEvent = (ev: any) => { dragEvents.push(ev.type); return true; };
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
  getAttribute: (name: string) => name === 'draggable' ? 'true' : '',
  dispatchEvent: (ev: any) => { colA.events.push(ev.type); return true; },
  scrollIntoView: () => {},
};
const colB: any = {
  tagName: 'DIV',
  id: 'column-b',
  draggable: true,
  innerHTML: '<header>B</header>',
  events: [],
  getBoundingClientRect: () => ({ left: 90, top: 20, width: 40, height: 40 }),
  getAttribute: (name: string) => name === 'draggable' ? 'true' : '',
  dispatchEvent: (ev: any) => { colB.events.push(ev.type); return true; },
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
(globalThis as any).document.querySelectorAll = (sel: string) => {
  const s = String(sel);
  if (s === '#column-a') return [colA];
  if (s === '#column-b') return [colB];
  if (s === '#droppable') return [hiddenDrop, shownDrop];
  if (String(sel).includes('search_query')) return [inputEl];
  return [inputEl];
};
(globalThis as any).document.querySelector = (sel: string) => {
  const s = String(sel);
  if (s === '#column-a') return colA;
  if (s === '#column-b') return colB;
  if (s.includes('search_query')) return inputEl;
  return hit;
};
(globalThis as any).document.elementFromPoint = (x: number) => (x >= 90 ? colB : colA);
const swapped = clickAt({ selector: '#column-a', toSelector: '#column-b', action: 'drag' });
assert.equal(swapped.ok, true);
assert.equal(colA.innerHTML, '<header>B</header>');
assert.equal(colB.innerHTML, '<header>A</header>');
assert.equal(colA.events.includes('dragstart'), true);
assert.equal(colB.events.includes('drop'), true);

colA.innerHTML = '<header>A</header>';
colB.innerHTML = '<header>B</header>';
colA.nodeType = 1;
colB.nodeType = 1;
colA.parentElement = null;
colB.parentElement = null;
const headerB: any = {
  tagName: 'HEADER',
  nodeType: 1,
  innerHTML: 'B',
  parentElement: colB,
  draggable: false,
  getAttribute: () => '',
  getBoundingClientRect: () => ({ left: 100, top: 30, width: 20, height: 20 }),
  dispatchEvent: () => true,
};
(globalThis as any).document.elementFromPoint = () => headerB;
const swappedFromHeader = clickAt({ selector: '#column-a', x2: 110, y2: 40, action: 'drag' });
assert.equal(swappedFromHeader.ok, true);
assert.equal(colA.innerHTML, '<header>B</header>');
assert.equal(colB.innerHTML, '<header>A</header>');

const pickedVisible = clickAt({ selector: '#droppable', x: 240, y: 60 });
assert.equal(pickedVisible.ok, true);
assert.equal(pickedVisible.error == null, true);

(globalThis as any).document.querySelectorAll = () => [inputEl];
(globalThis as any).document.elementFromPoint = () => hit;
const keyed = pressKeys({ selector: '[name="search_query"]', text: 'govind', key: 'Enter' });
assert.equal(keyed.ok, true);
assert.equal(inputEl.value, 'govind');
assert.equal(keyed.typed, 'govind');

const rangeEl: any = {
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
(globalThis as any).document.querySelector = (sel: string) => {
  if (String(sel).includes('search_query')) return inputEl;
  if (String(sel).includes('range')) return rangeEl;
  return hit;
};
(globalThis as any).document.querySelectorAll = (sel: string) => {
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

const otpEl: any = {
  tagName: 'INPUT',
  type: 'text',
  id: 'mobileotp',
  name: 'mobileotp',
  value: '',
  disabled: false,
  readOnly: false,
  dispatchEvent: () => true,
  focus: () => {},
  click: () => {},
  getAttribute: () => '',
  scrollIntoView: () => {},
};
(globalThis as any).document.querySelector = (sel: string) => String(sel).includes('otp') ? otpEl : hit;
(globalThis as any).document.querySelectorAll = (sel: string) => String(sel).includes('otp') ? [otpEl] : [inputEl];
const blocked = pressKeys({ selector: '#mobileotp', text: '123456' });
assert.equal(blocked.ok, false);
assert.equal(blocked.error, 'blocked_field');
assert.equal(otpEl.value, '');

console.log('pointer-keys.test.ts passed');
