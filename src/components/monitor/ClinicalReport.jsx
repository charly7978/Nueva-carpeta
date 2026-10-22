import { useState } from 'react';
import { FileDown, Mail, AlertTriangle, Info, Check, FileText } from 'lucide-react';
import { downloadReportPdf } from '@/lib/clinicalReport';
import HistorySummary from './HistorySummary';

const LEVEL = {
  alert: { color: '#ff4d5e', Icon: AlertTriangle },
  warn: { color: '#fbbf24', Icon: AlertTriangle },
  info: { color: '#94a3b8', Icon: Info },
};

function Row({ label, value, unit }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-white/[0.05] py-1.5 last:border-b-0">
      <span className="min-w-0 flex-1 text-[11px] leading-snug text-white/50">{label}</span>
      <span className="tabular shrink-0 font-mono text-[11px] text-white/85">
        {value}
        {unit ? <span className="ml-0.5 text-[8px] text-white/30">{unit}</span> : null}
      </span>
    </div>
  );
}

/** Resumen clínico de la última medición: promedios, variabilidad y alertas, con descarga y envío del PDF. */
export default function ClinicalReport({ report, onEmail }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleEmail = async () => {
    setSending(true);
    await onEmail(report);
    setSending(false);
    setSent(true);
  };

  return (
    <section
      className="space-y-3 rounded-2xl border border-primary/25 p-3.5"
      style={{ background: 'linear-gradient(180deg, rgba(0,255,136,0.07), rgba(255,255,255,0.015))' }}
    >
      <header className="flex items-start gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10">
          <FileText className="h-4 w-4 text-primary" />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-[15px] font-semibold leading-none">Informe clínico</h3>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-white/40">
            Última medición · {new Date(report.generatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </header>

      {report.alerts.length > 0 && (
        <div className="space-y-1.5">
          {report.alerts.map((a, i) => {
            const { color, Icon } = LEVEL[a.level] || LEVEL.info;
            return (
              <div
                key={i}
                className="flex items-start gap-2 rounded-xl border px-2.5 py-2"
                style={{ borderColor: `${color}55`, background: `${color}14` }}
              >
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color }} />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium" style={{ color }}>{a.title}</p>
                  <p className="text-[10px] leading-snug text-white/50">{a.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-x-4 sm:grid-cols-2">
        <div>
          <p className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-white/35">Valores promedio</p>
          {report.averages.map((r) => <Row key={r.label} {...r} />)}
        </div>
        <div>
          <p className="mb-0.5 mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-white/35 sm:mt-0">Variabilidad (HRV)</p>
          {report.variability.map((r) => <Row key={r.label} {...r} />)}
        </div>
      </div>

      <HistorySummary history={report.history} />

      <div className="flex gap-2">
        <button
          onClick={() => downloadReportPdf(report)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-semibold text-[#04120b]"
          style={{ background: 'linear-gradient(135deg,#00ff88,#00cc6a)' }}
        >
          <FileDown className="h-3.5 w-3.5" />
          Descargar PDF
        </button>
        <button
          onClick={handleEmail}
          disabled={sending || sent}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.05] py-2.5 text-[12px] font-medium text-white/85 disabled:opacity-60"
        >
          {sent ? <Check className="h-3.5 w-3.5 text-primary" /> : <Mail className="h-3.5 w-3.5" />}
          {sent ? 'Enviado' : sending ? 'Enviando…' : 'Enviar por correo'}
        </button>
      </div>
    </section>
  );
}