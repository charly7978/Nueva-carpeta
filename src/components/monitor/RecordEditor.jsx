import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Trash2 } from 'lucide-react';
import { RECORD_FIELDS } from '@/lib/vitalRecords';

const inputCls =
  'w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[13px] text-white/90 outline-none focus:border-primary/50';

/** Editor de una lectura guardada: corrige sus cifras y notas, o la elimina. */
export default function RecordEditor({ record, onOpenChange, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => {
    const d = {};
    RECORD_FIELDS.forEach((f) => { d[f.key] = record[f.key] == null ? '' : String(record[f.key]); });
    d.notes = record.notes || '';
    return d;
  });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  const handleSave = async () => {
    setBusy(true);
    const values = { notes: draft.notes.trim() };
    RECORD_FIELDS.forEach((f) => {
      const raw = draft[f.key].trim();
      values[f.key] = raw === '' ? null : Number(raw);
    });
    await onSave(record.id, values);
    setBusy(false);
    onOpenChange(false);
  };

  const handleDelete = async () => {
    setBusy(true);
    await onDelete(record.id);
    setBusy(false);
    onOpenChange(false);
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto border-white/10 bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Editar lectura</DialogTitle>
          <DialogDescription className="sr-only">
            Corrige o amplía las cifras y las notas de esta medición guardada
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {RECORD_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-white/40">
                {f.label}
                {f.unit ? ` · ${f.unit}` : ''}
              </span>
              <input
                type="number"
                inputMode="decimal"
                value={draft[f.key]}
                onChange={set(f.key)}
                className={inputCls}
              />
            </label>
          ))}
        </div>

        <label className="block">
          <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-white/40">Notas</span>
          <textarea
            rows={3}
            value={draft.notes}
            onChange={set('notes')}
            placeholder="Contexto de la medición, síntomas, medicación…"
            className={`${inputCls} resize-none`}
          />
        </label>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={busy}
            className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold text-[#04120b] disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#00ff88,#00cc6a)' }}
          >
            Guardar cambios
          </button>
          {confirming ? (
            <button
              onClick={handleDelete}
              disabled={busy}
              className="rounded-xl border border-[rgba(239,68,68,0.5)] bg-[rgba(239,68,68,0.15)] px-3 py-2.5 text-[12px] font-medium text-[#ef4444] disabled:opacity-50"
            >
              Confirmar borrado
            </button>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              aria-label="Eliminar lectura"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.1)] text-[#ef4444] transition-colors hover:bg-[rgba(239,68,68,0.2)]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}