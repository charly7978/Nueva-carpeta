import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { HeartHandshake } from 'lucide-react';
import { triggerHaptic, HapticPattern } from '@/utils/haptics';

/** Ancla la estimación óptica con una lectura real de manguito */
export default function BpCalibrationDialog({ open, onOpenChange, calibration, features, onSave, onClear }) {
  const [sbp, setSbp] = useState('');
  const [dbp, setDbp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setSbp(''); setDbp(''); setBusy(false); setError(''); }
  }, [open]);

  const s = Number(sbp);
  const d = Number(dbp);
  const valid = Number.isInteger(s) && Number.isInteger(d)
    && s >= 70 && s <= 250 && d >= 40 && d <= 150 && s > d;

  const submit = async () => {
    if (!valid || busy) return;
    triggerHaptic(HapticPattern.SUCCESS);
    setBusy(true);
    setError('');
    try {
      await onSave({ sbp: s, dbp: d });
      onOpenChange(false);
    } catch (e) {
      setError(e.message || 'No se pudo guardar la referencia.');
    } finally { setBusy(false); }
  };

  const clear = async () => {
    if (busy) return;
    triggerHaptic(HapticPattern.LIGHT);
    setBusy(true);
    setError('');
    try { await onClear(); onOpenChange(false); }
    catch (e) { setError(e.message || 'No se pudo quitar la referencia.'); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-[28px] border border-white/12 bg-card/95 p-5 shadow-2xl backdrop-blur-2xl">
        <DialogHeader className="pb-2 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl border border-purple-400/30 bg-purple-400/10 text-purple-300">
              <HeartHandshake className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="font-display text-lg font-bold text-white">
                Calibración Arterial (PWA)
              </DialogTitle>
              <DialogDescription className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/45">
                Anclaje óptico con esfigmomanómetro
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <p className="text-xs text-white/65 leading-relaxed pt-1">
          Introduce la lectura sistólica y diastólica tomada con un tensiómetro de manguito. El modelo PWA calibrará la distensibilidad del pulso digital en función de tu presión arterial de referencia.
        </p>

        <div className="space-y-3.5 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="bp-sbp" className="block font-mono text-[9px] uppercase tracking-[0.16em] text-white/50">
                Sistólica (mmHg)
              </label>
              <input
                id="bp-sbp"
                inputMode="numeric"
                placeholder="120"
                value={sbp}
                onChange={(e) => setSbp(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 font-mono text-base text-white outline-none focus:border-purple-400/60 focus:bg-white/[0.07] transition-all"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="bp-dbp" className="block font-mono text-[9px] uppercase tracking-[0.16em] text-white/50">
                Diastólica (mmHg)
              </label>
              <input
                id="bp-dbp"
                inputMode="numeric"
                placeholder="80"
                value={dbp}
                onChange={(e) => setDbp(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 font-mono text-base text-white outline-none focus:border-purple-400/60 focus:bg-white/[0.07] transition-all"
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5">
            <p className="text-[11px] text-white/60 leading-snug">
              {features
                ? `Morfología capturada: ${features.beats} latidos · Aumento AIx: ${Math.round(features.aix * 100)}% · Cresta: ${features.crest} ms`
                : 'Sin onda válida todavía: la calibración se activará automáticamente al estabilizarse el pulso.'}
            </p>
          </div>

          {error && <p role="alert" className="text-xs text-red-400 font-medium">{error}</p>}

          {calibration?.at && (
            <p className="text-[11px] font-mono text-purple-300/80">
              Calibración actual: {calibration.sbp}/{calibration.dbp} mmHg · {new Date(calibration.at).toLocaleDateString('es-ES')}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2">
          {calibration && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={clear}
              disabled={busy}
              className="rounded-xl border border-white/10 px-3 py-2.5 text-xs text-white/60 hover:text-white transition-colors"
            >
              Quitar calibración
            </motion.button>
          )}
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={submit}
            disabled={!valid || busy}
            className="flex-1 rounded-xl py-2.5 text-xs font-bold text-[#021008] shadow-[0_8px_20px_rgba(196,181,253,0.3)] transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #c4b5fd, #8b7cff)' }}
          >
            Calibrar Referencia
          </motion.button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}