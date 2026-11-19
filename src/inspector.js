import {
  enums,
  metals,
  shapeSVG,
  escapeHTML as esc,
  metalName,
} from "./config.js";

export function createInspector(root, { onChange, onStone, onHelp, icons }) {
  let state;
  const choice = (
    key,
    label,
    values = enums[key],
    note = "",
    disabled = false,
  ) => {
    const metal = ["metal", "headMetal", "bandMetal"].includes(key);
    const buttons = values
      .map((value) => {
        const selected = state[key] === value;
        let content = esc(
          value === "Lab grown"
            ? "Lab Grown"
            : value === "Hidden halo"
              ? "Hidden Halo"
              : value,
        );
        if (metal) {
          const tone = value.includes("Yellow")
            ? "yellow"
            : value.includes("Rose")
              ? "rose"
              : value === "Mixed"
                ? "mixed"
                : value === "Platinum"
                  ? "platinum"
                  : "white";
          content = `<span class="metal-dot tone-${tone}" aria-hidden="true"></span><span>${esc(value)}</span>${selected ? '<i data-lucide="check" class="selection-check"></i>' : ""}`;
        }
        return `<button type="button" data-field="${key}" data-value="${esc(value)}" class="option-chip ${metal ? "metal-chip" : ""} ${selected ? "selected" : ""}" aria-pressed="${selected}" ${disabled ? "disabled" : ""}>${content}</button>`;
      })
      .join("");
    return `<div class="inspector-field ${disabled ? "field-disabled" : ""}"><div class="field-heading"><h4>${label}</h4><button class="help-btn" data-help="${key}" aria-label="About ${label.toLowerCase()}"><i data-lucide="info"></i></button></div>${note ? `<p class="control-note">${esc(note)}</p>` : ""}<div class="choice-grid ${metal ? "metal-grid" : ""} ${values.length === 2 ? "two" : ""}" role="group" aria-label="${label}">${buttons}</div></div>`;
  };
  const slider = (key, label, min, max, step, suffix, note = "") =>
    `<div class="inspector-field"><div class="field-heading"><h4>${label}</h4><button class="help-btn" data-help="${key}" aria-label="About ${label.toLowerCase()}"><i data-lucide="info"></i></button></div>${note ? `<p class="control-note">${note}</p>` : ""}<div class="numeric-value"><input type="number" data-number="${key}" value="${state[key]}" min="${min}" max="${max}" step="${step}" aria-label="${label}" /><span>${suffix}</span></div><input type="range" data-range="${key}" value="${state[key]}" min="${min}" max="${max}" step="${step}" aria-label="${label} slider" style="--progress:${((state[key] - min) / (max - min)) * 100}%" /><div class="range-labels"><span>${min}</span><span>${max}</span></div></div>`;
  const summaryValues = () => ({
    metal: metalName(state),
    diamonds: `${state.stoneCount} ${state.stoneCount === 1 ? "stone" : "stones"} · ${state.shapeDeferred ? "Shape to decide" : state.shape} · ${state.caratDeferred ? "Size to decide" : state.carat + " ct"}`,
    head:
      state.basket === "Bezel"
        ? "Bezel setting"
        : `${state.basket === "None" ? "Open setting" : state.basket} · ${state.prongCount}`,
    band: `${state.width.toFixed(1)} mm · ${state.bandStyle} · US ${state.size}`,
    more: state.engraving
      ? `Engraved · ${state.engravingStyle}`
      : "Engraving, hidden details & timing",
  });
  const section = (id, title, icon, contents, open) => {
    const summaries = summaryValues();
    return `<details class="inspector-section" data-section="${id}" name="ring-customization" ${open ? "open" : ""}><summary><span class="section-icon"><i data-lucide="${icon}"></i></span><span class="section-label"><strong>${title}</strong><small>${esc(summaries[id])}</small></span><i data-lucide="chevron-down" class="accordion-arrow"></i></summary><div class="section-body">${contents}</div></details>`;
  };
  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-field]");
    if (button)
      onChange(
        button.dataset.field,
        button.dataset.field === "stoneCount"
          ? Number(button.dataset.value)
          : button.dataset.value,
      );
    const stone = event.target.closest("[data-stone]");
    if (stone) onStone(Number(stone.dataset.stone));
    const help = event.target.closest("[data-help]");
    if (help) onHelp(help.dataset.help);
  });
  const handleInput = (event, isChange) => {
    const element = event.target;
    const key =
      element.dataset.range ||
      element.dataset.number ||
      (element.id === "engraving" ? "engraving" : null);
    if (
      !key ||
      (element.dataset.number && !isChange) ||
      (element.dataset.range && isChange) ||
      (key === "engraving" && isChange)
    )
      return;
    const value = key === "engraving" ? element.value : Number(element.value);
    if (
      key !== "engraving" &&
      (!Number.isFinite(value) || element.value === "")
    ) {
      if (isChange) element.value = state[key];
      return;
    }
    onChange(key, value, { live: true });
    root
      .querySelectorAll(`[data-range="${key}"],[data-number="${key}"]`)
      .forEach((input) => {
        input.value = state[key];
        if (input.type === "range")
          input.style.setProperty(
            "--progress",
            `${((state[key] - input.min) / (input.max - input.min)) * 100}%`,
          );
      });
    if (key === "engraving") {
      root.querySelector("#engraving-count").textContent =
        `${state.engraving.length} / 14`;
      root.querySelector("#engraving-preview").textContent =
        state.engraving || "Your words, held close.";
    }
  };
  root.addEventListener("input", (event) => handleInput(event, false));
  root.addEventListener("change", (event) => handleInput(event, true));
  return {
    updateSummaries(next) {
      state = next;
      const summaries = summaryValues();
      for (const [id, value] of Object.entries(summaries)) {
        const label = root.querySelector(
          `[data-section="${id}"] .section-label small`,
        );
        if (label) label.textContent = value;
      }
    },
    render(next) {
      state = next;
      const opened = root.children.length
        ? new Set(
            [...root.querySelectorAll("details[open]")].map(
              (d) => d.dataset.section,
            ),
          )
        : new Set(["metal"]);
      const active = document.activeElement;
      const focus = active?.dataset.field
        ? { field: active.dataset.field, value: active.dataset.value }
        : null;
      const stoneLabels =
        state.stoneCount === 1
          ? ["Center"]
          : state.stoneCount === 2
            ? ["Center", "Second"]
            : ["Center", "Left", "Right"];
      const stoneButtons = stoneLabels
        .map((label, i) => {
          const shape =
              state[i === 0 ? "shape" : i === 1 ? "secondShape" : "thirdShape"],
            carat =
              state[i === 0 ? "carat" : i === 1 ? "secondCarat" : "thirdCarat"];
          return `<button class="stone-edit" data-stone="${i}"><span class="stone-cut-art">${shapeSVG(shape)}</span><span class="stone-copy"><strong>${label}</strong><small>${i === 0 && state.shapeDeferred ? "Shape to decide" : shape} · ${i === 0 && state.caratDeferred ? "size to decide" : `${Number(carat.toFixed(2))} ct`}</small></span><i data-lucide="square-pen"></i></button>`;
        })
        .join("");
      root.innerHTML = [
        section(
          "metal",
          "Metal",
          "palette",
          choice("metal", "Head & band color", metals, metalName(state)) +
            (state.metal === "Mixed"
              ? choice("headMetal", "Head color") +
                choice("bandMetal", "Band color")
              : ""),
          opened.has("metal"),
        ),
        section(
          "diamonds",
          "Diamonds",
          "gem",
          `<div class="inspector-field"><div class="field-heading"><h4>Center stones</h4><button class="help-btn" data-help="stoneCount" aria-label="About center stones"><i data-lucide="info"></i></button></div><p class="control-note">${state.stoneCount === 1 ? "One stone ring (solitaire)" : state.stoneCount === 2 ? "Two stone ring (Toi et Moi)" : "Three stone ring"}</p><div class="choice-grid" role="group" aria-label="Center stones">${[1, 2, 3].map((n, i) => `<button class="option-chip ${state.stoneCount === n ? "selected" : ""}" data-field="stoneCount" data-value="${n}" aria-pressed="${state.stoneCount === n}">${`<span class="stone-count-art" aria-hidden="true">${Array.from({ length: n }, () => shapeSVG("Round")).join("")}</span>`}<span>${["One stone", "Two stones", "Three stones"][i]}</span></button>`).join("")}</div></div><div class="inspector-field"><div class="field-heading"><h4>Select your stones</h4><button class="help-btn" data-help="stones" aria-label="About stone selection"><i data-lucide="info"></i></button></div><div class="stone-edit-list">${stoneButtons}</div></div>` +
            choice(
              "origin",
              "Diamond type",
              undefined,
              state.origin === "Skip"
                ? "Choose an origin whenever you’re ready"
                : `${state.origin === "Natural" ? "Natural" : "Lab-grown"} center stones and pavé`,
            ),
          opened.has("diamonds"),
        ),
        section(
          "head",
          "Head",
          "crown",
          (state.stoneCount === 2
            ? choice(
                "stoneElevation",
                "Stone elevation",
                undefined,
                "Tiered adds a subtle height difference; Level set aligns the tables",
              )
            : "") +
            choice(
              "basket",
              "Basket & halo",
              state.stoneCount === 3
                ? enums.basket.filter((value) => value !== "None")
                : undefined,
              state.stoneCount === 3
                ? "A connected basket supports the three-stone arrangement"
                : "",
            ) +
            choice(
              "prongCount",
              "Prong count",
              undefined,
              state.basket === "Bezel"
                ? "A bezel holds the stone without visible prongs"
                : "Placement follows the cut, including pointed ends",
              state.basket === "Bezel",
            ) +
            choice(
              "prongTips",
              "Prong tips",
              undefined,
              "",
              state.basket === "Bezel",
            ) +
            choice(
              "prongPave",
              "Prong pavé",
              undefined,
              "Diamonds along the prong arms",
              state.basket === "Bezel",
            ),
          opened.has("head"),
        ),
        section(
          "band",
          "Band",
          "circle",
          choice("bandStyle", "Style") +
            choice(
              "cathedral",
              "Cathedral",
              undefined,
              "Raised shoulders that meet the setting",
            ) +
            choice("paveStyle", "Pavé style") +
            (state.paveStyle !== "None"
              ? choice("paveCoverage", "Pavé coverage")
              : "") +
            slider("width", "Band width", 1.5, 4, 0.1, "mm") +
            slider(
              "size",
              "Ring size (US)",
              3,
              13,
              0.25,
              "US",
              "US / Canada standard sizing",
            ) +
            choice("fit", "Fit"),
          opened.has("band"),
        ),
        section(
          "more",
          "More",
          "sliders-horizontal",
          `<div class="inspector-field"><div class="field-heading"><h4>Add engraving</h4></div><p class="control-note">A personal message, up to 14 characters</p><input id="engraving" class="text-field" maxlength="14" value="${esc(state.engraving)}" placeholder="Your engraving" aria-label="Inside band engraving" /><div class="range-labels"><span>Inside the band</span><span id="engraving-count">${state.engraving.length} / 14</span></div></div>` +
            choice("engravingStyle", "Engraving style") +
            `<div class="engraving-preview ${state.engravingStyle === "Cursive" ? "cursive" : "block"}"><span>YOUR INSIDE STORY</span><em id="engraving-preview">${esc(state.engraving || "Your words, held close.")}</em></div>` +
            choice(
              "surprise",
              "Surprise stones",
              undefined,
              "A little sparkle tucked under the center stone",
            ) +
            choice(
              "timing",
              "When do you need it?",
              undefined,
              "A saved preference, not a delivery promise",
            ) +
            `<label class="matching-band"><span>Add a matching wedding band</span><input type="checkbox" id="wedding-band" ${state.wedding ? "checked" : ""} /></label>`,
          opened.has("more"),
        ),
      ].join("");
      root.querySelector("#wedding-band").onchange = (event) =>
        onChange("wedding", event.target.checked);
      icons();
      if (focus)
        [...root.querySelectorAll("[data-field]")]
          .find(
            (b) =>
              b.dataset.field === focus.field &&
              b.dataset.value === focus.value,
          )
          ?.focus({ preventScroll: true });
    },
  };
}
