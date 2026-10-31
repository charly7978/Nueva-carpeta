import { motion } from 'framer-motion';

/** Display numérico translúcido: deja ver la onda que pasa por debajo. */
export default function MetricTile({ label, value, unit, color, className = '' }) {
  const has = value != null;
  return (
    <div
      className={`relative flex min-h-0 min-w-0 flex-col justify-between overflow-hidden rounded-xl border px-2.5 py-1.5 backdrop-blur-sm ${className}`}
      style={{
        borderColor: has ? `${color}3d` : 'rgba(255,255,255,0.08)',
        // La traza pasa por detrás: el velo tiene que ser suficiente para que la
        // cifra se lea sin quitar la sensación de instrumento sumergido en la onda.
        background: has
          ? `linear-gradient(155deg, ${color}22, rgba(3,7,13,0.84))`
          : 'linear-gradient(155deg, rgba(255,255,255,0.05), rgba(3,7,13,0.78))',
      }}
    >
      <span
        className="pointer-events-none absolute inset-x-2 top-0 h-px transition-opacity duration-500"
        style={{
          opacity: has ? 0.75 : 0,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        }}
      />
      <span className="truncate font-mono text-[clamp(8px,1.5vmin,11px)] uppercase tracking-[0.16em] text-muted-foreground max-[360px]:text-[9px] max-[360px]:tracking-normal">
        {label}
      </span>
      <div className="flex min-w-0 items-baseline gap-1">
        <motion.span
          key={String(value)}
          initial={{ opacity: 0.35, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="tabular truncate font-mono text-[clamp(17px,5.2vmin,60px)] font-light leading-none max-[360px]:text-[20px]"
          style={{ color: has ? color : 'rgba(255,255,255,0.22)', textShadow: has ? `0 0 22px ${color}44` : 'none' }}
        >
          {has ? value : '--'}
        </motion.span>
        <span className="shrink-0 font-mono text-[clamp(7px,1.3vmin,10px)] text-white/30">{unit}</span>
      </div>
    </div>
  );
}
