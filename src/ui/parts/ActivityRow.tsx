import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowUpFromLine, Check, CheckCheck, CircleCheck, CircleDot, CircleSlash, Copy, Eye, EyeOff, GitCommitHorizontal, GitMerge, GitPullRequest, GitPullRequestDraft, MessageSquare, Reply, TriangleAlert, UserMinus, UserRound, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { reviewNote, type ReviewLine } from "../reviewLines";
import { sameLogin } from "../../timeline";
import type { Item, StateChange, StatusChange, WriteFailure } from "../../model";
import { historyText, type ShownActivity } from "../activities";
import { t, tRich, type MessageKey } from "../i18n";
import { ago } from "../labels";
import { Avatar } from "./Avatar";
import { KindIcon } from "./ItemMarks";
import { StatusIcon } from "./StatusIcon";

/** Per review verdict: icon, the sentence for others, the one for the viewer, and the tone. */
const REVIEWED: Record<string, [LucideIcon, MessageKey, MessageKey, string]> = {
  APPROVED: [Check, "activity.approved", "activity.approvedSelf", "good"],
  CHANGES_REQUESTED: [X, "activity.changesRequested", "activity.changesRequestedSelf", "bad"],
  COMMENTED: [MessageSquare, "activity.reviewed", "activity.reviewedSelf", ""],
  DISMISSED: [X, "activity.dismissed", "activity.dismissedSelf", ""],
};

/** Per state change: icon, the sentence for others and the one for the viewer. */
const STATE: Record<StateChange, [LucideIcon, MessageKey, MessageKey]> = {
  closed: [CircleCheck, "activity.closed", "activity.closedSelf"],
  reopened: [CircleDot, "activity.reopened", "activity.reopenedSelf"],
  merged: [GitMerge, "activity.merged", "activity.mergedSelf"],
  draft: [GitPullRequestDraft, "activity.draft", "activity.draftSelf"],
  ready: [GitPullRequest, "activity.ready", "activity.readySelf"],
};

/** Closing reasons with their own sentence; others read as plain closing. */
const CLOSED_AS: Record<string, [LucideIcon, MessageKey, MessageKey]> = {
  NOT_PLANNED: [CircleSlash, "activity.closedNotPlanned", "activity.closedNotPlannedSelf"],
  DUPLICATE: [Copy, "activity.closedDuplicate", "activity.closedDuplicateSelf"],
};

/**
 * One slim timeline line between the posts, GitHub style: an icon in a small circle, the actor's
 * avatar, a short sentence naming who did what, and when. A click opens GitHub at the event, or
 * at the item when GitHub gives the event no link (commits open the pull request's commits).
 *
 * @param itemUrl  The item's GitHub URL, the fallback link.
 *
 * @example
 *   <ActivityRow shown={{ activity: { kind: "commit", at: "…" }, count: 3 }} me="octocat" avatars={item.avatars} itemUrl={item.url} />
 *   // ⊙ 3 new commits by alice · 2 hours ago (without known authors: 3 new commits)
 */
export function ActivityRow({ shown, me, avatars, itemUrl }: { shown: ShownActivity; me: string; avatars: Record<string, string>; itemUrl: string }) {
  const { activity, count, authors = [] } = shown;
  const mine = activity.kind !== "commit" && sameLogin(activity.actor, me);
  const name = activity.kind !== "commit" && <strong>{activity.actor}</strong>;
  const say = (key: MessageKey, selfKey: MessageKey, params: Record<string, string | number> = {}) => (mine ? t(selfKey, params) : tRich(key, { name, ...params }));
  let icon: LucideIcon;
  let tone = "";
  let text: ReactNode;
  switch (activity.kind) {
    case "state": {
      const [stateIcon, key, selfKey] = (activity.change === "closed" && activity.reason && CLOSED_AS[activity.reason]) || STATE[activity.change];
      icon = stateIcon;
      text = say(key, selfKey);
      break;
    }
    case "force-pushed":
      icon = ArrowUpFromLine;
      text = count === 1 ? say("activity.forcePushed", "activity.forcePushedSelf") : say("activity.forcePushes", "activity.forcePushesSelf", { count });
      break;
    case "auto-merge":
      icon = GitMerge;
      text = say("activity.autoMerge", "activity.autoMergeSelf");
      break;
    case "dismissed":
      icon = X;
      text = say("activity.dismissedReview", "activity.dismissedReviewSelf", { reviewer: activity.reviewer });
      break;
    case "review-request-removed":
      icon = EyeOff;
      text = activity.reviewer.startsWith("team:")
        ? say("activity.teamReviewRequestRemoved", "activity.teamReviewRequestRemovedSelf", { team: activity.reviewer.slice(5) })
        : say("activity.reviewRequestRemoved", "activity.reviewRequestRemovedSelf");
      break;
    case "linked":
      icon = GitPullRequest;
      text = say("activity.linked", "activity.linkedSelf", { number: activity.number });
      break;
    case "duplicate":
      icon = Copy;
      text = say("activity.duplicate", "activity.duplicateSelf", { number: activity.number });
      break;
    case "assigned":
      icon = UserRound;
      text = mine ? t("activity.assignedSelf") : tRich("activity.assigned", { name: <strong>{activity.actor}</strong> });
      break;
    case "unassigned":
      icon = UserMinus;
      text = mine ? t("activity.unassignedSelf") : tRich("activity.unassigned", { name: <strong>{activity.actor}</strong> });
      break;
    case "review-requested":
      icon = Eye;
      if (activity.reviewer.startsWith("team:")) {
        const team = activity.reviewer.slice(5);
        text = mine ? t("activity.teamReviewRequestedSelf", { team }) : tRich("activity.teamReviewRequested", { name: <strong>{activity.actor}</strong>, team });
      } else {
        text = mine ? t("activity.reviewRequestedSelf") : tRich("activity.reviewRequested", { name: <strong>{activity.actor}</strong> });
      }
      break;
    case "reviewed": {
      const [reviewIcon, key, selfKey, reviewTone] = REVIEWED[activity.state] ?? REVIEWED.COMMENTED;
      icon = reviewIcon;
      tone = reviewTone;
      text = mine ? t(selfKey) : tRich(key, { name: <strong>{activity.actor}</strong> });
      break;
    }
    case "commit":
      icon = GitCommitHorizontal;
      text = commitText(count, authors, me);
      break;
  }
  const Icon = icon;
  const actor = activity.kind === "commit" ? (authors.length === 1 ? authors[0] : null) : activity.actor;
  const url = ("url" in activity && activity.url) || (activity.kind === "commit" ? `${itemUrl}/commits` : itemUrl);
  return (
    <li className="activity">
      <span className={`activity-icon ${tone}`}>
        <Icon size={13} />
      </span>
      {actor && <Avatar login={actor} src={avatars[actor]} size={16} />}
      <GitHubLink url={url}>
        {text} <span className="activity-time">· {ago(activity.at)}</span>
      </GitHubLink>
    </li>
  );
}

function commitText(count: number, authors: string[], me: string): ReactNode {
  const author = authors.at(-1);
  if (!author) return count === 1 ? t("activity.commit") : t("activity.commits", { count });
  const name = <strong>{author}</strong>;
  if (authors.length > 1) return tRich("activity.commitsByMany", { name, count });
  if (sameLogin(author, me)) return count === 1 ? t("activity.commitSelf") : t("activity.commitsSelf", { count });
  return count === 1 ? tRich("activity.commitBy", { name }) : tRich("activity.commitsBy", { name, count });
}

/** Opens a GitHub link from a timeline line; plain text when there is none. */
function GitHubLink({ url, children }: { url: string | null; children: ReactNode }) {
  if (!url) return <span className="activity-text">{children}</span>;
  return (
    <button className="activity-text activity-link" title={t("action.openOnGitHub")} onClick={() => void openUrl(url)}>
      {children}
    </button>
  );
}

/**
 * The timeline line of a review that has no text of its own, standing for all its inline comments,
 * e.g. "✕ lukas requested changes · 3 inline comments (2 of 3 resolved) · 2 hours ago". A click
 * opens GitHub at the review. Done reviews (see `ReviewDone`) get a double check instead.
 *
 * @example
 *   <ReviewRow line={reviewLines(item)[0]} me="octocat" avatars={item.avatars} />
 */
export function ReviewRow({ line, me, avatars }: { line: ReviewLine; me: string; avatars: Record<string, string> }) {
  const mine = sameLogin(line.actor, me);
  const name = <strong>{line.actor}</strong>;
  let icon: LucideIcon;
  let tone: string;
  let text: ReactNode;
  if (line.kind === "replies") {
    icon = Reply;
    tone = "";
    const one = line.replies === 1;
    text = mine ? t(one ? "activity.repliedOneSelf" : "activity.repliedSelf", { count: line.replies }) : tRich(one ? "activity.repliedOne" : "activity.replied", { name, count: line.replies });
  } else {
    const [reviewIcon, key, selfKey, reviewTone] = line.state === "DISMISSED" ? REVIEWED.COMMENTED : (REVIEWED[line.state] ?? REVIEWED.COMMENTED);
    icon = line.done ? CheckCheck : reviewIcon;
    tone = line.done ? "good" : reviewTone;
    text = mine ? t(selfKey) : tRich(key, { name });
  }
  const Icon = icon;
  const note = reviewNote(line);
  return (
    <li className="activity">
      <span className={`activity-icon ${tone}`}>
        <Icon size={13} />
      </span>
      <Avatar login={line.actor} src={avatars[line.actor]} size={16} />
      <GitHubLink url={line.url}>
        {text}
        {note && ` · ${note}`} <span className="activity-time">· {ago(line.at)}</span>
      </GitHubLink>
    </li>
  );
}

/**
 * A timeline line for a status change made in this app, which GitHub never sees: the status icon
 * and a sentence like "You snoozed it · 2 hours ago".
 *
 * @example
 *   <StatusChangeRow change={{ status: "snoozed", at: "2026-10-22T10:00:00Z", automatic: false }} />
 */
export function StatusChangeRow({ change }: { change: StatusChange }) {
  return (
    <li className="activity">
      <span className="activity-icon">
        <StatusIcon status={change.status} size={13} />
      </span>
      <span className="activity-text">
        {t(historyText(change))} <span className="activity-time">· {ago(change.at)}</span>
      </span>
    </li>
  );
}

/**
 * A timeline line for a write to GitHub that failed and was undone here; the message as tooltip.
 *
 * @example
 *   <WriteFailureRow failure={{ kind: "assign", at: "2026-10-25T10:00:00Z", error: "Load failed" }} />
 *   // ⚠ Assigning you on GitHub failed · just now
 */
export function WriteFailureRow({ failure }: { failure: WriteFailure }) {
  return (
    <li className="activity" title={failure.error}>
      <span className="activity-icon bad">
        <TriangleAlert size={13} />
      </span>
      <span className="activity-text">
        {t(failure.kind === "assign" ? "activity.assignFailed" : "activity.unassignFailed")} <span className="activity-time">· {ago(failure.at)}</span>
      </span>
    </li>
  );
}

/**
 * The first timeline line: who opened the item and when, with its kind icon. Pinned above the
 * "older comments" fold, so it shows even when older entries are folded away.
 *
 * @example
 *   <OpenedRow item={item} me="octocat" />
 *   // ⊙ alice opened this · 3 days ago
 */
export function OpenedRow({ item, me }: { item: Item; me: string }) {
  return (
    <li className="activity">
      <span className="activity-icon">
        <KindIcon item={item} size={13} />
      </span>
      <Avatar login={item.author} src={item.avatars[item.author]} size={16} />
      <span className="activity-text">
        {sameLogin(item.author, me) ? t("activity.openedSelf") : tRich("activity.opened", { name: <strong>{item.author}</strong> })}{" "}
        <span className="activity-time">· {ago(item.createdAt)}</span>
      </span>
    </li>
  );
}
