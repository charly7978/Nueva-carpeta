import { motion } from 'framer-motion';
import { AlertTriangle, Activity } from 'lucide-react';

const ALERT = '#ff3366';
const signed = (v) => (v == null ? '--' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`);

/** Ritmo: verde si es regular, rojo parpadeante ante cualquier arritmia */
export function RhythmBadge({ rhythm }) {
  const sev = rhythm?.severity;
  const arr = sev === 'warn' || sev === 'alert';
  const color = arr ? ALERT : sev === 'ok' ? '#00ff88' : '#94a3b8';

  return (
    <div className="min-w-0 select-none">
      <motion.span
        animate={arr ? { opacity: [1, 0.45, 1], scale: [1, 1.02, 1] } : { opacity: 1, scale: 1 }}
        transition={arr ? { repeat: Infinity, duration: 1.0, ease: 'easeInOut' } : { duration: 0.2 }}
        className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[9px] font-semibold tracking-[0.14em] sm:text-[10px] backdrop-blur-md"
        style={{
          borderColor: `${color}55`,
          color,
          background: `${color}18`,
          boxShadow: `0 0 16px ${color}25`,
        }}
      >
        {arr ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 animate-bounce" />
        ) : (
          <Activity className="h-3 w-3 shrink-0" />
        )}
        <span className="truncate">
          {arr ? `ALERTA · ${rhythm.short}` : rhythm?.short || 'ANALIZANDO RITMO'}
        </span>
      </motion.span>
      <p className="mt-1 line-clamp-2 max-w-[220px] text-[10px] leading-snug text-white/50 sm:max-w-sm">
        {rhythm?.detail || rhythm?.label || 'Comprobando estabilidad de intervalos'}
      </p>
    </div>
  );
}

/** Pico y valle del último latido + calidad de la señal (SQI) */
export function LastBeatReadout({ last, sqi }) {
  const lit = Math.ceil((sqi / 100) * 5);
  const qColor = sqi >= 70 ? '#00ff88' : sqi >= 45 ? '#fbbf24' : sqi >= 20 ? '#fb923c' : '#ef4444';

  return (
    <div className="shrink-0 text-right select-none">
      <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-white/40">
        Último latido
      </p>
      <p className="tabular font-mono text-[12px] font-medium leading-tight sm:text-sm">
        <span style={{ color: '#00ff88', textShadow: '0 0 10px rgba(0,255,136,0.3)' }}>
          ▲ {signed(last?.peak)}
        </span>
        <span className="ml-2" style={{ color: '#38bdf8', textShadow: '0 0 10px rgba(56,189,248,0.3)' }}>
          ▼ {signed(last?.valley)}
        </span>
      </p>
      <div className="mt-1.5 flex items-center justify-end gap-1.5">
        <div className="flex items-end gap-[3px]">
          {Array.from({ length: 5 }, (_, i) => (
            <motion.span
              key={i}
              className="w-[3px] rounded-full transition-colors duration-300"
              style={{
                height: `${5 + i * 2.5}px`,
                background: i < lit ? qColor : 'rgba(255,255,255,0.12)',
                boxShadow: i < lit ? `0 0 6px ${qColor}` : 'none',
              }}
            />
          ))}
        </div>
        <span className="font-mono text-[9px] text-white/50 tabular">
          SQI {sqi}%
        </span>
      </div>
    </div>
  );
}

/** Resplandor rojo en los bordes mientras haya una arritmia */
export function AlertGlow({ level }) {
  if (level !== 'warn' && level !== 'alert') return null;
  const strong = level === 'alert';
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-20"
      style={{
        boxShadow: `inset 0 0 ${strong ? 110 : 70}px rgba(255,51,102,${strong ? 0.45 : 0.28})`,
      }}
      animate={{ opacity: [0.6, 1, 0.6] }}
      transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }}
    />
  );
}