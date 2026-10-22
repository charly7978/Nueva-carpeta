/** Optional controls: keep the camera's measured values after stable contact.
 * Never guess exposure/focus, and never block capture for a device control. */
export class CaptureStabilizer {
  constructor(track, capabilities, onChange) {
    this.track = track;
    this.capabilities = capabilities;
    this.onChange = onChange;
    this.since = null;
    this.attempted = false;
    this.active = true;
  }
  stop() { this.active = false; }
  observe(optical, t) {
    if (!this.active || this.attempted) return;
    const good = optical.present && optical.confidence >= 85 && optical.usable.filter(Boolean).length >= 2;
    this.since = good ? (this.since ?? t) : null;
    if (this.since === null || t - this.since < 1.2) return;
    this.attempted = true;
    const settings = this.track.getSettings?.() || {};
    const fixed = {};
    for (const [mode, field] of [
      ['exposureMode', 'exposureTime'], ['focusMode', 'focusDistance'],
      ['whiteBalanceMode', 'colorTemperature'],
    ]) {
      const range = this.capabilities[field], value = settings[field];
      if (this.capabilities[mode]?.includes('manual') && Number.isFinite(value)
        && Number.isFinite(range?.min) && Number.isFinite(range?.max)
        && value >= range.min && value <= range.max) {
        fixed[mode] = 'manual';
        fixed[field] = value;
      }
    }
    if (!Object.keys(fixed).length) return;
    this.track.applyConstraints({ advanced: [fixed] }).then(() => {
      if (this.active && this.track.readyState === 'live') this.onChange();
    }, () => { /* Optional controls can be refused; keep native camera settings. */ });
  }
}