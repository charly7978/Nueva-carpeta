import { median } from '@/lib/dsp';
import { SpatialMotionGuard } from '@/lib/ppg/spatialMotion';

/** Frame-domain checks BEFORE interpolation/filtering. Thresholds are engineering
 * gates, not proof that an accepted optical fluctuation is physiological. */
export class ArtifactGuard {
  constructor() { this.reset(); }
  reset() {
    this.previous = null;
    this.diffs = [[], [], []];
    // Fast physiological upstrokes can exceed 1% per frame. Hard jumps use
    // a higher floor; accumulated spatial motion and per-pulse checks stay on.
    this.thresholds = [0.025, 0.025, 0.025];
    this.spatialMotion = new SpatialMotionGuard();
    this.until = -Infinity;
    this.lastStats = -Infinity;
    this.bad = false;
  }

  update(t, rgb, usable, spatial, contact, selected) {
    const p = this.previous;
    let bad = !contact || !usable[selected];
    bad ||= this.spatialMotion.update(t, spatial, usable, selected);
    let diff = null;
    let level = 0;
    if (p && t > p.t && t - p.t <= 0.2) {
      const frameScale = Math.max(1, Math.min(3, 30 * (t - p.t)));
      diff = rgb.map((v, c) => usable[c] && p.usable[c]
        ? (v - p.rgb[c]) / Math.max(12, (v + p.rgb[c]) / 2) / frameScale : 0);
      const jumps = diff.map((v, c) => Math.abs(v) > this.thresholds[c]);
      const structural = jumps[selected] || jumps.filter(Boolean).length >= 2;
      // micro: salto entre 0.6× y 1× del umbral adaptativo, o residuo fuera de banda elevado
      let micro = false;
      if (!structural && diff) {
        const nearThreshold = diff.some((v, c) => {
          if (!usable[c] || !p.usable[c]) return false;
          return Math.abs(v) > 0.6 * this.thresholds[c] && Math.abs(v) <= this.thresholds[c];
        });
        micro = nearThreshold;
      }
      const a = spatial?.[selected], b = p.spatial?.[selected];
      let spatialBad = false;
      if (usable[selected] && p.usable[selected] && a?.length === 4 && b?.length === 4) {
        const rms = Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / 4);
        if (rms > 0.025 * frameScale) spatialBad = true;
      }
      if (structural || spatialBad) { level = 2; bad = true; }
      else if (micro) { level = 1; }
      else { level = 0; }
      bad ||= level === 2;
    } else {
      bad = bad || false;
    }
    // Elevado residuo fuera de banda del guardia: micro
    // (placeholder: se mantiene simple)
    this.bad = bad;
    this.level = level;
    // Cuarentena: sólo nivel 2 fija until; nunca extender si ya en cuarentena
    if (level === 2 && t >= this.until) {
      this.until = t + 0.6;
    }
    const disturbed = t < this.until;
    // Do not teach the noise baseline to accept movement while quarantined.
    if (!disturbed && diff && level === 0) {
      diff.forEach((v, c) => {
        if (!usable[c] || !p.usable[c]) return;
        this.diffs[c].push(v);
        if (this.diffs[c].length > 90) this.diffs[c].shift();
      });
      if (t - this.lastStats >= 0.2) {
        this.lastStats = t;
        this.thresholds = this.diffs.map(a => {
          const center = median(a);
          const mad = 1.4826 * median(a.map(v => Math.abs(v - center)));
          return Math.max(0.025, Math.min(0.08, Math.abs(center) + 8 * mad));
        });
      }
    }
    this.previous = { t, rgb: [...rgb], usable: [...usable], spatial };
    return level;
  }
}