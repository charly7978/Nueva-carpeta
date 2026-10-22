import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { FileText, Activity, Dna, History } from 'lucide-react';
import BeatLog from '../BeatLog';
import HRVPanel from '../HRVPanel';
import RecordRow from './RecordRow';
import ClinicalReport from './ClinicalReport';
import { triggerHaptic, HapticPattern } from '@/utils/haptics';

const TABS = [
  { id: 'report', label: 'Informe', icon: FileText },
  { id: 'beats', label: 'Latidos', icon: Activity },
  { id: 'hrv', label: 'HRV', icon: Dna },
  { id: 'history', label: 'Historial', icon: History },
];

/** Registro: informe de la última medición, latidos detallados, espectro HRV e historial */
export default function RecordsSheet({
  open,
  onOpenChange,
  beats = [],
  hrv,
  records = [],
  onEdit,
  report,
  onEmail,
  reportBusy,
  reportError,
  onRetryReport,
}) {
  const [activeTab, setActiveTab] = useState('report');

  const handleTabChange = (id) => {
    triggerHaptic(HapticPattern.SELECTION);
    setActiveTab(id);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-hidden flex flex-col border-white/10 bg-card/95 backdrop-blur-3xl p-4 sm:p-6 rounded-t-[32px] shadow-[0_-20px_50px_rgba(0,0,0,0.8)]"
      >
        {/* Barra superior de arrastre táctil */}
        <div className="mx-auto h-1.5 w-12 rounded-full bg-white/20 mb-3 shrink-0" />

        <SheetHeader className="pb-2 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="font-display text-xl font-bold tracking-tight text-white">
                Registro Biométrico
              </SheetTitle>
              <SheetDescription className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
                Telemetría cardíaca y análisis fisiológico
              </SheetDescription>
            </div>

            {/* Badge de contador de lecturas */}
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
              {records.length} guardadas
            </span>
          </div>

          {/* Barra de pestañas segmentada futurista */}
          <div className="mt-3 flex rounded-xl border border-white/10 bg-white/[0.04] p-1 gap-1">
            {TABS.map((t) => {
              const active = activeTab === t.id;
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleTabChange(t.id)}
                  className="relative flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-semibold transition-colors"
                  style={{
                    color: active ? '#ffffff' : 'rgba(255,255,255,0.5)',
                  }}
                >
                  {active && (
                    <motion.div
                      layoutId="active-sheet-tab"
                      className="absolute inset-0 rounded-lg border border-primary/40 bg-primary/15 shadow-[0_0_15px_rgba(0,255,136,0.15)]"
                      transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                    />
                  )}
                  <Icon className="relative z-10 h-3.5 w-3.5" style={{ color: active ? '#00ff88' : 'currentColor' }} />
                  <span className="relative z-10">{t.label}</span>
                </button>
              );
            })}
          </div>
        </SheetHeader>

        {/* Contenido con scroll independiente por pestaña */}
        <div className="flex-1 overflow-y-auto min-h-0 pr-1 pt-2 space-y-4">
          <AnimatePresence mode="wait">
            {activeTab === 'report' && (
              <motion.div
                key="tab-report"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                {reportBusy && (
                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                      className="mx-auto h-8 w-8 rounded-full border-2 border-primary/20 border-t-primary"
                    />
                    <p className="mt-3 font-mono text-[11px] text-white/60">
                      Sintetizando informe clínico y calculando índices…
                    </p>
                  </div>
                )}

                {reportError && (
                  <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-center">
                    <p className="text-[13px] font-medium text-red-300">{reportError}</p>
                    <button
                      disabled={reportBusy}
                      onClick={onRetryReport}
                      className="mt-3 rounded-xl border border-white/12 bg-white/[0.08] px-4 py-2 text-[12px] font-medium text-white hover:bg-white/15"
                    >
                      Reintentar informe
                    </button>
                  </div>
                )}

                {report && !reportBusy && !reportError && (
                  <ClinicalReport key={report.generatedAt} report={report} onEmail={onEmail} />
                )}

                {!report && !reportBusy && !reportError && (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 text-center">
                    <FileText className="mx-auto h-8 w-8 text-white/30" />
                    <p className="mt-3 text-[13px] font-medium text-white/70">
                      Ningún informe generado en esta sesión
                    </p>
                    <p className="mt-1 text-[11px] text-white/40">
                      Completa una medición de pulso para obtener el reporte clínico.
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'beats' && (
              <motion.div
                key="tab-beats"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <BeatLog beats={beats} />
              </motion.div>
            )}

            {activeTab === 'hrv' && (
              <motion.div
                key="tab-hrv"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {hrv ? (
                  <HRVPanel hrv={hrv} />
                ) : (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 text-center">
                    <Dna className="mx-auto h-8 w-8 text-purple-400/40" />
                    <p className="mt-3 text-[13px] font-medium text-white/70">
                      Análisis HRV en espera
                    </p>
                    <p className="mt-1 text-[11px] text-white/40">
                      Requiere al menos 15 segundos continuos de pulso sin artefactos (modo 60s recomendado).
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div
                key="tab-history"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-2.5"
              >
                {records.length === 0 ? (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 text-center">
                    <History className="mx-auto h-8 w-8 text-white/30" />
                    <p className="mt-3 text-[13px] font-medium text-white/70">
                      Historial vacío
                    </p>
                    <p className="mt-1 text-[11px] text-white/40">
                      Al detener una medición válida se guardará automáticamente en este historial.
                    </p>
                  </div>
                ) : (
                  records.map((r) => <RecordRow key={r.id} record={r} onEdit={onEdit} />)
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </SheetContent>
    </Sheet>
  );
}