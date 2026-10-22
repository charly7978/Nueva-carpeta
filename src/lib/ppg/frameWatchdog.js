/** Withdraw stale readings even when the camera stops delivering callbacks.
 * No samples, timestamps or beat events are manufactured by the watchdog.
 */
export class FrameWatchdog {
  constructor(onStall) {
    this.onStall = onStall;
    this.timer = null;
    this.last = 0;
    this.stalled = false;
    this.visibility = () => { if (document.hidden) this.stall(); };
  }
  start() {
    this.tick();
    this.timer = setInterval(() => {
      if (performance.now() - this.last > 750) this.stall();
    }, 250);
    document.addEventListener('visibilitychange', this.visibility);
  }
  tick() { this.last = performance.now(); this.stalled = false; }
  stall() {
    if (this.stalled) return;
    this.stalled = true;
    this.onStall();
  }
  stop() {
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.visibility);
  }
}