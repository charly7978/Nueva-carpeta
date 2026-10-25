/**
 * Caché de puntos fiduciales por latido.
 * ─────────────────────────────────────────────────────────────
 * Buscar P1, escotadura, P2 y pie recorre la ventana del pulso: hacerlo en cada
 * fotograma sería tirar CPU. Se calcula UNA vez, cuando la ventana del latido ya
 * llegó completa, y se guarda por id. Si el latido es tan reciente que su
 * morfología aún está entrando, no se dibuja nada: no se inventa el tramo.
 */
import { detectPulseFeatures } from '@/lib/ppg/pulseFeatures';

const MAX_ITEMS = 6;
const MAX_CACHE = 64;

/**
 * @param store TraceStore con la morfología
 * @param beats lista viva del BeatTracker
 * @param cache Map id → features
 * @returns [{ fx, flagged }] de más antiguo a más reciente
 */
export function collectFiducials(store, beats, cache) {
  const alive = new Set();
  const items = [];
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    if (!b || !b.confirmed || b.bad || b.sus) continue;
    const key = b.id != null ? b.id : Math.round(b.t * 1000);
    alive.add(key);

    let fx = cache.get(key);
    if (fx === undefined) {
      fx = detectPulseFeatures(store, b, beats[i + 1] || null);
      if (!fx) continue; // ventana incompleta: se reintenta en el siguiente fotograma
      cache.set(key, fx);
      if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
    }
    if (!fx) continue;
    items.push({ fx, flagged: b.rhy === 'P' || b.rhy === 'L' });
  }
  // Los latidos que ya salieron del tracker no dejan basura en la caché
  for (const k of cache.keys()) if (!alive.has(k)) cache.delete(k);
  return items.slice(-MAX_ITEMS);
}
