/** Why GitHub search returned an item for the viewer. */
export type Reason = "assigned" | "mentioned" | "review" | "involved";

export type Bucket = "inbox" | "assigned" | "involved" | "authored" | "snoozed" | "done";

/** Manual status. "open" is the default; it is stored only after an explicit reopen. */
export type Status = "open" | "snoozed" | "done";

export interface Comment {
  author: string;
  body: string;
  createdAt: string;
  /** For pull request reviews: "path:line" of an inline comment, or "Review" for a review summary. */
  where?: string;
  /** Review summaries only: the review's verdict. Absent in caches from before it was kept. */
  reviewState?: ReviewState;
}

export interface Label {
  name: string;
  color: string;
}

/** A GitHub Projects board an item sits on, with the item's status and sprint there. */
export interface Board {
  id: string;
  title: string;
  status: string | null;
  /** The board's color for the status option, e.g. "GREEN"; missing for boards cached before it was loaded. */
  statusColor?: string;
  sprint: string | null;
  /** The item's other field values on this board, e.g. "Component: API" or "Estimation in h: 24". */
  fields: BoardField[];
}

/** One field value of an item on a board; `color` is the option color of single-select fields. */
export interface BoardField {
  /** The field's node id, stable when the field is renamed. */
  id: string;
  name: string;
  kind: "select" | "iteration" | "text" | "number" | "date";
  value: string;
  color?: string;
}

/** Pull request facts beyond the shared ones. */
export interface PullState {
  base: string;
  head: string;
  additions: number;
  deletions: number;
  conflicts: boolean;
}

/** One request for a review; `reviewer` is a login, or "team:<slug>" for a team. */
export interface ReviewRequest {
  reviewer: string;
  at: string;
}

export type ReviewState = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED";

/** A submitted review. `id`, `state` and `url` are absent in caches from before they were kept. */
export interface Review {
  author: string;
  at: string;
  id?: string;
  state?: ReviewState;
  /** Opens GitHub at the review, e.g. "https://github.com/o/r/pull/1#pullrequestreview-123". */
  url?: string;
}

/**
 * A conversation on a line of the diff. GitHub keeps whether and by whom it was resolved, but not
 * when (see `docs/reference/github-api.md`).
 */
export interface ReviewThread {
  resolved: boolean;
  resolvedBy: string | null;
  /** The code it points at changed since, so GitHub shows it collapsed. */
  outdated: boolean;
  comments: ThreadComment[];
}

/** One comment of a review thread, without its text, which stays in `Item.comments`. */
export interface ThreadComment {
  author: string;
  at: string;
  /** Opens GitHub at the comment, e.g. "…/pull/1#discussion_r456". */
  url: string;
  /** The review it was submitted with (`Review.id`), null when GitHub does not say. */
  review: string | null;
  /** An answer within the thread rather than the comment that opened it. */
  reply: boolean;
}

/** A change of an item's state on GitHub; "draft" and "ready" for pull requests only. */
export type StateChange = "closed" | "reopened" | "merged" | "draft" | "ready";

/**
 * A timeline event shown between the posts; reviews here are only those without text. `url`
 * opens GitHub at the event where GitHub gives one; events cached before it was kept have none.
 */
export type Activity =
  | { kind: "assigned" | "unassigned"; at: string; actor: string; assignee: string }
  | { kind: "review-requested" | "review-request-removed"; at: string; actor: string; reviewer: string }
  | { kind: "reviewed"; at: string; actor: string; state: ReviewState }
  | { kind: "commit"; at: string }
  /** `reason` for closed issues: GitHub's state reason, e.g. "NOT_PLANNED" or "DUPLICATE". */
  | { kind: "state"; at: string; actor: string; change: StateChange; reason?: string; url?: string }
  | { kind: "force-pushed" | "auto-merge"; at: string; actor: string }
  /** Someone dismissed the review of `reviewer`. */
  | { kind: "dismissed"; at: string; actor: string; reviewer: string; url?: string }
  /** A pull request linked to the issue, or the item the issue was marked a duplicate of. */
  | { kind: "linked" | "duplicate"; at: string; actor: string; number: number; url: string };

export interface Item {
  id: string;
  kind: "issue" | "pr";
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  labels: Label[];
  /** Pull requests only: review requests, oldest first. */
  reviewRequests: ReviewRequest[];
  /** Pull requests only: still a draft. */
  draft: boolean;
  /** Pull requests only: every submitted review, also those without text. */
  reviews: Review[];
  /** Pull requests only: the inline review threads; empty for caches from before they were kept. */
  threads: ReviewThread[];
  /** Avatar URL per author login; bots have no github.com/<login>.png and need these. */
  avatars: Record<string, string>;
  /** Pull requests only. */
  pull: PullState | null;
  /** Issues only: the open pull requests that would close it when merged. */
  linkedPrs: LinkedPr[];
  /** Issues only: the issue type, null without one; filled with null for caches from before it was loaded. */
  issueType: IssueType | null;
  /** Set once the item is closed or merged on GitHub; null while open. */
  closed: Closed | null;
  /** Assignments, review requests, reviews without text and commits, oldest first. */
  activities: Activity[];
  /** Boards from GitHub Projects; filled after the search by `fetchBoards`. */
  boards: Board[];
  assignees: string[];
  comments: Comment[];
  reasons: Reason[];
}

/** An issue's type as the organization defines it, e.g. "Bug"; `color` is GitHub's name for it, e.g. "RED". */
export interface IssueType {
  name: string;
  color: string;
}

/** A pull request that closes an issue when merged ("Fixes #12" or linked in the sidebar). */
export interface LinkedPr {
  number: number;
  url: string;
  draft: boolean;
  author: string;
}

export interface Closed {
  state: "closed" | "merged";
  at: string;
}

/**
 * What brings a "Zurückgestellt" or "Erledigt" item back to "Offen"; see `reopens`. The settings
 * no longer offer "mention-or-assigned-post", which acts as "mention" since assignments snooze in
 * their table; stored values stay readable.
 */
export type Reopen = "mention" | "any-post" | "mention-or-assigned-post";

/** A manual status. A stored "open" marks an explicit reopen, which counts like a new review request. */
/** A GitHub organization the viewer belongs to. */
export interface Org {
  login: string;
  name: string | null;
  avatarUrl: string;
}

export interface StoredStatus {
  status: Status;
  changedAt: string;
  /** Snoozed until this time (ISO 8601); it comes back then, or earlier by the "reopenOn" setting. */
  until?: string;
  /** With "done": the viewer's part of an assignment ended; what happens after it is an update for them. */
  handoff?: Handoff;
  /** An "open" written when a snooze date passed: the item stays in the inbox until the viewer files it. */
  due?: boolean;
}

/**
 * How an item looked when the viewer marked their part done (see `snapshotOf`): its status per
 * board and its linked pull requests. Anything that changes after that is an update for them.
 */
export interface Handoff {
  boards: Record<string, string | null>;
  prs: number[];
}

/**
 * A reminder from before follow-ups, read once at start and turned into one (see
 * `followUpsFrom`). Nothing sets reminders any more.
 */
export interface Reminder {
  at: string;
  /** When the app notified about it; unset until it was due. */
  firedAt?: string;
}

/** What a status change may carry besides the status: see `StoredStatus`. */
export type StatusExtra = Pick<StoredStatus, "until" | "due" | "handoff">;

/** A write to GitHub that failed and was undone here, kept for the item's timeline. */
export interface WriteFailure {
  kind: "assign" | "unassign";
  at: string;
  /** GitHub's or the network's message. */
  error: string;
}

/** One entry of an item's status history: a key press by the viewer, or the app reopening it. */
export interface StatusChange {
  status: Status;
  at: string;
  automatic: boolean;
  /** What caused the change, e.g. "auto:snooze-ended" for a follow-up that came due; unset in old rows. */
  source?: string;
}
