// Clock-driven interaction state keeps idle motion predictable and testable.
// OrbitControls supplies the turntable movement; no independent timers run.
export class IdleRotation {
  constructor(
    { enabled = false, delay = 0, ramp = 450, speed = 4.8 } = {},
    now = 0,
  ) {
    this.enabled = enabled;
    this.delay = delay;
    this.ramp = ramp;
    this.speed = speed;
    this.resumeAt = now + delay;
    this.startedAt = null;
    this.holds = new Set();
    this.blocks = new Set();
  }
  interact(now) {
    this.resumeAt = now + this.delay;
    this.startedAt = null;
  }
  hold(key, now) {
    this.holds.add(key);
    this.interact(now);
  }
  release(key, now) {
    if (this.holds.delete(key)) this.interact(now);
  }
  clearHolds(now) {
    this.holds.clear();
    this.interact(now);
  }
  block(key, blocked, now) {
    const changed = blocked ? !this.blocks.has(key) : this.blocks.has(key);
    if (blocked) this.blocks.add(key);
    else this.blocks.delete(key);
    if (changed) this.interact(now);
  }
  setEnabled(enabled, now, immediate = false) {
    this.enabled = Boolean(enabled);
    this.interact(now);
    if (enabled && immediate) this.resumeAt = now;
  }
  sample(now) {
    const ready =
      this.enabled &&
      !this.holds.size &&
      !this.blocks.size &&
      now >= this.resumeAt;
    if (!ready) this.startedAt = null;
    else if (this.startedAt === null) this.startedAt = now;
    const t = ready
      ? Math.min(1, Math.max(0, (now - this.startedAt) / this.ramp))
      : 0;
    const speed = this.speed * t * t * (3 - 2 * t);
    return { enabled: this.enabled, spinning: speed > 0, speed };
  }
}
