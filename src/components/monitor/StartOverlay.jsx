import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import IdlePanel from './IdlePanel';

const EASE = [0.22, 1, 0.36, 1];

/** Pantalla previa a la medición, sobre el monitor en espera. Se retira al empezar. */
export default function StartOverlay({ appState, statusMsg, errorMsg, onRetry, ...idleProps }) {
  if (appState === 'running') return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="absolute inset-0 z-30 overflow-y-auto bg-background/75 backdrop-blur-md"
    >
      <div className="grid min-h-full place-items-center px-3 py-6">
        {appState === 'idle' && <IdlePanel {...idleProps} />}

        {appState === 'starting' && (
          <div className="rounded-3xl border border-white/10 bg-card/80 p-8 text-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              className="mx-auto h-9 w-9 rounded-full border-2 border-primary/20 border-t-primary"
            />
            <p className="mt-4 text-[13px] text-white/60">{statusMsg}</p>
          </div>
        )}

        {appState === 'error' && (
          <div className="w-[min(92vw,380px)] rounded-3xl border border-[rgba(239,68,68,0.3)] bg-card/90 p-5 text-center">
            <AlertTriangle className="mx-auto h-6 w-6 text-[#ef4444]" />
            <p className="mt-3 text-[13px] leading-relaxed text-white/70">{errorMsg}</p>
            <button
              onClick={onRetry}
              className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.05] py-2.5 text-[13px] font-medium text-white/85 hover:bg-white/[0.09]"
            >
              Reintentar
            </button>
            <button
              onClick={idleProps.onStartDemo}
              className="mt-2 w-full rounded-xl border border-[rgba(139,124,255,0.35)] bg-[rgba(139,124,255,0.08)] py-2.5 text-[12px] font-medium text-[#a78bfa]"
            >
              Probar el monitor sin cámara (demo)
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}