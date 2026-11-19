export const shapes = [
  "Round",
  "Oval",
  "Cushion",
  "Emerald",
  "Princess",
  "Asscher",
  "Marquise",
  "Pear",
  "Radiant",
];
export const metals = [
  "14k White",
  "18k Yellow",
  "14k Rose",
  "18k White",
  "Platinum",
  "18k Rose",
  "14k Yellow",
  "Mixed",
];
export const metalColors = {
  "14k Yellow": "#e7c77f",
  "18k Yellow": "#e6bd68",
  "14k White": "#dce1e1",
  "18k White": "#d2d8d8",
  Platinum: "#c4cccd",
  "14k Rose": "#d8a18a",
  "18k Rose": "#ddb09a",
};
export const timings = [
  "1–4 weeks",
  "1–3 months",
  "3–6 months",
  "Not sure yet",
];
export const defaults = {
  metal: "14k Yellow",
  headMetal: "14k Yellow",
  bandMetal: "14k Yellow",
  stoneCount: 1,
  shape: "Round",
  carat: 1.5,
  secondShape: "Round",
  secondCarat: 1.5,
  secondStoneCustomized: false,
  thirdShape: "Round",
  thirdCarat: 0.5,
  thirdStoneCustomized: false,
  stoneElevation: "Tiered",
  origin: "Natural",
  basket: "None",
  prongCount: "4 Classic",
  prongTips: "Claw",
  prongPave: "None",
  bandStyle: "Round",
  cathedral: "None",
  paveStyle: "None",
  paveCoverage: "Shoulders",
  width: 1.7,
  size: 6,
  fit: "Standard Fit",
  engraving: "",
  engravingStyle: "Block",
  surprise: "None",
  wedding: false,
  timing: "Not sure yet",
  shapeDeferred: false,
  caratDeferred: false,
  styleDeferred: false,
};
export const enums = {
  metal: metals,
  headMetal: metals.slice(0, 7),
  bandMetal: metals.slice(0, 7),
  shape: shapes,
  secondShape: shapes,
  thirdShape: shapes,
  stoneElevation: ["Tiered", "Level set"],
  origin: ["Natural", "Lab grown", "Skip"],
  basket: ["None", "Basket", "Halo", "Hidden halo", "Bezel"],
  prongCount: ["4 Classic", "4 Compass", "6 Prong"],
  prongTips: ["Claw", "Petite Claw", "Rounded", "Tab"],
  prongPave: ["None", "Pavé"],
  bandStyle: ["Round", "Square"],
  cathedral: ["None", "Cathedral"],
  paveStyle: ["None", "Petite French"],
  paveCoverage: ["Shoulders", "Full band"],
  fit: ["Comfort Fit", "Standard Fit"],
  engravingStyle: ["Block", "Cursive"],
  surprise: ["None", "Add stones"],
  timing: timings,
};
export const styles = [
  { label: "Solitaire", copy: "Timeless and elegant", changes: {} },
  {
    label: "Halo",
    copy: "Captivating and radiant",
    changes: { basket: "Halo" },
  },
  {
    label: "Hidden Halo",
    copy: "Subtle yet brilliant",
    changes: { basket: "Hidden halo" },
  },
  {
    label: "Bezel",
    copy: "Sleek and contemporary",
    changes: { basket: "Bezel" },
  },
  {
    label: "Cathedral",
    copy: "Elevated and graceful",
    changes: {
      cathedral: "Cathedral",
      basket: "Basket",
      paveStyle: "Petite French",
    },
  },
  {
    label: "Full Pavé",
    copy: "Ornate and detailed",
    changes: { paveStyle: "Petite French", paveCoverage: "Full band" },
  },
  {
    label: "Toi et Moi",
    copy: "Romantic and symbolic",
    changes: { stoneCount: 2, basket: "Basket" },
  },
  {
    label: "Three Stone",
    copy: "Timeless triple brilliance",
    changes: {
      stoneCount: 3,
      secondShape: "Round",
      secondStoneCustomized: false,
      thirdStoneCustomized: false,
      basket: "Basket",
      cathedral: "Cathedral",
    },
  },
];
export const shapeCopy = {
  Round: "The most brilliant cut",
  Oval: "Elongates the finger",
  Cushion: "Classic with soft corners",
  Emerald: "Step-cut for clarity",
  Princess: "Square with sharp corners",
  Asscher: "A square, stepped silhouette",
  Marquise: "Elongated with pointed ends",
  Pear: "A graceful teardrop",
  Radiant: "Clean lines, brilliant sparkle",
};
export const escapeHTML = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const clamp = (value, min, max, step = 0.01) =>
  Math.round(Math.max(min, Math.min(max, Number(value))) / step) * step;
export const metalName = (s) =>
  s.metal === "Mixed"
    ? `${s.headMetal.toLowerCase()} head / ${s.bandMetal.toLowerCase()} band`
    : s.metal === "Platinum"
      ? "Platinum"
      : `${s.metal.toLowerCase()} gold`;
export function ringName(s) {
  const style =
    s.stoneCount === 2
      ? "Toi et Moi"
      : s.stoneCount === 3
        ? "Trilogy"
        : s.basket === "Halo"
          ? "Halo"
          : s.basket === "Hidden halo"
            ? "Hidden Halo"
            : s.basket === "Bezel"
              ? "Bezel"
              : s.cathedral === "Cathedral"
                ? "Cathedral"
                : s.paveCoverage === "Full band" && s.paveStyle !== "None"
                  ? "Pavé"
                  : "Solitaire";
  return `The ${s.shapeDeferred ? "" : s.shape + " "}${style}`;
}
export const describe = (s) =>
  `${metalName(s)} · ${s.caratDeferred ? "carat size to decide" : `${Number(s.carat.toFixed(2))} ct`} ${s.shapeDeferred ? "shape to decide" : s.shape.toLowerCase() + " diamond"} · ${s.stoneCount === 1 ? "One stone" : s.stoneCount === 2 ? "Two stones" : "Three stones"}`;
export function applyStyle(state, label) {
  const style = styles.find((s) => s.label === label);
  return syncMatchingStone({
    ...state,
    stoneCount: 1,
    basket: "None",
    cathedral: "None",
    paveStyle: "None",
    paveCoverage: "Shoulders",
    styleDeferred: !style,
    ...(style?.changes || {}),
  });
}
export function syncMatchingStone(state) {
  if (state.stoneCount === 2 && !state.secondStoneCustomized) {
    state.secondShape = state.shape;
    state.secondCarat = state.carat;
  }
  if (state.stoneCount === 3) {
    if (!state.secondStoneCustomized) {
      state.secondShape = "Round";
      state.secondCarat = Number(
        clamp(state.carat * 0.3, 0.1, 1.5, 0.05).toFixed(2),
      );
    }
    if (!state.thirdStoneCustomized) {
      state.thirdShape = state.secondShape;
      state.thirdCarat = state.secondCarat;
    }
    if (state.basket === "None") state.basket = "Basket";
  }
  return state;
}
export function sanitize(input) {
  const s = { ...defaults };
  if (!input || typeof input !== "object") return s;
  // Preserve designs created before the expanded controls were introduced.
  input = { ...input };
  if (["Yellow", "White", "Rose"].includes(input.metal))
    input.metal = `18k ${input.metal}`;
  if (input.setting) {
    const legacy = {
      Solitaire: "Solitaire",
      "Hidden halo": "Hidden Halo",
      "Three stone": "Three Stone",
    }[input.setting];
    Object.assign(s, applyStyle(s, legacy));
  }
  if (input.band === "Pavé") s.paveStyle = "Petite French";
  for (const [key, values] of Object.entries(enums))
    if (values.includes(input[key])) s[key] = input[key];
  if (s.metal !== "Mixed") s.headMetal = s.bandMetal = s.metal;
  for (const key of ["carat", "secondCarat", "thirdCarat"])
    if (typeof input[key] === "number" && Number.isFinite(input[key]))
      s[key] = Number(
        clamp(input[key], key === "carat" ? 0.5 : 0.1, 5, 0.05).toFixed(2),
      );
  if ([1, 2, 3].includes(input.stoneCount)) s.stoneCount = input.stoneCount;
  if (Number.isFinite(Number(input.width)))
    s.width = Number(clamp(input.width, 1.5, 4, 0.1).toFixed(1));
  if (
    input.size !== "" &&
    input.size !== undefined &&
    Number.isFinite(Number(input.size))
  )
    s.size = clamp(input.size, 3, 13, 0.25);
  s.engraving = String(input.engraving || "").slice(0, 14);
  for (const key of [
    "wedding",
    "shapeDeferred",
    "caratDeferred",
    "styleDeferred",
    "secondStoneCustomized",
    "thirdStoneCustomized",
  ])
    s[key] = input[key] === true;
  if (typeof input.secondStoneCustomized !== "boolean") {
    // The previous automatic second stone was always a 1 ct pear. Replace
    // that default while preserving independently configured second stones.
    const previousDefault =
      input.secondShape === "Pear" && input.secondCarat === 1;
    const threeStonePreset =
      s.stoneCount === 3 &&
      input.secondShape === "Round" &&
      input.secondCarat === 0.5;
    const explicitSecond =
      shapes.includes(input.secondShape) || Number.isFinite(input.secondCarat);
    const matchesCenter =
      s.secondShape === s.shape && s.secondCarat === s.carat;
    s.secondStoneCustomized =
      explicitSecond && !previousDefault && !threeStonePreset && !matchesCenter;
  }
  if (s.stoneCount === 3 && typeof input.thirdStoneCustomized !== "boolean") {
    const balancedCarat = Number(
      clamp(s.carat * 0.3, 0.1, 1.5, 0.05).toFixed(2),
    );
    const expectedShape = s.secondStoneCustomized ? s.secondShape : "Round";
    const expectedCarat = s.secondStoneCustomized
      ? s.secondCarat
      : balancedCarat;
    const explicitThird =
      shapes.includes(input.thirdShape) || Number.isFinite(input.thirdCarat);
    const oldDefault = s.thirdShape === "Round" && s.thirdCarat === 0.5;
    s.thirdStoneCustomized =
      explicitThird &&
      !oldDefault &&
      (s.thirdShape !== expectedShape || s.thirdCarat !== expectedCarat);
  }
  return syncMatchingStone(s);
}
export function estimate(s) {
  const metalCost = {
    "14k Yellow": 650,
    "18k Yellow": 800,
    "14k White": 700,
    "18k White": 850,
    "14k Rose": 650,
    "18k Rose": 800,
    Platinum: 1200,
  };
  const stoneRate = s.origin === "Natural" ? 3500 : 1100;
  const weight =
    s.carat +
    (s.stoneCount > 1 ? s.secondCarat : 0) +
    (s.stoneCount > 2 ? s.thirdCarat : 0);
  return (
    Math.round(
      ((s.metal === "Mixed"
        ? metalCost[s.bandMetal] * 0.75 + metalCost[s.headMetal] * 0.25 + 80
        : metalCost[s.metal]) +
        weight * stoneRate +
        { None: 0, Basket: 100, Halo: 450, "Hidden halo": 350, Bezel: 200 }[
          s.basket
        ] +
        (s.paveStyle !== "None"
          ? s.paveCoverage === "Full band"
            ? 650
            : 400
          : 0) +
        (s.cathedral === "Cathedral" ? 150 : 0) +
        (s.prongPave === "Pavé" ? 175 : 0) +
        (s.surprise !== "None" ? 125 : 0) +
        (s.engraving ? 75 : 0) +
        (s.wedding ? 550 : 0) +
        (s.width - 1.7) * 150) /
        25,
    ) * 25
  );
}
export function shapeSVG(shape) {
  const paths = {
    Round:
      '<circle cx="18" cy="20" r="14"/><path d="m18 6 10 4 4 10-4 10-10 4-10-4-4-10 4-10ZM12 13h12l5 7-5 7H12l-5-7ZM8 10l4 3m16-3-4 3M8 30l4-3m16 3-4-3M18 6v7m0 14v7"/>',
    Oval: '<ellipse cx="18" cy="20" rx="11" ry="17"/><path d="m18 3-7 8-4 9 4 9 7 8 7-8 4-9-4-9Z M12 11l12 18M24 11 12 29M7 20h22M12 11h12l3 9-3 9H12L9 20Z"/>',
    Cushion:
      '<rect x="4" y="6" width="28" height="28" rx="8"/><path d="m12 10-4 7v6l4 7h12l4-7v-6l-4-7ZM8 17h20M8 23h20M12 10l12 20m0-20L12 30M18 6v4m0 20v4"/>',
    Emerald:
      '<path d="M10 3h16l5 5v24l-5 5H10l-5-5V8Z M13 8h10l4 4v16l-4 4H13l-4-4V12Z M10 3l3 5m13-5-3 5M5 8l4 4m22-4-4 4M5 32l4-4m22 4-4-4M10 37l3-5m13 5-3-5"/>',
    Princess:
      '<path d="M3 5h30v30H3ZM8 10h20v20H8ZM3 5l30 30M33 5 3 35M8 10l10 4 10-4-4 10 4 10-10-4-10 4 4-10Z"/>',
    Asscher:
      '<path d="M10 5h16l7 7v16l-7 7H10l-7-7V12ZM13 10h10l5 5v10l-5 5H13l-5-5V15ZM10 5l3 5m13-5-3 5M3 12l5 3m25-3-5 3M3 28l5-3m25 3-5-3M10 35l3-5m13 5-3-5"/>',
    Marquise:
      '<path d="M18 2C0 15 0 25 18 38 36 25 36 15 18 2ZM18 9 9 20l9 11 9-11ZM18 2v7m0 22v7M5 20h26M9 20l9-18 9 18-9 18Z"/>',
    Pear: '<path d="M18 2C14 10 6 17 6 25a12 12 0 0 0 24 0C30 17 22 10 18 2ZM18 11 10 24l8 9 8-9ZM18 2v9M6 25l4-1m20 1-4-1m-8 9v4M10 24h16"/>',
    Radiant:
      '<path d="M10 4h16l6 6v20l-6 6H10l-6-6V10ZM12 10h12l3 4v12l-3 4H12l-3-4V14ZM10 4l8 10 8-10M4 10l10 10L4 30m28-20L22 20l10 10M10 36l8-10 8 10M12 10l12 20m0-20L12 30"/>',
  };
  return `<svg viewBox="0 0 36 40" aria-hidden="true">${paths[shape] || paths.Round}</svg>`;
}
