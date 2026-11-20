import * as THREE from "three";
import { diamondOutline } from "./diamond.js";
import { cutProfiles, stoneScale } from "./gem-proportions.js";

// Offset the silhouette by a real distance, then space points by arc length.
// Halos stay close to elongated cuts and their melee do not bunch at corners.
export function settingOutline(shape, scale, offset = 0, count = 128) {
  const raw = Array.from({ length: 256 }, (_, i) => {
    const angle = (i / 256) * Math.PI * 2;
    const p = diamondOutline(shape, angle);
    const a = diamondOutline(shape, angle - 0.002);
    const b = diamondOutline(shape, angle + 0.002);
    const normal = new THREE.Vector2(b[1] - a[1], a[0] - b[0]).normalize();
    return new THREE.Vector3(
      p[0] * scale + normal.x * offset,
      0,
      p[1] * scale + normal.y * offset,
    );
  });
  const lengths = [0];
  for (let i = 1; i <= raw.length; i++)
    lengths.push(lengths[i - 1] + raw[i % raw.length].distanceTo(raw[i - 1]));
  let segment = 0;
  return Array.from({ length: count }, (_, i) => {
    const distance = (i / count) * lengths.at(-1);
    while (lengths[segment + 1] < distance) segment++;
    return raw[segment]
      .clone()
      .lerp(
        raw[(segment + 1) % raw.length],
        (distance - lengths[segment]) /
          (lengths[segment + 1] - lengths[segment]),
      );
  });
}

export function outlineLength(points) {
  return points.reduce(
    (sum, p, i) => sum + p.distanceTo(points[(i + 1) % points.length]),
    0,
  );
}

export function settingSpecs(state, bandTop) {
  const bandSurface = (x) =>
    Math.max(
      bandTop - 0.32,
      Math.sqrt(Math.max(0, (bandTop + 0.25) ** 2 - x ** 2)) - 0.25,
    );
  const make = (shape, carat, x = 0, z = 0, tilt = 0) => {
    const profile = cutProfiles[shape];
    const scale = stoneScale(shape, carat);
    const depth = (profile.step ? 0.83 : 0.9) * profile.depth * scale;
    const crown = (profile.step ? 0.28 : 0.32) * profile.depth * scale;
    const halfWidth = scale * profile.halfWidth;
    // Seat the pavilion over the local curve of the shank. Using the top of
    // the entire band for every stone creates the tall, disconnected posts.
    const culetX = x + depth * Math.sin(tilt);
    const y = bandSurface(culetX) + depth * Math.cos(tilt) + 0.045;
    return {
      shape,
      carat,
      scale,
      depth,
      crown,
      halfWidth,
      halfLength: scale * profile.halfLength,
      tilt,
      position: new THREE.Vector3(x, y, z),
    };
  };
  const center = make(state.shape, state.carat);
  if (state.stoneCount === 1) return [center];
  const second = make(state.secondShape, state.secondCarat);
  const rim =
    state.basket === "Halo" ? 0.144 : state.basket === "Bezel" ? 0.065 : 0.015;
  const clearance = rim * 2 + 0.025;
  if (state.stoneCount === 2) {
    const gap = (center.halfWidth + second.halfWidth + clearance) / 2;
    const pair = [
      make(state.shape, state.carat, -gap, -0.09, 0.08),
      make(state.secondShape, state.secondCarat, gap, 0.09, -0.08),
    ];
    if (state.stoneElevation === "Level set") {
      const table = Math.max(
        ...pair.map(
          (spec) => spec.position.y + spec.crown * Math.cos(spec.tilt),
        ),
      );
      for (const spec of pair)
        spec.position.y = table - spec.crown * Math.cos(spec.tilt);
    } else
      pair[1].position.y += Math.max(
        0.06,
        Math.min(center.depth, second.depth) * 0.2,
      );
    return pair;
  }
  const third = make(state.thirdShape, state.thirdCarat);
  const tiltedRim = (spec) =>
    state.basket === "Bezel" ? spec.depth * 0.34 * Math.sin(0.32) + 0.015 : 0;
  return [
    center,
    make(
      state.secondShape,
      state.secondCarat,
      -center.halfWidth -
        second.halfWidth * Math.cos(0.32) -
        clearance -
        tiltedRim(second),
      0,
      0.32,
    ),
    make(
      state.thirdShape,
      state.thirdCarat,
      center.halfWidth +
        third.halfWidth * Math.cos(0.32) +
        clearance +
        tiltedRim(third),
      0,
      -0.32,
    ),
  ];
}

export function prongAngles(shape, style) {
  if (style === "6 Prong")
    return Array.from({ length: 6 }, (_, i) => Math.PI / 2 + (i * Math.PI) / 3);
  if (style === "4 Compass" || shape === "Marquise")
    return [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
  if (shape === "Pear")
    return [Math.PI / 2, Math.PI * 1.12, Math.PI * 1.5, Math.PI * 1.88];
  const p = cutProfiles[shape];
  const corner = Math.atan2(p.halfLength, p.halfWidth);
  return [corner, Math.PI - corner, Math.PI + corner, Math.PI * 2 - corner];
}

// A closed, rounded metal wall replaces the disconnected bezel wires.
export function bezelGeometry(shape, scale, depth) {
  const path = settingOutline(shape, scale, 0, 160);
  const bottom = -depth * 0.34,
    top = scale * 0.045;
  const inner = -0.004,
    outer = 0.052,
    r = Math.min(0.014, (top - bottom) * 0.22);
  const profile = new THREE.Shape();
  profile.moveTo(outer, (top + bottom) / 2);
  profile.quadraticCurveTo(outer + 0.006, top - r * 2, outer, top - r);
  profile.quadraticCurveTo(outer, top, outer - r, top);
  profile.lineTo(inner + r, top);
  profile.quadraticCurveTo(inner, top, inner, top - r);
  profile.lineTo(inner, bottom + r);
  profile.quadraticCurveTo(inner, bottom, inner + r, bottom);
  profile.lineTo(0.02, bottom);
  profile.quadraticCurveTo(0.031, bottom, 0.033, bottom + r);
  profile.quadraticCurveTo(
    0.042,
    bottom + (top - bottom) * 0.25,
    outer,
    (top + bottom) / 2,
  );
  const section = profile.getPoints(6),
    sides = section.length - 1;
  const pn = section.slice(0, sides).map((p, i) => {
    const before = p
      .clone()
      .sub(section[(i + sides - 1) % sides])
      .normalize();
    const after = section[(i + 1) % sides].clone().sub(p).normalize();
    const t = before.add(after).normalize();
    return new THREE.Vector2(t.y, -t.x);
  });
  const vertices = [],
    normals = [],
    indices = [];
  for (let i = 0; i <= path.length; i++) {
    const p = path[i % path.length];
    const t = path[(i + 1) % path.length]
      .clone()
      .sub(path[(i + path.length - 1) % path.length])
      .normalize();
    const outward = new THREE.Vector3(t.z, 0, -t.x);
    for (let j = 0; j <= sides; j++) {
      const q = section[j % sides],
        n = pn[j % sides];
      vertices.push(p.x + outward.x * q.x, q.y, p.z + outward.z * q.x);
      normals.push(outward.x * n.x, n.y, outward.z * n.x);
      if (i < path.length && j < sides) {
        const a = i * (sides + 1) + j,
          b = a + sides + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

export function clawGeometry(petite = false) {
  const factor = petite ? 0.72 : 1;
  const points = Array.from({ length: 21 }, (_, i) => {
    const angle = (i / 20) * Math.PI,
      u = (Math.cos(angle) + 1) / 2;
    return new THREE.Vector2(
      Math.sin(angle) * (0.45 + 0.55 * u) * 0.038 * factor,
      Math.cos(angle) * 0.061 * factor,
    );
  });
  return new THREE.LatheGeometry(points.reverse(), 32)
    .scale(1, 1, 0.72)
    .rotateX(Math.PI / 2);
}

export function shoulderGeometry(curve, halfBandWidth) {
  const vertices = [],
    normals = [],
    indices = [],
    segments = 64,
    sides = 32;
  for (let i = 0; i <= segments; i++) {
    const u = i / segments,
      center = curve.getPointAt(u),
      tangent = curve.getTangentAt(u).normalize();
    const lateral = new THREE.Vector3(0, 0, 1)
      .addScaledVector(tangent, -tangent.z)
      .normalize();
    const radial = new THREE.Vector3()
      .crossVectors(tangent, lateral)
      .normalize();
    const rootBlend = Math.max(0.025, THREE.MathUtils.smoothstep(u, 0, 0.26));
    const width =
      THREE.MathUtils.lerp(halfBandWidth * 0.9, halfBandWidth * 0.66, u) *
      rootBlend;
    const thickness = THREE.MathUtils.lerp(0.075, 0.047, u) * rootBlend;
    for (let j = 0; j <= sides; j++) {
      const a = ((j % sides) / sides) * Math.PI * 2,
        c = Math.cos(a),
        s = Math.sin(a);
      const point = center
        .clone()
        .addScaledVector(radial, c * thickness)
        .addScaledVector(lateral, s * width);
      const normal = radial
        .clone()
        .multiplyScalar(c / thickness)
        .addScaledVector(lateral, s / width)
        .normalize();
      vertices.push(point.x, point.y, point.z);
      normals.push(normal.x, normal.y, normal.z);
      if (i < segments && j < sides) {
        const n = i * (sides + 1) + j,
          m = n + sides + 1;
        indices.push(n, m, n + 1, m, m + 1, n + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}
