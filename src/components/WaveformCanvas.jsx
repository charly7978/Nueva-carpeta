/**
 * WaveformCanvas — trazado de la morfología del pulso a pantalla completa.
 * ─────────────────────────────────────────────────────────────
 * Fidelidad primero:
 *  · Dibuja el canal de MORFOLOGÍA (0,1–10 Hz, orden 2): conserva escotadura
 *    dicrótica, pico diastólico y frente sistólico. El canal de detección sigue
 *    siendo otro; dibujar bien y detectar bien son problemas distintos.
 *  · Escala LINEAL con ganancia automática suave: toda la traza se multiplica
 *    por el mismo factor, así que la forma queda intacta. La compresión muestra
 *    a muestra que había antes aplanaba los picos en mesetas falsas.
 *  · Interpolación PCHIP: pasa por cada muestra y no sobreoscila.
 *  · Regla real en pantalla: % de modulación AC/DC y segundos.
 *
 * Rendimiento: el motor escribe en un TraceStore fuera de React y este lienzo lo
 * lee en su propio bucle; ningún fotograma de cámara provoca un render.
 */
import { useRef, useEffect } from 'react';
import { GREEN, RED, glowSprite, traceGradient, fillGradient, penColumn } from './waveform/canvasAssets';
import { createFrameRenderer } from './waveform/drawFrame';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export default function WaveformCanvas({ storeRef, rhythmRef, mode = 'live' }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  if (!stateRef.current) {
    stateRef.current = { W: 0, H: 0, dpr: 1, layers: {}, grads: {}, lay: null, sprites: null, t0: 0 };
  }
  const liveRef = useRef(mode === 'live');
  liveRef.current = mode === 'live';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return undefined;
    const s = stateRef.current;
    let raf = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const W = Math.round(canvas.clientWidth);
      const H = Math.round(canvas.clientHeight);
      if (!W || !H) return;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);

      // La banda de la onda respeta el alto que ocupa el HUD. En vertical el
      // panel de métricas se apila abajo y, sin reserva, la mitad inferior del
      // trazado —y la regla— quedaba detrás de las tarjetas. En horizontal el
      // panel va a un lado, así que la banda puede usar casi toda la altura.
      const portrait = W < 620;
      let band;
      let padTop;
      if (portrait) {
        const topReserve = Math.min(150, H * 0.22);
        // El pie del HUD en vertical suma: tarjeta de estado, fila de ritmo y
        // último latido, rejilla de métricas y barra inferior. Si la banda no
        // reserva ese alto, su regla y su leyenda caen detrás de esas piezas.
        const bottomReserve = Math.min(H * 0.45, 340);
        const usable = Math.max(180, H - topReserve - bottomReserve);
        band = clamp(usable * 0.92, 150, 460);
        padTop = topReserve + (usable - band) * 0.5;
      } else {
        band = clamp(H * 0.42, 150, 460);
        padTop = (H - band) * 0.42;
      }
      s.lay = { padTop, padBot: H - padTop - band, band, zeroY: padTop + band * 0.5 };
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

    const render = createFrameRenderer(ctx, canvas, s);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      render(storeRef?.current || null, rhythmRef?.current || null, liveRef.current);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [storeRef, rhythmRef]);

  return <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />;
}
