import { Activity, ChevronRight } from 'lucide-react';
import { formatWhen, summarize } from '@/lib/vitalRecords';

/** Una lectura guardada: se abre para corregirla o se borra desde la papelera. */
export default function RecordRow({ record, onEdit }) {
  return (
    <button
      onClick={() => onEdit(record)}
      className="flex w-full items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.07]"
    >
      <Activity className="h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[9px] uppercase tracking-[0.18em] text-white/40">
          {formatWhen(record.created_date)}
        </span>
        <span className="block truncate text-[12px] text-white/80">{summarize(record)}</span>
      </span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/25" />
    </button>
  );
}