import { motion } from 'framer-motion';
import { Activity, ChevronRight } from 'lucide-react';
import { formatWhen, summarize } from '@/lib/vitalRecords';
import { triggerHaptic, HapticPattern } from '@/utils/haptics';

/** Una lectura guardada: se abre para corregirla o se borra desde la papelera */
export default function RecordRow({ record, onEdit }) {
  const handleClick = () => {
    triggerHaptic(HapticPattern.SELECTION);
    onEdit(record);
  };

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.01, x: 2 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 text-left transition-all hover:bg-white/[0.07] hover:border-primary/30"
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
        <Activity className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[9px] uppercase tracking-[0.2em] text-white/45">
          {formatWhen(record.created_date)}
        </span>
        <span className="block truncate text-[13px] font-medium text-white/90">
          {summarize(record)}
        </span>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
    </motion.button>
  );
}