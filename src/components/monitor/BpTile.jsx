import { motion } from 'framer-motion';
import { triggerHaptic, HapticPattern } from '@/utils/haptics';

/** Presión estimada por morfología del pulso (PWA-PPG) con anclaje a manguito */
export default function BpTile({ bp, onCalibrate }) {
  const has = bp?.sbp != null;
  const tag = !has
    ? null
    : bp.calibrated
    ? bp.stale
      ? 'CAL. ANTIGUA'
      : 'CALIBRADA'
    : 'ESTIMADA';

  const tone = has ? (bp.calibrated ? '#f0abfc' : '#c084fc') : '#94a3b8';

  const handleClick = () => {
    triggerHaptic(HapticPattern.TAP);
    if (onCalibrate) onCalibrate();
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      aria-label={
        has
          ? `Presión arterial estimada ${bp.sbp} sobre ${bp.dbp} milímetros de mercurio. Calibrar con manguito.`
          : 'Presión arterial sin estimar. Calibrar con un tensiómetro.'
      }
      className="group relative flex min-h-0 min-w-0 flex-col justify-between overflow-hidden rounded-2xl border px-3 py-2 text-left transition-all"
      style={{
        borderColor: has ? `${tone}35` : 'rgba(255, 255, 255, 0.08)',
        background: has
          ? `linear-gradient(155deg, ${tone}20 0%, rgba(4, 9, 16, 0.65) 100%)`
          : 'linear-gradient(155deg, rgba(255, 255, 255, 0.04) 0%, rgba(4, 9, 16, 0.5) 100%)',
        backdropFilter: 'blur(16px)',
        boxShadow: has ? `0 8px 24px -10px ${tone}25` : 'none',
      }}
    >
      {/* Reflejo superior */}
      <span
        className="pointer-events-none absolute inset-x-3 top-0 h-px transition-opacity duration-500"
        style={{
          opacity: has ? 0.8 : 0.2,
          background: `linear-gradient(90deg, transparent, ${tone}, transparent)`,
        }}
      />

      {/* Micro-esquina futurista */}
      <span
        className="pointer-events-none absolute top-1 right-1 h-1.5 w-1.5 border-t border-r rounded-tr"
        style={{ borderColor: `${tone}60` }}
      />

      <div className="flex min-w-0 items-center justify-between gap-1 w-full">
        <span className="truncate font-mono text-[clamp(8px,1.5vmin,11px)] font-semibold uppercase tracking-[0.16em] text-white/55">
          Presión Arterial
        </span>
        {tag && (
          <span
            className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[8px] font-semibold tracking-wider"
            style={{ background: `${tone}25`, color: tone }}
          >
            {tag}
          </span>
        )}
      </div>

      <div className="flex min-w-0 items-baseline gap-1.5 my-0.5">
        <motion.span
          key={has ? `${bp.sbp}/${bp.dbp}` : 'nobp'}
          initial={{ opacity: 0.35, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="tabular truncate font-mono text-[clamp(16px,4.2vmin,40px)] font-light leading-none tracking-tight"
          style={{
            color: has ? tone : 'rgba(255, 255, 255, 0.22)',
            textShadow: has ? `0 0 20px ${tone}45` : 'none',
          }}
        >
          {has ? `${bp.sbp}/${bp.dbp}` : '--/--'}
        </motion.span>
        <span className="shrink-0 font-mono text-[clamp(8px,1.4vmin,11px)] text-white/40">
          mmHg
        </span>
      </div>

      <span className="truncate font-mono text-[8px] tracking-wide text-white/40 group-hover:text-white/70 transition-colors">
        {has
          ? `Banda ${bp.sbpLo}–${bp.sbpHi} / ${bp.dbpLo}–${bp.dbpHi}`
          : 'Calibrar con manguito'}
      </span>
    </motion.button>
  );
}