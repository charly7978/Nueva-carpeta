/** Presión estimada por morfología del pulso (PWA-PPG). Se muestra siempre con
 * su carácter estimado y su banda; el botón permite anclarla a un manguito. */
export default function BpTile({ bp, onCalibrate }) {
  const has = bp?.sbp != null;
  const tag = !has ? null : bp.calibrated ? (bp.stale ? 'CAL. ANTIGUA' : 'CALIBRADA') : 'ESTIMADA';
  const tone = has ? (bp.calibrated ? '#f0abfc' : '#c084fc') : '#94a3b8';

  return (
    <button
      type="button"
      onClick={onCalibrate}
      aria-label={has
        ? `Presión estimada ${bp.sbp} sobre ${bp.dbp} milímetros de mercurio. Calibrar con manguito.`
        : 'Presión sin estimar. Calibrar con un tensiómetro.'}
      className="relative flex min-h-0 min-w-0 flex-col justify-between overflow-hidden rounded-xl border px-2.5 py-1.5 text-left transition-colors hover:brightness-125"
      style={{
        borderColor: has ? `${tone}33` : 'rgba(255,255,255,0.07)',
        background: has
          ? `linear-gradient(155deg, ${tone}24, rgba(4,9,16,0.46))`
          : 'linear-gradient(155deg, rgba(255,255,255,0.05), rgba(4,9,16,0.4))',
      }}
    >
      <span className="flex min-w-0 items-center gap-1">
        <span className="truncate font-mono text-[clamp(8px,1.5vmin,11px)] uppercase tracking-[0.16em] text-white/45">
          Presión
        </span>
        {tag && (
          <span
            className="shrink-0 rounded px-1 py-px font-mono text-[7px] tracking-[0.08em]"
            style={{ background: `${tone}22`, color: tone }}
          >
            {tag}
          </span>
        )}
      </span>

      <div className="flex min-w-0 items-baseline gap-1">
        <span
          className="tabular truncate font-mono text-[clamp(14px,4.2vmin,42px)] font-light leading-none"
          style={{ color: has ? tone : 'rgba(255,255,255,0.22)', textShadow: has ? `0 0 22px ${tone}44` : 'none' }}
        >
          {has ? `${bp.sbp}/${bp.dbp}` : '--'}
        </span>
        <span className="shrink-0 font-mono text-[clamp(7px,1.3vmin,10px)] text-white/30">mmHg</span>
      </div>

      <span className="truncate font-mono text-[7px] text-white/35">
        {has ? `banda ${bp.sbpLo}–${bp.sbpHi} · ${bp.dbpLo}–${bp.dbpHi}` : 'Calibrar con manguito'}
      </span>
    </button>
  );
}