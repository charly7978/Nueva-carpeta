import { useEffect, useState } from 'react';
import { Hand, Waves, CheckCircle2 } from 'lucide-react';
import signalFeedback from '@/lib/ppg/signalFeedback';

const TONES = {
  warn: 'border-chart-4/40 text-chart-4',
  info: 'border-accent/40 text-accent',
  ok: 'border-primary/30 text-primary',
};

export default function FeedbackOverlay(props) {
  const fb = signalFeedback(props);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setHidden(false);
    if (fb?.key !== 'locked') return;
    const timer = setTimeout(() => setHidden(true), 1800);
    return () => clearTimeout(timer);
  }, [fb?.key]);
  if (!fb || hidden) return null;
  const Icon = fb.key === 'finger' ? Hand : fb.key === 'locked' ? CheckCircle2 : Waves;
  return (
    <div role="status" aria-live="polite" className={`pointer-events-none absolute inset-x-3 bottom-[4.75rem] z-20 rounded-xl border bg-card/95 p-2.5 ${TONES[fb.tone]}`}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold leading-snug">{fb.title}</p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{fb.detail}</p>
        </div>
      </div>
      {fb.progress != null && <div role="progressbar" aria-label="Ajuste de captura" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fb.progress * 100)} className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${fb.progress * 100}%` }} />
      </div>}
    </div>
  );
}