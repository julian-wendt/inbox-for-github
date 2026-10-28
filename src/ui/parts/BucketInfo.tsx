import { Lightbulb } from "lucide-react";
import { useEffect, useState } from "react";
import type { Reopen } from "../../model";
import { bucketHelp } from "../explain";
import { t } from "../i18n";
import type { View } from "../labels";

/**
 * Light-bulb button for the list header; opens a short overview of what the bucket holds and how
 * items leave or return, with a link to all rules. Closes on a click anywhere or on Escape.
 *
 * @example
 *   <BucketInfo bucket="inbox" reopenOn="mention" onShowRules={() => setDialog("rules")} />
 */
export function BucketInfo({ bucket, reopenOn, onShowRules }: { bucket: View; reopenOn: Reopen; onShowRules: () => void }) {
  const [open, setOpen] = useState(false);
  const help = bucketHelp(bucket, reopenOn);

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  return (
    <span className="bulb">
      <button className="chip-btn" aria-expanded={open} title={t("list.bucketInfo")} onClick={() => setOpen(!open)}>
        <Lightbulb size={14} />
      </button>
      {open && (
        <>
          <div className="popover-backdrop" onMouseDown={() => setOpen(false)} />
          <div className="popover" role="dialog" aria-label={t("list.bucketInfo")}>
            <strong>{help.lead}</strong>
            <ul>
              {help.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <button
              className="link-btn"
              onClick={() => {
                setOpen(false);
                onShowRules();
              }}
            >
              {t("list.allRules")}
            </button>
          </div>
        </>
      )}
    </span>
  );
}
