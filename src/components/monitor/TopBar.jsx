import { Activity, Maximize2, Minimize2, Volume2, VolumeX } from 'lucide-react';
import { motion } from 'framer-motion';
import { triggerHaptic, HapticPattern } from '@/utils/haptics';

const MODE_META = {
  standby: { label: 'EN ESPERA', color: '#94a3b8', dot: '#94a3b8' },
  nofinger: { label: 'COLOCA EL DEDO', color: '#fbbf24', dot: '#fbbf24' },
  acquiring: { label: 'ADQUIRIENDO', color: '#fbbf24', dot: '#fbbf24' },
  artifact: { label: 'AJUSTANDO SEÑAL', color: '#f59e0b', dot: '#f59e0b' },
  recovering: { label: 'RECUPERANDO', color: '#22d3ee', dot: '#22d3ee' },
  live: { label: 'EN VIVO · BLOQUEADO', color: '#00ff88', dot: '#00ff88' },
  error: { label: 'SIN SEÑAL', color: '#ef4444', dot: '#ef4444' },
};

function Chip({ color, dotColor, pulse = false, children }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] font-medium tracking-[0.16em] backdrop-blur-md transition-colors"
      style={{
        borderColor: `${color}40`,
        color,
        background: `${color}15`,
        boxShadow: `0 0 12px ${color}1a`,
      }}
    >
      {dotColor && (
        <span
          className={`h-1.5 w-1.5 rounded-full ${pulse ? 'animate-ping' : ''}`}
          style={{ background: dotColor }}
        />
      )}
      {children}
    </span>
  );
}

export default function TopBar({ mode, simulated, fullscreen, cue, sqi }) {
  const meta = MODE_META[mode] || MODE_META.standby;

  const handleCueToggle = () => {
    triggerHaptic(HapticPattern.SELECTION);
    cue.toggle();
  };

  const handleFullscreenToggle = () => {
    triggerHaptic(HapticPattern.SELECTION);
    fullscreen.toggle();
  };

  return (
    <header className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-2.5 pb-2 pl-[max(env(safe-area-inset-left),14px)] pr-[max(env(safe-area-inset-right),14px)] pt-[max(env(safe-area-inset-top),10px)]">
      {/* Logotipo y estado del canal */}
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="relative grid h-8 w-8 place-items-center rounded-xl border border-primary/30 bg-primary/10 shadow-[0_0_15px_rgba(0,255,136,0.2)]">
          <Activity className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-[16px] font-bold leading-none tracking-tight text-white flex items-center gap-1">
            Vital<span className="text-primary">Scan</span>
          </h1>
          <span className="font-mono text-[8px] uppercase tracking-[0.24em] text-white/40 block mt-0.5">
            CH-01 · 60 FPS
          </span>
        </div>
      </div>

      {/* Badges de estado, SQI y controles */}
      <div className="flex items-center gap-2 max-[360px]:w-full max-[360px]:justify-end">
        {simulated && (
          <Chip color="#c4b5fd" dotColor="#a78bfa">
            SIMULADOR
          </Chip>
        )}

        {mode === 'live' && sqi > 0 && (
          <Chip
            color={sqi >= 75 ? '#00ff88' : sqi >= 45 ? '#fbbf24' : '#ef4444'}
            dotColor={sqi >= 75 ? '#00ff88' : sqi >= 45 ? '#fbbf24' : '#ef4444'}
            pulse={sqi >= 75}
          >
            SQI {sqi}%
          </Chip>
        )}

        <Chip color={meta.color} dotColor={meta.dot}>
          {meta.label}
        </Chip>

        {/* Control de Audio / Aviso sonoro */}
        {cue && (
          <motion.button
            type="button"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={handleCueToggle}
            aria-label={cue.enabled ? 'Silenciar el aviso de latido' : 'Activar el aviso de latido'}
            className="grid h-8 w-8 place-items-center rounded-xl border transition-all"
            style={{
              borderColor: cue.enabled ? 'rgba(0,255,136,0.35)' : 'rgba(255,255,255,0.1)',
              background: cue.enabled ? 'rgba(0,255,136,0.12)' : 'rgba(255,255,255,0.03)',
              color: cue.enabled ? '#00ff88' : 'rgba(255,255,255,0.45)',
              boxShadow: cue.enabled ? '0 0 14px rgba(0,255,136,0.2)' : 'none',
            }}
          >
            {cue.enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </motion.button>
        )}

        {/* Control de Pantalla Completa */}
        {fullscreen.supported && (
          <motion.button
            type="button"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={handleFullscreenToggle}
            aria-label={fullscreen.isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-white/70 transition-all hover:bg-white/10 hover:text-white"
          >
            {fullscreen.isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </motion.button>
        )}
      </div>
    </header>
  );
}