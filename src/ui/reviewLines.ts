import type { Item, ReviewState } from "../model";
import { sameLogin } from "../timeline";
import { t } from "./i18n";

/** Why a review needs nothing more: its threads are resolved, its author approved later, or it was dismissed. */
export type ReviewDone = "resolved" | "approved" | "dismissed";

/** One timeline line for a review, standing for all its inline comments. */
export interface ReviewLine {
  /** "replies" when the review only answered in existing threads, as GitHub files each reply. */
  kind: "review" | "replies";
  at: string;
  actor: string;
  state: ReviewState;
  /** Opens GitHub at the review, or at the first reply; null when GitHub gave no link. */
  url: string | null;
  /** Threads the review opened, of those resolved, and of the rest how many are outdated. */
  inline: number;
  resolved: number;
  outdated: number;
  /** Threads it answered in. */
  replies: number;
  done: ReviewDone | null;
}

/**
 * Turns a pull request's reviews into one line each, so inline comments never show one by one.
 *
 * A review that only answered in existing threads becomes a "replies" line. A request for
 * changes counts as done once its author approved later, every thread it opened is resolved, or
 * it was dismissed; a comment review with threads counts as done once they are all resolved.
 * Reviews without an id (caches from before ids were kept) are left out; their text-less
 * activities still show.
 *
 * @param item  The pull request's `reviews` and `threads`.
 * @returns The lines, oldest first.
 *
 * @example
 *   reviewLines(pr); // [{ kind: "review", actor: "lukas", state: "CHANGES_REQUESTED", inline: 3, resolved: 2, done: null, … }]
 */
export function reviewLines(item: Pick<Item, "reviews" | "threads">): ReviewLine[] {
  return item.reviews.flatMap((review): ReviewLine[] => {
    if (!review.id || !review.state) return [];
    const opened = item.threads.filter((t) => t.comments[0]?.review === review.id && !t.comments[0].reply);
    const answered = item.threads.filter((t) => t.comments.some((c) => c.review === review.id && c.reply));
    const resolved = opened.filter((t) => t.resolved).length;
    const outdated = opened.filter((t) => !t.resolved && t.outdated).length;
    const approvedLater = item.reviews.some((r) => r.state === "APPROVED" && sameLogin(r.author, review.author) && r.at > review.at);
    const allResolved = opened.length > 0 && resolved === opened.length;
    const done: ReviewDone | null =
      review.state === "DISMISSED" ? "dismissed" : review.state === "CHANGES_REQUESTED" && approvedLater ? "approved" : review.state !== "APPROVED" && allResolved ? "resolved" : null;
    const onlyReplies = review.state === "COMMENTED" && opened.length === 0 && answered.length > 0;
    const firstReply = answered.flatMap((t) => t.comments).find((c) => c.review === review.id && c.reply);
    return [
      {
        kind: onlyReplies ? "replies" : "review",
        at: review.at,
        actor: review.author,
        state: review.state,
        url: (onlyReplies ? firstReply?.url : review.url) || null,
        inline: opened.length,
        resolved,
        outdated,
        replies: answered.length,
        done,
      },
    ];
  });
}

/**
 * What follows a review's sentence: its inline comments and their state, e.g.
 * "3 inline comments (2 of 3 resolved)", or "(approved later)". Empty when there is nothing to add.
 *
 * @example
 *   reviewNote({ kind: "review", inline: 3, resolved: 3, done: "resolved", … }); // "3 inline comments (all resolved)"
 */
export function reviewNote(line: ReviewLine): string {
  const inline = line.kind === "review" && line.inline > 0 ? (line.inline === 1 ? t("review.inlineOne") : t("review.inline", { count: line.inline })) : "";
  const status = reviewStatus(line);
  return [inline, status && `(${status})`].filter(Boolean).join(" ");
}

function reviewStatus(line: ReviewLine): string {
  if (line.done === "approved") return t("review.statusApproved");
  if (line.done === "dismissed") return t("review.statusDismissed");
  if (line.done === "resolved") return t("review.statusResolved");
  const partly = line.resolved > 0 ? t("review.statusPartly", { resolved: line.resolved, count: line.inline }) : "";
  const outdated = line.outdated > 0 ? t("review.statusOutdated", { count: line.outdated }) : "";
  return [partly, outdated].filter(Boolean).join(", ");
}
