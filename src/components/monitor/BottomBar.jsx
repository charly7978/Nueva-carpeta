import { motion } from 'framer-motion';
import { ListOrdered, Square } from 'lucide-react';
import { triggerHaptic, HapticPattern } from '@/utils/haptics';

const pad = (n) => String(n).padStart(2, '0');

export default function BottomBar({ elapsed, target, extended, onStop, onOpenRecord }) {
  const pct = Math.min(100, (elapsed / target) * 100);

  const handleStop = () => {
    triggerHaptic(HapticPattern.STOP);
    onStop();
  };

  const handleOpenRecord = () => {
    triggerHaptic(HapticPattern.SELECTION);
    onOpenRecord();
  };

  return (
    <footer className="relative z-40 flex shrink-0 items-center gap-3 pb-[max(env(safe-area-inset-bottom),10px)] pl-[max(env(safe-area-inset-left),14px)] pr-[max(env(safe-area-inset-right),14px)] pt-2.5 bg-gradient-to-t from-background via-background/80 to-transparent">
      {/* Barra de telemetría y progreso de escaneo */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between mb-1.5">
          <div className="flex items-baseline gap-2">
            <span className="tabular font-mono text-xl font-light leading-none text-white tracking-tight">
              {pad(Math.floor(elapsed / 60))}:{pad(elapsed % 60)}
            </span>
            <span className="font-mono text-[10px] tracking-[0.2em] text-white/40">
              / {target}s
            </span>
          </div>

          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-primary font-medium">
            {extended ? 'HRV EXTENDIDO' : 'REGISTRO ACTIVO'} · {Math.round(pct)}%
          </span>
        </div>

        {/* Barra de progreso con punta brillante tipo láser */}
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10 shadow-inner">
          <motion.div
            className="relative h-full rounded-full transition-all duration-300 ease-linear"
            style={{
              width: `${pct}%`,
              background: extended
                ? 'linear-gradient(90deg, #7c5cff, #c4b5fd)'
                : 'linear-gradient(90deg, #00d977, #00ff88)',
              boxShadow: extended
                ? '0 0 14px rgba(139,124,255,0.7)'
                : '0 0 14px rgba(0,255,136,0.7)',
            }}
          />
        </div>
      </div>

      {/* Botón de Registro */}
      <motion.button
        type="button"
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleOpenRecord}
        className="flex h-11 items-center gap-2 rounded-2xl border border-white/12 bg-white/[0.06] px-3.5 text-[12px] font-semibold text-white/90 backdrop-blur-md transition-colors hover:bg-white/10"
      >
        <ListOrdered className="h-4 w-4 text-primary" />
        <span>Registro</span>
      </motion.button>

      {/* Botón de Detener */}
      <motion.button
        type="button"
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleStop}
        className="flex h-11 items-center gap-2 rounded-2xl border border-red-500/40 bg-red-500/15 px-4 text-[12px] font-semibold text-red-400 backdrop-blur-md transition-all hover:bg-red-500/25 shadow-[0_0_20px_rgba(239,68,68,0.2)]"
      >
        <Square className="h-3.5 w-3.5 fill-current" />
        <span>Detener</span>
      </motion.button>
    </footer>
  );
}