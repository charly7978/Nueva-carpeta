/** Compare optical profiles over elapsed time, not just adjacent frames.
 * Detects accumulated displacement even at high camera frame rates.
 * Thresholds are conservative engineering gates, not clinical validation. */
export class SpatialMotionGuard {
  constructor() { this.reset(); }
  reset() { this.frames = []; }
  update(t, spatial, usable, selected) {
    this.frames = this.frames.filter(frame => t - frame.t <= 0.4);
    const profile = spatial?.[selected];
    if (!usable[selected] || profile?.length !== 4 || !profile.every(Number.isFinite)) return false;
    const moving = this.frames.some(frame => {
      const previous = frame.spatial?.[selected];
      if (t - frame.t < 0.1 || !frame.usable[selected] || previous?.length !== 4) return false;
      const rms = Math.sqrt(profile.reduce((sum, value, i) => sum + (value - previous[i]) ** 2, 0) / 4);
      return rms > 0.035;
    });
    this.frames.push({ t, spatial, usable: [...usable] });
    return moving;
  }
}