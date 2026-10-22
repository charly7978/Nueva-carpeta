import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { CameraOff, ScanLine } from 'lucide-react';

/**
 * CameraPreview — vista del dedo sobre la cámara.
 * El elemento <video> lo crea el motor; aquí solo se monta en el DOM y se
 * muestra a tamaño completo. La guía de la zona de lectura coincide con el
 * recorte central que el motor promedia para extraer la señal.
 * `compact` lo reduce a una miniatura dentro del monitor.
 */
export default function CameraPreview({ video, simulated, active, compact = false }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !video) return;

    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    video.style.display = 'block';
    host.appendChild(video);

    return () => {
      if (video.parentNode === host) host.removeChild(video);
    };
  }, [video]);

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: '#04070d' }}>
      <div ref={hostRef} className="h-full w-full" />

      {video ? (
        <>
          {!compact && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="h-[54%] w-[54%] rounded-full border border-dashed border-primary/30" />
            </div>
          )}
          <div
            className={`pointer-events-none absolute flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-black/50 ${
              compact ? 'bottom-1 left-1 px-1.5 py-[2px]' : 'left-2.5 top-2.5 px-2 py-0.5'
            }`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: active ? '#00ff88' : '#64748b' }}
            />
            <span
              className={`font-mono uppercase tracking-[0.2em] text-white/55 ${compact ? 'text-[7px]' : 'text-[8px]'}`}
            >
              Cámara
            </span>
          </div>
        </>
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <div className={`flex flex-col items-center text-center ${compact ? 'gap-1 px-1' : 'gap-2 px-4'}`}>
            <motion.div
              className={`grid place-items-center rounded-full border border-white/10 bg-white/[0.04] ${
                compact ? 'h-6 w-6' : 'h-9 w-9'
              }`}
              animate={active ? { scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] } : { opacity: 0.6 }}
              transition={active ? { repeat: Infinity, duration: 2.6, ease: 'easeInOut' } : { duration: 0.3 }}
            >
              {active ? (
                <ScanLine className={compact ? 'h-3 w-3 text-accent' : 'h-4 w-4 text-accent'} />
              ) : (
                <CameraOff className={compact ? 'h-3 w-3 text-white/35' : 'h-4 w-4 text-white/35'} />
              )}
            </motion.div>
            {!compact && (
              <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-white/40">
                {simulated && active ? 'Señal de verificación' : active ? 'Cámara no disponible' : 'Cámara inactiva'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}