import { AnimatePresence, motion } from "motion/react";
import { t } from "../i18n";

export interface ToastMessage {
  id: number;
  text: string;
  /** Shown as a button with its shortcut; omitted for plain notices. */
  undo?: () => void;
}

export function Toast({ toast }: { toast: ToastMessage | null }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          className="toast"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <span>{toast.text}</span>
          {toast.undo && (
            <button className="toast-undo" onClick={toast.undo}>
              {t("toast.undo")} <kbd>Z</kbd>
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
