/* cyber-open-bridge: open PDF via postMessage + inject Back/Delete into Mozilla toolbar */
(async function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  function notifyReady() {
    try {
      parent.postMessage({ type: "cyber-pdf-ready" }, window.location.origin);
    } catch {}
  }

  function injectToolbarButtons() {
    if (document.getElementById("cyberBackButton")) return;

    const left = document.getElementById("toolbarViewerLeft");
    const right = document.getElementById("toolbarViewerRight");

    if (left) {
      const back = document.createElement("button");
      back.id = "cyberBackButton";
      back.type = "button";
      back.className = "toolbarButton";
      back.title = "Back to File Manager";
      back.setAttribute("aria-label", "Back to File Manager");
      back.innerHTML = "<span>← Back</span>";
      back.style.minWidth = "auto";
      back.style.padding = "0 8px";
      back.style.fontWeight = "600";
      back.addEventListener("click", () => {
        try {
          parent.postMessage({ type: "cyber-pdf-back" }, window.location.origin);
        } catch {}
      });
      left.insertBefore(back, left.firstChild);
    }

    if (right) {
      const del = document.createElement("button");
      del.id = "cyberDeleteButton";
      del.type = "button";
      del.className = "toolbarButton";
      del.title = "Delete this file";
      del.setAttribute("aria-label", "Delete this file");
      del.innerHTML = "<span>Delete</span>";
      del.style.minWidth = "auto";
      del.style.padding = "0 8px";
      del.addEventListener("click", () => {
        try {
          parent.postMessage({ type: "cyber-pdf-delete" }, window.location.origin);
        } catch {}
      });
      // Prefer before download / secondary tools
      const download = document.getElementById("downloadButton");
      if (download && download.parentElement) {
        download.parentElement.insertBefore(del, download);
      } else {
        right.appendChild(del);
      }
    }
  }

  window.addEventListener("message", async (e) => {
    if (e.origin !== window.location.origin) return;
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
      await app.open({ data: e.data.data });
      injectToolbarButtons();
    } catch (err) {
      console.error("cyber-open-pdf failed", err);
      try {
        parent.postMessage(
          { type: "cyber-pdf-error", message: String(err) },
          window.location.origin,
        );
      } catch {}
    }
  });

  try {
    await appReady();
    injectToolbarButtons();
    notifyReady();
  } catch {}
})();
