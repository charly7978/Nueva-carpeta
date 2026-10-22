import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Hand, Waves, CheckCircle2 } from 'lucide-react';
import signalFeedback from '@/lib/ppg/signalFeedback';

const TONES = {
  warn: {
    border: 'border-amber-400/50',
    bg: 'bg-amber-950/40',
    text: 'text-amber-300',
    iconColor: 'text-amber-400',
    glow: 'rgba(251, 191, 36, 0.15)',
  },
  info: {
    border: 'border-cyan-400/50',
    bg: 'bg-cyan-950/40',
    text: 'text-cyan-300',
    iconColor: 'text-cyan-400',
    glow: 'rgba(34, 211, 238, 0.15)',
  },
  ok: {
    border: 'border-primary/50',
    bg: 'bg-emerald-950/40',
    text: 'text-primary',
    iconColor: 'text-primary',
    glow: 'rgba(0, 255, 136, 0.2)',
  },
};

export default function FeedbackOverlay(props) {
  const fb = signalFeedback(props);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(false);
    if (fb?.key !== 'locked') return;
    const timer = setTimeout(() => setHidden(true), 2000);
    return () => clearTimeout(timer);
  }, [fb?.key]);

  if (!fb || hidden) return null;

  const tone = TONES[fb.tone] || TONES.info;
  const Icon = fb.key === 'finger' ? Hand : fb.key === 'locked' ? CheckCircle2 : Waves;

  return (
    <AnimatePresence>
      <motion.div
        key={fb.key}
        initial={{ opacity: 0, y: 12, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.95 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        role="status"
        aria-live="polite"
        className={`pointer-events-none absolute inset-x-3 bottom-[4.85rem] z-20 overflow-hidden rounded-2xl border p-3 backdrop-blur-2xl shadow-2xl ${tone.border} ${tone.bg}`}
        style={{
          boxShadow: `0 12px 30px -10px rgba(0,0,0,0.8), 0 0 20px ${tone.glow}`,
        }}
      >
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-white/10 ${tone.iconColor}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-[13px] font-bold tracking-tight leading-snug ${tone.text}`}>
              {fb.title}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-white/70">
              {fb.detail}
            </p>
          </div>
        </div>

        {fb.progress != null && (
          <div
            role="progressbar"
            aria-label="Ajuste de captura"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(fb.progress * 100)}
            className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10"
          >
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-accent to-primary shadow-[0_0_10px_#22d3ee]"
              initial={{ width: 0 }}
              animate={{ width: `${fb.progress * 100}%` }}
              transition={{ duration: 0.25 }}
            />
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}