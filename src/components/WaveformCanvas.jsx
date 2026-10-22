/**
 * WaveformCanvas — trazado PPG a pantalla completa, a resolución nativa
 * ─────────────────────────────────────────────────────────────────────
 * Rellena todo su contenedor y lee del TraceStore directamente (nada pasa por
 * React). El lápiz avanza con el reloj real y la onda se desplaza a velocidad
 * de monitor clínico, con curva continua, columna de barrido y un pulso de
 * brillo que responde a cada latido.
 *
 * Arritmias en rojo: los latidos prematuros y las pausas se repintan en rojo
 * sobre la onda; en un ritmo irregular sostenido, toda la pantalla vira a rojo.
 * ─────────────────────────────────────────────────────────────────────
 */
import { useRef, useEffect } from 'react';
import { GREEN, RED, glowSprite, buildGridLayer, traceGradient, fillGradient, penColumn } from './waveform/canvasAssets';
import drawLiveTrace from '@/components/waveform/drawLiveTrace';
import { drawBeats } from './waveform/drawBeats';
import { drawArrhythmiaAlert } from './waveform/drawArrhythmiaAlert';
import { drawStandby } from './waveform/drawStandby';

const MAXPTS = 1024;
const UP = 2.6;     // excursión positiva visible (unidades normalizadas)
const DOWN = 1.8;   // excursión negativa visible
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Compresión suave en los extremos: una excursión enorme se achata sin cortarse en plano */
function squash(v) {
  const lim = v >= 0 ? UP : DOWN;
  const knee = lim * 0.8;
  const a = Math.abs(v);
  if (a <= knee) return v;
  const r = knee + (lim - knee) * Math.tanh((a - knee) / (lim - knee));
  return v >= 0 ? r : -r;
}

export default function WaveformCanvas({ storeRef, rhythmRef, mode = 'live' }) {
  const canvasRef = useRef(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    const px = new Float32Array(MAXPTS);
    const py = new Float32Array(MAXPTS);
    const pt = new Float64Array(MAXPTS);
    const s = { W: 0, H: 0, dpr: 1, layers: {}, grads: {}, lay: null, sprites: null, t0: 0 };
    let raf = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const W = Math.round(canvas.clientWidth);
      const H = Math.round(canvas.clientHeight);
      if (!W || !H) return;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);

      // Banda central: la onda llena la pantalla con aire arriba y abajo
      const band = clamp(H * 0.44, 140, 430);
      const padTop = (H - band) * 0.44;
      s.lay = {
        padTop,
        padBot: H - padTop - band,
        band,
        zeroY: padTop + band * (UP / (UP + DOWN)),
        k: band / (UP + DOWN),
      };
      s.layers = {};
      s.grads = {
        trOk: traceGradient(ctx, W, GREEN),
        trRed: traceGradient(ctx, W, RED),
        flOk: fillGradient(ctx, s.lay, GREEN),
        flRed: fillGradient(ctx, s.lay, RED),
        penOk: penColumn(ctx, W, GREEN),
        penRed: penColumn(ctx, W, RED),
      };
      if (!s.sprites) {
        s.sprites = { ok: glowSprite(GREEN), red: glowSprite(RED), white: glowSprite('232,255,244') };
      }
      s.W = W; s.H = H; s.dpr = dpr;
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const { W, H, dpr, lay } = s;
      if (!W || !lay) return;

      const alert = !!rhythmRef?.current?.alert;
      const rgb = alert ? RED : GREEN;
      const lk = alert ? 'Red' : 'Ok';
      if (!s.layers[lk]) s.layers[lk] = buildGridLayer(W, H, dpr, rgb, lay.zeroY);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(s.layers[lk], 0, 0, W, H);
      ctx.fillStyle = s.grads[`pen${lk}`];
      ctx.fillRect(0, 0, W, H);

      const store = storeRef?.current;
      if (modeRef.current !== 'live' || !store || store.n < 5) {
        drawStandby(ctx, W, H, s, rgb);
        return;
      }

      // Escala temporal: el lápiz está fijo cerca del borde y la onda pasa por debajo
      const pps = W < 360 ? W / 3 : clamp(W * 0.45, 150, 480);
      const penX = W - 14;
      const pen = store.penTime(performance.now() / 1000);
      const t0 = pen - penX / pps - 0.1;
      const xOf = (t) => penX + (t - pen) * pps;
      const yOf = (v) => lay.zeroY - squash(v) * lay.k;

      // Pulso de brillo: se enciende al detectar un latido y se apaga enseguida
      const beats = store.beats || [];
      let lastBeat = null;
      for (let i = beats.length - 1; i >= 0; i--) {
        if (beats[i].confirmed && !beats[i].bad) { lastBeat = beats[i]; break; }
      }
      const since = lastBeat ? pen - lastBeat.t : 9;
      const pulse = lastBeat && since >= 0 && since < 1 ? Math.exp(-since * 4.5) : 0;

      // Muestras visibles, hasta el instante del lápiz
      const first = store.firstIndex;
      let last = store.n - 1;
      while (last > first && store.timeAt(last) > pen) last--;
      let start = last;
      while (start > first && store.timeAt(start) >= t0) start--;
      let m = 0;
      for (let k = start; k <= last && m < MAXPTS; k++) {
        const t = store.timeAt(k);
        pt[m] = t; px[m] = xOf(t); py[m] = yOf(store.valueAt(k)); m++;
      }
      if (m && pt[m - 1] < pen - 1e-4 && m < MAXPTS) {
        pt[m] = pen; px[m] = xOf(pen); py[m] = yOf(store.sampleAt(pen)); m++;
      }
      if (m < 3) { drawStandby(ctx, W, H, s, rgb); return; }

      drawLiveTrace(ctx, { px, py, pt, m, lay, rgb, pulse,
        gradients: s.grads, key: lk, beats, t0, alert, width: W });

      drawBeats(ctx, {
        beats, t0, xOf, yOf, W, lay, alert, sprites: s.sprites, fs: W < 520 ? 10 : 12,
      });

      // Aviso de arritmia en tiempo real, anclado al trazo
      let flagged = false;
      for (let i = beats.length - 1; i >= 0; i--) {
        const b = beats[i];
        if (!b || b.t < t0 - 0.3) break;
        if (b.confirmed && !b.bad && !b.sus && (b.rhy === 'P' || b.rhy === 'L')) { flagged = true; break; }
      }
      drawArrhythmiaAlert(ctx, {
        alert, flagged, W, lay, label: rhythmRef?.current?.label, fs: W < 520 ? 10 : 12,
      });

      // Lápiz: barra de barrido y brillo en la punta, que late con cada pulso
      ctx.fillStyle = `rgba(${rgb},${0.3 + pulse * 0.45})`;
      ctx.fillRect(penX - 0.75, lay.padTop - 6, 1.5, lay.band + 12);
      const gsz = 38 + pulse * 28;
      ctx.globalAlpha = 0.88 + pulse * 0.12;
      if (Number.isFinite(py[m - 1])) {
        ctx.drawImage(s.sprites[alert ? 'red' : 'ok'], px[m - 1] - gsz / 2, py[m - 1] - gsz / 2, gsz, gsz);
      }
      ctx.globalAlpha = 1;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [storeRef, rhythmRef]);

  return <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />;
}