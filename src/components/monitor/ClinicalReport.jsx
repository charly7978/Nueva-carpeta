import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileDown, Mail, AlertTriangle, Info, Check, FileText, Database, FileSpreadsheet } from 'lucide-react';
import { downloadReportPdf } from '@/lib/clinicalReport';
import { downloadFhirJson, downloadBeatsCsv } from '@/lib/fhirExport';
import HistorySummary from './HistorySummary';
import { triggerHaptic, HapticPattern } from '@/utils/haptics';

const LEVEL = {
  alert: { color: '#ff3366', Icon: AlertTriangle, bg: 'rgba(255,51,102,0.12)', border: 'rgba(255,51,102,0.4)' },
  warn: { color: '#fbbf24', Icon: AlertTriangle, bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.4)' },
  info: { color: '#94a3b8', Icon: Info, bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.3)' },
};

function Row({ label, value, unit }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-white/[0.05] py-2 last:border-b-0">
      <span className="min-w-0 flex-1 text-[12px] leading-snug text-white/55">{label}</span>
      <span className="tabular shrink-0 font-mono text-[12px] font-semibold text-white/90">
        {value}
        {unit ? <span className="ml-1 text-[9px] text-white/40">{unit}</span> : null}
      </span>
    </div>
  );
}

/** Resumen clínico de la última medición: promedios, variabilidad y alertas, con descarga y exportación */
export default function ClinicalReport({ report, onEmail }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handlePdf = () => {
    triggerHaptic(HapticPattern.TAP);
    downloadReportPdf(report);
  };

  const handleFhir = () => {
    triggerHaptic(HapticPattern.TAP);
    downloadFhirJson(report);
  };

  const handleCsv = () => {
    triggerHaptic(HapticPattern.TAP);
    downloadBeatsCsv(report.acceptedBeats || [], report);
  };

  const handleEmail = async () => {
    triggerHaptic(HapticPattern.TAP);
    setSending(true);
    try {
      await onEmail(report);
      setSent(true);
    } catch {
      // Ignored
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-4 rounded-3xl border border-primary/30 bg-gradient-to-b from-primary/[0.08] via-card/90 to-background p-4 sm:p-5 shadow-2xl backdrop-blur-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-white/[0.08] pb-3.5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-primary/35 bg-primary/10 shadow-[0_0_15px_rgba(0,255,136,0.2)]">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-display text-[16px] font-bold text-white leading-none">
              Informe Biométrico Clínico
            </h3>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-white/45">
              Generado: {new Date(report.generatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>
        </div>

        <span className="rounded-full border border-primary/40 bg-primary/15 px-2.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-primary">
          VERIFICADO
        </span>
      </header>

      {/* Alertas clínicas */}
      {report.alerts.length > 0 && (
        <div className="space-y-2">
          {report.alerts.map((a, i) => {
            const { color, Icon, bg, border } = LEVEL[a.level] || LEVEL.info;
            return (
              <div
                key={i}
                className="flex items-start gap-2.5 rounded-2xl border p-3"
                style={{ borderColor: border, background: bg }}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} />
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold" style={{ color }}>{a.title}</p>
                  <p className="text-[11px] leading-snug text-white/70 mt-0.5">{a.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tablas de Valores y HRV */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
          <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.2em] text-primary/80 font-semibold">
            Valores Promedio Fisiológicos
          </p>
          {report.averages.map((r) => <Row key={r.label} {...r} />)}
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
          <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.2em] text-purple-300 font-semibold">
            Variabilidad y Ritmo (HRV)
          </p>
          {report.variability.map((r) => <Row key={r.label} {...r} />)}
        </div>
      </div>

      <HistorySummary history={report.history} />

      {/* Botones de acción táctiles con efectos modernos */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 pt-1">
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.96 }}
          onClick={handlePdf}
          className="flex items-center justify-center gap-2 rounded-2xl py-3 text-[12px] font-bold text-[#021008] shadow-[0_8px_20px_rgba(0,255,136,0.3)] transition-all"
          style={{ background: 'linear-gradient(135deg, #00ff88, #00cc6a)' }}
        >
          <FileDown className="h-4 w-4" />
          <span>Descargar PDF</span>
        </motion.button>

        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.96 }}
          onClick={handleEmail}
          disabled={sending || sent}
          className="flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.06] py-3 text-[12px] font-semibold text-white/90 backdrop-blur-md transition-colors hover:bg-white/10 disabled:opacity-60"
        >
          {sent ? <Check className="h-4 w-4 text-primary" /> : <Mail className="h-4 w-4" />}
          <span>{sent ? 'Enviado' : sending ? 'Enviando…' : 'Por Correo'}</span>
        </motion.button>

        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.96 }}
          onClick={handleFhir}
          className="flex items-center justify-center gap-2 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 py-3 text-[12px] font-semibold text-cyan-300 backdrop-blur-md transition-colors hover:bg-cyan-500/20"
          title="Exportar en formato estándar HL7 FHIR Observation (LOINC)"
        >
          <Database className="h-4 w-4" />
          <span>FHIR JSON</span>
        </motion.button>

        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.96 }}
          onClick={handleCsv}
          className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 py-3 text-[12px] font-semibold text-emerald-300 backdrop-blur-md transition-colors hover:bg-emerald-500/20"
          title="Exportar serie temporal completa de intervalos RR en CSV"
        >
          <FileSpreadsheet className="h-4 w-4" />
          <span>CSV Latidos</span>
        </motion.button>
      </div>
    </section>
  );
}