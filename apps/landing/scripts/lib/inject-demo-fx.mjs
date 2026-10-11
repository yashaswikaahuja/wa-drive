/**
 * Inject DemoFx (visible cursor / ripple / highlight) into a Playwright page.
 * Uses a Playwright-serialized function so Chrome-extension CSP cannot block it.
 */

function installDemoFxInPage() {
  if (window.DemoFx) return;
  const STYLE_ID = "cc-demo-fx-style";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
#cc-cursor {
  position: fixed; left: 0; top: 0; width: 22px; height: 22px;
  pointer-events: none; z-index: 2147483647; transform: translate(-2px, -2px);
  transition: none; will-change: transform;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,.35));
}
#cc-cursor svg { display: block; width: 22px; height: 22px; }
#cc-cursor-ripple {
  position: fixed; width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid rgba(249,115,22,.85); pointer-events: none; z-index: 2147483646;
  opacity: 0; transform: translate(-50%, -50%) scale(.4);
}
#cc-cursor-ripple.on { animation: cc-ripple .45s ease-out forwards; }
@keyframes cc-ripple {
  0% { opacity: .9; transform: translate(-50%, -50%) scale(.35); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(2.4); }
}
.cc-fx-highlight {
  outline: 2px solid rgba(249,115,22,.7) !important;
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(249,115,22,.18) !important;
  transition: outline .15s, box-shadow .15s;
}
html.cc-fx-hide-cursor, html.cc-fx-hide-cursor * { cursor: none !important; }
`;
    document.documentElement.appendChild(style);
  }
  document.documentElement.classList.add("cc-fx-hide-cursor");

  let cursor = document.getElementById("cc-cursor");
  let ripple = document.getElementById("cc-cursor-ripple");
  if (!cursor) {
    cursor = document.createElement("div");
    cursor.id = "cc-cursor";
    cursor.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 2.5L19.5 11.2L11.8 13.1L8.9 21.5L4 2.5Z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>
    </svg>`;
    document.documentElement.appendChild(cursor);
  }
  if (!ripple) {
    ripple = document.createElement("div");
    ripple.id = "cc-cursor-ripple";
    document.documentElement.appendChild(ripple);
  }

  let x = 40;
  let y = 40;
  cursor.style.transform = `translate(${x}px, ${y}px)`;

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function resolvePoint(elOrXY) {
    if (Array.isArray(elOrXY)) return { x: elOrXY[0], y: elOrXY[1] };
    if (elOrXY && typeof elOrXY === "object" && "x" in elOrXY && "y" in elOrXY) {
      return { x: elOrXY.x, y: elOrXY.y };
    }
    const el = typeof elOrXY === "string" ? document.querySelector(elOrXY) : elOrXY;
    if (!el || !el.getBoundingClientRect) return { x, y };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  async function moveTo(elOrXY, ms) {
    const target = resolvePoint(elOrXY);
    const sx = x;
    const sy = y;
    const dx = target.x - sx;
    const dy = target.y - sy;
    const dur = Math.max(1, ms || 500);
    const t0 = performance.now();
    await new Promise((resolve) => {
      function frame(now) {
        const t = Math.min(1, (now - t0) / dur);
        const e = easeInOutCubic(t);
        x = sx + dx * e;
        y = sy + dy * e;
        cursor.style.transform = `translate(${x}px, ${y}px)`;
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  async function click(el) {
    if (el) {
      const point = resolvePoint(el);
      x = point.x;
      y = point.y;
      cursor.style.transform = `translate(${x}px, ${y}px)`;
    }
    ripple.style.left = `${x + 4}px`;
    ripple.style.top = `${y + 4}px`;
    ripple.classList.remove("on");
    void ripple.offsetWidth;
    ripple.classList.add("on");
    cursor.style.transform = `translate(${x}px, ${y}px) scale(.92)`;
    await sleep(90);
    cursor.style.transform = `translate(${x}px, ${y}px) scale(1)`;
    await sleep(160);
  }

  async function highlight(el, ms) {
    const node = typeof el === "string" ? document.querySelector(el) : el;
    if (!node) return sleep(ms || 400);
    node.classList.add("cc-fx-highlight");
    await sleep(ms || 400);
    node.classList.remove("cc-fx-highlight");
  }

  async function typeInto(el, text, cps) {
    const node = typeof el === "string" ? document.querySelector(el) : el;
    if (!node) return;
    const delay = Math.max(18, Math.round(1000 / (cps || 28)));
    if ("value" in node) node.value = "";
    else node.textContent = "";
    node.classList.add("filling");
    for (let i = 0; i < text.length; i++) {
      if ("value" in node) node.value += text[i];
      else node.textContent += text[i];
      await sleep(delay);
    }
    node.classList.remove("filling");
    node.classList.add("filled");
  }

  window.DemoFx = { moveTo, click, highlight, typeInto, sleep, cursor };
}

/** Inject DemoFx into the current document (call after navigation). */
export async function injectDemoFx(page) {
  await page.evaluate(installDemoFxInPage);
  await page.waitForFunction(() => !!window.DemoFx, null, { timeout: 8000 });
}

/** Smooth-move DemoFx cursor to a locator, ripple, then real click. */
export async function fxClick(page, locator, moveMs = 650) {
  const el = typeof locator === "string" ? page.locator(locator).first() : locator;
  await el.waitFor({ state: "visible", timeout: 20000 });
  const handle = await el.elementHandle();
  if (!handle) throw new Error("fxClick: missing element");
  await handle.evaluate((node) => {
    window.__ccFxTarget = node;
  });
  await page.evaluate(async (ms) => {
    const fx = window.DemoFx;
    const target = window.__ccFxTarget;
    if (!fx || !target) throw new Error("DemoFx not ready");
    await fx.moveTo(target, ms);
    await fx.highlight(target, 220);
    await fx.click(target);
  }, moveMs);
  await el.click({ force: true });
}

/** Move cursor to locator without clicking. */
export async function fxMove(page, locator, moveMs = 550) {
  const el = typeof locator === "string" ? page.locator(locator).first() : locator;
  await el.waitFor({ state: "visible", timeout: 20000 });
  const handle = await el.elementHandle();
  if (!handle) return;
  await handle.evaluate((node) => {
    window.__ccFxTarget = node;
  });
  await page.evaluate(async (ms) => {
    const fx = window.DemoFx;
    const target = window.__ccFxTarget;
    if (!fx || !target) return;
    await fx.moveTo(target, ms);
    await fx.highlight(target, 180);
  }, moveMs);
}

/**
 * On the form page: as fields gain values, glide cursor + highlight them.
 */
export async function animateFieldsFilling(page, fieldIds, { minFilled = 5, timeoutMs = 90000 } = {}) {
  return page.evaluate(
    async ({ fieldIds, minFilled, timeoutMs }) => {
      const fx = window.DemoFx;
      const start = Date.now();
      const seen = new Set();
      while (Date.now() - start < timeoutMs && seen.size < fieldIds.length) {
        for (const id of fieldIds) {
          if (seen.has(id)) continue;
          const el = document.getElementById(id);
          const v = (el && ("value" in el ? el.value : el.textContent)) || "";
          if (String(v).trim()) {
            seen.add(id);
            if (fx && el) {
              el.classList.add("cc-fx-highlight");
              await fx.moveTo(el, 260);
              await fx.sleep(140);
              el.classList.remove("cc-fx-highlight");
            }
          }
        }
        if (seen.size >= Math.min(fieldIds.length, Math.max(minFilled, 5))) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      return [...seen];
    },
    { fieldIds, minFilled, timeoutMs },
  );
}
