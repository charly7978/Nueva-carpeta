import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'vitalscan.cue';

/**
 * Aviso por latido real: un bip corto y una vibración, uno por cada latido que el
 * motor acepta. Se puede silenciar desde la barra superior y la preferencia se
 * recuerda entre sesiones.
 *
 * El sonido se sintetiza con la Web Audio API (no hay fichero que cargar) y el
 * contexto se crea dentro del gesto de inicio: es la única forma de que el
 * navegador —iOS sobre todo— permita reproducir audio después.
 */
export function useBeatCue() {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
  });

  const ctxRef = useRef(null);
  const lastCueRef = useRef(-Infinity);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch { /* almacenamiento no disponible */ }
  }, [enabled]);

  /** Desbloquea el audio. Debe llamarse dentro del gesto del usuario que inicia la medición. */
  const unlock = useCallback(() => {
    try {
      const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
      if (!AC) return;
      if (!ctxRef.current) ctxRef.current = new AC();
      if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
    } catch { /* sin audio disponible */ }
  }, []);

  /** Un latido: bip + vibración */
  const play = useCallback((beat) => {
    if (!enabledRef.current || !beat?.confirmed || beat.t <= lastCueRef.current) return;
    // Never replay a backlog after the browser was blocked or backgrounded.
    if (performance.now() / 1000 - beat.t > 1.2) return;
    lastCueRef.current = beat.t;

    // A long vibration at every beat can itself move the camera against the finger.
    try { navigator.vibrate?.(8); } catch { /* sin vibración */ }

    const ctx = ctxRef.current;
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t0);
      osc.frequency.exponentialRampToValueAtTime(520, t0 + 0.09);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.15);
    } catch { /* el contexto puede estar cerrado */ }
  }, []);

  const stop = useCallback(() => {
    try { navigator.vibrate?.(0); } catch { /* sin vibración */ }
  }, []);

  return { enabled, toggle: () => setEnabled((v) => !v), unlock, play, stop };
}