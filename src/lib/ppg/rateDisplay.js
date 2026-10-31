/** Presentation only: a held reading NEVER becomes accepted measurement data. */
export default class RateDisplay {
  constructor() { this.reset(); }
  reset() { this.value = null; this.at = null; }
  update(target, t) {
    if (Number.isFinite(target)) {
      const dt = this.at === null ? 0 : Math.max(0, t - this.at);
      if (this.value === null || dt > 3.5) this.value = target;
      else this.value += Math.max(-5 * dt, Math.min(5 * dt, target - this.value));
      this.at = t;
    }
    const age = this.at === null ? Infinity : Math.max(0, t - this.at);
    return { value: age <= 3.5 ? Math.round(this.value) : null,
      held: !Number.isFinite(target) && age <= 3.5, age };
  }
}