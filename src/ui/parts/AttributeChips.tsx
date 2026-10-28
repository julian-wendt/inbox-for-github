import { openUrl } from "@tauri-apps/plugin-opener";
import { BookMarked, GitPullRequest, GitPullRequestDraft, IterationCw } from "lucide-react";
import type { ReactNode } from "react";
import type { Item, LinkedPr } from "../../model";
import { guessWorkStatus, linkedPrsFirst, type StatusMap } from "../../workStatus";
import { reviewersOf } from "../attributes";
import { t } from "../i18n";
import { Avatar } from "./Avatar";

/**
 * The chips for a list of attributes (see `resolveAttributes`), in that order: the repo, the issue type, the board
 * status (dot in the board's color for it), linked pull requests, labels, the assignee and reviewer pills and
 * board field values. Boards switched off are left out; attributes without a value render nothing.
 *
 * @param keys         Attribute keys to show, in order.
 * @param hiddenBoards Board ids switched off in the settings.
 * @param statusMap    The board status mapping, for the color of the status dot.
 * @param interactive  Pull request chips open the pull request on GitHub; off inside a clickable row.
 *
 * @example
 *   <AttributeChips keys={["repo", "status", "field:PVTSSF_1"]} item={item} me="octocat" hiddenBoards={[]} statusMap={{}} />
 */
export function AttributeChips(props: {
  keys: string[];
  item: Item;
  me: string;
  hiddenBoards: string[];
  statusMap: StatusMap;
  interactive?: boolean;
}) {
  const { keys, item, me, hiddenBoards, statusMap, interactive = false } = props;
  const prs = linkedPrsFirst(item, me);
  const boards = item.boards.filter((b) => !hiddenBoards.includes(b.id));
  return <>{keys.flatMap((key) => chips(key, { ...item, boards }, prs, interactive, statusMap))}</>;
}

/** A prefix and overlapping avatars, which spread apart on hover. */
function people(key: string, prefix: string, logins: string[], item: Item): ReactNode[] {
  if (logins.length === 0) return [];
  return [
    <span key={key} className="chip assignee-pill" title={`${prefix} ${logins.join(", ")}`}>
      <span>{prefix}</span>
      <span className="people">
        {logins.map((login) => (
          <span key={login} className="assignee-avatar" title={login}>
            <Avatar login={login} src={item.avatars[login]} size={18} />
          </span>
        ))}
      </span>
    </span>,
  ];
}

function chips(key: string, item: Item, prs: LinkedPr[], interactive: boolean, statusMap: StatusMap): ReactNode[] {
  switch (key) {
    case "repo":
      return [
        <span key="repo" className="chip" title={item.repo}>
          <BookMarked size={13} strokeWidth={2.2} className="chip-icon" />
          {item.repo.split("/")[1]}
        </span>,
      ];
    case "type":
      return item.issueType
        ? [
            <span key="type" className="chip" title={t("attr.type")}>
              <i className={`option-dot option-${item.issueType.color.toLowerCase()}`} aria-hidden />
              {item.issueType.name}
            </span>,
          ]
        : [];
    case "status":
      return item.boards.flatMap((b) => {
        if (!b.status) return [];
        // The board's own color for the status; boards cached before it was loaded fall back to the work status.
        const work = statusMap[b.id]?.[b.status] ?? guessWorkStatus(b.status) ?? "todo";
        const dot = b.statusColor ? `option-dot option-${b.statusColor.toLowerCase()}` : "option-dot";
        return [
          <span
            key={`status-${b.id}`}
            className={`chip work-${work}`}
            title={t("props.statusOn", { board: b.title })}
          >
            <i className={dot} style={b.statusColor ? undefined : { background: "var(--dot)" }} aria-hidden />
            {b.status}
          </span>,
        ];
      });
    case "pr":
      return prs.map((pr) => {
        const content = (
          <>
            {pr.draft ? <GitPullRequestDraft size={12} className="chip-icon" /> : <GitPullRequest size={12} className="chip-icon good" />}#{pr.number}
          </>
        );
        const title = t(pr.draft ? "props.linkedPrDraft" : "props.linkedPr", { number: pr.number, author: pr.author });
        return interactive ? (
          <button key={`pr-${pr.number}`} className="chip chip-link" title={title} onClick={() => void openUrl(pr.url)}>
            {content}
          </button>
        ) : (
          <span key={`pr-${pr.number}`} className="chip" title={title}>
            {content}
          </span>
        );
      });
    case "labels":
      return item.labels.map((label) => (
        <span
          key={`label-${label.name}`}
          className="label"
          style={{ "--label": `#${label.color}` } as React.CSSProperties}
        >
          {label.name}
        </span>
      ));
    case "assignees":
      return people("assignees", t("chip.owning"), item.assignees, item);
    case "reviewers":
      return people("reviewers", t("chip.reviewing"), reviewersOf(item), item);
    default: {
      const id = key.slice("field:".length);
      return item.boards.flatMap((b) => b.fields.filter((f) => f.id === id)).map((f) => (
        <span key={key} className="chip" title={`${f.name}: ${f.value}`}>
          {f.kind === "select" && <i className={`option-dot option-${(f.color ?? "GRAY").toLowerCase()}`} aria-hidden />}
          {f.kind === "iteration" && <IterationCw size={12} className="chip-icon" />}
          {f.kind === "select" || f.kind === "iteration" ? f.value : `${f.name}: ${f.value}`}
        </span>
      ));
    }
  }
}
