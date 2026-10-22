import { AlertTriangle, Info } from 'lucide-react';

const LEVEL = {
  alert: { color: '#ff4d5e', Icon: AlertTriangle },
  warn: { color: '#fbbf24', Icon: AlertTriangle },
  info: { color: '#94a3b8', Icon: Info },
};

/** Cribado del historial: promedios de las lecturas guardadas y alertas acumuladas. */
export default function HistorySummary({ history }) {
  if (!history) return null;

  return (
    <section className="space-y-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
      <header className="flex items-baseline justify-between gap-2">
        <h4 className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/40">Historial</h4>
        <span className="shrink-0 font-mono text-[9px] text-white/35">{history.eligibleCount} / {history.count} aceptadas</span>
      </header>

      {history.alerts.length > 0 ? (
        <div className="space-y-1.5">
          {history.alerts.map((a) => {
            const { color, Icon } = LEVEL[a.level] || LEVEL.info;
            return (
              <div key={a.title} className="flex items-start gap-2">
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color }} />
                <p className="text-[11px] leading-snug text-white/70">
                  <span className="font-medium" style={{ color }}>{a.title}</span>
                  <span className="text-white/40"> · {a.count} lectura(s)</span>
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] leading-snug text-primary/80">
          Sin umbrales repetidos en lecturas aceptadas; no descarta alteraciones.
        </p>
      )}

      <p className="text-[10px] leading-snug text-muted-foreground">Solo señal con calidad verificada; datos antiguos sin esa comprobación excluidos. SpO₂ y presión estimadas no activan alertas clínicas.</p>
      <div className="grid gap-x-4 sm:grid-cols-2">
        {history.averages.map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-2 border-b border-white/[0.05] py-1.5 last:border-b-0"
          >
            <span className="min-w-0 flex-1 text-[11px] leading-snug text-white/50">{r.label}</span>
            <span className="tabular shrink-0 font-mono text-[11px] text-white/85">
              {r.value}
              {r.unit ? <span className="ml-0.5 text-[8px] text-white/30">{r.unit}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}