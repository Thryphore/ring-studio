import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createDiamondCut } from "../src/diamond.js";
import { defaults, shapes } from "../src/config.js";
import { buildRing } from "../src/ring-model.js";
import {
  MM_TO_WORLD,
  stoneScale,
  stoneDimensions,
} from "../src/gem-proportions.js";
import {
  bezelGeometry,
  shoulderGeometry,
  prongAngles,
} from "../src/setting-geometry.js";

test("Open solitaire prong roots are covered by the band while the pavilion stays clear", () => {
  const p = new THREE.Vector3();
  for (const shape of shapes)
    for (const carat of [0.5, 5])
      for (const prongCount of ["4 Classic", "4 Compass", "6 Prong"]) {
        const ring = buildRing({ ...defaults, shape, carat, prongCount });
        ring.updateMatrixWorld(true);
        const band = ring.children[0];
        band.geometry.computeBoundingBox();
        const bandTop = band.geometry.boundingBox.max.y;
        const shankVolume = new THREE.Mesh(
          band.geometry,
          new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
        );
        shankVolume.matrixWorld.copy(band.matrixWorld);
        const head = ring.children.find((o) => o.userData.isSetting);
        const stone = head.children.find((o) => o.userData.isCenterStone);
        const diamondBounds = new THREE.Box3().setFromObject(stone, true);
        assert.ok(
          diamondBounds.min.y > bandTop + 0.12,
          `${shape}: culet clearance`,
        );
        assert.ok(
          !ring.children.some((o) => o.userData.isMount),
          "No separate pedestal",
        );
        const arms = head.children.filter((o) => o.userData.isSolitaireProng);
        assert.equal(arms.length, prongAngles(shape, prongCount).length);
        for (const arm of arms) {
          const vertices = arm.geometry.attributes.position;
          // These arms have uncapped roots. Every point on their starting
          // section must be inside the actual shank, including its rounded
          // sides. Band width alone is not a limit on the V's sideways flare.
          for (let i = 0; i <= arm.geometry.parameters.radialSegments; i++) {
            p.fromBufferAttribute(vertices, i).applyMatrix4(arm.matrixWorld);
            const hits = new THREE.Raycaster(
              p,
              new THREE.Vector3(0.17, 0.97, 0.11).normalize(),
            )
              .intersectObject(shankVolume)
              .filter(
                (hit, j, all) =>
                  j === 0 ||
                  Math.abs(hit.distance - all[j - 1].distance) > 0.00001,
              );
            assert.equal(
              hits.length % 2,
              1,
              `${shape}, ${carat}, ${prongCount}: exposed prong root`,
            );
          }
        }
        shankVolume.material.dispose();
      }
});

test("Every cut is closed and its optical planes contain the rendered stone", () => {
  const p = new THREE.Vector3();
  for (const shape of shapes) {
    const cut = createDiamondCut(shape, "#f0c562");
    cut.geometry.computeBoundingBox();
    const bounds = cut.geometry.boundingBox.getSize(new THREE.Vector3());
    const planes = cut.material.uniforms.uPlanes.value;
    assert.ok(
      bounds.y > 0.7 && planes.length >= 30 && planes.length <= 100,
      shape,
    );
    const vertices = cut.geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      p.fromBufferAttribute(vertices, i);
      for (const plane of planes)
        assert.ok(
          plane.x * p.x + plane.y * p.y + plane.z * p.z + plane.w < 0.00001,
          `${shape}: ray volume matches facets`,
        );
    }
    const actual = bounds.multiplyScalar(stoneScale(shape, 1) / MM_TO_WORLD);
    const stated = stoneDimensions(shape, 1);
    assert.ok(
      Math.abs(actual.x - stated.width) / stated.width < 0.03,
      `${shape}: width`,
    );
    assert.ok(
      Math.abs(actual.z - stated.length) / stated.length < 0.03,
      `${shape}: length`,
    );
    assert.ok(
      Math.abs(actual.y - stated.height) / stated.height < 0.005,
      `${shape}: depth`,
    );
  }
});

test("The round benchmark has a full brilliant depth and size follows carat volume", () => {
  const one = stoneDimensions("Round", 1);
  assert.equal(one.width, 6.5);
  assert.ok(one.height / one.width > 0.6 && one.height / one.width < 0.64);
  for (const shape of shapes) {
    const small = stoneDimensions(shape, 0.5),
      large = stoneDimensions(shape, 4);
    assert.ok(Math.abs(large.width / small.width - 2) < 1e-8);
    assert.ok(Math.abs(large.height / small.height - 2) < 1e-8);
  }
});

test("Small, large and multiple stones clear the curved surface of the band", () => {
  const p = new THREE.Vector3();
  for (const shape of shapes)
    for (const carat of [0.5, 5])
      for (const stoneCount of [1, 2, 3]) {
        const ring = buildRing({
          ...defaults,
          shape,
          carat,
          stoneCount,
          secondShape: shape,
          secondCarat: carat,
          thirdShape: "Round",
          thirdCarat: 0.5,
        });
        ring.updateMatrixWorld(true);
        ring.children[0].geometry.computeBoundingBox();
        const bandTop = ring.children[0].geometry.boundingBox.max.y;
        let centers = 0;
        ring.traverse((o) => {
          if (!o.userData.isCenterStone) return;
          centers++;
          const vertices = o.geometry.attributes.position;
          for (let i = 0; i < vertices.count; i++) {
            p.fromBufferAttribute(vertices, i).applyMatrix4(o.matrixWorld);
            // Side stones sit lower on the curved shank. The actual radial
            // surface, rather than its global top, determines an intersection.
            assert.ok(
              Math.abs(p.z) > (defaults.width * MM_TO_WORLD) / 2 + 0.01 ||
                Math.hypot(p.x, p.y + 0.25) >= bandTop + 0.25 + 0.005,
              `${shape}, ${carat}, ${stoneCount}: pavilion intersects the curved band`,
            );
          }
        });
        assert.equal(centers, stoneCount);
      }
});

test("Halo diamonds remain separated around round, long and pointed cuts", () => {
  for (const shape of shapes)
    for (const carat of [0.5, 5]) {
      const ring = buildRing({ ...defaults, shape, carat, basket: "Halo" });
      const head = ring.children.find((o) => o.userData.isSetting);
      const melee = head.children.filter(
        (o) => o.userData.isGem && !o.userData.isCenterStone,
      );
      assert.ok(melee.length >= 8);
      for (let i = 0; i < melee.length; i++) {
        const a = melee[i],
          b = melee[(i + 1) % melee.length];
        assert.ok(
          a.position.distanceTo(b.position) > a.scale.x + b.scale.x,
          `${shape}, ${carat}: overlapping halo stones`,
        );
      }
    }
});

test("The solid bezel has visible outer and inner walls", () => {
  const bezel = new THREE.Mesh(
    bezelGeometry("Round", 0.5, 0.45),
    new THREE.MeshBasicMaterial(),
  );
  bezel.updateMatrixWorld(true);
  const outside = new THREE.Raycaster(
    new THREE.Vector3(2, -0.05, 0),
    new THREE.Vector3(-1, 0, 0),
  ).intersectObject(bezel)[0];
  const inside = new THREE.Raycaster(
    new THREE.Vector3(0, -0.05, 0),
    new THREE.Vector3(1, 0, 0),
  ).intersectObject(bezel)[0];
  assert.ok(outside && outside.point.x > 0.54 && outside.face.normal.x > 0.7);
  assert.ok(inside && inside.point.x < 0.51 && inside.face.normal.x < -0.7);
});

test("Halo and bezel heads have room in two and three stone layouts", () => {
  for (const basket of ["Halo", "Bezel"])
    for (const stoneCount of [2, 3])
      for (const shape of shapes) {
        const ring = buildRing({
          ...defaults,
          basket,
          stoneCount,
          shape,
          carat: 3,
          secondShape: shape,
          secondCarat: 1,
          thirdShape: "Round",
          thirdCarat: 0.5,
        });
        ring.updateMatrixWorld(true);
        const bounds = ring.children
          .filter((o) => o.userData.isSetting)
          .map((o) => new THREE.Box3().setFromObject(o, true))
          .sort((a, b) => a.min.x - b.min.x);
        for (let i = 1; i < bounds.length; i++)
          assert.ok(
            bounds[i].min.x > bounds[i - 1].max.x,
            `${basket}, ${stoneCount}, ${shape}: colliding heads`,
          );
      }
});

test("Tapered cathedral shoulders have outward-facing polished surfaces", () => {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0.5, 0),
    new THREE.Vector3(0, 1, 0),
  ]);
  const shoulder = new THREE.Mesh(
    shoulderGeometry(curve, 0.14),
    new THREE.MeshBasicMaterial(),
  );
  shoulder.updateMatrixWorld(true);
  const front = new THREE.Raycaster(
    new THREE.Vector3(1, 0.5, 0),
    new THREE.Vector3(-1, 0, 0),
  ).intersectObject(shoulder)[0];
  assert.ok(front && front.point.x > 0.04 && front.face.normal.x > 0.7);
});

test("Complete cathedral designs build for every head and stone count", () => {
  for (const basket of ["None", "Basket", "Halo", "Hidden halo", "Bezel"])
    for (const stoneCount of [1, 2, 3]) {
      const ring = buildRing({
        ...defaults,
        cathedral: "Cathedral",
        basket,
        stoneCount,
        shape: "Emerald",
        carat: 3,
      });
      assert.equal(
        ring.children.filter((o) => o.userData.isSetting).length,
        stoneCount,
      );
      ring.traverse((o) => {
        if (!o.isMesh) return;
        for (const value of o.geometry.attributes.position.array)
          assert.ok(
            Number.isFinite(value),
            `${basket}, ${stoneCount}: invalid surface`,
          );
      });
    }
});
