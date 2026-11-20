import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createDiamondCut, diamondOutline } from "./diamond.js";
import { metalColors } from "./config.js";
import { createDiamondGlints } from "./diamond-glints.js";
import { createMetalMaterial } from "./metal-finish.js";
import {
  MM_TO_WORLD,
  BAND_OUTER,
  BAND_INNER,
  ringRadius,
} from "./gem-proportions.js";
import {
  settingOutline,
  outlineLength,
  settingSpecs,
  bezelGeometry,
  clawGeometry,
  prongAngles,
  shoulderGeometry,
} from "./setting-geometry.js";

// Saturated yellow-alloy tints keep gold warm through the studio reflections.
// Interface swatches remain independent of their 3D finish.
const polishedMetalColors = {
  ...metalColors,
  "14k Yellow": "#ffd06a",
  "18k Yellow": "#ffc349",
  "14k Rose": "#edc7b5",
  "18k Rose": "#ecc1ab",
  "14k White": "#e6e7e5",
  "18k White": "#e0e2e1",
  Platinum: "#d4d7d6",
};

const up = new THREE.Vector3(0, 1, 0);
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);

function bandProfile(state, width = state.width) {
  const shape = new THREE.Shape();
  const outer = BAND_OUTER,
    inner = BAND_INNER,
    halfWidth = (width * MM_TO_WORLD) / 2;
  shape.moveTo(outer, 0);
  if (state.bandStyle === "Square") {
    const rx = 0.028,
      rz = Math.min(0.034, halfWidth * 0.24),
      k = 0.5522847498;
    shape.lineTo(outer, halfWidth - rz);
    shape.bezierCurveTo(
      outer,
      halfWidth - rz + k * rz,
      outer - rx + k * rx,
      halfWidth,
      outer - rx,
      halfWidth,
    );
    shape.lineTo(inner + rx, halfWidth);
    shape.bezierCurveTo(
      inner + rx - k * rx,
      halfWidth,
      inner,
      halfWidth - rz + k * rz,
      inner,
      halfWidth - rz,
    );
    innerFace(halfWidth - rz);
    shape.bezierCurveTo(
      inner,
      -halfWidth + rz - k * rz,
      inner + rx - k * rx,
      -halfWidth,
      inner + rx,
      -halfWidth,
    );
    shape.lineTo(outer - rx, -halfWidth);
    shape.bezierCurveTo(
      outer - rx + k * rx,
      -halfWidth,
      outer,
      -halfWidth + rz - k * rz,
      outer,
      -halfWidth + rz,
    );
    shape.lineTo(outer, 0);
  } else {
    // A continuous domed profile with rolled inner edges replaces the abrupt
    // radial step that previously produced a sharp lip on the standard band.
    shape.bezierCurveTo(
      outer,
      halfWidth * 0.6,
      0.035,
      halfWidth,
      -0.045,
      halfWidth,
    );
    shape.bezierCurveTo(
      -0.068,
      halfWidth,
      inner,
      halfWidth * 0.94,
      inner,
      halfWidth * 0.78,
    );
    innerFace(halfWidth * 0.78);
    shape.bezierCurveTo(
      inner,
      -halfWidth * 0.94,
      -0.068,
      -halfWidth,
      -0.045,
      -halfWidth,
    );
    shape.bezierCurveTo(0.035, -halfWidth, outer, -halfWidth * 0.6, outer, 0);
  }
  return shape;

  function innerFace(edge) {
    if (state.fit === "Comfort Fit") {
      shape.bezierCurveTo(
        inner,
        edge * 0.58,
        inner - 0.018,
        edge * 0.45,
        inner - 0.018,
        0,
      );
      shape.bezierCurveTo(
        inner - 0.018,
        -edge * 0.45,
        inner,
        -edge * 0.58,
        inner,
        -edge,
      );
    } else shape.lineTo(inner, -edge);
  }
}

function bandGeometry(state, radius, width = state.width) {
  const profile = bandProfile(state, width).getPoints(12);
  const sides = profile.length - 1;
  const profileNormals = profile.slice(0, sides).map((point, j) => {
    const before = point
      .clone()
      .sub(profile[(j + sides - 1) % sides])
      .normalize();
    const after = profile[(j + 1) % sides].clone().sub(point).normalize();
    const tangent = before.add(after).normalize();
    return new THREE.Vector2(tangent.y, -tangent.x);
  });
  const vertices = [],
    normals = [],
    indices = [],
    segments = 256;
  for (let i = 0; i <= segments; i++) {
    const a = ((i % segments) / segments) * Math.PI * 2;
    for (let j = 0; j <= sides; j++) {
      const point = profile[j % sides],
        normal = profileNormals[j % sides];
      vertices.push(
        Math.sin(a) * (radius + point.x),
        Math.cos(a) * (radius + point.x) - 0.25,
        point.y,
      );
      // Reuse identical normals at both closed seams so highlights flow
      // continuously around the band and across its rounded edges.
      normals.push(Math.sin(a) * normal.x, Math.cos(a) * normal.x, normal.y);
      if (i < segments && j < sides) {
        const n = i * (sides + 1) + j,
          m = n + sides + 1;
        // Outward winding: the near surface must hide the far side of the band.
        indices.push(n, n + 1, m, m, n + 1, m + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

export function buildRing(s) {
  if (s.stoneCount === 3 && s.basket === "None") s = { ...s, basket: "Basket" };
  const ring = new THREE.Group(),
    cuts = new Map(),
    capGeometries = new Map();
  const bandFinish = s.metal === "Mixed" ? s.bandMetal : s.metal;
  const headFinish = s.metal === "Mixed" ? s.headMetal : s.metal;
  const bandColor = polishedMetalColors[bandFinish];
  const headColor = polishedMetalColors[headFinish];
  const bandMetal = createMetalMaterial(bandColor, bandFinish),
    headMetal =
      s.metal === "Mixed"
        ? createMetalMaterial(headColor, headFinish)
        : bandMetal;
  const radius = ringRadius(s.size, s.fit);
  const bandTop = radius - 0.25 + BAND_OUTER;
  const mesh = (geometry, mat = headMetal, parent = ring) => {
    const item = new THREE.Mesh(geometry, mat);
    parent.add(item);
    return item;
  };
  const roundCap = (point, thickness, mat, parent) => {
    if (!capGeometries.has(thickness))
      capGeometries.set(thickness, new THREE.SphereGeometry(thickness, 24, 16));
    const cap = mesh(capGeometries.get(thickness), mat, parent);
    cap.position.copy(point);
  };
  const tube = (
    points,
    thickness,
    mat = headMetal,
    parent = ring,
    closed = false,
  ) => {
    const item = mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points, closed),
        closed ? 160 : points.length === 2 ? 8 : 48,
        thickness,
        24,
        closed,
      ),
      mat,
      parent,
    );
    if (!closed) {
      roundCap(points[0], thickness, mat, parent);
      roundCap(points.at(-1), thickness, mat, parent);
    }
    return item;
  };
  const gem = (shape, scale, position, parent = ring, direction) => {
    if (!cuts.has(shape)) {
      const cut = createDiamondCut(shape, headColor);
      cut.glints = createDiamondGlints(cut.geometry);
      cuts.set(shape, cut);
    }
    const cut = cuts.get(shape),
      stone = mesh(cut.geometry, cut.material, parent);
    stone.scale.setScalar(scale);
    stone.position.copy(position);
    stone.userData.isGem = true;
    const sparkle = new THREE.Points(cut.glints.geometry, cut.glints.material);
    sparkle.renderOrder = 2;
    sparkle.onBeforeRender = (renderer) => {
      cut.glints.material.uniforms.uViewportHeight.value =
        renderer.domElement.height;
      cut.glints.material.uniformsNeedUpdate = true;
    };
    stone.add(sparkle);
    if (direction)
      stone.quaternion.setFromUnitVectors(up, direction.clone().normalize());
    return stone;
  };
  mesh(bandGeometry(s, radius), bandMetal);
  const specs = settingSpecs(s, bandTop);
  const shoulderCurves = [];
  const rail = (shape, scale, y, offset, thickness, group) => {
    const points = settingOutline(shape, scale, offset, 128);
    for (const point of points) point.y = y;
    return tube(points, thickness, headMetal, group, true);
  };
  const taperedArm = (curve, bodyRadius, tipRadius, group) => {
    const segments = 64,
      sides = 24;
    const geometry = new THREE.TubeGeometry(curve, segments, bodyRadius, sides);
    const positions = geometry.getAttribute("position");
    const point = new THREE.Vector3();
    for (let i = 0; i <= segments; i++) {
      const center = curve.getPointAt(i / segments);
      const u = i / segments;
      // The arms merge into a narrow common seat, open into a fuller body,
      // then taper into the claw. Full-width root caps look like solder beads.
      const radiusAt =
        u < 0.24
          ? THREE.MathUtils.lerp(
              bodyRadius * 0.62,
              bodyRadius,
              THREE.MathUtils.smoothstep(u, 0, 0.24),
            )
          : THREE.MathUtils.lerp(
              bodyRadius,
              tipRadius,
              THREE.MathUtils.smoothstep(u, 0.24, 1),
            );
      for (let j = 0; j <= sides; j++) {
        const index = i * (sides + 1) + j;
        point
          .fromBufferAttribute(positions, index)
          .sub(center)
          .multiplyScalar(radiusAt / bodyRadius)
          .add(center);
        positions.setXYZ(index, point.x, point.y, point.z);
      }
    }
    geometry.computeVertexNormals();
    const normals = geometry.getAttribute("normal");
    for (let i = 0; i <= segments; i++) {
      const a = i * (sides + 1),
        b = a + sides;
      point
        .fromBufferAttribute(normals, a)
        .add(new THREE.Vector3().fromBufferAttribute(normals, b))
        .normalize();
      normals.setXYZ(a, point.x, point.y, point.z);
      normals.setXYZ(b, point.x, point.y, point.z);
    }
    mesh(geometry, headMetal, group);
    roundCap(curve.getPointAt(0), bodyRadius * 0.62, headMetal, group);
  };
  const melee = (spec, group, hidden = false) => {
    const tiny = hidden ? 0.047 : 0.061;
    const offset = hidden ? -tiny * 0.25 : tiny + 0.022;
    const outlineScale = spec.scale * (hidden ? 0.88 : 1);
    const rough = settingOutline(spec.shape, outlineScale, offset);
    let count = THREE.MathUtils.clamp(
      Math.floor(outlineLength(rough) / (tiny * 2 + 0.014)),
      16,
      64,
    );
    let points = settingOutline(spec.shape, outlineScale, offset, count);
    while (
      count > 8 &&
      points.some(
        (p, i) =>
          p.distanceTo(points[(i + 1) % points.length]) < tiny * 2 + 0.005,
      )
    )
      points = settingOutline(spec.shape, outlineScale, offset, --count);
    const y = hidden ? -spec.depth * 0.35 : spec.scale * 0.018;
    const support = points.map((p) =>
      V(p.x, y - (hidden ? 0 : tiny * 0.47), p.z),
    );
    tube(support, hidden ? 0.022 : 0.025, headMetal, group, true);
    if (!hidden) {
      const inside = settingOutline(spec.shape, spec.scale * 0.86, 0, 8);
      const outside = settingOutline(spec.shape, outlineScale, offset, 8);
      for (let i = 0; i < 8; i++) {
        const a = inside[i],
          b = outside[i];
        tube(
          [
            V(a.x, -spec.depth * 0.28, a.z),
            V((a.x + b.x) / 2, -spec.depth * 0.16, (a.z + b.z) / 2),
            V(b.x, y - tiny * 0.47, b.z),
          ],
          0.021,
          headMetal,
          group,
        );
      }
    }
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      gem(
        "Round",
        tiny,
        V(p.x, y, p.z),
        group,
        hidden ? V(p.x, 0.07, p.z) : undefined,
      );
      if (!hidden) {
        const next = points[(i + 1) % points.length];
        const midpoint = p.clone().add(next).multiplyScalar(0.5);
        const bead = mesh(
          new THREE.SphereGeometry(0.014, 16, 12),
          headMetal,
          group,
        );
        bead.position.set(midpoint.x, y + 0.012, midpoint.z);
      }
    }
  };

  for (const spec of specs) {
    const group = new THREE.Group();
    group.userData.isSetting = true;
    group.position.copy(spec.position);
    group.rotation.z = spec.tilt;
    ring.add(group);
    const centerStone = gem(spec.shape, spec.scale, V(0, 0), group);
    centerStone.userData.carat = spec.carat;
    centerStone.userData.isCenterStone = true;
    const rootY = -spec.depth + 0.025;
    const seat = V(0, rootY, 0).applyEuler(group.rotation).add(spec.position);
    const anchorX = THREE.MathUtils.clamp(
      seat.x,
      -(radius + BAND_OUTER) * 0.88,
      (radius + BAND_OUTER) * 0.88,
    );
    const anchorY =
      Math.sqrt(Math.max(0.1, (radius + BAND_OUTER) ** 2 - anchorX ** 2)) -
      0.25;
    if (specs.length === 1 || (specs.length === 3 && spec === specs[0])) {
      const mount = tube(
        [
          V(anchorX, anchorY - 0.035, spec.position.z * 0.3),
          V((anchorX + seat.x) / 2, (anchorY + seat.y) / 2, seat.z * 0.65),
          seat,
        ],
        0.05,
        bandMetal,
      );
      mount.userData.isMount = true;
    }
    // A small seat unites the prong roots and the shank underneath the culet.
    rail(spec.shape, spec.scale * 0.2, rootY, 0, 0.028, group);
    for (const angle of [0, Math.PI / 2]) {
      const [x, z] = diamondOutline(spec.shape, angle);
      tube(
        [
          V(-x * spec.scale * 0.2, rootY, -z * spec.scale * 0.2),
          V(0, rootY - 0.025, 0),
          V(x * spec.scale * 0.2, rootY, z * spec.scale * 0.2),
        ],
        0.023,
        headMetal,
        group,
      );
    }

    if (s.basket === "Bezel") {
      mesh(bezelGeometry(spec.shape, spec.scale, spec.depth), headMetal, group);
      rail(spec.shape, spec.scale * 0.58, -spec.depth * 0.6, 0, 0.026, group);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const [x, z] = diamondOutline(spec.shape, a);
        tube(
          [
            V(x * spec.scale * 0.2, rootY, z * spec.scale * 0.2),
            V(x * spec.scale * 0.59, -spec.depth * 0.6, z * spec.scale * 0.59),
            V(x * spec.scale * 0.99, -spec.depth * 0.25, z * spec.scale * 0.99),
          ],
          0.035,
          headMetal,
          group,
        );
      }
    } else {
      for (const a of prongAngles(spec.shape, s.prongCount)) {
        const [ox, oz] = diamondOutline(spec.shape, a);
        const x = ox * spec.scale,
          z = oz * spec.scale;
        const petite = s.prongTips === "Petite Claw";
        // Keep small side-stone claws delicate while giving the main setting
        // the fuller, softly tapered metal of a cast and polished prong.
        const prongScale = THREE.MathUtils.clamp(
          Math.sqrt(spec.scale / 0.53),
          0.65,
          1.3,
        );
        const tipY = spec.scale * 0.055 + 0.012;
        const curve = new THREE.CatmullRomCurve3(
          [
            V(x * 0.2, rootY, z * 0.2),
            V(x * 0.52, -spec.depth * 0.64, z * 0.52),
            V(x * 0.89, -spec.depth * 0.23, z * 0.89),
            V(x * 1.02, -0.006, z * 1.02),
            V(x * 0.99, tipY, z * 0.99),
          ],
          false,
          "centripetal",
        );
        taperedArm(
          curve,
          (petite ? 0.037 : 0.052) * prongScale,
          (petite ? 0.021 : 0.029) * prongScale,
          group,
        );
        let tip;
        if (s.prongTips === "Tab") {
          tip = mesh(
            new RoundedBoxGeometry(0.068, 0.03, 0.058, 4, 0.009),
            headMetal,
            group,
          );
          tip.rotation.y = -a;
        } else if (s.prongTips === "Rounded") {
          tip = mesh(new THREE.SphereGeometry(0.032, 32, 24), headMetal, group);
          tip.scale.y = 0.8;
        } else {
          tip = mesh(clawGeometry(petite), headMetal, group);
          tip.quaternion.setFromUnitVectors(V(0, 0, 1), V(x, 0, z).normalize());
        }
        tip.scale.multiplyScalar(prongScale);
        tip.position.set(x * 0.975, tipY, z * 0.975);
        if (s.prongPave === "Pavé")
          for (const t of [0.38, 0.57, 0.76]) {
            const point = curve.getPointAt(t);
            const direction = V(x, 0.15, z).normalize();
            point.addScaledVector(direction, 0.023);
            gem("Round", petite ? 0.021 : 0.027, point, group, direction);
          }
      }
      if (s.basket !== "None" || s.cathedral === "Cathedral") {
        rail(
          spec.shape,
          spec.scale * 0.86,
          -spec.depth * 0.28,
          0,
          0.025,
          group,
        );
        if (s.basket === "Basket" || s.basket === "Halo" || specs.length > 1)
          rail(
            spec.shape,
            spec.scale * 0.57,
            -spec.depth * 0.62,
            0,
            0.024,
            group,
          );
      }
    }
    if (s.basket === "Halo") melee(spec, group);
    if (s.basket === "Hidden halo") melee(spec, group, true);
  }

  if (specs.length > 1) {
    const sorted = [...specs].sort((a, b) => a.position.x - b.position.x);
    const galleryPoint = (spec, direction, front) => {
      const angle = Math.atan2(front * 0.48, direction);
      const [x, z] = diamondOutline(spec.shape, angle);
      const lower = s.basket === "None" ? 0.2 : 0.57;
      const y = s.basket === "None" ? -spec.depth + 0.025 : -spec.depth * 0.62;
      return V(x * spec.scale * lower, y, z * spec.scale * lower)
        .applyAxisAngle(V(0, 0, 1), spec.tilt)
        .add(spec.position);
    };
    for (let i = 1; i < sorted.length; i++) {
      for (const front of [-1, 1]) {
        const a = galleryPoint(sorted[i - 1], 1, front);
        const b = galleryPoint(sorted[i], -1, front);
        const bridge = tube(
          [a, a.clone().lerp(b, 0.5).add(V(0, -0.018)), b],
          0.034,
          headMetal,
        );
        bridge.userData.isGalleryBridge = true;
      }
    }
  }

  if (s.cathedral === "Cathedral" || specs.length > 1) {
    for (const sign of [-1, 1]) {
      const main = specs.reduce(
        (chosen, spec) =>
          sign * spec.position.x > sign * chosen.position.x ? spec : chosen,
        specs[0],
      );
      const x = sign * (radius + BAND_OUTER) * Math.sin(0.95);
      const surfaceY = Math.sqrt((radius + BAND_OUTER) ** 2 - x * x) - 0.25;
      const raised = s.cathedral === "Cathedral";
      const attachmentScale = raised
        ? s.basket === "Bezel"
          ? 0.99
          : 0.86
        : s.basket === "None"
          ? 0.2
          : s.basket === "Bezel"
            ? 0.58
            : 0.57;
      const attachmentY = raised
        ? -main.depth * 0.28
        : s.basket === "None"
          ? -main.depth + 0.025
          : -main.depth * (s.basket === "Bezel" ? 0.6 : 0.62);
      const finish = V(sign * main.halfWidth * attachmentScale, attachmentY, 0)
        .applyAxisAngle(V(0, 0, 1), main.tilt)
        .add(main.position);
      const start = V(
        x - sign * Math.sin(0.95) * 0.08,
        surfaceY - Math.cos(0.95) * 0.08,
        main.position.z * 0.15,
      );
      const lift = Math.max(0.15, finish.y - start.y);
      const shoulder = new THREE.CubicBezierCurve3(
        start,
        start
          .clone()
          .add(
            V(-sign * Math.cos(0.95), Math.sin(0.95)).multiplyScalar(
              Math.min(0.5, lift * 0.55),
            ),
          ),
        V(
          THREE.MathUtils.lerp(x, finish.x, 0.82),
          finish.y - lift * 0.14,
          finish.z,
        ),
        finish,
      );
      const support = mesh(
        shoulderGeometry(shoulder, (s.width * MM_TO_WORLD) / 2),
        bandMetal,
      );
      support.userData.isShoulder = true;
      shoulderCurves.push(shoulder);
    }
  }

  if (s.paveStyle === "Petite French") {
    const placedPave = [];
    const full = s.paveCoverage === "Full band";
    const tiny = Math.min(0.072, s.width * MM_TO_WORLD * 0.24);
    const r = radius + BAND_OUTER + 0.009;
    const count = Math.floor((Math.PI * 2 * r) / (tiny * 2 + 0.014));
    const step = (Math.PI * 2) / count;
    const halfHead = Math.max(
      ...specs.map((spec) => Math.abs(spec.position.x) + spec.halfWidth),
    );
    const clearAngle = Math.max(
      shoulderCurves.length ? 1.03 : 0,
      Math.asin(Math.min(0.9, (halfHead + 0.03) / r)),
    );
    const angles = Array.from({ length: count }, (_, i) => i * step - Math.PI);
    for (const a of angles) {
      if (Math.abs(a) < clearAngle || (!full && Math.abs(a) > 1.2)) continue;
      gem(
        "Round",
        tiny,
        V(Math.sin(a) * r, Math.cos(a) * r - 0.25),
        ring,
        V(Math.sin(a), Math.cos(a)),
      );
      placedPave.push({
        point: V(Math.sin(a) * r, Math.cos(a) * r - 0.25),
        scale: tiny,
      });
      for (const sign of [-1, 1]) {
        const z = sign * tiny * 0.88;
        // Short grains rise from the shank to clasp the edge of each melee.
        // Keeping them near the stone avoids floating beads at the band edge.
        const rootR = radius + BAND_OUTER - 0.035;
        const beadR = r + 0.008;
        tube(
          [
            V(Math.sin(a) * rootR, Math.cos(a) * rootR - 0.25, z),
            V(Math.sin(a) * beadR, Math.cos(a) * beadR - 0.25, z),
          ],
          0.011,
          bandMetal,
        );
        const bead = mesh(new THREE.SphereGeometry(0.016, 20, 14), bandMetal);
        bead.position.set(Math.sin(a) * beadR, Math.cos(a) * beadR - 0.25, z);
      }
    }
    // Follow raised shoulders instead of putting the diamonds underneath
    // them on the original circular shank.
    for (const curve of shoulderCurves) {
      const count = Math.max(
        2,
        Math.ceil((curve.getLength() * 0.87) / (tiny * 2 + 0.018)) + 1,
      );
      for (let i = 0; i < count; i++) {
        const u = 0.03 + (i / Math.max(1, count - 1)) * 0.83;
        const point = curve.getPointAt(u);
        const direction = new THREE.Vector3()
          .crossVectors(curve.getTangentAt(u), V(0, 0, 1))
          .normalize();
        if (direction.dot(V(point.x, point.y + 0.25)) < 0) direction.negate();
        const edge = THREE.MathUtils.lerp(0.075, 0.047, u);
        const rootBlend = Math.max(
          0.025,
          THREE.MathUtils.smoothstep(u, 0, 0.26),
        );
        const center = point
          .clone()
          .addScaledVector(direction, edge * rootBlend + 0.009);
        const radial = V(center.x, center.y + 0.25);
        if (radial.length() < r) {
          direction.copy(radial).normalize();
          center
            .copy(direction)
            .multiplyScalar(r)
            .add(V(0, -0.25, point.z));
        }
        const scale = tiny * THREE.MathUtils.lerp(1, 0.76, u);
        if (
          placedPave.some(
            (existing) =>
              existing.point.distanceTo(center) <
              existing.scale + scale + 0.009,
          )
        )
          continue;
        placedPave.push({ point: center.clone(), scale });
        gem("Round", scale, center, ring, direction);
        for (const sign of [-1, 1]) {
          const grain = mesh(
            new THREE.SphereGeometry(0.013, 16, 12),
            bandMetal,
          );
          grain.position.copy(center).add(V(0, 0, sign * scale * 0.92));
        }
      }
    }
  }
  if (s.surprise === "Add stones")
    for (const sign of [-1, 1])
      gem(
        "Round",
        0.071,
        V(0, bandTop + 0.04, sign * 0.15),
        ring,
        V(0, 0, sign),
      );
  if (s.wedding) {
    const band = mesh(bandGeometry(s, radius, 1.7), bandMetal);
    band.position.z = ((s.width + 1.7) * MM_TO_WORLD) / 2 + 0.018;
  }
  if (s.engraving) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `72px ${s.engravingStyle === "Cursive" ? '"Segoe Script", "Snell Roundhand", cursive' : "Arial, sans-serif"}`;
    ctx.fillStyle = "rgba(255,246,209,0.65)";
    ctx.fillText(s.engraving, 514, 67, 970);
    ctx.fillStyle = "rgba(65,49,25,0.78)";
    ctx.fillText(s.engraving, 512, 64, 970);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const positions = [],
      uvs = [],
      indices = [],
      count = 64,
      depthSegments = 8,
      stride = depthSegments + 1,
      profile = bandProfile(s).getPoints(12),
      span = Math.min(1.8, 0.12 * s.engraving.length + 0.35);
    // Wrap the lettering onto the inner contour, including the comfort curve,
    // so rounding the band does not hide the engraving beneath the metal.
    const rows = Array.from({ length: stride }, (_, j) => {
      const depth = (j / depthSegments - 0.5) * Math.min(s.width * 0.11, 0.23);
      let inner = Infinity;
      for (let p = 1; p < profile.length; p++) {
        const a = profile[p - 1],
          b = profile[p];
        if (
          Math.abs(b.y - a.y) < 1e-8 ||
          depth < Math.min(a.y, b.y) ||
          depth > Math.max(a.y, b.y)
        )
          continue;
        const t = (depth - a.y) / (b.y - a.y);
        inner = Math.min(inner, a.x + t * (b.x - a.x));
      }
      return { depth, radius: radius + inner - 0.0015 };
    });
    for (let i = 0; i <= count; i++)
      for (let j = 0; j < stride; j++) {
        const a = Math.PI - span / 2 + (i / count) * span,
          { depth, radius: r } = rows[j];
        positions.push(Math.sin(a) * r, Math.cos(a) * r - 0.25, depth);
        uvs.push(1 - i / count, j / depthSegments);
        if (i < count && j < depthSegments) {
          const n = i * stride + j;
          indices.push(n, n + stride, n + 1, n + stride, n + stride + 1, n + 1);
        }
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    mesh(geo, mat);
  }
  return ring;
}
