/* cyber-open-bridge: icon toolbar buttons + file switch without toolbar-scroll false positives */
(async function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ORIGIN = window.location.origin;

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
    btn.className = "cyberIconBtn";
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.innerHTML = iconSvg(ICONS[iconKey]);
    btn.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "width:32px",
      "height:32px",
      "min-width:32px",
      "padding:0",
      "margin:0 2px",
      "color:#f0f0f0",
      "background:rgba(255,255,255,0.12)",
      "border:1px solid rgba(255,255,255,0.3)",
      "border-radius:6px",
      "cursor:pointer",
      "flex-shrink:0",
    ].join(";");
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
    if (e.data.type !== "cyber-open-pdf") return;
    try {
      const app = await appReady();
      if (!app) throw new Error("PDFViewerApplication not ready");
      injectToolbarButtons();
      bindFileSwitchKeys();
      bindEdgeSwipe();
      await app.open({ data: e.data.data });
      injectToolbarButtons();
    } catch (err) {
      console.error("cyber-open-pdf failed", err);
      post("cyber-pdf-error", { message: String(err) });
    }
  });

  try {
    await appReady();
    injectToolbarButtons();
    bindFileSwitchKeys();
    bindEdgeSwipe();
    notifyReady();
  } catch {}
})();
