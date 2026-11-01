/**
 * Page scroll for browser_task. Self-contained so chrome.scripting can serialize it.
 * Scrolls the overflowing root (nested overflow:auto on DemoQA, window on
 * infinite_scroll) and retries to:bottom while lazy content grows.
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
  function findRoot() {
    var scrolling = doc.scrollingElement || doc.documentElement;
    var best = scrolling;
    var bestDelta = delta(best);
    var nodes = [];
    try { nodes = doc.querySelectorAll('div,main,section,article,aside,body,html'); } catch (e) { nodes = []; }
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!overflowY(el)) continue;
      var d = delta(el);
      if (d > bestDelta + 8) {
        best = el;
        bestDelta = d;
      }
    }
    return best || scrolling;
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

  var root = findRoot();
  var before = pos(root);
  var selector = spec && spec.selector ? String(spec.selector) : '';
  if (selector) {
    var target = resolve(selector);
    if (!target) return { ok: false, error: 'not_found' };
    try { target.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e4) { /* stay */ }
  } else if (spec && spec.to === 'top') {
    setPos(root, 0, 0);
  } else if (spec && spec.to === 'bottom') {
    for (var n = 0; n < 8; n++) {
      var h = root && root.scrollHeight || 0;
      setPos(root, 0, h);
      await wait(220);
      var grown = (root && root.scrollHeight || 0) > h + 2;
      if (!grown) break;
    }
  } else {
    var dx = Number(spec && spec.dx) || 0;
    var dy = Number(spec && spec.dy) || 0;
    setPos(root, before.x + dx, before.y + dy);
    var afterTry = pos(root);
    if (afterTry.x === before.x && afterTry.y === before.y && !isWindowRoot(root)) {
      if (typeof win.scrollBy === 'function') win.scrollBy(dx, dy);
    }
  }
  var after = pos(root);
  var moved = after.x !== before.x || after.y !== before.y;
  if (!moved && spec && spec.to === 'bottom') {
    var still = findRoot();
    if (still && still !== root) {
      setPos(still, 0, still.scrollHeight || 0);
      root = still;
      after = pos(root);
      moved = after.x !== before.x || after.y !== before.y;
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
