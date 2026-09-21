/* cyber-open-bridge */
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
    try { parent.postMessage({ type: "cyber-pdf-ready" }, window.location.origin); } catch {}
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
      await app.open({ data: e.data.data });
    } catch (err) {
      console.error("cyber-open-pdf failed", err);
      try { parent.postMessage({ type: "cyber-pdf-error", message: String(err) }, window.location.origin); } catch {}
    }
  });
  try {
    await appReady();
    notifyReady();
  } catch {}
})();
