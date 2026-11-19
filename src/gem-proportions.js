// Preview proportions, not a substitute for a supplier's measured stone.
// One consistent scale links carat size, band width, and US ring diameter.
export const MM_TO_WORLD = (1.43 - 0.078) / ((11.63 + 0.8128 * 6) / 2);
export const BAND_OUTER = 0.175;
export const BAND_INNER = -0.078;

export const cutProfiles = {
  Round: { halfWidth: 1, halfLength: 1, width: 6.5, depth: 1 },
  Oval: { halfWidth: 0.78, halfLength: 1.12, width: 5.6, depth: 0.78 },
  Cushion: { halfWidth: 0.89, halfLength: 0.98, width: 5.7, depth: 0.89 },
  Emerald: {
    halfWidth: 0.85,
    halfLength: 1.2,
    width: 5.0,
    depth: 1,
    step: true,
  },
  Princess: { halfWidth: 0.94, halfLength: 0.94, width: 5.5, depth: 1.05 },
  Asscher: {
    halfWidth: 0.94,
    halfLength: 0.94,
    width: 5.5,
    depth: 1.12,
    step: true,
  },
  Marquise: { halfWidth: 0.68, halfLength: 1.3, width: 5.0, depth: 0.68 },
  Pear: { halfWidth: 0.733, halfLength: 1.1, width: 5.5, depth: 0.733 },
  Radiant: { halfWidth: 0.85, halfLength: 1.06, width: 5.3, depth: 0.91 },
};

export function stoneScale(shape, carat) {
  const p = cutProfiles[shape] || cutProfiles.Round;
  return (p.width / (2 * p.halfWidth)) * Math.cbrt(carat) * MM_TO_WORLD;
}

export function stoneDimensions(shape, carat) {
  const p = cutProfiles[shape] || cutProfiles.Round;
  const scale = stoneScale(shape, carat) / MM_TO_WORLD;
  return {
    width: p.halfWidth * 2 * scale,
    length: p.halfLength * 2 * scale,
    height: (p.step ? 1.11 : 1.22) * p.depth * scale,
  };
}

export function ringRadius(size, fit = "Standard Fit") {
  return (
    ((11.63 + 0.8128 * size) / 2) * MM_TO_WORLD -
    BAND_INNER +
    (fit === "Comfort Fit" ? 0.018 : 0)
  );
}
