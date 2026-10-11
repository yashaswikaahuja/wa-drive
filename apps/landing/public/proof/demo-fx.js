/**
 * Shared cursor / click / type FX for fictional landing proof clips (#331).
 * Exposes window.DemoFx — pages set __ready after load, __done when sequence ends.
 */
(function () {
  const STYLE_ID = "cc-demo-fx-style";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
#cc-cursor {
  position: fixed; left: 0; top: 0; width: 22px; height: 22px;
  pointer-events: none; z-index: 99999; transform: translate(-2px, -2px);
  transition: none; will-change: transform;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,.35));
}
#cc-cursor svg { display: block; width: 22px; height: 22px; }
#cc-cursor-ripple {
  position: fixed; width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid rgba(249,115,22,.85); pointer-events: none; z-index: 99998;
  opacity: 0; transform: translate(-50%, -50%) scale(.4);
}
#cc-cursor-ripple.on {
  animation: cc-ripple .45s ease-out forwards;
}
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
`;
    document.head.appendChild(style);
  }

  let cursor = document.getElementById("cc-cursor");
  let ripple = document.getElementById("cc-cursor-ripple");
  if (!cursor) {
    cursor = document.createElement("div");
    cursor.id = "cc-cursor";
    cursor.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 2.5L19.5 11.2L11.8 13.1L8.9 21.5L4 2.5Z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>
    </svg>`;
    document.body.appendChild(cursor);
  }
  if (!ripple) {
    ripple = document.createElement("div");
    ripple.id = "cc-cursor-ripple";
    document.body.appendChild(ripple);
  }

  let x = 640;
  let y = 360;
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
    if (!el) return { x, y };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  async function moveTo(elOrXY, ms = 500) {
    const target = resolvePoint(elOrXY);
    const sx = x;
    const sy = y;
    const dx = target.x - sx;
    const dy = target.y - sy;
    const dur = Math.max(1, ms);
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

  async function highlight(el, ms = 400) {
    const node = typeof el === "string" ? document.querySelector(el) : el;
    if (!node) return sleep(ms);
    node.classList.add("cc-fx-highlight");
    await sleep(ms);
    node.classList.remove("cc-fx-highlight");
  }

  async function typeInto(el, text, cps = 28) {
    const node = typeof el === "string" ? document.querySelector(el) : el;
    if (!node) return;
    const delay = Math.max(18, Math.round(1000 / cps));
    node.textContent = "";
    node.classList.add("filling");
    for (let i = 0; i < text.length; i++) {
      node.textContent += text[i];
      await sleep(delay);
    }
    node.classList.remove("filling");
    node.classList.add("filled");
  }

  window.DemoFx = { moveTo, click, highlight, typeInto, sleep, cursor };
})();
