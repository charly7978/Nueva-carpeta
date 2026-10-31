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
    this.level = 0;
  }

  update(t, rgb, usable, spatial, contact, selected) {
    const p = this.previous;
    let bad = !contact || !usable[selected];
    const spatialMoving = this.spatialMotion.update(t, spatial, usable, selected);
    let diff = null;
    let level = 0;
    if (p && t > p.t && t - p.t <= 0.2) {
      const frameScale = Math.max(1, Math.min(3, 30 * (t - p.t)));
      diff = rgb.map((v, c) => usable[c] && p.usable[c]
        ? (v - p.rgb[c]) / Math.max(12, (v + p.rgb[c]) / 2) / frameScale : 0);
      const macroJumps = diff.map((v, c) => Math.abs(v) > Math.max(0.065, 1.8 * this.thresholds[c]));
      const structural = macroJumps[selected] || macroJumps.filter(Boolean).length >= 2;
      const microJumps = diff.map((v, c) => Math.abs(v) > this.thresholds[c]);
      const micro = microJumps[selected] || microJumps.filter(Boolean).length >= 1;

      const a = spatial?.[selected], b = p.spatial?.[selected];
      let spatialMacro = false;
      let spatialMicro = false;
      if (usable[selected] && p.usable[selected] && a?.length === 4 && b?.length === 4) {
        const rms = Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / 4);
        if (rms > 0.065 * frameScale) spatialMacro = true;
        else if (rms > 0.025 * frameScale) spatialMicro = true;
      }
      if (structural || spatialMacro) {
        level = 2;
        bad = true;
      } else if (micro || spatialMicro || spatialMoving) {
        level = 1;
      } else {
        level = 0;
      }
    } else {
      bad = bad || false;
    }
    this.bad = bad || level === 2;
    this.level = level;
    // Cuarentena: sólo nivel 2 fija until; nunca extender si ya en cuarentena
    if (level === 2 && t >= this.until) {
      this.until = t + 0.5;
    }
    const disturbed = t < this.until;
    // Aprender la línea base de variación con level <= 1 sin contaminar con macro-desplazamientos
    if (!disturbed && diff && level <= 1) {
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