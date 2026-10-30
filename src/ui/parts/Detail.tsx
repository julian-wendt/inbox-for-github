import { openUrl } from "@tauri-apps/plugin-opener";
import { AtSign, Bell, ChevronDown, ChevronRight, Link, RefreshCw, UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState, type Ref } from "react";
import type { Classified } from "../../classify";
import type { Reopen, Status, StatusChange, WriteFailure } from "../../model";
import type { BotComments, DescriptionMode, OpenAt } from "../../store";
import { findMention, isBot, latest, posts, sameLogin } from "../../timeline";
import { explain } from "../explain";
import { t } from "../i18n";
import { shownActivities, shownHistory } from "../activities";
import { agoInSentence, firstLine, statusesFor, type LinkFormat } from "../labels";
import { followUpOf } from "../followUp";
import { datedText, planTexts, type Dated } from "../plan";
import { reviewLines, reviewNote, type ReviewLine } from "../reviewLines";
import { ActivityRow, OpenedRow, ReviewRow, StatusChangeRow, WriteFailureRow } from "./ActivityRow";
import { Avatar } from "./Avatar";
import { Description } from "./Description";
import { GitHubMark } from "./GitHubMark";
import { OrcaMark } from "./OrcaMark";
import { KindIcon, FollowUpChip, PlanChip, PlanIcon } from "./ItemMarks";
import type { StatusMap } from "../../workStatus";
import { AttributeChips } from "./AttributeChips";
import { ItemProps } from "./ItemProps";
import { Markdown } from "./Markdown";
import { StatusIcon } from "./StatusIcon";
import { Reply, type StateWrite } from "./Reply";
import { Resizer } from "./Resizer";
import { WhyHint } from "./WhyHint";
import { useStoredSize } from "../useStoredSize";
import { useGutter } from "../useGutter";

/** Height of the docked comment field, in CSS pixels. */
const REPLY_HEIGHT = { initial: 72, min: 56, max: 520 };

interface Props {
  entry: Classified | null;
  me: string;
  reopenOn: Reopen;
  /** Whether an item is pinned for today or planned for a day (see `datedOf`), for the explanation of where it sits. */
  datedOf: (entry: Classified) => Dated | null;
  hiddenBoards: string[];
  /** The item's status changes made in this app, oldest first. */
  history: StatusChange[];
  /** Writes to GitHub that failed for this item, shown in its timeline. */
  failures: WriteFailure[];
  /** When the viewer last opened the item; in Assigned to me, older comments fold behind it. */
  seenAt: string | null;
  /** Attribute keys for the meta line, in order (setting "detailAttributes"). */
  attributes: string[];
  /** The board status mapping, for the color of the status chip. */
  statusMap: StatusMap;
  /** The viewer's private note on the item, editable on every item. */
  note: string;
  onNote: (id: string, note: string) => void;
  /** Comments shown before older ones fold away; 0 shows all. */
  recentComments: number;
  botComments: BotComments;
  /** The comment box sits below the scrolling thread instead of at its end. */
  stickyReply: boolean;
  /** Where the view starts when the item opens. */
  openAt: OpenAt;
  /** How the description card shows its text. */
  descriptionMode: DescriptionMode;
  /** Called with the item's id after a reply or state change was posted, to reload it. */
  onReplied: (id: string, change?: StateWrite) => void;
  onStatus: (status: Status) => void;
  onCopy: (format: LinkFormat) => void;
  onReload: () => void;
  /** "Open in Orca" (W), offered while Orca knows the item's repo or can clone it (see `orcaHint`). */
  onOrca?: () => void;
  /** Said in the Orca button's tooltip when Orca lacks the repo: where it comes from. */
  orcaHint?: string;
  /** Adds the viewer to the assignees on GitHub; offered while the item is open and not assigned to them. */
  onAssignMe?: () => void;
  /** "Plan" in the status switch, before the follow-up, opens the plan choices below this button. */
  onPlan: (at: DOMRect) => void;
  /** "Snoozed" in the status switch opens the snooze choices below this button. */
  onSnooze: (at: DOMRect) => void;
  /** Takes the follow-up date off the item; the chip shows a × for it. */
  onRemoveFollowUp: () => void;
  /** This item is being reloaded on its own. */
  reloading: boolean;
  /** Set when the detail shows as a pop-up: a close button joins the header actions. */
  onClose?: () => void;
}

export function Detail({ entry, ...rest }: Props) {
  if (!entry) {
    return (
      <section className="detail detail-empty" data-tauri-drag-region>
        <p>{t("detail.nothingSelected")}</p>
        <p className="hint">
          <kbd>↑</kbd> <kbd>↓</kbd> {t("detail.navHint")} · <kbd>⌘</kbd> <kbd>K</kbd> {t("detail.commandsHint")}
        </p>
      </section>
    );
  }
  return <DetailBody key={entry.item.id} entry={entry} {...rest} />;
}

function DetailBody({ entry, me, reopenOn, datedOf, hiddenBoards, history, failures, seenAt: lastSeen, attributes, statusMap, note, onNote, recentComments, botComments, stickyReply, openAt, descriptionMode, onReplied, onStatus, onCopy, onReload, onOrca, orcaHint, onAssignMe, onPlan, onSnooze, onRemoveFollowUp, reloading, onClose }: Props & { entry: Classified }) {
  const { item, status } = entry;
  const [opening, ...allPosts] = posts(item);
  // Inline comments stand behind their review's line, unless one mentions the viewer.
  const allComments = allPosts.filter((c) => !c.where || c.where === "Review" || findMention(c.body, me) !== null);
  const comments = botComments === "hidden" ? allComments.filter((c) => !isBot(c.author)) : allComments;
  const reviews = reviewLines(item).filter((line) => botComments !== "hidden" || !isBot(line.actor));
  const reviewOf = (post: { author: string; at: string; where?: string }) => (post.where === "Review" ? reviews.find((r) => r.at === post.at && sameLogin(r.actor, post.author)) : undefined);
  const recent = recentComments > 0 ? recentComments : comments.length;
  const trigger = useRef<HTMLLIElement>(null);
  const isTrigger = (post: (typeof comments)[number]) => !!entry.mention && post.at === entry.mention.at && post.author === entry.mention.by;
  const triggerIndex = comments.findIndex(isTrigger);
  const [showAll, setShowAll] = useState(triggerIndex >= 0 && triggerIndex < comments.length - recent);
  // Captured once: marking the item seen while it is open must not move the divider.
  const [seenAt] = useState(entry.bucket === "assigned" ? latest(lastSeen, entry.statusAt) : null);
  const firstNew = seenAt ? comments.findIndex((c) => c.at > seenAt) : -1;
  const hidden = showAll ? 0 : firstNew > 0 ? firstNew : Math.max(0, comments.length - recent);
  const visible = comments.slice(hidden);
  const since = hidden > 0 ? visible[0]?.at : undefined;
  const asPost = new Set(comments.flatMap((c) => (reviewOf(c) ? [`${c.author}@${c.at}`] : [])));
  const reviewRows = reviews.filter((r) => !asPost.has(`${r.actor}@${r.at}`) && (!since || r.at >= since));
  const covered = new Set(reviews.map((r) => `${r.actor}@${r.at}`));
  const activities = shownActivities(item, me, comments.map((c) => c.at))
    .filter((s) => s.activity.kind !== "reviewed" || !covered.has(`${s.activity.actor}@${s.activity.at}`))
    .filter((s) => !since || s.activity.at >= since);
  const timeline = [
    ...visible.map((post, i) => ({ at: post.at, node: <Post key={`p-${post.at}-${i}`} post={post} review={reviewOf(post)} me={me} avatar={item.avatars[post.author]} trigger={isTrigger(post)} botsFolded={botComments === "folded"} innerRef={isTrigger(post) ? trigger : undefined} /> })),
    ...activities.map((shown, i) => ({ at: shown.activity.at, node: <ActivityRow key={`a-${shown.activity.at}-${i}`} shown={shown} me={me} itemUrl={item.url} /> })),
    ...reviewRows.map((line, i) => ({ at: line.at, node: <ReviewRow key={`r-${line.at}-${i}`} line={line} me={me} /> })),
    ...shownHistory(history, item).filter((c) => !since || c.at >= since).map((change, i) => ({ at: change.at, node: <StatusChangeRow key={`s-${change.at}-${i}`} change={change} /> })),
    ...failures.filter((f) => !since || f.at >= since).map((failure, i) => ({ at: failure.at, node: <WriteFailureRow key={`f-${failure.at}-${i}`} failure={failure} /> })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const dividerAt = seenAt ? timeline.findIndex((row) => row.at > seenAt) : -1;
  const descriptionRef = useRef<HTMLDivElement>(null);
  const sinceRef = useRef<HTMLLIElement>(null);
  const timelineEnd = useRef<HTMLOListElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  useGutter(() => scroll.current);
  const replyHeight = useStoredSize("reply-height", REPLY_HEIGHT);

  // Once per item: DetailBody is keyed by the item id, so a refresh does not scroll again.
  useEffect(() => {
    if (openAt === "relevant") (trigger.current ?? sinceRef.current ?? descriptionRef.current)?.scrollIntoView({ block: "center" });
    if (openAt === "latest") timelineEnd.current?.scrollIntoView({ block: "end" });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only when the item opens, not when the setting changes

  // A plan is the item's "when" while it is open, so Plan, not Open, shows as chosen.
  const dated = datedOf(entry);
  const plan = dated ? datedText(dated) : null;
  return (
    <section className="detail">
      <header className="pane-header" data-tauri-drag-region>
        <span className="crumb">
          {item.repo} <span className="crumb-sep">/</span> #{item.number}
        </span>
        <div className="header-actions">
          {item.closed ? (
            <span className="chip closed-chip" title={t("closed.statusHint")}>
              {t(item.closed.state === "merged" ? "merged.onGitHub" : "closed.onGitHub")}
            </span>
          ) : (
            <div className="segmented compact status-switch" role="radiogroup" aria-label={t("detail.status")}>
              {statusesFor(entry).map((s) => [
                s.id === "snoozed" && (
                  <button
                    key="plan"
                    role="radio"
                    aria-checked={!!plan}
                    className={plan ? "on" : ""}
                    title={`${plan?.title ?? t("detail.plan")} (P)`}
                    onClick={(e) => onPlan(e.currentTarget.getBoundingClientRect())}
                  >
                    <PlanIcon dated={dated} size={15} strokeWidth={1.75} color="var(--st-planned)" />
                    <SteadyLabel text={plan?.text ?? t("detail.plan")} reserve={planTexts()} />
                    <ChevronDown size={12} className="segment-more" />
                  </button>
                ),
                <button
                  key={s.id}
                  role="radio"
                  aria-checked={status === s.id && !(plan && s.id === "open")}
                  className={status === s.id && !(plan && s.id === "open") ? "on" : ""}
                  title={`${s.title} (${s.key})`}
                  onClick={(e) => (s.id === "snoozed" ? onSnooze(e.currentTarget.getBoundingClientRect()) : onStatus(s.id))}
                >
                  <StatusIcon status={s.id} size={13} />
                  <SteadyLabel text={s.title} reserve={[s.title]} />
                  {s.id === "snoozed" && <ChevronDown size={12} className="segment-more" />}
                </button>,
              ])}
            </div>
          )}
          {onAssignMe && !item.closed && !item.assignees.some((a) => sameLogin(a, me)) && (
            <button className="chip-btn" title={`${t("assign.action")} (⌃A)`} aria-label={t("assign.action")} onClick={onAssignMe}>
              <UserPlus size={15} />
            </button>
          )}
          <button className="chip-btn" title={`${t("detail.openOnGitHub")} (⌃O)`} aria-label={t("detail.openOnGitHub")} onClick={() => void openUrl(item.url)}>
            <GitHubMark />
          </button>
          {onOrca && (
            <button className="chip-btn" title={`${t(orcaHint ? "orca.addOpen" : "orca.open")} (W)${orcaHint ? `\n${orcaHint}` : ""}`} aria-label={t(orcaHint ? "orca.addOpen" : "orca.open")} onClick={onOrca}>
              <OrcaMark size={18} />
            </button>
          )}
          <button className="chip-btn" title={`${t("action.refreshItem")} (⌃R)`} aria-label={t("action.refreshItem")} onClick={onReload} disabled={reloading}>
            <RefreshCw size={15} className={reloading ? "spin" : undefined} />
          </button>
          <button className="chip-btn" title={`${t("menu.copyLink")} (C)`} aria-label={t("menu.copyLink")} onClick={() => onCopy("url")}>
            <Link size={15} />
          </button>
          <WhyHint why={explain(entry, reopenOn, me, dated)} />
          {onClose && (
            <button className="chip-btn" onClick={onClose} title={t("popup.close")} aria-label={t("popup.close")}>
              <X size={15} />
            </button>
          )}
        </div>
      </header>
      <div className="detail-scroll" ref={scroll}>
        <div className="detail-column">
          <h2 className="detail-title">{item.title}</h2>
          <div className="detail-meta">
            <KindIcon item={item} size={18} />
            {dated && <PlanChip dated={dated} onPlan={onPlan} />}
            <FollowUpChip entry={entry} onRemove={followUpOf(entry) ? onRemoveFollowUp : undefined} />
            <AttributeChips keys={attributes} item={item} me={me} hiddenBoards={hiddenBoards} statusMap={statusMap} interactive />
            <ItemProps item={item} />
            {item.draft && <span className="draft">{t("detail.draft")}</span>}
          </div>

          <Description body={opening.body} me={me} mode={descriptionMode} innerRef={isTrigger(opening) ? descriptionRef : undefined} />

          <PrivateNote key={item.id} note={note} onSave={(text) => onNote(item.id, text)} />

          <h3 className="section-title">{t("detail.activities")}</h3>
          <ol className="timeline" ref={timelineEnd}>
            <OpenedRow item={item} me={me} />
            {hidden > 0 && (
              <li className="timeline-more">
                <button className="btn ghost" onClick={() => setShowAll(true)}>
                  {t(hidden === 1 ? "detail.olderCommentsOne" : "detail.olderComments", { count: hidden })}
                </button>
              </li>
            )}
            {timeline.flatMap((row, i) =>
              i === dividerAt ? [<li key="since" className="since-divider" ref={sinceRef}>{t("detail.sinceLastHere")}</li>, row.node] : [row.node],
            )}
          </ol>

          {!stickyReply && <Reply item={item} me={me} onSent={(change) => onReplied(item.id, change)} />}
        </div>
      </div>
      {stickyReply && (
        <div className="reply-dock">
          <Resizer label={t("pane.reply")} axis="y" width={replyHeight.size} onResize={replyHeight.resize} onReset={replyHeight.reset} />
          <div className="detail-column">
            <Reply item={item} me={me} onSent={(change) => onReplied(item.id, change)} fieldHeight={replyHeight.size} />
          </div>
        </div>
      )}
    </section>
  );
}

interface PostProps {
  post: ReturnType<typeof posts>[number];
  /** For a review summary: its line, whose inline comments and state show in the header. */
  review?: ReviewLine;
  me: string;
  avatar?: string;
  /** The mention that keeps the item in the inbox. */
  trigger?: boolean;
  /** Bot comments start folded. */
  botsFolded?: boolean;
  innerRef?: Ref<HTMLLIElement>;
}

/** One post; comments by bots can fold to their first line, since they are mostly reports. */
/**
 * A segment's label that keeps one width: as wide as the widest of `reserve` set in bold, the
 * weight of the chosen segment, so the switch does not jump when the choice or the plan changes.
 *
 * @example
 *   <SteadyLabel text="Thursday" reserve={planTexts()} />
 */
function SteadyLabel({ text, reserve }: { text: string; reserve: string[] }) {
  return (
    <span className="steady-label">
      <span>{text}</span>
      {reserve.map((r) => (
        <span key={r} aria-hidden>
          {r}
        </span>
      ))}
    </span>
  );
}

function Post({ post, review, me, avatar, trigger = false, botsFolded = true, innerRef }: PostProps) {
  const note = review && reviewNote(review);
  const bot = isBot(post.author);
  const [open, setOpen] = useState(!bot || !botsFolded);
  const mentionsMe = findMention(post.body, me) !== null;
  const kind = mentionsMe ? (sameLogin(post.author, me) ? " reminder" : " mention") : "";
  return (
    <li ref={innerRef} className={`post${kind}${bot ? " bot" : ""}${trigger ? " trigger" : ""}`}>
      <div
        className={`post-head${bot ? " foldable" : ""}`}
        title={bot ? (open ? t("detail.fold") : t("detail.unfold")) : undefined}
        aria-expanded={bot ? open : undefined}
        onClick={bot ? () => setOpen(!open) : undefined}
      >
        {bot && <ChevronRight size={14} className="post-chevron" aria-hidden />}
        <Avatar login={post.author} src={avatar} size={20} />
        <strong title={post.author}>{post.author.replace(/\[bot\]$/, "")}</strong>
        {bot && <span className="bot-tag">{t("post.bot")}</span>}
        <span className="post-time">{t("post.commented", { ago: agoInSentence(post.at) })}</span>
        {post.reviewState ? (
          <span className={`review-tag review-${post.reviewState.toLowerCase()}`}>{t(`review.${post.reviewState}`)}</span>
        ) : (
          post.where && <code className="post-where">{post.where}</code>
        )}
        {note && review.url && (
          <button className="post-review-note" title={`${note} · ${t("action.openOnGitHub")}`} onClick={() => void openUrl(review.url!)}>
            {note}
          </button>
        )}
        {kind && (
          <span className="mention-tag">
            {kind === " reminder" ? <Bell size={13} /> : <AtSign size={13} />}
            {kind === " reminder" ? t("post.reminder") : t("post.mentioned")}
          </span>
        )}
      </div>
      <div className="post-body">{open ? <Markdown source={post.body} me={me} /> : <p className="post-summary">{firstLine(post.body)}</p>}</div>
    </li>
  );
}

/** A private note per item, saved shortly after typing stops; it never leaves this Mac. */
function PrivateNote({ note, onSave }: { note: string; onSave: (note: string) => void }) {
  const [text, setText] = useState(note);
  const timer = useRef<number>(undefined);
  const save = (value: string) => {
    setText(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onSave(value), 600);
  };
  return (
    <label className="private-note">
      <span>{t("note.label")}</span>
      <textarea
        value={text}
        onChange={(e) => save(e.target.value)}
        onBlur={() => onSave(text)}
        onKeyDown={(e) => {
          // Leaves the field without resetting the view, as in the comment box.
          if (e.key === "Escape") {
            e.stopPropagation();
            e.currentTarget.blur();
          }
        }}
        placeholder={t("note.placeholder")}
        rows={2}
      />
    </label>
  );
}
