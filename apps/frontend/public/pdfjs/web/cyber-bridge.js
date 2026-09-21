/* cyber-open-bridge: open PDF + toolbar Back/Delete/Prev/Next file + edge swipe */
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

  function makeTextBtn(id, label, title, onClick) {
    const btn = document.createElement("button");
    btn.id = id;
    btn.type = "button";
    btn.className = "cyberTextBtn";
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.textContent = label;
    btn.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "min-width:auto",
      "width:auto",
      "height:28px",
      "padding:0 10px",
      "margin:0 3px",
      "font-size:12px",
      "font-weight:600",
      "line-height:28px",
      "color:#f0f0f0",
      "background:rgba(255,255,255,0.14)",
      "border:1px solid rgba(255,255,255,0.35)",
      "border-radius:4px",
      "cursor:pointer",
      "white-space:nowrap",
      "z-index:5",
    ].join(";");
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  function injectToolbarButtons() {
    if (document.getElementById("cyberBackButton")) return;

    const left = document.getElementById("toolbarViewerLeft");
    const right = document.getElementById("toolbarViewerRight");

    if (left) {
      const back = makeTextBtn("cyberBackButton", "← Back", "Back to File Manager", () =>
        post("cyber-pdf-back"),
      );
      const prev = makeTextBtn("cyberPrevFileButton", "‹ Prev", "Previous file in folder", () =>
        post("cyber-pdf-prev-file"),
      );
      const next = makeTextBtn("cyberNextFileButton", "Next ›", "Next file in folder", () =>
        post("cyber-pdf-next-file"),
      );
      left.insertBefore(next, left.firstChild);
      left.insertBefore(prev, left.firstChild);
      left.insertBefore(back, left.firstChild);
    }

    if (right) {
      const del = makeTextBtn("cyberDeleteButton", "Delete", "Delete this file", () =>
        post("cyber-pdf-delete"),
      );
      const download = document.getElementById("downloadButton");
      if (download?.parentElement) {
        download.parentElement.insertBefore(del, download);
      } else {
        right.appendChild(del);
      }
    }
  }

  /** Desktop keys: ← → switch FILES (capture before PDF.js page handlers). */
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

  /**
   * Phone: edge swipe only (left/right 56px) → switch FILES.
   * Center of the page still scrolls/pans the PDF normally.
   */
  function bindEdgeSwipe() {
    if (window.__cyberSwipeBound) return;
    window.__cyberSwipeBound = true;

    let startX = null;
    let startY = null;
    let edge = null; // 'left' | 'right' | null
    const EDGE = 56;

    const onStart = (e) => {
      if (e.touches.length !== 1) return;
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      const w = window.innerWidth;
      if (x <= EDGE) edge = "left";
      else if (x >= w - EDGE) edge = "right";
      else {
        edge = null;
        startX = null;
        return;
      }
      startX = x;
      startY = y;
    };

    const onEnd = (e) => {
      if (edge == null || startX == null || e.changedTouches.length === 0) {
        startX = null;
        edge = null;
        return;
      }
      const x = e.changedTouches[0].clientX;
      const y = e.changedTouches[0].clientY;
      const dx = x - startX;
      const dy = y - startY;
      startX = null;
      const which = edge;
      edge = null;

      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
      // Swipe inward from edge, or continue in swipe direction
      if (which === "left" && dx > 0) post("cyber-pdf-prev-file");
      else if (which === "right" && dx < 0) post("cyber-pdf-next-file");
      else if (dx < 0) post("cyber-pdf-next-file");
      else post("cyber-pdf-prev-file");
    };

    // Capture on document so we get events even over canvas
    document.addEventListener("touchstart", onStart, { passive: true, capture: true });
    document.addEventListener("touchend", onEnd, { passive: true, capture: true });
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
