import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildRing } from "../src/ring-model.js";
import { defaults } from "../src/config.js";

function firstVisibleFace(mesh, origin, direction) {
  mesh.updateWorldMatrix(true, false);
  return new THREE.Raycaster(
    new THREE.Vector3(...origin),
    new THREE.Vector3(...direction),
  ).intersectObject(mesh)[0];
}

test("The near band surface hides the back surface for every profile and fit", () => {
  for (const bandStyle of ["Round", "Square"]) {
    for (const fit of ["Standard Fit", "Comfort Fit"]) {
      const band = buildRing({ ...defaults, bandStyle, fit }).children[0];
      const front = firstVisibleFace(band, [1.43, -0.25, 3], [0, 0, -1]);
      assert.ok(front, `${bandStyle}, ${fit}: visible front face`);
      assert.ok(
        front.point.z > 0.12,
        `${bandStyle}, ${fit}: the nearest surface is in front, not behind`,
      );
      assert.ok(front.face.normal.z > 0.6, "front normal faces the viewer");
      const outside = firstVisibleFace(band, [0, 5, 0], [0, -1, 0]);
      assert.ok(outside.point.y > 1.28, "the outer rim hides the inner rim");
      assert.ok(
        outside.face.normal.y > 0.6,
        "the outer normal faces away from the hole",
      );
    }
  }
});

test("A matching wedding band also has visible outward-facing surfaces", () => {
  const ring = buildRing({ ...defaults, wedding: true });
  const wedding = ring.children.at(-1);
  const front = firstVisibleFace(wedding, [1.43, -0.25, 3], [0, 0, -1]);
  assert.ok(front.point.z > wedding.position.z + 0.12);
  assert.ok(front.face.normal.z > 0.6);
});

test("Polished band shading is continuous at both closed seams", () => {
  for (const bandStyle of ["Round", "Square"])
    for (const fit of ["Standard Fit", "Comfort Fit"])
      for (const width of [1.5, 4]) {
        const band = buildRing({ ...defaults, bandStyle, fit, width })
          .children[0];
        const positions = band.geometry.getAttribute("position");
        const normals = band.geometry.getAttribute("normal");
        const matching = new Map();
        const point = new THREE.Vector3(),
          normal = new THREE.Vector3();
        let seamVertices = 0;
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i);
          normal.fromBufferAttribute(normals, i);
          assert.ok(
            Math.abs(normal.length() - 1) < 0.0001,
            "finite unit normal",
          );
          const key = point
            .toArray()
            .map((v) => Math.round(v * 100000))
            .join(",");
          if (matching.has(key)) {
            assert.ok(
              normal.dot(matching.get(key)) > 0.9999,
              `${bandStyle}, ${fit}, ${width}: no lighting break at the seam`,
            );
            seamVertices++;
          } else matching.set(key, normal.clone());
        }
        assert.ok(seamVertices > 100, "both closed seams were checked");
      }
});
