import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { CameraOff, ScanLine, Fingerprint } from 'lucide-react';

/**
 * CameraPreview — Vista del dedo sobre el sensor óptico
 * con retícula biométrica de precisión médica y haz de escaneo láser.
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
    <div className="relative h-full w-full overflow-hidden select-none bg-[#03060c]">
      <div ref={hostRef} className="h-full w-full" />

      {video ? (
        <>
          {/* Retícula biométrica de enfoque central */}
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            {/* Círculo de ROI óptico */}
            <div
              className={`rounded-full border border-dashed transition-all duration-300 ${
                active ? 'border-primary/50 shadow-[0_0_12px_rgba(0,255,136,0.3)]' : 'border-white/20'
              }`}
              style={{ width: compact ? '62%' : '54%', height: compact ? '62%' : '54%' }}
            />
          </div>

          {/* Línea de escaneo láser continuo */}
          {active && (
            <motion.div
              animate={{ y: ['0%', '100%', '0%'] }}
              transition={{ repeat: Infinity, duration: 2.2, ease: 'linear' }}
              className="pointer-events-none absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent opacity-75 shadow-[0_0_8px_#00ff88]"
            />
          )}

          {/* Esquinas de telemetría de retícula */}
          <div className="pointer-events-none absolute inset-1.5">
            <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-primary/60" />
            <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-primary/60" />
            <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-primary/60" />
            <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-primary/60" />
          </div>

          {/* Badge de cámara */}
          <div
            className={`pointer-events-none absolute flex items-center gap-1.5 rounded-full border border-white/10 bg-black/60 backdrop-blur-md ${
              compact ? 'bottom-1 left-1 px-1.5 py-[2px]' : 'left-2.5 top-2.5 px-2 py-0.5'
            }`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: active ? '#00ff88' : '#64748b',
                boxShadow: active ? '0 0 8px #00ff88' : 'none',
              }}
            />
            <span
              className={`font-mono uppercase tracking-[0.2em] text-white/70 ${
                compact ? 'text-[7px]' : 'text-[8px]'
              }`}
            >
              ÓPTICA
            </span>
          </div>
        </>
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <div className={`flex flex-col items-center text-center ${compact ? 'gap-1 px-1' : 'gap-2 px-4'}`}>
            <motion.div
              className={`grid place-items-center rounded-2xl border border-white/12 bg-white/[0.05] shadow-inner ${
                compact ? 'h-8 w-8' : 'h-10 w-10'
              }`}
              animate={active ? { scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] } : { opacity: 0.6 }}
              transition={active ? { repeat: Infinity, duration: 2.4, ease: 'easeInOut' } : { duration: 0.3 }}
            >
              {active ? (
                <Fingerprint className={compact ? 'h-4 w-4 text-primary' : 'h-5 w-5 text-primary'} />
              ) : (
                <CameraOff className={compact ? 'h-4 w-4 text-white/35' : 'h-5 w-5 text-white/35'} />
              )}
            </motion.div>
            {!compact && (
              <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-white/45">
                {simulated && active ? 'Señal de verificación' : active ? 'Cámara no disponible' : 'Cámara inactiva'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}