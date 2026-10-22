import { useState } from 'react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Trash2, Save, FileEdit } from 'lucide-react';
import { RECORD_FIELDS } from '@/lib/vitalRecords';
import { triggerHaptic, HapticPattern } from '@/utils/haptics';

const inputCls =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] text-white/95 outline-none focus:border-primary/60 focus:bg-white/[0.07] transition-all font-mono';

/** Editor de una lectura guardada: corrige sus cifras y notas, o la elimina. */
export default function RecordEditor({ record, onOpenChange, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => {
    const d = {};
    RECORD_FIELDS.forEach((f) => {
      d[f.key] = record[f.key] == null ? '' : String(record[f.key]);
    });
    d.notes = record.notes || '';
    return d;
  });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  const handleSave = async () => {
    triggerHaptic(HapticPattern.SUCCESS);
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
    triggerHaptic(HapticPattern.WARNING);
    setBusy(true);
    await onDelete(record.id);
    setBusy(false);
    onOpenChange(false);
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-[28px] border border-white/12 bg-card/95 p-5 sm:max-w-md shadow-2xl backdrop-blur-2xl">
        <DialogHeader className="pb-2 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
              <FileEdit className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="font-display text-lg font-bold text-white">
                Editar Registro Fisiológico
              </DialogTitle>
              <DialogDescription className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/45">
                Ajuste manual de telemetría y observaciones
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2.5 pt-2">
          {RECORD_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-white/45 truncate">
                {f.label} {f.unit ? `(${f.unit})` : ''}
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

        <label className="block mt-2">
          <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-white/45">
            Notas Clínicas y Síntomas
          </span>
          <textarea
            rows={3}
            value={draft.notes}
            onChange={set('notes')}
            placeholder="Contexto de la medición, síntomas, medicación previa…"
            className={`${inputCls} resize-none font-sans`}
          />
        </label>

        <div className="flex items-center gap-2.5 pt-3">
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleSave}
            disabled={busy}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl py-3 text-[13px] font-bold text-[#021008] shadow-[0_8px_20px_rgba(0,255,136,0.25)] transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #00ff88, #00cc6a)' }}
          >
            <Save className="h-4 w-4" />
            <span>Guardar Cambios</span>
          </motion.button>

          {confirming ? (
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleDelete}
              disabled={busy}
              className="rounded-2xl border border-red-500/50 bg-red-500/20 px-3.5 py-3 text-[12px] font-semibold text-red-300 disabled:opacity-50"
            >
              Confirmar
            </motion.button>
          ) : (
            <motion.button
              type="button"
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => {
                triggerHaptic(HapticPattern.WARNING);
                setConfirming(true);
              }}
              aria-label="Eliminar lectura"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-red-500/35 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20"
            >
              <Trash2 className="h-4 w-4" />
            </motion.button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}