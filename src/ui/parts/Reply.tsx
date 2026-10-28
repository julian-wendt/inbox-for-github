import { AtSign, Bold, Code, Heading, Italic, Link, List, ListOrdered, ListTodo, TextQuote, type LucideIcon } from "lucide-react";
import { ghToken } from "../../github/token";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { addComment, setOpen, type CloseReason } from "../../github/comment";
import type { Item } from "../../model";
import { t } from "../i18n";
import { applyFormat, type Format } from "../markdownFormat";
import { CloseButton } from "./CloseButton";
import { Markdown } from "./Markdown";

type Tab = "write" | "preview";

const TOOLBAR: [Format, LucideIcon][][] = [
  [
    ["heading", Heading],
    ["bold", Bold],
    ["italic", Italic],
    ["quote", TextQuote],
    ["code", Code],
    ["link", Link],
  ],
  [
    ["bullets", List],
    ["numbers", ListOrdered],
    ["tasks", ListTodo],
  ],
  [["mention", AtSign]],
];

/** A close or reopen the viewer made, with the reason the item had been closed for before, so undo can put it back. */
export interface StateWrite {
  action: "close" | "reopen";
  reason?: CloseReason;
  before?: CloseReason;
}

/** Why the item was last closed, if it was closed as not planned; else completed. */
function lastCloseReason(item: Item): CloseReason {
  const closed = item.activities.filter((a) => a.kind === "state" && a.change === "closed").at(-1);
  return closed?.kind === "state" && closed.reason === "NOT_PLANNED" ? "NOT_PLANNED" : "COMPLETED";
}

const SHORTCUTS: Record<string, Format> = { b: "bold", i: "italic", e: "code", k: "link" };

/** Unsent text per item id; lives as long as the app, so switching items keeps a draft. */
const drafts = new Map<string, string>();

/**
 * Composer for a plain comment on the item, modeled on GitHub's comment box: Write and Preview
 * tabs, a Markdown toolbar (also ⌘B, ⌘I, ⌘E, ⌘K while typing), and a green Comment button.
 * Sends with the button or ⌘↵; Escape leaves the field. On success the draft is cleared and
 * `onSent` runs, typically reloading the item so it moves to where the answer puts it; on failure
 * the text stays and the error shows below it.
 *
 * Next to Comment sits the close or reopen button (see `CloseButton`); with text in the box it
 * posts the comment first, as GitHub does.
 *
 * @param item    The issue or pull request to comment on.
 * @param me      The viewer's login, to highlight self-mentions in the preview.
 * @param onSent  Called after GitHub accepted the comment or the state change, with the state change if there was one.
 * @param fieldHeight  Set when docked below the thread: the field's height in pixels, sized by
 *                     the dock's drag handle; the heading is left out.
 *
 * @example
 *   <Reply item={item} me={me} onSent={() => void inbox.reloadItem(item.id)} />
 */
export function Reply({ item, me, onSent, fieldHeight }: { item: Item; me: string; onSent: (change?: StateWrite) => void; fieldHeight?: number }) {
  const docked = fieldHeight !== undefined;
  const sized = docked ? { height: fieldHeight } : undefined;
  const itemId = item.id;
  const [text, setText] = useState(() => drafts.get(itemId) ?? "");
  const [tab, setTab] = useState<Tab>("write");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const selection = useRef<[number, number] | null>(null);

  useLayoutEffect(() => {
    if (!selection.current || !field.current) return;
    field.current.focus();
    field.current.setSelectionRange(...selection.current);
    selection.current = null;
  });

  const edit = (value: string) => {
    setText(value);
    if (value) drafts.set(itemId, value);
    else drafts.delete(itemId);
  };

  const send = async (state?: { action: "close" | "reopen"; reason?: CloseReason }) => {
    if ((!text.trim() && !state) || sending) return;
    setSending(true);
    setError(null);
    let posted = false;
    try {
      const token = await ghToken();
      if (text.trim()) {
        await addComment(token, itemId, text);
        posted = true;
        edit("");
      }
      if (state) await setOpen(token, item, state.action, state.reason);
      setTab("write");
      onSent(state && { ...state, before: lastCloseReason(item) });
    } catch (e) {
      setError(String(e));
      // The comment is on GitHub even though the state change failed; show it.
      if (posted) onSent();
    } finally {
      setSending(false);
    }
  };

  const format = (f: Format) => {
    const el = field.current;
    if (!el) return;
    const result = applyFormat(text, el.selectionStart, el.selectionEnd, f);
    selection.current = [result.start, result.end];
    edit(result.text);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const shortcut = e.metaKey && tab === "write" ? SHORTCUTS[e.key.toLowerCase()] : undefined;
    if (shortcut) {
      // ⌘K formats a link here instead of opening the palette.
      e.preventDefault();
      e.stopPropagation();
      format(shortcut);
    } else if (e.key === "Enter" && e.metaKey) {
      e.preventDefault();
      void send();
    } else if (e.key === "Escape") {
      // Keeps the window-wide Escape (reset view) from firing while leaving the field.
      e.stopPropagation();
      field.current?.blur();
    }
  };

  return (
    <section className={`reply${docked ? " docked" : ""}`} onKeyDown={onKeyDown} aria-label={t("reply.title")}>
      {!docked && <h3 className="section-title">{t("reply.title")}</h3>}
      <div className="comment-box">
        <div className="comment-head">
          <div className="comment-tabs" role="tablist">
            {(["write", "preview"] as const).map((id) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
                {t(`reply.${id}`)}
              </button>
            ))}
          </div>
          {tab === "write" && (
            <div className="comment-toolbar">
              {TOOLBAR.map((group, i) => (
                <div key={i} className="comment-tools">
                  {group.map(([f, Icon]) => (
                    <button key={f} className="icon-btn" title={t(`format.${f}`)} aria-label={t(`format.${f}`)} onMouseDown={(e) => e.preventDefault()} onClick={() => format(f)}>
                      <Icon size={15} />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="comment-body">
          {tab === "write" ? (
            <textarea
              ref={field}
              className="reply-field"
              value={text}
              onChange={(e) => edit(e.target.value)}
              placeholder={t("reply.placeholder")}
              rows={5}
              style={sized}
              disabled={sending}
            />
          ) : (
            <div className="reply-preview" style={sized}>{text.trim() ? <Markdown source={text} me={me} /> : <p className="md-empty">{t("reply.nothing")}</p>}</div>
          )}
        </div>
      </div>
      {error && (
        <small className="reply-error" role="alert">
          {t("reply.failed", { error })}
        </small>
      )}
      <div className="reply-actions">
        <small>{t("reply.hint")}</small>
        <div className="reply-buttons">
          <CloseButton item={item} withText={!!text.trim()} busy={sending} onAction={(action, reason) => void send({ action, reason })} />
          <button className="btn success" onClick={() => void send()} disabled={!text.trim() || sending} title="⌘↵">
          {sending ? t("reply.sending") : t("reply.send")}
        </button>
        </div>
      </div>
    </section>
  );
}
