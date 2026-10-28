import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Classified } from "../classify";
import type { Status, StatusExtra, StoredStatus } from "../model";
import { untilText } from "./snooze";
import { t } from "./i18n";
import { STATUSES } from "./labels";
import type { ToastMessage } from "./parts/Toast";
import { doAgain, EMPTY_HISTORY, record, takeBack, texts, type History } from "./undoStack";

const TOAST_MS = 4000;

type Write = (nodeId: string, status: Status, extra?: StatusExtra) => Promise<void>;

/**
 * Changes with a toast and a history to walk back and forth: ⌘Z takes back the newest change and
 * goes on back through the chain, ⌘Y does the taken-back ones again, in the order they happened.
 * Each toast and the history say which change they mean, so nothing is undone unseen. A new change
 * ends what could be redone. The history lives as long as the window and keeps the last fifty.
 * Setting the status an item already has changes nothing; with `until`, it moves the follow-up date.
 *
 * @param setStatus      Persists a status, e.g. `useInbox().setStatus`.
 * @param restoreStatus  Puts a stored status back exactly, or none, e.g. `useInbox().restoreStatus`.
 * @param stored         The item's stored status right now, to remember what undo has to restore.
 * @param onTakeBack     Called with the item's id after a status change was undone, e.g. to select it again.
 * @returns `apply` to change an item's status (with `until`, a follow-up date); `announce` for any other change,
 *   with what takes it back and what does it again; `notify` for a message that is no change; `undo`, `redo`,
 *   `undoSteps` and `redoSteps` (several at once, for a pick from the history); `history` as texts, nearest first;
 *   and the toast to show.
 */
export function useStatusActions(setStatus: Write, restoreStatus: (nodeId: string, previous: StoredStatus | undefined) => Promise<void>, stored: (nodeId: string) => StoredStatus | undefined, onTakeBack?: (nodeId: string) => void) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [history, setHistory] = useState<History>(EMPTY_HISTORY);
  const kept = useRef<History>(EMPTY_HISTORY);
  const timer = useRef<number>(undefined);

  const show = useCallback((message: Omit<ToastMessage, "id">) => {
    window.clearTimeout(timer.current);
    setToast({ ...message, id: Date.now() });
    timer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const keep = useCallback((next: History) => {
    kept.current = next;
    setHistory(next);
  }, []);

  /** Takes back the newest `count` changes, newest first, and says what the last of them was. */
  const undoSteps = useCallback(
    (count: number) => {
      const { history: next, steps } = takeBack(kept.current, count);
      if (steps.length === 0) return show({ text: t("toast.nothingToUndo") });
      keep(next);
      for (const step of steps) step.undo();
      show({ text: t("toast.undoneWhat", { what: steps.length === 1 ? steps[0].text : t("toast.manySteps", { count: steps.length }) }) });
    },
    [keep, show],
  );
  const undo = useCallback(() => undoSteps(1), [undoSteps]);

  /** Does the next `count` taken-back changes again, in the order they happened. */
  const redoSteps = useCallback(
    (count: number) => {
      const { history: next, steps } = doAgain(kept.current, count);
      if (steps.length === 0) return show({ text: t("toast.nothingToRedo") });
      keep(next);
      for (const step of steps) step.redo();
      show({ text: t("toast.redoneWhat", { what: steps.length === 1 ? steps[0].text : t("toast.manySteps", { count: steps.length }) }) });
    },
    [keep, show],
  );
  const redo = useCallback(() => redoSteps(1), [redoSteps]);

  /** Shows a change and puts it into the history, with what takes it back and what does it again. */
  const announce = useCallback(
    (text: string, takeBackStep: () => void, again: () => void) => {
      keep(record(kept.current, { text, undo: takeBackStep, redo: again }));
      show({ text, undo });
    },
    [keep, show, undo],
  );

  const apply = useCallback(
    (entry: Classified, status: Status, until?: string) => {
      if (entry.item.closed) return show({ text: t("closed.noStatus", { number: entry.item.number }) });
      if (entry.status === status && until === undefined) return;
      const id = entry.item.id;
      const previous = stored(id);
      const extra: StatusExtra = until ? { until } : {};
      void setStatus(id, status, extra);
      const title = STATUSES.find((s) => s.id === status)!.title;
      announce(
        until ? t("toast.snoozedUntil", { number: entry.item.number, until: untilText(until) }) : `#${entry.item.number} → ${title}`,
        () => {
          void restoreStatus(id, previous);
          onTakeBack?.(id);
        },
        () => void setStatus(id, status, extra),
      );
    },
    [setStatus, restoreStatus, stored, onTakeBack, show, announce],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const notify = useCallback((text: string) => show({ text }), [show]);
  const listed = useMemo(() => texts(history), [history]);

  return { apply, undo, redo, undoSteps, redoSteps, history: listed, toast, notify, announce };
}
