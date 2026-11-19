import {
  defaults,
  styles,
  shapes,
  shapeCopy,
  timings,
  applyStyle,
  shapeSVG,
  sanitize,
} from "./config.js";
import { RingViewer } from "./ring.js";

export function createWelcome(root, { onComplete, onCancel, icons }) {
  let step = 1,
    draft = { ...defaults },
    pickedStyle = "",
    canCancel = false,
    generation = 0;
  const cache = new Map();
  const save = () => {
    try {
      sessionStorage.setItem(
        "aurelle-welcome-v2",
        JSON.stringify({ step, draft, pickedStyle }),
      );
    } catch {}
  };
  function move(next) {
    step = next;
    save();
    render();
    window.scrollTo({ top: 0, behavior: "instant" });
    root.querySelector("h1").focus({ preventScroll: true });
  }
  root.addEventListener("click", (event) => {
    const style = event.target.closest("[data-start-style]");
    if (style) {
      pickedStyle = style.dataset.startStyle;
      draft = applyStyle(draft, pickedStyle);
      move(2);
    }
    const metal = event.target.closest("[data-start-metal]");
    if (metal) {
      draft.metal =
        draft.headMetal =
        draft.bandMetal =
          metal.dataset.startMetal;
      save();
      render();
    }
    const origin = event.target.closest("[data-start-origin]");
    if (origin) {
      draft.origin = origin.dataset.startOrigin;
      save();
      render();
    }
    const shape = event.target.closest("[data-start-shape]");
    if (shape) {
      draft.shapeDeferred = shape.dataset.startShape === "later";
      if (!draft.shapeDeferred) draft.shape = shape.dataset.startShape;
      move(3);
    }
    const carat = event.target.closest("[data-start-carat]");
    if (carat) {
      draft.caratDeferred = carat.dataset.startCarat === "later";
      if (!draft.caratDeferred) draft.carat = Number(carat.dataset.startCarat);
      move(4);
    }
    const timing = event.target.closest("[data-start-timing]");
    if (timing) {
      draft.timing = timing.dataset.startTiming;
      generation++;
      try {
        sessionStorage.removeItem("aurelle-welcome-v2");
      } catch {}
      onComplete({ ...draft });
    }
    if (event.target.closest("[data-start-back]")) move(Math.max(1, step - 1));
    if (event.target.closest("[data-start-cancel]")) {
      generation++;
      onCancel();
    }
  });
  async function thumbnails() {
    const token = ++generation,
      metal = draft.metal;
    const fill = () =>
      root.querySelectorAll("[data-preview-style]").forEach((img) => {
        const source = cache.get(`${metal}:${img.dataset.previewStyle}`);
        if (source) {
          img.src = source;
          img.hidden = false;
          img.previousElementSibling.setAttribute("hidden", "");
        }
      });
    fill();
    if (styles.every((s) => cache.has(`${metal}:${s.label}`))) return;
    await new Promise(requestAnimationFrame);
    if (token !== generation || step !== 1 || root.hidden) return;
    const host = document.createElement("div");
    host.style.cssText =
      "position:fixed;left:-9999px;top:0;width:300px;height:210px;pointer-events:none";
    document.body.append(host);
    let renderer;
    try {
      renderer = new RingViewer(host);
      renderer.renderer.setPixelRatio(1);
      renderer.resize();
      renderer.renderer.setAnimationLoop(null);
      for (const style of styles) {
        if (token !== generation || step !== 1 || root.hidden) break;
        const key = `${metal}:${style.label}`;
        if (!cache.has(key)) {
          renderer.update(
            applyStyle(
              { ...defaults, metal, headMetal: metal, bandMetal: metal },
              style.label,
            ),
          );
          cache.set(key, renderer.renderer.domElement.toDataURL("image/png"));
        }
        fill();
        await new Promise(requestAnimationFrame);
      }
    } catch {
      /* The illustrated fallback stays available without WebGL. */
    } finally {
      renderer?.dispose();
      host.remove();
    }
  }
  function render() {
    const headings = [
      "Let’s start designing your ring",
      "Choose your center stone",
      "Select your center stone size",
      "When do you need your ring?",
    ];
    const subheads = [
      "A few little choices. The beginning of something forever.",
      "The star of the show — your main diamond.",
      "You can refine the exact carat weight in the ring designer.",
      "We’ll keep your timing in mind as you explore.",
    ];
    let content = "";
    if (step === 1)
      content = `<div class="welcome-metals" role="group" aria-label="Starting metal">${[
        ["14k Yellow", "yellow"],
        ["14k White", "white"],
        ["14k Rose", "rose"],
      ]
        .map(
          ([value, color]) =>
            `<button data-start-metal="${value}" class="${draft.metal === value ? "selected" : ""}" aria-label="${color} gold" aria-pressed="${draft.metal === value}"><span class="metal-swatch ${color}-swatch"></span><span>${color[0].toUpperCase() + color.slice(1)} gold</span></button>`,
        )
        .join(
          "",
        )}</div><div class="welcome-style-grid">${styles.map((s) => `<button class="welcome-card style-card ${pickedStyle === s.label ? "selected" : ""}" data-start-style="${s.label}"><div class="style-art"><svg class="ring-illustration" viewBox="0 0 100 105" aria-hidden="true"><ellipse cx="50" cy="67" rx="25" ry="29"/><ellipse cx="50" cy="67" rx="21" ry="25"/><path d="m37 24 13-8 13 8-2 12-11 10-11-10ZM37 24h26m-21-5 8 27 8-27"/></svg><img hidden data-preview-style="${s.label}" alt="" /></div><strong>${s.label}</strong><span>${s.copy}</span></button>`).join("")}<button class="welcome-card scratch-card" data-start-style="scratch"><i data-lucide="plus"></i><strong>Start from scratch</strong><span>Find your own kind of beautiful</span></button></div>`;
    if (step === 2)
      content = `<div class="welcome-origin segmented" role="group" aria-label="Diamond origin">${["Natural", "Lab grown"].map((origin) => `<button class="${draft.origin === origin ? "selected" : ""}" data-start-origin="${origin}" aria-pressed="${draft.origin === origin}">${origin === "Lab grown" ? "Lab Grown" : origin}</button>`).join("")}</div><div class="welcome-shape-grid">${shapes.map((shape) => `<button class="welcome-card cut-card ${draft.shape === shape && !draft.shapeDeferred ? "selected" : ""}" data-start-shape="${shape}">${shapeSVG(shape)}<strong>${shape}</strong><span>${shapeCopy[shape]}</span></button>`).join("")}<button class="welcome-card later-card" data-start-shape="later">Decide later <i data-lucide="arrow-right"></i></button></div>`;
    if (step === 3)
      content = `<div class="welcome-carat-grid">${[0.5, 1, 1.5, 2, 2.5, 3, 4, 5].map((carat) => `<button class="welcome-card carat-card ${draft.carat === carat && !draft.caratDeferred ? "selected" : ""}" data-start-carat="${carat}"><span class="carat-gem" style="--gem-size:${17 + Math.cbrt(carat) * 12}px">${shapeSVG(draft.shape)}</span><strong>${carat} <small>carat</small></strong></button>`).join("")}<button class="welcome-card later-card" data-start-carat="later">Decide later <i data-lucide="arrow-right"></i></button></div>`;
    if (step === 4)
      content = `<div class="welcome-timing-grid">${timings.map((timing, i) => `<button class="welcome-card timing-card" data-start-timing="${timing}"><span class="timing-number">0${i + 1}</span><strong>${timing.replaceAll("–", " – ")}</strong><i data-lucide="arrow-right"></i></button>`).join("")}</div><p class="welcome-timing-note">This is a design preference, not a delivery promise.</p>`;
    root.innerHTML = `<div class="welcome-wrap"><div class="welcome-topline"><span class="eyebrow">A RING THAT BEGINS WITH YOU</span>${canCancel ? '<button class="text-link welcome-cancel" data-start-cancel>Back to my current ring <i data-lucide="arrow-up-right"></i></button>' : '<span class="welcome-duration">A little inspiration. Four simple steps.</span>'}</div><div class="welcome-progress" aria-label="Step ${step} of 4">${[1, 2, 3, 4].map((i) => `<span class="${i <= step ? "filled" : ""}"></span>`).join("")}</div><p class="welcome-step">STEP ${step} OF 4</p><h1 tabindex="-1">${headings[step - 1]}</h1><p class="welcome-subhead">${subheads[step - 1]}</p>${content}<div class="welcome-footer">${step > 1 ? '<button class="welcome-back" data-start-back><i data-lucide="arrow-left"></i> Back</button>' : '<span><i data-lucide="fingerprint"></i> Your story. Every detail.</span>'}<p>Every choice can be changed in the 3D designer.</p>${step > 1 ? `<span class="welcome-summary">${pickedStyle === "scratch" ? "Your design" : pickedStyle} · ${draft.metal}${step > 2 ? ` · ${draft.shapeDeferred ? "Shape later" : draft.shape}` : ""}</span>` : '<span class="welcome-summary">Select a style to continue <i data-lucide="arrow-right"></i></span>'}</div></div>`;
    icons();
    if (step === 1) thumbnails();
    else generation++;
  }
  return {
    open({ cancel = false, resume = false } = {}) {
      canCancel = cancel;
      step = 1;
      draft = { ...defaults };
      pickedStyle = "";
      if (resume)
        try {
          const stored = JSON.parse(
            sessionStorage.getItem("aurelle-welcome-v2"),
          );
          if (stored && stored.step >= 1 && stored.step <= 4) {
            step = stored.step;
            draft = sanitize(stored.draft);
            pickedStyle =
              styles.some((s) => s.label === stored.pickedStyle) ||
              stored.pickedStyle === "scratch"
                ? stored.pickedStyle
                : "";
          }
        } catch {}
      root.hidden = false;
      render();
    },
    hide() {
      generation++;
      root.hidden = true;
    },
  };
}
