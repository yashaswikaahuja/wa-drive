/**
 * upload-file-input — assign an image or PDF onto input[type=file].
 *
 * The service worker fetches bytes (Hub fileId, http(s) URL, or capped
 * base64) and injects this helper with { selector, filename, mimeType, data }.
 * Raw filesystem paths never reach this module.
 *
 * Public API (on globalThis.CcUploadFile):
 *   assignFileInput(spec) => { ok, selector, fileName, fileSize, mimeType, fileCount, error? }
 *   findFileInput(selector, doc)
 *   matchesAccept(accept, mimeType, filename)
 */
(function (root: any) {
  'use strict';

  var ALLOWED: any = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'application/pdf': 'pdf',
  };

  function isFileInput(el: any) {
    if (!el) return false;
    var tag = String(el.tagName || '').toLowerCase();
    var type = String(el.type || (el.getAttribute && el.getAttribute('type')) || '').toLowerCase();
    return tag === 'input' && type === 'file';
  }

  function resolveNode(selector: any, doc: any) {
    if (!selector || !doc) return null;
    var resolver = root.CcResolveCcSelector;
    if (resolver && typeof resolver.resolveCcSelector === 'function') {
      try {
        var hit = resolver.resolveCcSelector(selector, doc);
        if (hit) return hit;
      } catch (e0) { /* CSS fallback */ }
    }
    try {
      if (typeof doc.querySelector === 'function') return doc.querySelector(selector);
    } catch (e1) { /* bad selector */ }
    return null;
  }

  function findFileInput(selector: any, doc: any) {
    var d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) return null;
    var node = resolveNode(selector, d);
    if (isFileInput(node)) return node;
    if (node && typeof node.querySelector === 'function') {
      try {
        var inner = node.querySelector('input[type="file"]');
        if (inner) return inner;
      } catch (e2) { /* stay */ }
    }
    var parent = node && (node.parentElement || node.parentNode);
    for (var hops = 0; parent && hops < 6; hops++) {
      if (typeof parent.querySelector === 'function') {
        try {
          var near = parent.querySelector('input[type="file"]');
          if (near) return near;
        } catch (e3) { /* stay */ }
      }
      parent = parent.parentElement || parent.parentNode;
    }
    try {
      var all = d.querySelectorAll('input[type="file"]');
      if (all && all.length === 1) return all[0];
    } catch (e4) { /* stay */ }
    return null;
  }

  function matchesAccept(accept: any, mimeType: any, filename: any) {
    var raw = String(accept || '').trim();
    if (!raw) return true;
    var mime = String(mimeType || '').toLowerCase();
    var name = String(filename || '').toLowerCase();
    var ext = name.lastIndexOf('.') >= 0 ? name.slice(name.lastIndexOf('.')) : '';
    var parts = raw.split(',');
    for (var i = 0; i < parts.length; i++) {
      var p = String(parts[i] || '').trim().toLowerCase();
      if (!p) continue;
      if (p === '*/*') return true;
      if (p.charAt(p.length - 1) === '*' && p.charAt(p.length - 2) === '/') {
        if (mime.indexOf(p.slice(0, p.length - 1)) === 0) return true;
        continue;
      }
      if (p.charAt(0) === '.') {
        if (ext === p) return true;
        if (p === '.jpg' && mime === 'image/jpeg') return true;
        if (p === '.jpeg' && mime === 'image/jpeg') return true;
        if (p === '.png' && mime === 'image/png') return true;
        if (p === '.webp' && mime === 'image/webp') return true;
        if (p === '.gif' && mime === 'image/gif') return true;
        if (p === '.pdf' && mime === 'application/pdf') return true;
        continue;
      }
      if (p === mime) return true;
    }
    return false;
  }

  function decodeBase64(data: any) {
    var raw = String(data || '');
    var comma = raw.indexOf(',');
    if (raw.slice(0, 5) === 'data:' && comma >= 0) raw = raw.slice(comma + 1);
    raw = raw.replace(/\s+/g, '');
    if (!raw) throw new Error('empty_data');
    var binary = atob(raw);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function mimeFromDataUrl(data: any) {
    var raw = String(data || '');
    if (raw.slice(0, 5) !== 'data:') return '';
    var match = raw.match(/^data:([^;,]+)/i);
    return match ? String(match[1]).toLowerCase() : '';
  }

  function safeName(name: any, mime: any) {
    var s = String(name || '').replace(/\\/g, '/').split('/').pop() || '';
    s = s.replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '').slice(0, 80);
    var ext = ALLOWED[mime] || '';
    if (!s || s === '.' || s === '..') s = ext === 'pdf' ? 'document.pdf' : 'upload.' + (ext || 'bin');
    if (ext && s.toLowerCase().indexOf('.' + ext) < 0 && !(ext === 'jpg' && /\.jpe?g$/i.test(s))) {
      s = s.replace(/\.[^.]+$/, '') + '.' + ext;
    }
    return s;
  }

  function assignFileInput(spec: any) {
    var g = typeof globalThis !== 'undefined' ? globalThis : root;
    var doc = (spec && spec.document) || g.document;
    if (!doc) return { ok: false, error: 'no_document' };
    var selector = spec && spec.selector ? String(spec.selector) : '';
    if (!selector) return { ok: false, error: 'selector_required' };
    var el = findFileInput(selector, doc);
    if (!el) return { ok: false, error: 'not_found', selector: selector };
    var mime = String((spec && spec.mimeType) || mimeFromDataUrl(spec && spec.data) || '').toLowerCase();
    if (mime === 'image/jpg') mime = 'image/jpeg';
    if (!ALLOWED[mime]) return { ok: false, error: 'mime_not_allowed', mimeType: mime, selector: selector };
    var filename = safeName(spec && spec.filename, mime);
    var accept = (el.accept || (el.getAttribute && el.getAttribute('accept'))) || '';
    if (!matchesAccept(accept, mime, filename)) {
      return { ok: false, error: 'accept_mismatch', selector: selector, accept: String(accept).slice(0, 80), mimeType: mime };
    }
    if (typeof File !== 'function' || typeof DataTransfer !== 'function') {
      return { ok: false, error: 'file_api_unavailable', selector: selector };
    }
    var bytes;
    try {
      bytes = decodeBase64(spec && spec.data);
    } catch (e0) {
      return { ok: false, error: 'bad_data', selector: selector };
    }
    if (!bytes || !bytes.length) return { ok: false, error: 'empty_data', selector: selector };
    var file;
    try {
      file = new File([bytes], filename, { type: mime, lastModified: Date.now() });
    } catch (e1) {
      return { ok: false, error: 'file_create_failed', selector: selector };
    }
    try {
      var dt = new DataTransfer();
      dt.items.add(file);
      el.files = dt.files;
    } catch (e2) {
      return { ok: false, error: 'assign_failed', selector: selector };
    }
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e3) {
      try { el.dispatchEvent({ type: 'change', bubbles: true }); } catch (e4) { /* assigned anyway */ }
    }
    var count = (el.files && el.files.length) || 1;
    return {
      ok: true,
      selector: selector,
      fileName: filename,
      fileSize: file.size,
      mimeType: mime,
      fileCount: count,
    };
  }

  root.CcUploadFile = {
    assignFileInput: assignFileInput,
    findFileInput: findFileInput,
    matchesAccept: matchesAccept,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = (globalThis as any).CcUploadFile;
