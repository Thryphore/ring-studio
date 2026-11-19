import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  defaults,
  applyStyle,
  sanitize,
  syncMatchingStone,
} from "../src/config.js";
import { buildRing } from "../src/ring-model.js";
import { settingSpecs } from "../src/setting-geometry.js";

test("Three-stone presets have a prominent center, balanced small sides, and supported settings", () => {
  for (const carat of [0.5, 1, 2, 5]) {
    const state = applyStyle({ ...defaults, carat }, "Three Stone");
    assert.equal(state.secondCarat, state.thirdCarat);
    assert.ok(state.secondCarat < state.carat);
    assert.equal(state.basket, "Basket");
    assert.equal(state.cathedral, "Cathedral");
    const ring = buildRing(state);
    const heads = ring.children.filter((o) => o.userData.isSetting);
    assert.ok(heads[0].position.y > heads[1].position.y);
    assert.ok(heads[0].position.y > heads[2].position.y);
    for (const mount of ring.children.filter((o) => o.userData.isMount)) {
      const height = new THREE.Box3()
        .setFromObject(mount)
        .getSize(new THREE.Vector3()).y;
      assert.ok(
        height < 0.2,
        `${carat} ct: tall unsupported pedestal (${height})`,
      );
    }
  }
});

test("Automatic side stones follow center size and matching sides, while independent choices survive saving", () => {
  let state = applyStyle({ ...defaults, carat: 1 }, "Three Stone");
  assert.equal(state.secondCarat, 0.3);
  state.carat = 2;
  syncMatchingStone(state);
  assert.equal(state.secondCarat, 0.6);
  state.secondShape = "Pear";
  state.secondCarat = 0.4;
  state.secondStoneCustomized = true;
  syncMatchingStone(state);
  assert.equal(state.thirdShape, "Pear");
  assert.equal(state.thirdCarat, 0.4);
  state.thirdShape = "Emerald";
  state.thirdCarat = 0.25;
  state.thirdStoneCustomized = true;
  state = sanitize(JSON.parse(JSON.stringify(state)));
  assert.equal(state.secondCarat, 0.4);
  assert.equal(state.thirdCarat, 0.25);
  assert.equal(state.thirdShape, "Emerald");
  state.thirdStoneCustomized = false;
  syncMatchingStone(state);
  assert.equal(state.thirdShape, "Pear");
});

test("Legacy automatic trilogy defaults are balanced without replacing explicit independent stones", () => {
  const legacy = sanitize({
    stoneCount: 3,
    carat: 0.5,
    secondShape: "Round",
    secondCarat: 0.5,
    thirdCarat: 0.5,
    basket: "None",
  });
  assert.equal(legacy.secondCarat, 0.15);
  assert.equal(legacy.thirdCarat, 0.15);
  assert.equal(legacy.basket, "Basket");
  const custom = sanitize({
    stoneCount: 3,
    carat: 1,
    secondShape: "Oval",
    secondCarat: 0.7,
    thirdShape: "Pear",
    thirdCarat: 0.4,
  });
  assert.equal(custom.secondShape, "Oval");
  assert.equal(custom.secondCarat, 0.7);
  assert.equal(custom.thirdShape, "Pear");
  assert.equal(custom.thirdCarat, 0.4);
});

test("Two-stone elevation aligns level-set tables and keeps a deliberate tiered height difference", () => {
  const state = sanitize({
    stoneCount: 2,
    shape: "Round",
    carat: 1,
    secondShape: "Emerald",
    secondCarat: 0.5,
    secondStoneCustomized: true,
    stoneElevation: "Level set",
  });
  const level = settingSpecs(state, 1.4);
  const table = (spec) => spec.position.y + spec.crown * Math.cos(spec.tilt);
  assert.ok(Math.abs(table(level[0]) - table(level[1])) < 1e-8);
  const tiered = settingSpecs(
    {
      ...state,
      stoneElevation: "Tiered",
      secondShape: "Round",
      secondCarat: 1,
    },
    1.4,
  );
  assert.ok(table(tiered[1]) - table(tiered[0]) > 0.05);
});
