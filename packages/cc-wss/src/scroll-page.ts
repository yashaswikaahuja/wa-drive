/**
 * Page scroll for browser_task. Self-contained so chrome.scripting can serialize it.
 * Scrolls the overflowing root: the window when the page itself can move,
 * otherwise a nested overflow:auto pane. Skips a narrow left nav (DemoQA).
 * Retries to:bottom while lazy content grows.
 */
async function scrollPage(spec: any) {
  var g = typeof globalThis !== 'undefined' ? globalThis : this;
  var doc = g.document;
  if (!doc) return { ok: false, error: 'no_document' };
  var win = doc.defaultView || g.window || g;
  function wait(ms: any) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }
  function overflowY(el: any) {
    if (!el || !win.getComputedStyle) return false;
    try {
      var oy = String((win.getComputedStyle(el) || {}).overflowY || '');
      return oy === 'auto' || oy === 'scroll' || oy === 'overlay';
    } catch (e) {
      return false;
    }
  }
  function delta(el: any) {
    if (!el) return 0;
    return Math.max(0, (el.scrollHeight || 0) - (el.clientHeight || 0));
  }
  function isWindowRoot(el: any) {
    return el === doc.scrollingElement || el === doc.documentElement || el === doc.body;
  }
  function isChromePane(el: any) {
    if (!el) return false;
    if (el.closest && el.closest('nav,aside,header,footer,[role="navigation"],[role="banner"],.left-pannel,.left-panel')) return true;
    var w = el.clientWidth || 0;
    var vw = win.innerWidth || 0;
    return vw > 0 && w > 0 && w < vw * 0.4;
  }
  function isPane(el: any) {
    if (!el || isWindowRoot(el)) return false;
    if (overflowY(el)) return true;
    if (!win.getComputedStyle) return false;
    try {
      var oy = String((win.getComputedStyle(el) || {}).overflowY || '');
      if (oy !== 'hidden') return false;
      var w = el.clientWidth || 0;
      var vw = win.innerWidth || 0;
      return vw > 0 && w > vw * 0.5;
    } catch (e) {
      return false;
    }
  }
  function windowActuallyScrolls() {
    var scrolling = doc.scrollingElement || doc.documentElement;
    if (delta(scrolling) <= 32) return false;
    if (typeof win.scrollTo !== 'function') return false;
    var y0 = win.scrollY || 0;
    var probe = y0 > 8 ? y0 - 8 : y0 + 8;
    try { win.scrollTo(0, probe); } catch (e) { return false; }
    var y1 = win.scrollY || 0;
    try { win.scrollTo(0, y0); } catch (e2) { /* restore best-effort */ }
    return Math.abs(y1 - y0) > 1;
  }
  function findNested() {
    var best = null;
    var bestDelta = 0;
    var fallback = null;
    var fallbackDelta = 0;
    var nodes = [];
    try { nodes = doc.querySelectorAll('div,main,section,article,aside,body,html'); } catch (e) { nodes = []; }
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!isPane(el)) continue;
      var d = delta(el);
      if (d > fallbackDelta + 8) {
        fallback = el;
        fallbackDelta = d;
      }
      if (isChromePane(el)) continue;
      if (d > bestDelta + 8) {
        best = el;
        bestDelta = d;
      }
    }
    if (best && bestDelta > 32) return best;
    if (fallback && fallbackDelta > 32) return fallback;
    return null;
  }
  function findRoot() {
    var scrolling = doc.scrollingElement || doc.documentElement;
    if (windowActuallyScrolls()) return scrolling;
    return findNested() || scrolling;
  }
  function pos(root: any) {
    if (!root) return { x: 0, y: 0 };
    if (isWindowRoot(root)) return { x: win.scrollX || 0, y: win.scrollY || 0 };
    return { x: root.scrollLeft || 0, y: root.scrollTop || 0 };
  }
  function setPos(root: any, x: any, y: any) {
    if (!root) return;
    if (isWindowRoot(root)) {
      if (typeof win.scrollTo === 'function') win.scrollTo(x, y);
      else {
        root.scrollLeft = x;
        root.scrollTop = y;
      }
      return;
    }
    root.scrollLeft = x;
    root.scrollTop = y;
  }
  function resolve(sel: any) {
    if (!sel) return null;
    try {
      var resolver = g.CcResolveCcSelector;
      if (resolver && typeof resolver.resolveCcSelector === 'function') {
        var byCc = resolver.resolveCcSelector(sel, doc);
        if (byCc) return byCc;
      }
    } catch (e) { /* fall through */ }
    try {
      var clickApi = g.CcClickControl;
      if (clickApi && typeof clickApi.elementFor === 'function') {
        var byClick = clickApi.elementFor(sel, doc);
        if (byClick) return byClick;
      }
    } catch (e2) { /* fall through */ }
    try {
      var hit = doc.querySelector(sel);
      if (hit) return hit;
      var frames = doc.querySelectorAll('iframe,frame');
      for (var fi = 0; fi < frames.length; fi++) {
        var child = null;
        try { child = frames[fi].contentDocument; } catch (e4) { child = null; }
        if (!child) continue;
        try {
          hit = child.querySelector(sel);
          if (hit) return hit;
        } catch (e5) { /* keep looking */ }
      }
    } catch (e3) { return null; }
    return null;
  }

  async function apply(targetRoot: any, from: any) {
    var selector = spec && spec.selector ? String(spec.selector) : '';
    if (selector) {
      var target = resolve(selector);
      if (!target) return { missing: true };
      try { target.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e4) { /* stay */ }
      return { missing: false };
    }
    if (spec && spec.to === 'top') {
      setPos(targetRoot, 0, 0);
      return { missing: false };
    }
    if (spec && spec.to === 'bottom') {
      for (var n = 0; n < 8; n++) {
        var h = targetRoot && targetRoot.scrollHeight || 0;
        setPos(targetRoot, 0, h);
        await wait(220);
        var grown = (targetRoot && targetRoot.scrollHeight || 0) > h + 2;
        if (!grown) break;
      }
      return { missing: false };
    }
    var dx = Number(spec && spec.dx) || 0;
    var dy = Number(spec && spec.dy) || 0;
    setPos(targetRoot, from.x + dx, from.y + dy);
    return { missing: false };
  }

  var root = findRoot();
  var before = pos(root);
  var applied = await apply(root, before);
  if (applied.missing) return { ok: false, error: 'not_found' };
  var after = pos(root);
  var moved = after.x !== before.x || after.y !== before.y;
  if (!moved && !(spec && spec.selector)) {
    var alt = isWindowRoot(root) ? findNested() : (doc.scrollingElement || doc.documentElement);
    if (alt && alt !== root) {
      var altBefore = pos(alt);
      await apply(alt, altBefore);
      var altAfter = pos(alt);
      if (altAfter.x !== altBefore.x || altAfter.y !== altBefore.y) {
        root = alt;
        after = altAfter;
        moved = true;
      }
    }
  }
  return {
    ok: true,
    url: String((g.location && g.location.href) || '').split('?')[0].slice(0, 300),
    title: doc.title || '',
    scrollX: after.x,
    scrollY: after.y,
    scrollHeight: (root && root.scrollHeight) || 0,
    clientHeight: isWindowRoot(root) ? (win.innerHeight || 0) : (root && root.clientHeight) || 0,
    scrollRoot: isWindowRoot(root) ? 'window' : 'element',
    moved: moved,
  };
}

const scrollRoot = typeof globalThis !== 'undefined' ? globalThis : this;
(scrollRoot as any).CcScrollPage = { scrollPage };
