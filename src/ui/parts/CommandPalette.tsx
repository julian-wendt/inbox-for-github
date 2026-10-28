import { Command } from "cmdk";
import { motion } from "motion/react";
import { useRef, type ReactNode } from "react";
import type { Classified } from "../../classify";
import type { Status } from "../../model";
import { t } from "../i18n";
import { sameLogin } from "../../timeline";
import { statusesFor, type LinkFormat, type View, type VIEWS } from "../labels";
import { StatusIcon } from "./StatusIcon";
import { useGutter } from "../useGutter";
import { noteInput } from "../inputTrail";

interface Props {
  /** The views to offer under "Go to", in sidebar order (see `VIEWS`). */
  views: typeof VIEWS;
  /** The viewer's login, to offer "Assign me" only where they are not assigned. */
  me: string;
  /** The items to search, those that show in a view (see `viewOf`). */
  entries: Classified[];
  current: Classified | null;
  onClose: () => void;
  /** The undo history as texts, nearest first: what ⌘Z would take back next, and what ⌘Y would do again. */
  history: { undo: string[]; redo: string[] };
  /** Takes back the newest `count` changes. */
  onUndoSteps: (count: number) => void;
  /** Does the next `count` taken-back changes again. */
  onRedoSteps: (count: number) => void;
  onStatus: (status: Status) => void;
  onOpenCurrent: () => void;
  /** "Open in Orca", offered while Orca knows the current item's repo. */
  onOrca?: () => void;
  onUntrack: () => void;
  /** The current item counts as unread; the entry then marks it read. */
  unread: boolean;
  onToggleRead: () => void;
  /** Pins the current item for today or takes it off (P); offered while it can be pinned. */
  onToday?: () => void;
  onCopy: (format: LinkFormat) => void;
  onReload: () => void;
  onAssignMe: () => void;
  /** Opens the follow-up choices for the current item. */
  onFollowUp: () => void;
  /** Takes the follow-up date off the current item; offered while it waits for one. */
  onRemoveFollowUp?: () => void;
  /** "Remove me as assignee" (⌃U), offered while the viewer is assigned. */
  onLeave?: () => void;
  onBucket: (bucket: View) => void;
  onJump: (entry: Classified) => void;
  onRefresh: () => void;
  onSettings: () => void;
  onToggleTheme: () => void;
  /** Switches between the real data and the demo data; the window reloads. Missing when the demo is fixed by the environment. */
  onSwitchDemo?: () => void;
  /** The app shows the demo data now. */
  demo?: boolean;
  onHelp: () => void;
  onRules: () => void;
  onResetFilters: () => void;
}

/** ⌘K: fuzzy search over actions and all loaded issues and pull requests. */
export function CommandPalette(props: Props) {
  const list = useRef<HTMLDivElement>(null);
  useGutter(() => list.current);
  const run = (action: () => void) => () => {
    noteInput("palette");
    props.onClose();
    action();
  };

  return (
    <div className="overlay" onMouseDown={props.onClose}>
      <motion.div
        className="dialog palette"
        initial={{ opacity: 0, scale: 0.98, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.14, ease: [0.2, 0.8, 0.2, 1] }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Command loop onKeyDown={(e) => e.key === "Escape" && props.onClose()}>
          <Command.Input autoFocus placeholder={t("palette.placeholder")} onValueChange={() => list.current?.scrollTo({ top: 0 })} />
          <Command.List ref={list}>
            <Command.Empty>{t("palette.empty")}</Command.Empty>

            {props.current && (
              <Command.Group heading={`#${props.current.item.number} ${props.current.item.title}`}>
                {props.onLeave && (
                  <Item onSelect={run(props.onLeave)} keys="⌃U">
                    {t("unassign.action")}
                  </Item>
                )}
                {props.onRemoveFollowUp && (
                  <Item onSelect={run(props.onRemoveFollowUp)} keys="X">
                    {t("reminder.remove")}
                  </Item>
                )}
                {statusesFor(props.current).map((s) => (
                  <Item key={s.id} onSelect={run(() => (s.id === "snoozed" ? props.onFollowUp() : props.onStatus(s.id)))} icon={<StatusIcon status={s.id} />} keys={s.key}>
                    {t("palette.status", { status: s.title })}
                  </Item>
                ))}
                <Item onSelect={run(props.onOpenCurrent)} keys="⌃O">
                  {t("action.openOnGitHub")}
                </Item>
                {props.onOrca && <Item onSelect={run(props.onOrca)} keys="W">{t("orca.open")}</Item>}
                {!props.current.item.closed && !props.current.item.assignees.some((a) => sameLogin(a, props.me)) && (
                  <Item onSelect={run(props.onAssignMe)} keys="⌃A">
                    {t("assign.action")}
                  </Item>
                )}
                {props.onToday && (
                  <Item onSelect={run(props.onToday)} keys="P">
                    {t("menu.today")}
                  </Item>
                )}
                <Item onSelect={run(props.onToggleRead)} keys="R">
                  {t(props.unread ? "menu.markRead" : "menu.markUnread")}
                </Item>
                <Item onSelect={run(props.onReload)} keys="⌃R">
                  {t("action.refreshItem")}
                </Item>
                <Item onSelect={run(() => props.onCopy("url"))} keys="C">
                  {t("menu.copyLink")}
                </Item>
                <Item onSelect={run(() => props.onCopy("ref"))}>{t("menu.copyRef")}</Item>
                <Item onSelect={run(() => props.onCopy("markdown"))}>{t("menu.copyMarkdown")}</Item>
                <Item onSelect={run(props.onUntrack)}>
                  {t("untrack.action")}
                </Item>
              </Command.Group>
            )}

            <Command.Group heading={t("palette.goTo")}>
              {props.views.map((b, i) => (
                <Item key={b.id} onSelect={run(() => props.onBucket(b.id))} keys={String(i + 1)}>
                  {b.title}
                </Item>
              ))}
            </Command.Group>

            {(props.history.undo.length > 0 || props.history.redo.length > 0) && (
              <Command.Group heading={t("undo.group")}>
                {props.history.undo.map((what, i) => (
                  <Item key={`undo-${i}`} value={`undo ${i} ${what}`} onSelect={run(() => props.onUndoSteps(i + 1))} keys={i === 0 ? "⌘Z" : undefined}>
                    {t("undo.undo", { what })}
                  </Item>
                ))}
                {props.history.redo.map((what, i) => (
                  <Item key={`redo-${i}`} value={`redo ${i} ${what}`} onSelect={run(() => props.onRedoSteps(i + 1))} keys={i === 0 ? "⌘Y" : undefined}>
                    {t("undo.redo", { what })}
                  </Item>
                ))}
              </Command.Group>
            )}

            <Command.Group heading={t("palette.general")}>
              <Item onSelect={run(props.onRefresh)} keys="⌘R">
                {t("action.refreshAll")}
              </Item>
              <Item onSelect={run(props.onToggleTheme)}>{t("palette.toggleTheme")}</Item>
              {props.onSwitchDemo && <Item onSelect={run(props.onSwitchDemo)}>{t(props.demo ? "palette.demoOff" : "palette.demoOn")}</Item>}
              <Item onSelect={run(props.onSettings)} keys="⌘,">
                {t("action.settings")}
              </Item>
              <Item onSelect={run(props.onResetFilters)}>
                {t("action.resetView")}
              </Item>
              <Item onSelect={run(props.onRules)}>{t("action.rules")}</Item>
              <Item onSelect={run(props.onHelp)} keys="?">
                {t("action.shortcuts")}
              </Item>
            </Command.Group>

            <Command.Group heading={t("palette.items")}>
              {props.entries.map((entry) => (
                <Item
                  key={entry.item.id}
                  value={`${entry.item.title} ${entry.item.repo}#${entry.item.number} ${entry.item.id}`}
                  onSelect={run(() => props.onJump(entry))}
                  icon={<StatusIcon status={entry.status} />}
                  keys={`#${entry.item.number}`}
                >
                  <span className="palette-title">{entry.item.title}</span>
                  <span className="palette-sub">{entry.item.repo.split("/")[1]}</span>
                </Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </motion.div>
    </div>
  );
}

function Item({ children, onSelect, icon, keys, value }: { children: ReactNode; onSelect: () => void; icon?: ReactNode; keys?: string; value?: string }) {
  return (
    <Command.Item onSelect={onSelect} value={value}>
      {icon ?? <span className="palette-icon" />}
      <span className="palette-label">{children}</span>
      {keys && <kbd>{keys}</kbd>}
    </Command.Item>
  );
}
