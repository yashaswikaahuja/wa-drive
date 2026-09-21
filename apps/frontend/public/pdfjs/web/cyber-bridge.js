/* cyber-open-bridge: open PDF + Back/Delete in toolbar + file switch keys/swipe */
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

  /** Text buttons — do NOT use .toolbarButton alone (icons hide span text → white square). */
  function makeTextBtn(id, label, title, onClick) {
    const btn = document.createElement("button");
    btn.id = id;
    btn.type = "button";
    // Do not use .toolbarButton — PDF.js hides label spans and draws icon masks (white square).
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
      "margin:0 4px",
      "font-size:12px",
      "font-weight:600",
      "line-height:28px",
      "color:#f0f0f0",
      "background:rgba(255,255,255,0.14)",
      "border:1px solid rgba(255,255,255,0.35)",
      "border-radius:4px",
      "cursor:pointer",
      "white-space:nowrap",
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

  /** Desktop: ← → switch FILES (not PDF pages). PDF pages use toolbar prev/next. */
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
      true, // capture before PDF.js page handlers
    );
  }

  /** Phone: horizontal swipe switches FILES. */
  function bindFileSwitchSwipe() {
    if (window.__cyberSwipeBound) return;
    window.__cyberSwipeBound = true;
    let startX = null;
    let startY = null;
    const el = document.getElementById("viewerContainer") || document.body;

    el.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length !== 1) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      },
      { passive: true },
    );

    el.addEventListener(
      "touchend",
      (e) => {
        if (startX == null || e.changedTouches.length === 0) return;
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        startX = null;
        startY = null;
        // Horizontal swipe dominant
        if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        if (dx < 0) post("cyber-pdf-next-file");
        else post("cyber-pdf-prev-file");
      },
      { passive: true },
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
      bindFileSwitchSwipe();
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
    bindFileSwitchSwipe();
    notifyReady();
  } catch {}
})();
