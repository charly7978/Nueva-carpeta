import { motion, AnimatePresence } from 'framer-motion';
import { Heart } from 'lucide-react';
import HrTrend from '@/components/monitor/HrTrend';

export default function HeartRateReadout({ bpm, irregular, beatId, arrhythmia, tacho, held }) {
  const toneColor = held
    ? '#94a3b8'
    : arrhythmia
    ? '#ff3366'
    : bpm != null
    ? '#00ff88'
    : '#94a3b8';

  const glowShadow = held || bpm == null
    ? 'none'
    : arrhythmia
    ? '0 0 32px rgba(255, 51, 102, 0.45)'
    : '0 0 32px rgba(0, 255, 136, 0.45)';

  return (
    <div className="flex max-w-full items-start gap-3 select-none">
      {/* Indicador de Latido con Ondas de Choque Concéntricas */}
      <div className="relative mt-2 flex items-center justify-center">
        {/* Anillo de choque expansivo al latir */}
        <AnimatePresence>
          {beatId > 0 && !held && (
            <motion.div
              key={beatId}
              initial={{ scale: 0.8, opacity: 0.9 }}
              animate={{ scale: 2.2, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.65, ease: 'easeOut' }}
              className="absolute inset-0 rounded-full border"
              style={{
                borderColor: arrhythmia ? '#ff3366' : '#00ff88',
                boxShadow: `0 0 15px ${arrhythmia ? '#ff3366' : '#00ff88'}`,
              }}
            />
          )}
        </AnimatePresence>

        <motion.div
          key={beatId ? `beat-${beatId}` : 'beat-idle'}
          animate={beatId ? { scale: [1, 1.22, 1] } : { scale: 1 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="relative grid h-10 w-10 place-items-center rounded-2xl border backdrop-blur-md shadow-lg"
          style={{
            borderColor: `${toneColor}40`,
            background: `${toneColor}18`,
            color: toneColor,
            boxShadow: `0 0 20px ${toneColor}25`,
          }}
        >
          <Heart
            className="h-5 w-5"
            fill={bpm != null && !held ? 'currentColor' : 'none'}
          />
        </motion.div>
      </div>

      {/* Lectura numérica monumental */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">
            {held ? 'Última lectura válida' : irregular ? 'Frecuencia Media (Irregular)' : 'Frecuencia Cardíaca'}
          </p>
          {arrhythmia && (
            <span className="rounded-md border border-red-500/40 bg-red-500/20 px-1.5 py-0.2 font-mono text-[8px] font-bold tracking-wider text-red-400 animate-pulse">
              ARRITMIA
            </span>
          )}
        </div>

        <div className="flex items-baseline gap-2">
          <motion.span
            key={bpm ?? 'nobpm'}
            initial={{ opacity: 0.6, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="tabular font-mono text-[clamp(48px,11.5vmin,112px)] font-light leading-none tracking-tight text-white"
            style={{
              textShadow: glowShadow,
              color: arrhythmia ? '#ff4d6a' : held ? '#94a3b8' : '#ffffff',
            }}
          >
            {bpm ?? '--'}
          </motion.span>

          <span
            className="font-mono text-[12px] font-semibold tracking-wider"
            style={{ color: toneColor }}
          >
            BPM
          </span>
        </div>

        {held ? (
          <p className="mt-1 font-mono text-[10px] text-amber-400/90 animate-pulse">
            Recuperando señal óptica…
          </p>
        ) : (
          <HrTrend tacho={tacho} />
        )}
      </div>
    </div>
  );
}