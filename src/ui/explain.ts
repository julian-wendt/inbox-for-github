import type { Classified } from "../classify";
import type { Reopen } from "../model";
import { t } from "./i18n";
import { ago, agoInSentence, updateSummary, type View } from "./labels";
import { sameLogin } from "../timeline";
import { untilText } from "./snooze";
import { dayLong, type Dated } from "./plan";

export interface Explanation {
  tone: "inbox" | "reminder" | "done" | "snoozed" | "planned" | "involved" | "authored" | "assigned";
  title: string;
  /** One sentence per reason: why the item is here and what moves it on. */
  lines: string[];
}

const comesBack = (reopenOn: Reopen) => t("explain.comesBack", { rule: t(`reopen.${reopenOn}`) });

/**
 * Explains in plain words why an item sits where it is and what moves it on, from the same
 * classification that sorted it, so the text cannot drift from the behavior.
 *
 * @param entry     The classified item.
 * @param reopenOn  The "reopenOn" setting, which decides when manual statuses fall back.
 * @param me        The viewer's login, to tell their own pull requests apart.
 * @param dated     Whether the item is pinned for today or planned for a day (see `datedOf`), which
 *                  took it out of the inbox or keeps a date beside its reason for being there.
 * @returns A tone for styling, a short title and one sentence per reason.
 *
 * @example
 *   explain(entry, "mention");
 *   // { tone: "done", title: "Done", lines: ["You responded to the review request.", …] }
 */
export function explain(entry: Classified, reopenOn: Reopen, me = "", dated: Dated | null = null): Explanation {
  const { item, mention, answered, asks, status, statusAt, bucket } = entry;
  const trigger = reopenOn === "mention-or-assigned-post" ? (item.reasons.includes("assigned") ? "any-post" : "mention") : reopenOn;
  const waitsInPlace = status === "snoozed" && (bucket === "assigned" || bucket === "authored" || asks.length > 0);
  const planLine = dated?.kind === "today" ? [t("explain.stillToday")] : dated?.kind === "planned" ? [t("explain.stillPlanned", { day: dayLong(dated.day) })] : [];

  // In the inbox the asks say why, whatever else is stored: a follow-up that waits in place, a part that is done.
  if (asks.length > 0) {
    const lines = asks.map((ask) => {
      switch (ask) {
        case "update":
          return t("explain.update", { what: updateSummary(entry.updates ?? []) });
        case "review":
          return t("explain.review");
        case "commits":
          return t("explain.commits");
        case "reopened":
          return t("explain.reopened", { ago: statusAt ? agoInSentence(statusAt) : "" });
        case "mention":
          return mention!.self
            ? t("explain.reminder", { ago: agoInSentence(mention!.at) })
            : t("explain.mention", { name: mention!.by, ago: agoInSentence(mention!.at) });
      }
    });
    if (waitsInPlace) lines.push(entry.until ? t("explain.stillWaiting", { until: untilText(entry.until) }) : t("explain.stillWaitingNoDate"));
    lines.push(...planLine);
    const reminderOnly = asks.length === 1 && mention?.self;
    return { tone: reminderOnly ? "reminder" : "inbox", title: t("explain.inboxTitle"), lines };
  }

  if (entry.updates) {
    return { tone: bucket === "assigned" ? "assigned" : "done", title: t("explain.handedOffTitle"), lines: [t("explain.handedOff"), t("explain.handedOffBack")] };
  }
  if (item.closed) {
    const title = t(item.closed.state === "merged" ? "explain.mergedSince" : "explain.closedSince", { ago: ago(item.closed.at) });
    return { tone: "done", title, lines: [t("explain.closed")] };
  }
  if (bucket === "planned") {
    if (dated?.kind === "today") return { tone: "planned", title: t("plate.focus"), lines: [t("explain.today"), t("explain.todayHint")] };
    const title = dated?.kind === "planned" ? t("plan.on", { date: dayLong(dated.day) }) : t("bucket.planned");
    return { tone: "planned", title, lines: [t("explain.planned"), t("explain.plannedHint")] };
  }
  if (waitsInPlace) {
    const title = statusAt ? t("explain.snoozedSince", { ago: ago(statusAt) }) : t("status.snoozed");
    return { tone: "snoozed", title, lines: [entry.until ? t("explain.waitsHere", { until: untilText(entry.until) }) : t("explain.waitsHereNoDate"), t("explain.undoHint")] };
  }
  // An own pull request that is assigned to the viewer belongs to Created by me, as the sidebar has it.
  if (bucket === "assigned" && item.kind === "pr" && sameLogin(item.author, me)) {
    return { tone: "authored", title: t("bucket.authored"), lines: [t("explain.authored"), t("explain.involvedComesBack")] };
  }
  if (bucket === "assigned") {
    return { tone: "assigned", title: t("row.assigned"), lines: [t("explain.assigned"), t("explain.assignedComesBack"), ...planLine] };
  }
  if (status === "snoozed") {
    const title = statusAt ? t("explain.snoozedSince", { ago: ago(statusAt) }) : t("status.snoozed");
    const back = entry.until ? t("explain.snoozedUntil", { until: untilText(entry.until), rule: t(`reopen.${trigger}`) }) : comesBack(trigger);
    return { tone: "snoozed", title, lines: [back, t("explain.undoHint")] };
  }
  if (status === "done" && !answered && item.reasons.includes("assigned")) {
    return { tone: "done", title: t("explain.doneStillOpen", { ago: statusAt ? ago(statusAt) : "" }), lines: [t("explain.doneStillOpenHint"), comesBack(trigger)] };
  }
  if (status === "done" && !answered) {
    const title = statusAt ? t("explain.doneSince", { ago: ago(statusAt) }) : t("status.done");
    return { tone: "done", title, lines: [t("explain.markedDone"), comesBack(trigger)] };
  }
  if (answered === "review") {
    return {
      tone: "done",
      title: t("status.done"),
      lines: [t("explain.reviewAnswered"), t("explain.reviewComesBack")],
    };
  }
  if (answered === "mention") {
    return { tone: "done", title: t("status.done"), lines: [t("explain.mentionAnswered"), comesBack("mention")] };
  }
  if (bucket === "authored") {
    return { tone: "authored", title: t("bucket.authored"), lines: [t("explain.authored"), t("explain.involvedComesBack"), ...planLine] };
  }
  return {
    tone: "involved",
    title: t("bucket.involved"),
    lines: [t("explain.involved"), t("explain.involvedComesBack")],
  };
}

/**
 * What a view holds and how items leave or return, for the overview behind the list header's
 * info button and for the help. Shares its wording with `explain`.
 *
 * @param view      The view to describe.
 * @param reopenOn  The "reopenOn" setting, which decides when manual statuses fall back.
 * @returns A lead sentence and the rules as short points.
 *
 * @example
 *   bucketHelp("inbox", "mention").points[0]; // "Mention: until you reply."
 */
export function bucketHelp(view: View, reopenOn: Reopen): { lead: string; points: string[] } {
  switch (view) {
    case "inbox":
      return {
        lead: t("help.inbox.lead"),
        points: [t("help.inbox.mention"), t("help.inbox.review"), t("help.inbox.commits"), t("help.inbox.update"), t("help.inbox.reopened"), t("help.inbox.later", { rule: t(`reopen.${reopenOn}`) })],
      };
    case "assigned":
      return { lead: t("help.assigned.lead"), points: [t("help.assigned.leaves"), t("help.assigned.back")] };
    case "authored":
      return { lead: t("help.authored.lead"), points: [t("help.authored.unassigned"), t("help.authored.leaves")] };
    case "planned":
      return {
        lead: t("help.planned.lead"),
        points: [t("help.planned.today"), t("help.planned.plan")],
      };
    case "done":
      return {
        lead: t("help.done.lead"),
        points: [t("help.done.mention"), t("help.done.review"), t("help.done.closed"), t("help.done.manual", { rule: t(`reopen.${reopenOn}`) }), t("explain.undoHint")],
      };
  }
}
