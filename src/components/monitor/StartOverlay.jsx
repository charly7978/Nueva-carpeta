import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';
import IdlePanel from './IdlePanel';
import { triggerHaptic, HapticPattern } from '@/utils/haptics';

const EASE = [0.16, 1, 0.3, 1];

/** Pantalla previa a la medición sobre el monitor clínico. */
export default function StartOverlay(props) {
  const { appState, statusMsg, errorMsg, onRetry, ...idleProps } = props;
  if (appState === 'running') return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        className="absolute inset-0 z-30 overflow-y-auto bg-background/80 backdrop-blur-xl"
      >
        <div className="grid min-h-full place-items-center px-3 py-6">
          {appState === 'idle' && <IdlePanel {...idleProps} />}

          {appState === 'starting' && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="relative w-[min(90vw,360px)] overflow-hidden rounded-[26px] border border-primary/30 bg-card/90 p-8 text-center shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_30px_rgba(0,255,136,0.12)] backdrop-blur-2xl"
            >
              <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
              
              {/* Spinner de radar biométrico */}
              <div className="relative mx-auto h-16 w-16 mb-4">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                  className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary shadow-[0_0_15px_rgba(0,255,136,0.4)]"
                />
                <motion.div
                  animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.4, 0.8, 0.4] }}
                  transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                  className="absolute inset-3 rounded-full bg-primary/15"
                />
              </div>

              <h3 className="font-display text-[16px] font-bold text-white tracking-wide">
                Calibrando Óptica
              </h3>
              <p className="mt-2 font-mono text-[11px] text-white/60 leading-relaxed">
                {statusMsg || 'Iniciando pipeline fotopletismográfico…'}
              </p>
            </motion.div>
          )}

          {appState === 'error' && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="relative w-[min(92vw,400px)] overflow-hidden rounded-[26px] border border-red-500/35 bg-card/90 p-6 text-center shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_30px_rgba(239,68,68,0.15)] backdrop-blur-2xl"
            >
              <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />
              
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-red-500/30 bg-red-500/10 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.2)]">
                <AlertTriangle className="h-6 w-6" />
              </div>

              <h3 className="mt-3 font-display text-[16px] font-bold text-white">
                Acceso a Cámara no disponible
              </h3>
              <p className="mt-2 text-[12px] leading-relaxed text-white/70">
                {errorMsg}
              </p>

              <div className="mt-5 space-y-2">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    triggerHaptic(HapticPattern.TAP);
                    onRetry();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.08] py-3 text-[13px] font-semibold text-white transition-colors hover:bg-white/[0.14]"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reintentar Cámara
                </motion.button>

                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    triggerHaptic(HapticPattern.START);
                    idleProps.onStartDemo();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-purple-500/40 bg-purple-500/15 py-3 text-[12px] font-semibold text-purple-300 transition-colors hover:bg-purple-500/25"
                >
                  <Sparkles className="h-4 w-4" />
                  Probar el monitor sin cámara (Demostración)
                </motion.button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}