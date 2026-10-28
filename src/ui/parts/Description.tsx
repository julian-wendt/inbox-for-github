import { AlignLeft, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type Ref } from "react";
import type { DescriptionMode } from "../../store";
import { t } from "../i18n";
import { Markdown } from "./Markdown";

/** The height of an expandable description before "Show more", in pixels: about eight lines. */
const CLAMP_PX = 176;

/**
 * The issue or pull request description in a card, shown as the viewer chose in the settings:
 *
 * - `collapsed`: only the "Description" header shows; the header (with its chevron) opens and
 *   closes the text.
 * - `full`: the whole text, always.
 * - `expandable`: a fixed height; a longer text fades out at the bottom of the card, and
 *   "Show more" opens the rest ("Show less" closes it again). A short text shows whole, without
 *   fade or button.
 *
 * @param body      The description's Markdown.
 * @param me        The viewer's login, to highlight their mentions.
 * @param mode      How the card shows the text.
 * @param innerRef  Ref to the card, for scrolling to it.
 *
 * @example
 *   <Description body={item.body} me="octocat" mode="expandable" />
 */
export function Description({ body, me, mode, innerRef }: { body: string; me: string; mode: DescriptionMode; innerRef?: Ref<HTMLDivElement> }) {
  const [open, setOpen] = useState(false);
  const [longer, setLonger] = useState(false);
  const content = useRef<HTMLDivElement>(null);

  // The text may grow after it renders (images, code blocks), so the height is watched, not read once.
  useEffect(() => {
    const el = content.current;
    if (mode !== "expandable" || !el) return;
    const measure = () => setLonger(el.scrollHeight > CLAMP_PX + 8);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [mode, body]);

  const folded = mode === "collapsed";
  const shown = mode === "full" || (folded && open) || mode === "expandable";
  const clamped = mode === "expandable" && longer && !open;

  return (
    <div ref={innerRef} className={`description${folded && open ? " open" : ""}`}>
      {folded ? (
        <button className="description-head" aria-expanded={open} onClick={() => setOpen(!open)}>
          <AlignLeft size={15} />
          <span>{t("detail.description")}</span>
          <ChevronDown size={15} className="fold-desc" aria-label={open ? t("detail.fold") : t("detail.unfold")} />
        </button>
      ) : (
        <div className="description-head static">
          <AlignLeft size={15} />
          <span>{t("detail.description")}</span>
        </div>
      )}
      {shown && (
        <div className="description-body">
          <div className={`description-text${clamped ? " clamped" : ""}`} style={clamped ? { maxHeight: CLAMP_PX } : undefined}>
            <div ref={content}>
              <Markdown source={body} me={me} />
            </div>
          </div>
          {mode === "expandable" && longer && (
            <button className="description-more" aria-expanded={open} onClick={() => setOpen(!open)}>
              {t(open ? "detail.descriptionLess" : "detail.descriptionMore")}
              <ChevronDown size={15} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
