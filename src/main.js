import "./ui.css";
import {
  createIcons,
  ArrowUpRight,
  Bookmark,
  Heart,
  Maximize,
  Rotate3d,
  Minus,
  Plus,
  Scan,
  MousePointer2,
  Download,
  Share2,
  Gem,
  Sparkles,
  RotateCcw,
  ArrowRight,
  ArrowLeft,
  Info,
  Leaf,
  Check,
  Fingerprint,
  X,
  Trash2,
  Copy,
  ChevronDown,
  Palette,
  Crown,
  Circle,
  SlidersHorizontal,
  SquarePen,
} from "lucide";
import { RingViewer, DEFAULT_LIGHT_LEVEL } from "./ring.js";
import { createWelcome } from "./welcome.js";
import { createInspector } from "./inspector.js";
import { stoneDimensions } from "./gem-proportions.js";
import {
  defaults,
  shapes,
  sanitize,
  syncMatchingStone,
  clamp,
  ringName,
  describe,
  estimate,
  shapeSVG,
  escapeHTML as esc,
} from "./config.js";

const iconSet = {
  ArrowUpRight,
  Bookmark,
  Heart,
  Maximize,
  Rotate3d,
  Minus,
  Plus,
  Scan,
  MousePointer2,
  Download,
  Share2,
  Gem,
  Sparkles,
  RotateCcw,
  ArrowRight,
  ArrowLeft,
  Info,
  Leaf,
  Check,
  Fingerprint,
  X,
  Trash2,
  Copy,
  ChevronDown,
  Palette,
  Crown,
  Circle,
  SlidersHorizontal,
  SquarePen,
};
const icons = () =>
  createIcons({ icons: iconSet, attrs: { "stroke-width": 1.5 } });
const $ = (id) => document.getElementById(id);
const currency = (value) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
let state = { ...defaults },
  viewer,
  studioStarted = false,
  saved = [],
  toastTimer,
  lastFocus;
try {
  const parsed = JSON.parse(localStorage.getItem("aurelle-designs") || "[]");
  if (Array.isArray(parsed))
    saved = parsed
      .filter(
        (d) => d && typeof d.id === "string" && typeof d.title === "string",
      )
      .slice(0, 30)
      .map((d) => ({ ...d, state: sanitize(d.state) }));
} catch {}
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 4200);
}
function openModal(content) {
  viewer?.setActive(false);
  lastFocus = document.activeElement;
  $("modal-content").innerHTML = content;
  icons();
  if (!$("modal").open) $("modal").showModal();
}
function closeModal() {
  $("modal").close();
  lastFocus?.focus();
}
const modalHeader = (eyebrow, title, copy = "") =>
  `<p class="modal-eyebrow">${eyebrow}</p><h2 id="modal-title">${title}</h2>${copy ? `<p class="modal-copy">${copy}</p>` : ""}`;
$("close-modal").onclick = closeModal;
$("modal").addEventListener("close", () =>
  viewer?.setActive(!$("studio-screen").hidden),
);
$("modal").addEventListener("click", (event) => {
  if (event.target !== $("modal")) return;
  const box = $("modal").getBoundingClientRect();
  if (
    event.clientX < box.left ||
    event.clientX > box.right ||
    event.clientY < box.top ||
    event.clientY > box.bottom
  )
    closeModal();
});

const inspector = createInspector($("inspector"), {
  onChange: change,
  onStone: editStone,
  onHelp: showHelp,
  icons,
});
const welcome = createWelcome($("welcome-screen"), {
  onComplete: enterStudio,
  onCancel: () => enterStudio(state),
  icons,
});
function rememberSession() {
  if (studioStarted)
    try {
      sessionStorage.setItem("aurelle-session-v2", JSON.stringify(state));
      const parameters = new URLSearchParams(location.hash.slice(1));
      if (parameters.has("design")) {
        parameters.set("design", JSON.stringify(state));
        history.replaceState(null, "", `#${parameters}`);
      }
    } catch {}
}
function refresh({ panel = true, model = true } = {}) {
  syncMatchingStone(state);
  if (panel) inspector.render(state);
  else inspector.updateSummaries(state);
  $("design-name").textContent = ringName(state);
  $("design-description").textContent = describe(state);
  $("price").innerHTML = `${currency(estimate(state))}<small> USD</small>`;
  $("saved-count").textContent = saved.length;
  $("favorite").classList.toggle(
    "active",
    saved.some((d) => JSON.stringify(d.state) === JSON.stringify(state)),
  );
  const notes = [];
  if (state.timing !== "Not sure yet")
    notes.push(`Your timing: ${state.timing}`);
  if (state.shapeDeferred || state.caratDeferred)
    notes.push(
      `Preview: ${state.carat} ct ${state.shape.toLowerCase()}. ${[state.shapeDeferred ? "Shape" : "", state.caratDeferred ? "Carat size" : ""].filter(Boolean).join(" and ")} still to choose.`,
    );
  if (state.styleDeferred)
    notes.push("Starting from scratch — explore the Head and Band options.");
  $("design-preferences").innerHTML = notes
    .map((note) => `<span>${esc(note)}</span>`)
    .join("");
  $("design-preferences").hidden = !notes.length;
  if (model && viewer) viewer.update(state);
  rememberSession();
}
function change(key, value, { live = false } = {}) {
  if (key === "metal") {
    state.metal = value;
    if (value !== "Mixed") state.headMetal = state.bandMetal = value;
  } else if (key === "stoneCount") {
    if (value === 3 && state.stoneCount !== 3) {
      if (state.basket === "None") state.basket = "Basket";
      state.cathedral = "Cathedral";
    }
    state.stoneCount = value;
  } else if (key === "width")
    state.width = Number(clamp(value, 1.5, 4, 0.1).toFixed(1));
  else if (key === "size") state.size = clamp(value, 3, 13, 0.25);
  else if (key === "engraving") state.engraving = String(value).slice(0, 14);
  else state[key] = value;
  state.styleDeferred = false;
  refresh({ panel: !live });
}
function setBackdrop(mode) {
  mode = mode === "noir" ? "noir" : "studio";
  $("ring-stage").dataset.backdrop = mode;
  document
    .querySelectorAll("[data-backdrop].backdrop-btn")
    .forEach((button) => {
      const active = button.dataset.backdrop === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  if (viewer) viewer.setBackdrop(mode);
  try {
    sessionStorage.setItem("aurelle-backdrop", mode);
  } catch {}
}
document
  .querySelectorAll(".backdrop-btn")
  .forEach(
    (button) => (button.onclick = () => setBackdrop(button.dataset.backdrop)),
  );

function setLightLevel(value) {
  const numeric = Number(value);
  const level = Number.isFinite(numeric)
    ? Number(clamp(numeric, 0.2, 3, 0.05).toFixed(2))
    : DEFAULT_LIGHT_LEVEL;
  const slider = $("light-level");
  slider.value = level;
  slider.style.setProperty("--progress", `${((level - 0.2) / 2.8) * 100}%`);
  slider.setAttribute("aria-valuetext", `Light level ${level.toFixed(2)}`);
  $("light-level-value").value = level.toFixed(2);
  viewer?.setLightLevel(level);
  try {
    sessionStorage.setItem("aurelle-light-level", String(level));
    sessionStorage.setItem(
      "aurelle-light-default",
      String(DEFAULT_LIGHT_LEVEL),
    );
  } catch {}
}
$("light-level").addEventListener("input", (event) =>
  setLightLevel(event.target.value),
);
$("reset-light").onclick = () => setLightLevel(DEFAULT_LIGHT_LEVEL);

function startViewer() {
  if (viewer) {
    viewer.resize();
    return;
  }
  try {
    viewer = new RingViewer($("ring-canvas"), { idleRotate: true });
    viewer.onZoom = (zoom) => ($("zoom-level").textContent = `${zoom}%`);
    viewer.onRotationChange = syncRotationButton;
    syncRotationButton();
    viewer.onError = () => {
      if (!$("ring-canvas").querySelector(".fallback-message"))
        $("ring-canvas").insertAdjacentHTML(
          "beforeend",
          '<div class="fallback-message">The 3D preview was interrupted. Reload to restore it. Your saved designs are kept in My designs.</div>',
        );
    };
  } catch (error) {
    $("ring-canvas").innerHTML =
      '<div class="fallback-message">The options are ready. The interactive preview needs a browser with WebGL enabled. Try Chrome, Edge, or Safari.</div>';
    console.error("3D preview could not start", error);
  }
  $("preview-loading").hidden = true;
  let mode = "studio";
  try {
    mode = sessionStorage.getItem("aurelle-backdrop") || mode;
  } catch {}
  setBackdrop(mode);
  let lightLevel = DEFAULT_LIGHT_LEVEL;
  try {
    const savedLight = sessionStorage.getItem("aurelle-light-level");
    const savedDefault = Number(
      sessionStorage.getItem("aurelle-light-default"),
    );
    if (
      savedDefault === DEFAULT_LIGHT_LEVEL &&
      savedLight !== null &&
      savedLight.trim() !== ""
    )
      lightLevel = savedLight;
  } catch {}
  setLightLevel(lightLevel);
}
function enterStudio(next) {
  state = sanitize(next);
  welcome.hide();
  $("studio-screen").hidden = false;
  studioStarted = true;
  startViewer();
  viewer?.setActive(true);
  refresh();
  viewer?.setView("signature");
  setViewActive("signature");
  window.scrollTo({ top: 0, behavior: "instant" });
}
function newDesign() {
  $("toast").classList.remove("show");
  if (viewer) {
    viewer.setActive(false);
    setViewActive("signature");
  }
  $("studio-screen").hidden = true;
  welcome.open({ cancel: studioStarted });
  window.scrollTo({ top: 0, behavior: "instant" });
}

function editStone(index) {
  const shapeKey = ["shape", "secondShape", "thirdShape"][index],
    caratKey = ["carat", "secondCarat", "thirdCarat"][index];
  let shape = state[shapeKey],
    carat = state[caratKey];
  const minCarat = index === 0 ? 0.5 : 0.1;
  const title =
    index === 0
      ? "Your center stone"
      : state.stoneCount === 2
        ? "Your second stone"
        : index === 1
          ? "Your left stone"
          : "Your right stone";
  const dimensionText = () => {
    const d = stoneDimensions(shape, carat);
    return `Approx. preview size: ${d.length.toFixed(1)} × ${d.width.toFixed(1)} mm · ${d.height.toFixed(1)} mm deep`;
  };
  openModal(
    modalHeader(
      "EVERY FACET, YOUR CHOICE",
      title,
      state.stoneCount === 3 && index === 1 && !state.thirdStoneCustomized
        ? "Your side stones match by default. Changes here update both. Edit the right stone separately for an asymmetric design."
        : "Choose a shape and exact carat weight. Each stone can be designed independently.",
    ) +
      `<div class="stone-shape-grid">${shapes.map((cut) => `<button class="stone-shape ${cut === shape ? "selected" : ""}" data-edit-shape="${cut}" aria-pressed="${cut === shape}">${shapeSVG(cut)}<span>${cut}</span></button>`).join("")}</div><div class="stone-weight"><label for="stone-carat">Carat weight</label><div><input id="stone-carat" type="number" min="${minCarat}" max="5" step="0.05" value="${carat}" aria-label="Carat weight" /><span>ct</span></div></div><input id="stone-carat-range" type="range" min="${minCarat}" max="5" step="0.05" value="${carat}" aria-label="Stone carat weight slider" /><div class="range-labels"><span>${minCarat} ct</span><span>5 ct</span></div><button id="apply-stone" class="primary-btn">Apply to my ring <i data-lucide="arrow-right"></i></button>`,
  );
  const dimensions = document.createElement("p");
  dimensions.id = "stone-dimensions";
  dimensions.className = "field-note stone-dimensions";
  dimensions.setAttribute("aria-live", "polite");
  dimensions.textContent = dimensionText();
  $("apply-stone").before(dimensions);
  document.querySelectorAll("[data-edit-shape]").forEach(
    (button) =>
      (button.onclick = () => {
        shape = button.dataset.editShape;
        dimensions.textContent = dimensionText();
        document.querySelectorAll("[data-edit-shape]").forEach((b) => {
          b.classList.toggle("selected", b === button);
          b.setAttribute("aria-pressed", String(b === button));
        });
      }),
  );
  const weight = (element) => {
    if (element.value === "" || !Number.isFinite(Number(element.value))) return;
    carat = Number(clamp(element.value, minCarat, 5, 0.05).toFixed(2));
    $("stone-carat").value = $("stone-carat-range").value = carat;
    dimensions.textContent = dimensionText();
    rangeStyle($("stone-carat-range"));
  };
  $("stone-carat").onchange = (event) => weight(event.target);
  $("stone-carat-range").oninput = (event) => weight(event.target);
  rangeStyle($("stone-carat-range"));
  $("apply-stone").onclick = () => {
    weight($("stone-carat"));
    state[shapeKey] = shape;
    state[caratKey] = carat;
    if (index === 1)
      state.secondStoneCustomized =
        state.stoneCount === 3 ||
        shape !== state.shape ||
        carat !== state.carat;
    if (index === 2) state.thirdStoneCustomized = true;
    if (index === 0) state.shapeDeferred = state.caratDeferred = false;
    refresh();
    closeModal();
  };
  if (index === 1 && state.stoneCount === 2) {
    const match = document.createElement("button");
    match.id = "match-center-stone";
    match.className = "modal-secondary";
    match.textContent = "Match center stone";
    match.onclick = () => {
      state.secondStoneCustomized = false;
      refresh();
      closeModal();
      toast("The second stone now matches the center stone.");
    };
    $("modal-content").append(match);
  }
  if (state.stoneCount === 3 && index > 0) {
    const match = document.createElement("button");
    match.id = "match-side-stones";
    match.className = "modal-secondary";
    match.textContent =
      index === 1 ? "Use balanced side stones" : "Match left stone";
    match.onclick = () => {
      if (index === 1) state.secondStoneCustomized = false;
      state.thirdStoneCustomized = false;
      refresh();
      closeModal();
    };
    $("modal-content").append(match);
  }
}
function rangeStyle(element) {
  element.style.background = `linear-gradient(to right,#839272 ${((element.value - element.min) / (element.max - element.min)) * 100}%,#e2e5d8 0)`;
}
const help = {
  metal: [
    "Head & band color",
    "Choose a metal for the whole ring, or select Mixed to set the head and band separately. 14k and 18k finishes have their own tones.",
  ],
  headMetal: [
    "The head",
    "The metal around your stones: the prongs, basket, halo, or bezel.",
  ],
  bandMetal: [
    "The band",
    "Choose the metal for the ring shank and cathedral shoulders.",
  ],
  stoneCount: [
    "One, two, or three",
    "One stone creates a solitaire. Two stones create a Toi et Moi design. Three stones frame your center diamond with independently editable side stones.",
  ],
  stones: [
    "Make every stone yours",
    "Open Center, Second, Left, or Right to choose its cut and carat weight. Each stone can have a different shape and size.",
  ],
  origin: [
    "Diamond origin",
    "Natural and lab-grown diamonds share the same preview appearance. Skip leaves the origin undecided; the illustrative estimate then uses the lab-grown rate.",
  ],
  basket: [
    "The frame for your stone",
    "None uses an open prong setting. Basket adds a supporting gallery rail. Halo surrounds the stone with small diamonds. Hidden Halo tucks sparkle beneath it. Bezel wraps the stone in a continuous metal rim.",
  ],
  stoneElevation: [
    "How the pair sits",
    "Tiered gives the second stone a subtle lift. Level set aligns the centers of their tables. Both arrangements use a connected gallery and shoulders beneath the stones.",
  ],
  prongCount: [
    "How your stone is held",
    "4 Classic follows the corners or shoulders of your cut. 4 Compass places prongs north, south, east, and west. 6 Prong adds two more. Pointed cuts have support at their tips. A bezel hides the prong controls.",
  ],
  prongTips: [
    "A tiny finishing detail",
    "Claw tips taper over the stone. Petite Claw uses a finer profile. Rounded tips are soft and circular. Tab tips are flat and rectangular.",
  ],
  prongPave: [
    "A little extra light",
    "Add small diamonds along the prong arms. Rotate the ring to discover them from the side.",
  ],
  bandStyle: [
    "The band profile",
    "Round has a softly curved cross-section. Square has flatter faces and softened corners.",
  ],
  cathedral: [
    "Cathedral shoulders",
    "Raised shoulders sweep up from the band to meet the setting.",
  ],
  paveStyle: [
    "Petite French pavé",
    "Small diamonds sit between delicate shared beads along the band. Choose shoulders or full-band coverage.",
  ],
  paveCoverage: [
    "Where the sparkle goes",
    "Shoulders covers the upper band. Full band continues the pavé around the ring.",
  ],
  width: [
    "Your band width",
    "Choose between 1.5 and 4 mm. The band gets visibly wider while your diamond keeps its carat size.",
  ],
  size: [
    "Your ring size",
    "US / Canada sizes from 3 to 13 in quarter sizes. The preview changes the band diameter relative to the stone.",
  ],
  fit: [
    "The inside profile",
    "Comfort Fit has a gently curved interior. Standard Fit has a flatter inside surface. This subtle detail is easiest to see from the side.",
  ],
  engravingStyle: [
    "Your inside story",
    "Block uses upright lettering. Cursive uses flowing italic serif lettering. Your message is previewed inside the band; rotate and zoom to see it.",
  ],
  surprise: [
    "A hidden little sparkle",
    "Two small diamonds beneath the center setting, one facing each side of the ring.",
  ],
  timing: [
    "Your timeline",
    "Your preference is saved with the design. This prototype does not schedule production or guarantee delivery dates.",
  ],
};
function showHelp(key) {
  const [title, copy] = help[key] || [
    "Make it yours",
    "Explore the options in the live preview.",
  ];
  openModal(modalHeader("A LITTLE GUIDANCE", title, copy));
}

function exportDesign(design) {
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          {
            format: "aurelle-ring-v2",
            title: design.title,
            state: design.state,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `aurelle-${design.state.shape.toLowerCase()}-design.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const persist = () => {
  try {
    localStorage.setItem("aurelle-designs", JSON.stringify(saved));
    return true;
  } catch {
    return false;
  }
};
function saveDialog() {
  openModal(
    modalHeader(
      "KEEP THE POSSIBILITY",
      "Some things are worth keeping.",
      "Save in this browser, or export a portable copy.",
    ) +
      `<form id="save-form" class="save-form"><label for="save-title">Give your design a name</label><input id="save-title" class="text-field" required maxlength="65" value="${esc(ringName(state))}" /><div class="save-summary">${esc(describe(state))}<br />Timing: ${esc(state.timing)}${state.engraving ? `<br />Engraving: “${esc(state.engraving)}” · ${state.engravingStyle}` : ""}</div><button class="primary-btn" type="submit">Save this design <i data-lucide="bookmark"></i></button></form><button id="export-current" class="modal-secondary">Download a portable design file</button>`,
  );
  $("export-current").onclick = () =>
    exportDesign({
      title: $("save-title").value.trim() || ringName(state),
      state,
    });
  $("save-form").onsubmit = (event) => {
    event.preventDefault();
    const title = $("save-title").value.trim();
    if (!title) return;
    if (saved.length >= 30)
      return toast("Remove a saved design to make room for another.");
    const item = {
      id: crypto.randomUUID(),
      title,
      state: { ...state },
      created: new Date().toISOString(),
    };
    saved.unshift(item);
    if (!persist()) {
      saved.shift();
      return toast(
        "Browser storage is unavailable. Use Download a portable design file below.",
      );
    }
    refresh({ model: false });
    closeModal();
    toast("Saved to My designs. Every little detail, kept.");
  };
}
function showSaved() {
  openModal(
    modalHeader(
      "YOUR PERSONAL COLLECTION",
      "The ones you love.",
      "Your options and timing stay with every saved ring.",
    ) +
      (saved.length
        ? saved
            .map(
              (d) =>
                `<div class="saved-item"><div><h3>${esc(d.title)}</h3><p>${esc(describe(d.state))}</p><p>${esc(d.state.timing)}</p></div><button class="text-link" data-load="${esc(d.id)}">Open ↗</button><button class="icon-btn" data-export="${esc(d.id)}" aria-label="Export ${esc(d.title)}"><i data-lucide="download"></i></button><button class="icon-btn" data-delete="${esc(d.id)}" aria-label="Remove ${esc(d.title)}"><i data-lucide="trash-2"></i></button></div>`,
            )
            .join("")
        : '<div class="empty-saved"><i data-lucide="bookmark"></i><p class="modal-copy">Your favorites will feel right at home here.</p></div>') +
      '<button id="import-design" class="modal-secondary">Import a saved design file</button><input type="file" id="design-file" accept=".json,application/json" hidden />',
  );
  document.querySelectorAll("[data-load]").forEach(
    (b) =>
      (b.onclick = () => {
        const item = saved.find((d) => d.id === b.dataset.load);
        if (item) {
          closeModal();
          enterStudio(item.state);
        }
      }),
  );
  document
    .querySelectorAll("[data-export]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          exportDesign(saved.find((d) => d.id === b.dataset.export))),
    );
  document.querySelectorAll("[data-delete]").forEach(
    (b) =>
      (b.onclick = () => {
        const previous = saved;
        saved = saved.filter((d) => d.id !== b.dataset.delete);
        if (!persist()) {
          saved = previous;
          return toast("Your browser could not update this collection.");
        }
        $("saved-count").textContent = saved.length;
        showSaved();
      }),
  );
  $("import-design").onclick = () => $("design-file").click();
  $("design-file").onchange = async (event) => {
    try {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 100000) throw Error();
      const data = JSON.parse(await file.text());
      if (
        !["aurelle-ring-v1", "aurelle-ring-v2"].includes(data.format) ||
        !data.state ||
        typeof data.state !== "object"
      )
        throw Error();
      closeModal();
      enterStudio(data.state);
      toast("Your design is back in the studio.");
    } catch {
      toast("Choose a valid Aurelle design file (.json).");
    }
  };
}

function setViewActive(view) {
  document
    .querySelectorAll("[data-view]")
    .forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  syncRotationButton();
}
function syncRotationButton() {
  const enabled = Boolean(viewer?.rotationEnabled);
  const button = $("rotate");
  button.classList.toggle("active", enabled);
  button.setAttribute("aria-pressed", String(enabled));
  const label = enabled ? "Pause idle rotation" : "Enable idle rotation";
  button.setAttribute("aria-label", label);
  button.title = label;
}
document.querySelectorAll("[data-view]").forEach(
  (b) =>
    (b.onclick = () => {
      viewer?.setView(b.dataset.view);
      setViewActive(b.dataset.view);
    }),
);
$("zoom-in").onclick = () => viewer?.setZoom(1);
$("zoom-out").onclick = () => viewer?.setZoom(-1);
$("reset-view").onclick = () => {
  viewer?.setView("signature");
  setViewActive("signature");
};
$("rotate").onclick = () => {
  if (!viewer) return;
  viewer.setIdleRotation(!viewer.rotationEnabled);
};
$("reset-design").onclick = () => {
  state = { ...defaults };
  $("inspiration-prompt").value = "";
  $("prompt-feedback").hidden = true;
  refresh();
  viewer?.setView("signature");
  setViewActive("signature");
  toast("A fresh canvas. Make it yours.");
};
$("favorite").onclick = $("save-design").onclick = saveDialog;
$("download-render").onclick = () => {
  if (!viewer)
    return toast("The preview needs to load before saving an image.");
  const link = document.createElement("a");
  link.download = `Aurelle-${state.shape.toLowerCase()}-ring.png`;
  link.href = viewer.image();
  link.click();
  toast("Your ring image is ready to keep.");
};
$("share-design").onclick = async () => {
  if (location.protocol === "file:") {
    openModal(
      modalHeader(
        "SHARE YOUR VISION",
        "Every detail, ready to share.",
        "Download your design file. Anyone with this studio can import it from My designs, including all your options and timing.",
      ) +
        '<button id="share-export" class="primary-btn">Download my design <i data-lucide="download"></i></button>',
    );
    $("share-export").onclick = () =>
      exportDesign({ title: ringName(state), state });
    return;
  }
  const url = new URL(location.href);
  url.hash = new URLSearchParams({ design: JSON.stringify(state) }).toString();
  try {
    await navigator.clipboard.writeText(url.href);
    toast("Design link copied. Every detail goes with it.");
  } catch {
    openModal(
      modalHeader("SHARE YOUR VISION", "A design worth sharing.") +
        `<input class="text-field" id="share-url" readonly value="${esc(url.href)}" aria-label="Shareable design URL" />`,
    );
    $("share-url").select();
  }
};

function applyPrompt() {
  const original = $("inspiration-prompt").value,
    text = original.toLowerCase().trim(),
    applied = [];
  const set = (key, value, label) => {
    state[key] = value;
    applied.push(label || value);
  };
  for (const shape of shapes)
    if (new RegExp(`\\b${shape.toLowerCase()}\\b`).test(text)) {
      set("shape", shape, `${shape.toLowerCase()} cut`);
      state.shapeDeferred = false;
      break;
    }
  const karat = /\b14\s*k\b/.test(text) ? "14k" : "18k";
  if (/\bplatinum\b/.test(text)) {
    state.metal = state.bandMetal = state.headMetal = "Platinum";
    applied.push("platinum");
  } else if (/\b(rose|pink|white|yellow|gold)\b/.test(text)) {
    const color = /\b(rose|pink)\b/.test(text)
      ? "Rose"
      : /\bwhite\b/.test(text)
        ? "White"
        : "Yellow";
    state.metal = state.bandMetal = state.headMetal = `${karat} ${color}`;
    applied.push(`${karat} ${color.toLowerCase()} gold`);
  }
  const carat = text.match(/(\d+(?:\.\d+)?)\s*(?:carats?|cts?)\b/);
  if (carat) {
    set(
      "carat",
      Number(clamp(carat[1], 0.5, 5, 0.05).toFixed(2)),
      "stone size",
    );
    state.caratDeferred = false;
  }
  if (/\b(three[ -]?stone|trilogy)\b/.test(text)) {
    set("stoneCount", 3, "three stones");
    state.secondShape = state.thirdShape = "Round";
    state.secondStoneCustomized = state.thirdStoneCustomized = false;
    state.basket = "Basket";
    state.cathedral = "Cathedral";
  } else if (/\b(toi et moi|two[ -]?stone)\b/.test(text))
    set("stoneCount", 2, "two stones");
  else if (/\bsolitaire\b/.test(text)) {
    state.stoneCount = 1;
    state.basket = "None";
    applied.push("solitaire");
  }
  if (/\bbezel\b/.test(text)) set("basket", "Bezel", "bezel setting");
  else if (/\b(no halo|without a?\s?halo)\b/.test(text))
    set("basket", "None", "open setting");
  else if (/\bhidden halo\b/.test(text))
    set("basket", "Hidden halo", "hidden halo");
  else if (/\bhalo\b/.test(text)) set("basket", "Halo", "halo");
  else if (/\bbasket\b/.test(text)) set("basket", "Basket", "basket");
  if (/\bcathedral\b/.test(text))
    set(
      "cathedral",
      /\bno cathedral\b/.test(text) ? "None" : "Cathedral",
      "shoulder style",
    );
  if (/\b(no pav[eé]|plain band)(?![a-z])/.test(text))
    set("paveStyle", "None", "plain band");
  else if (/\b(pav[eé]|diamond band)(?![a-z])/.test(text)) {
    set("paveStyle", "Petite French", "pavé band");
    if (/\bfull\b/.test(text)) state.paveCoverage = "Full band";
  }
  if (/\b(delicate|thin|dainty|slim)\b/.test(text))
    set("width", 1.5, "delicate band");
  else if (/\b(bold|thick|wide)\b/.test(text)) set("width", 2.6, "wider band");
  if (/\bnatural\b/.test(text)) set("origin", "Natural", "natural diamonds");
  else if (/\blab[ -]?(grown)?\b/.test(text))
    set("origin", "Lab grown", "lab-grown diamonds");
  if (/\b6\s*prong/.test(text)) set("prongCount", "6 Prong", "six prongs");
  else if (/\bcompass\b/.test(text))
    set("prongCount", "4 Compass", "compass prongs");
  const engraving = original.match(
    /engrav(?:e|ing|ed)\s*(?:with\s*)?["“']([^"”']+)["”']/i,
  );
  if (engraving) set("engraving", engraving[1].slice(0, 14), "engraving");
  if (/\b(no|without a?) wedding band\b/.test(text)) state.wedding = false;
  else if (/\b(wedding band|matching band)\b/.test(text))
    set("wedding", true, "matching wedding band");
  $("prompt-feedback").hidden = false;
  $("prompt-feedback").textContent = applied.length
    ? `Applied ${applied.join(", ")}. Explore the details below.`
    : "Try a shape, metal, carat size, halo, prong count, or band style from the options below.";
  refresh();
}
$("apply-prompt").onclick = applyPrompt;
$("inspiration-prompt").onkeydown = (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") applyPrompt();
};

const actions = {
  studio: () => {
    if (studioStarted) enterStudio(state);
    else $("welcome-screen").scrollIntoView();
  },
  new: newDesign,
  inspiration: newDesign,
  customize: () =>
    document.querySelector(".design-panel").scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    }),
  saved: showSaved,
  fullscreen: () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else
      $("ring-stage")
        .requestFullscreen?.()
        .catch(() => toast("Full screen isn’t available in this browser."));
  },
  guide: () =>
    openModal(
      modalHeader(
        "A LITTLE GUIDANCE",
        "A ring with your story in it.",
        "Start with four simple questions, then make every detail yours.",
      ) +
        '<div class="guide-step"><span>01</span><div><h3>A beautiful beginning</h3><p>Choose a style and metal, stone shape and origin, carat size, and timing. You can decide on the stone later.</p></div></div><div class="guide-step"><span>02</span><div><h3>Refine every detail</h3><p>Explore Metal, Diamonds, Head, Band, and More. Edit each stone independently, try mixed metals, or discover your favorite prong and pavé details.</p></div></div><div class="guide-step"><span>03</span><div><h3>Keep what you love</h3><p>Save designs, export portable design files, or download a ring image. Existing Aurelle design files can still be imported.</p></div></div>',
    ),
  "pricing-guide": () =>
    openModal(
      modalHeader(
        "ROOM TO DREAM",
        "An estimate, for exploration.",
        "Prices are illustrative. Real inventory, jeweler quotes, and ordering are not connected.",
      ) +
        `<div class="save-summary">${esc(describe(state))}<br />${state.origin === "Skip" ? "Origin undecided; using the lab-grown rate" : esc(state.origin) + " diamonds"}<br />${state.width} mm band · US ${state.size} · ${esc(state.fit)}<br />Timing: ${esc(state.timing)}<br /><strong>Illustrative estimate: ${currency(estimate(state))}</strong></div><p class="field-note">${state.shapeDeferred || state.caratDeferred ? "Stone details are undecided. The estimate uses the stone currently shown." : "Timing is a saved preference, not a delivery promise."}</p>`,
    ),
};
document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]");
  if (action) actions[action.dataset.action]?.();
  if (event.target.closest(".brand")) {
    event.preventDefault();
    newDesign();
  }
});
window.addEventListener("hashchange", () => {
  try {
    const data = new URLSearchParams(location.hash.slice(1)).get("design");
    if (data) enterStudio(JSON.parse(data));
  } catch {
    toast("This design link could not be read.");
  }
});
icons();
$("saved-count").textContent = saved.length;
let initial;
try {
  const shared = new URLSearchParams(location.hash.slice(1)).get("design");
  initial = shared
    ? JSON.parse(shared)
    : JSON.parse(sessionStorage.getItem("aurelle-session-v2") || "null");
} catch {}
if (initial && typeof initial === "object") enterStudio(initial);
else welcome.open({ resume: true });
