import test from "node:test";
import assert from "node:assert/strict";
import { IdleRotation } from "../src/idle-rotation.js";

test("idle rotation starts immediately, eases into a fast turn, and stops on contact", () => {
  const motion = new IdleRotation({ enabled: true }, 1000);
  assert.equal(motion.sample(1000).speed, 0);
  assert.ok(motion.sample(1225).speed > 0);
  assert.ok(motion.sample(1225).speed < 4.8);
  assert.equal(motion.sample(1450).speed, 4.8);
  motion.hold("finger", 1500);
  assert.equal(motion.sample(20000).spinning, false);
  motion.release("finger", 20000);
  assert.equal(motion.sample(20000).speed, 0);
  motion.sample(20000);
  assert.equal(motion.sample(20450).speed, 4.8);
});

test("releasing one of several contacts cannot restart the turntable", () => {
  const motion = new IdleRotation({ enabled: true });
  motion.hold("finger-one", 2000);
  motion.hold("finger-two", 2200);
  motion.release("finger-one", 2400);
  assert.equal(motion.sample(20000).spinning, false);
  motion.release("finger-two", 21000);
  assert.equal(motion.sample(21000).speed, 0);
  motion.sample(21000);
  assert.equal(motion.sample(21450).speed, 4.8);
});

test("pointer-free activity postpones motion and manual pause remains off", () => {
  const motion = new IdleRotation({ enabled: true });
  motion.sample(0);
  assert.equal(motion.sample(450).spinning, true);
  motion.interact(500);
  assert.equal(motion.sample(500).speed, 0);
  assert.equal(motion.sample(950).speed, 4.8);
  motion.setEnabled(false, 1000);
  assert.equal(motion.sample(999999).spinning, false);
  motion.setEnabled(true, 1000000, true);
  motion.sample(1000000);
  assert.equal(motion.sample(1000450).speed, 4.8);
});

test("modal, hidden-tab, and offscreen pauses resume only after every blocker clears", () => {
  const motion = new IdleRotation({ enabled: true });
  motion.block("modal", true, 1000);
  motion.block("hidden-tab", true, 1500);
  motion.block("offscreen", true, 2000);
  motion.block("modal", false, 3000);
  motion.block("hidden-tab", false, 4000);
  assert.equal(motion.sample(20000).spinning, false);
  motion.block("offscreen", false, 21000);
  assert.equal(motion.sample(21000).speed, 0);
  motion.sample(21000);
  assert.equal(motion.sample(21450).speed, 4.8);
});

test("clearing a lost pointer preserves other pauses and defaults stay still", () => {
  const still = new IdleRotation();
  assert.equal(still.sample(999999).spinning, false);
  const motion = new IdleRotation({ enabled: true });
  motion.hold("lost-pointer", 1000);
  motion.block("hidden-tab", true, 2000);
  motion.clearHolds(2100);
  assert.equal(motion.sample(99999).spinning, false);
  motion.block("hidden-tab", false, 100000);
  assert.equal(motion.sample(100000).speed, 0);
  motion.sample(100000);
  assert.equal(motion.sample(100450).speed, 4.8);
});
