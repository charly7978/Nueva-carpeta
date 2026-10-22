import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import BeatLog from '../BeatLog';
import HRVPanel from '../HRVPanel';
import RecordRow from './RecordRow';
import ClinicalReport from './ClinicalReport';

/** Registro: informe de la última medición, lecturas guardadas y la sesión en curso. */
export default function RecordsSheet({ open, onOpenChange, beats, hrv, records, onEdit, report, onEmail, reportBusy, reportError, onRetryReport }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88dvh] space-y-3 overflow-y-auto border-white/10 bg-background">
        <SheetHeader>
          <SheetTitle className="font-display">Registro</SheetTitle>
          <SheetDescription className="sr-only">Lecturas guardadas y latidos de la sesión</SheetDescription>
        </SheetHeader>

        {reportBusy && <p role="status" className="py-3 text-sm text-muted-foreground">Preparando informe y comprobando la calidad del historial…</p>}
        {reportError && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{reportError}</p><button disabled={reportBusy} onClick={onRetryReport} className="rounded-lg border border-border px-3 py-2 text-foreground disabled:opacity-50">Reintentar informe</button></div>}
        {report && !reportBusy && !reportError && <ClinicalReport key={report.generatedAt} report={report} onEmail={onEmail} />}

        <section className="space-y-2">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
            Lecturas guardadas · {records.length}
          </h3>
          {records.length === 0 ? (
            <p className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-4 text-center text-[12px] text-white/40">
              Aún no hay lecturas. Al detener una medición se guarda aquí.
            </p>
          ) : (
            records.map((r) => <RecordRow key={r.id} record={r} onEdit={onEdit} />)
          )}
        </section>

        <BeatLog beats={beats} />
        {hrv && <HRVPanel hrv={hrv} />}
      </SheetContent>
    </Sheet>
  );
}