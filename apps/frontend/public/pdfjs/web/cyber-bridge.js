/* cyber-open-bridge: icon toolbar buttons + file switch without toolbar-scroll false positives */
(async function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ORIGIN = window.location.origin;
  const editorMode = new URLSearchParams(window.location.search).get("cyber") === "editor";

  const EDITOR_MODES = { none: 0, text: 3, highlight: 9, image: 13, draw: 15 };

  // Follow the Hub theme (html[data-theme]) instead of the OS setting, so the
  // viewer toolbar is dark when the app is dark. Same origin, so read the parent.
  function syncTheme() {
    let theme = "light";
    try {
      theme = window.parent.document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    } catch {
      return;
    }
    const root = document.documentElement;
    root.style.colorScheme = theme;
    // viewer.css fallback toggle: "initial" = light, empty = dark.
    root.style.setProperty("--csstools-color-scheme--light", theme === "dark" ? " " : "initial");
    root.dataset.cyberTheme = theme;
  }
  syncTheme();
  try {
    new MutationObserver(syncTheme).observe(window.parent.document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  } catch {
    /* not embedded */
  }

  function armChrome() {
    if (editorMode) {
      armEditor();
      return;
    }
    injectToolbarButtons();
    bindFileSwitchKeys();
    bindEdgeSwipe();
  }

  // Café print owns save/print. PDF.js must not download when this frame is replaced.
  function patchClose(app) {
    if (!app || app.__cyberClosePatched) return;
    const orig = app.close.bind(app);
    app.close = async function () {
      app._annotationStorageModified = false;
      return orig();
    };
    app.__cyberClosePatched = true;
  }

  function revealEditorButtons() {
    ["editorHighlightButton", "editorFreeTextButton", "editorInkButton", "editorStampButton"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = false;
    });
  }

  function injectDriveStamp() {
    const menu = document.querySelector("#editorStampParamsToolbar .menuContainer");
    if (!menu || document.getElementById("cyberStampFromFiles")) return;
    const btn = document.createElement("button");
    btn.id = "cyberStampFromFiles";
    btn.type = "button";
    btn.className = "toolbarButton labeled";
    btn.title = "From File Manager";
    const span = document.createElement("span");
    span.className = "editorParamsLabel";
    span.textContent = "From File Manager";
    btn.append(span);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      post("cyber-pick-drive-image");
    });
    menu.append(btn);
  }

  function armEditor() {
    document.documentElement.classList.add("cyber-editor");
    injectDriveStamp();
    const app = globalThis.PDFViewerApplication;
    if (app) patchClose(app);
    if (app?.pdfViewer && app.pdfViewer.annotationEditorMode !== -1) revealEditorButtons();
    keepSidebarClosed(app);
    bindTextClickCommit(app);
  }

  // pdf.js 5: clicking blank page while a text box is in edit mode leaves the
  // next new box only "selected", so typed letters are dropped until Space.
  // Commit the open box and clear selection first, so the click starts typing.
  function bindTextClickCommit(app) {
    if (window.__cyberTextClickBound) return;
    window.__cyberTextClickBound = true;
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (e.button !== 0 || !e.target?.classList?.contains("annotationEditorLayer")) return;
        const um = (app || globalThis.PDFViewerApplication)?.pdfViewer?._layerProperties?.annotationEditorUIManager;
        if (!um) return;
        try {
          const act = um.getActive?.();
          if (act && act.editorType === "freetext" && act.isInEditMode?.()) act.commitOrRemove();
          um.unselectAll?.();
        } catch {
          /* pdf.js internals changed: fall back to default behaviour */
        }
      },
      true,
    );
  }

  // The editor is one page the operator prints. Thumbnails only cover it,
  // and pdf.js reopens them from saved view history, so close on every load.
  function keepSidebarClosed(app) {
    try {
      globalThis.PDFViewerApplicationOptions?.set("sidebarViewOnLoad", 0);
    } catch {
      /* older build */
    }
    if (!app || app.__cyberSidebarClosed) return;
    app.__cyberSidebarClosed = true;
    const close = () => setTimeout(() => app.pdfSidebar?.close?.(), 0);
    close();
    app.eventBus?.on?.("pagesinit", close);
    app.eventBus?.on?.("pagesloaded", close);
  }

  function asImageFile(raw) {
    if (raw instanceof File) return raw;
    if (raw instanceof Blob) {
      return new File([raw], "image.jpg", { type: raw.type || "image/jpeg" });
    }
    return null;
  }

  async function editorApp() {
    const app = await appReady();
    if (!app?.pdfViewer) return null;
    for (let i = 0; i < 80; i++) {
      const ui = app.pdfViewer._layerProperties?.annotationEditorUIManager;
      if (ui && app.pdfViewer.annotationEditorMode !== -1) return app;
      await sleep(50);
    }
    return app;
  }

  async function setEditorMode(name) {
    const mode = EDITOR_MODES[name] ?? 0;
    const app = await editorApp();
    const viewer = app?.pdfViewer;
    if (!viewer || viewer.annotationEditorMode === -1) throw new Error("PDF editor is not ready");
    if (viewer.annotationEditorMode !== mode) viewer.annotationEditorMode = { mode };
    revealEditorButtons();
    if (name === "image") {
      for (let i = 0; i < 30 && viewer.annotationEditorMode !== EDITOR_MODES.image; i++) await sleep(40);
      document.getElementById("editorStampAddImage")?.click();
    }
  }

  function newestStamp(layer, ui) {
    const nodes = layer.div?.querySelectorAll(".stampEditor");
    const el = nodes && nodes.length ? nodes[nodes.length - 1] : null;
    if (!el || !ui?.getEditor) return null;
    return ui.getEditor(el.id);
  }

  async function layoutStamp(editor, place) {
    const w = Math.min(0.98, Math.max(0.05, Number(place.w) || 0.5));
    const h = Math.min(0.98, Math.max(0.05, Number(place.h) || 0.5));
    let x = Math.min(0.95, Math.max(0, Number(place.x) || 0));
    let y = Math.min(0.95, Math.max(0, Number(place.y) || 0));
    if (x + w > 1) x = Math.max(0, 1 - w);
    if (y + h > 1) y = Math.max(0, 1 - h);
    const apply = () => {
      if (editor._initialOptions) editor._initialOptions.isCentered = false;
      editor.width = w;
      editor.height = h;
      editor.x = x;
      editor.y = y;
      if (!editor.div) return false;
      const canvas = editor.div.querySelector("canvas");
      if (!canvas) return false;
      const [parentWidth, parentHeight] = editor.parentDimensions;
      editor.setDims(parentWidth * w, parentHeight * h);
      editor.fixAndSetPosition();
      return true;
    };
    // Size must be set before the bitmap finishes, and again after the canvas exists.
    apply();
    for (let i = 0; i < 50; i++) {
      if (apply()) return;
      await sleep(40);
    }
    throw new Error("Image did not appear");
  }

  async function placeImageFile(raw, place) {
    const file = asImageFile(raw);
    if (!file) throw new Error("No image");
    if (file.type && !file.type.startsWith("image/")) throw new Error("Choose a photo (JPG or PNG)");
    const app = await editorApp();
    const viewer = app?.pdfViewer;
    if (!viewer) throw new Error("PDF editor is not ready");
    const pageNumber = Number(place?.page) || 0;
    if (pageNumber) app.page = pageNumber;
    let layer = null;
    let ui = null;
    for (let i = 0; i < 80; i++) {
      ui = viewer._layerProperties?.annotationEditorUIManager;
      const page = (pageNumber || viewer.currentPageNumber || 1) - 1;
      layer = ui?.getLayer(page) || (!pageNumber ? ui?.currentLayer : null) || null;
      if (layer?.pasteEditor && viewer.annotationEditorMode !== -1) break;
      layer = null;
      await sleep(50);
    }
    if (!layer) throw new Error("Page is not ready for an image");
    ui.setPreference("enableNewAltTextWhenAddingImage", false);
    await layer.pasteEditor(
      { mode: EDITOR_MODES.image },
      { bitmapFile: file, isCentered: !place },
    );
    revealEditorButtons();
    if (place && Number.isFinite(Number(place.w)) && Number.isFinite(Number(place.h))) {
      const editor = newestStamp(layer, ui);
      if (!editor) throw new Error("Image was not added");
      await layoutStamp(editor, place);
      // Back to Select after the stamp exists, so the next click shows resize handles.
      try {
        viewer.annotationEditorMode = { mode: EDITOR_MODES.none };
      } catch {}
      for (let i = 0; i < 40 && ui.getMode() !== EDITOR_MODES.none; i++) await sleep(25);
      if (editor.div) editor.div.dataset.cyberPlaced = "1";
    }
  }

  async function exportPdf(id) {
    const app = await appReady();
    const doc = app?.pdfDocument;
    if (!doc) throw new Error("PDF is not open");
    const data = await doc.saveDocument();
    const copy = new Uint8Array(data);
    parent.postMessage({ type: "cyber-pdf-bytes", id, data: copy.buffer }, ORIGIN, [copy.buffer]);
  }

  async function appReady() {
    for (let i = 0; i < 200; i++) {
      const app = globalThis.PDFViewerApplication;
      if (app?.initializedPromise) {
        await app.initializedPromise;
        return app;
      }
      await sleep(50);
    }
    return null;
  }

  function post(type, extra) {
    try {
      parent.postMessage({ type, ...(extra || {}) }, ORIGIN);
    } catch {}
  }

  function notifyReady() {
    post("cyber-pdf-ready");
  }

  function iconSvg(pathD) {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">' +
      '<path d="' + pathD + '"></path></svg>'
    );
  }

  // Simple, readable 256-viewBox icons
  const ICONS = {
    // arrow left (back)
    back: "M204 128a12 12 0 0 1-12 12H69l35 35a12 12 0 1 1-17 17l-56-56a12 12 0 0 1 0-17l56-56a12 12 0 1 1 17 17l-35 35h123a12 12 0 0 1 12 12Z",
    // caret left
    prev: "M160 40a12 12 0 0 1 0 17L95 128l65 71a12 12 0 1 1-17 17L69 136a12 12 0 0 1 0-17l74-79a12 12 0 0 1 17 0Z",
    // caret right
    next: "M96 40a12 12 0 0 1 17 0l74 79a12 12 0 0 1 0 17l-74 79a12 12 0 1 1-17-17l65-71-65-71a12 12 0 0 1 0-17Z",
    // trash
    del: "M216 56h-40v-8a24 24 0 0 0-24-24h-48a24 24 0 0 0-24 24v8H40a12 12 0 0 0 0 24h8v136a24 24 0 0 0 24 24h112a24 24 0 0 0 24-24V80h8a12 12 0 0 0 0-24ZM104 48h48v8h-48Zm88 168H64V80h128Zm-80-24a12 12 0 0 0 12-12v-64a12 12 0 0 0-24 0v64a12 12 0 0 0 12 12Zm40 0a12 12 0 0 0 12-12v-64a12 12 0 0 0-24 0v64a12 12 0 0 0 12 12Z",
  };

  function makeIconBtn(id, iconKey, title, onClick) {
    const btn = document.createElement("button");
    btn.id = id;
    btn.type = "button";
    // Same shell as Mozilla buttons — cyber-toolbar.css strips the patched look
    btn.className = "toolbarButton cyberIconBtn";
    btn.tabIndex = 0;
    btn.title = title;
    btn.setAttribute("aria-label", title);
    // Empty span keeps PDF.js a11y pattern; SVG is the visible icon
    btn.innerHTML = "<span></span>" + iconSvg(ICONS[iconKey]);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  function scrollToolbarToStart() {
    const bar = document.getElementById("toolbarContainer");
    if (bar) bar.scrollLeft = 0;
  }

  function injectToolbarButtons() {
    if (document.getElementById("cyberBackButton")) {
      scrollToolbarToStart();
      return;
    }

    const left = document.getElementById("toolbarViewerLeft");
    const right = document.getElementById("toolbarViewerRight");

    if (left) {
      const back = makeIconBtn("cyberBackButton", "back", "Back to File Manager", () =>
        post("cyber-pdf-back"),
      );
      const prev = makeIconBtn("cyberPrevFileButton", "prev", "Previous file", () =>
        post("cyber-pdf-prev-file"),
      );
      const next = makeIconBtn("cyberNextFileButton", "next", "Next file", () =>
        post("cyber-pdf-next-file"),
      );
      left.insertBefore(next, left.firstChild);
      left.insertBefore(prev, left.firstChild);
      left.insertBefore(back, left.firstChild);
    }

    if (right) {
      const del = makeIconBtn("cyberDeleteButton", "del", "Delete this file", () =>
        post("cyber-pdf-delete"),
      );
      const download = document.getElementById("downloadButton");
      if (download?.parentElement) {
        download.parentElement.insertBefore(del, download);
      } else {
        right.appendChild(del);
      }
    }

    requestAnimationFrame(scrollToolbarToStart);
  }

  function bindFileSwitchKeys() {
    if (window.__cyberKeysBound) return;
    window.__cyberKeysBound = true;
    window.addEventListener(
      "keydown",
      (e) => {
        const tag = (e.target && e.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          e.stopImmediatePropagation();
          post("cyber-pdf-prev-file");
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          e.stopImmediatePropagation();
          post("cyber-pdf-next-file");
        } else if (e.key === "Escape") {
          e.preventDefault();
          post("cyber-pdf-back");
        }
      },
      true,
    );
  }

  function isInToolbar(target) {
    if (!target || !target.closest) return false;
    return !!(
      target.closest("#toolbarContainer") ||
      target.closest(".toolbar") ||
      target.closest("#secondaryToolbar") ||
      target.closest("#findbar")
    );
  }

  /**
   * Edge swipe for file switch — IGNORE anything that starts on the toolbar
   * so horizontal toolbar scroll never changes files.
   */
  function bindEdgeSwipe() {
    if (window.__cyberSwipeBound) return;
    window.__cyberSwipeBound = true;

    let startX = null;
    let startY = null;
    let edge = null;
    let armed = false;
    const EDGE = 56;

    document.addEventListener(
      "touchstart",
      (e) => {
        armed = false;
        startX = null;
        edge = null;
        if (e.touches.length !== 1) return;
        // Critical: toolbar scroll must not switch files
        if (isInToolbar(e.target)) return;

        const x = e.touches[0].clientX;
        const y = e.touches[0].clientY;
        const w = window.innerWidth;
        if (x <= EDGE) edge = "left";
        else if (x >= w - EDGE) edge = "right";
        else return;

        startX = x;
        startY = y;
        armed = true;
      },
      { passive: true, capture: true },
    );

    document.addEventListener(
      "touchend",
      (e) => {
        if (!armed || edge == null || startX == null || e.changedTouches.length === 0) {
          armed = false;
          startX = null;
          edge = null;
          return;
        }
        // If finger ended on toolbar, ignore
        if (isInToolbar(e.target)) {
          armed = false;
          startX = null;
          edge = null;
          return;
        }

        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        const which = edge;
        armed = false;
        startX = null;
        edge = null;

        if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
        if (which === "left" && dx > 0) post("cyber-pdf-prev-file");
        else if (which === "right" && dx < 0) post("cyber-pdf-next-file");
        else if (dx < 0) post("cyber-pdf-next-file");
        else post("cyber-pdf-prev-file");
      },
      { passive: true, capture: true },
    );
  }

  window.addEventListener("message", async (e) => {
    if (e.origin !== ORIGIN) return;
    if (!e.data) return;
    if (e.data.type === "cyber-ping") {
      notifyReady();
      return;
    }
    if (e.data.type === "cyber-go-page") {
      try {
        const app = await appReady();
        const n = Number(e.data.page) || 1;
        if (app) app.page = n;
      } catch {}
      return;
    }
    if (e.data.type === "cyber-current-page") {
      try {
        const app = await appReady();
        const page = Number(app?.pdfViewer?.currentPageNumber || app?.page || 1);
        parent.postMessage({ type: "cyber-page-number", id: e.data.id, page }, ORIGIN);
      } catch (err) {
        parent.postMessage(
          { type: "cyber-page-number-error", id: e.data.id, message: String(err.message || err) },
          ORIGIN,
        );
      }
      return;
    }
    if (e.data.type === "cyber-editor-mode") {
      try {
        await setEditorMode(e.data.mode);
      } catch (err) {
        post("cyber-pdf-error", { message: String(err.message || err) });
      }
      return;
    }
    if (e.data.type === "cyber-stamp-file") {
      try {
        await placeImageFile(e.data.file, e.data.place || null);
        post("cyber-stamp-placed", e.data.id ? { id: e.data.id } : undefined);
      } catch (err) {
        const message = String(err.message || err);
        if (e.data.id) parent.postMessage({ type: "cyber-stamp-error", id: e.data.id, message }, ORIGIN);
        else post("cyber-pdf-error", { message });
      }
      return;
    }
    if (e.data.type === "cyber-export-pdf") {
      try {
        await exportPdf(e.data.id);
      } catch (err) {
        parent.postMessage(
          { type: "cyber-pdf-export-error", id: e.data.id, message: String(err.message || err) },
          ORIGIN,
        );
      }
      return;
    }
    if (e.data.type !== "cyber-open-pdf") return;
    try {
      const app = await appReady();
      if (!app) throw new Error("PDFViewerApplication not ready");
      patchClose(app);
      armChrome();
      await app.open({ data: e.data.data });
      armChrome();
      // Editor buttons start disabled in the HTML and flip on after the first page draws.
      for (let i = 0; i < 40; i++) {
        if (app.pdfViewer?.annotationEditorMode !== -1) {
          revealEditorButtons();
          break;
        }
        await sleep(50);
      }
      // Editor: the page is the work surface, so thumbnails stay closed
      // (they covered half the page on phones). The pdf.js sidebar button
      // still opens them for multi-page jobs.
      try {
        if (editorMode) app.pdfSidebar?.close?.();
        else app.pdfSidebar?.switchView(1, true);
      } catch {}
      post("cyber-pdf-opened");
    } catch (err) {
      console.error("cyber-open-pdf failed", err);
      post("cyber-pdf-error", { message: String(err) });
    }
  });

  try {
    await appReady();
    armChrome();
    notifyReady();
  } catch {}
})();
