import type { Reaction, ReactionContent } from "../model";
import { graphql } from "./client";
import { reactionsOf, type RawReactionGroup } from "./fetch";

const ADD_COMMENT = `
mutation ($subjectId: ID!, $body: String!) {
  addComment(input: { subjectId: $subjectId, body: $body }) { commentEdge { node { url } } }
}`;

/**
 * Posts a comment on an issue or pull request as the token's owner. Plain conversation comments
 * only: review replies, approvals and change requests stay in GitHub's own UI.
 *
 * @param token      A token with the `repo` scope (`public_repo` suffices for public repos).
 * @param subjectId  The node id of the issue or pull request, i.e. `Item.id`.
 * @param body       The comment in GitHub-flavored Markdown.
 * @returns The new comment's URL.
 * @throws Error with GitHub's message, e.g. for a missing scope or a locked conversation.
 *
 * @example
 *   await addComment(token, item.id, "Thanks, @alice, fixed in the next push.");
 */
export async function addComment(token: string, subjectId: string, body: string): Promise<string> {
  const data = await graphql<{ addComment: { commentEdge: { node: { url: string } } } }>(token, ADD_COMMENT, { subjectId, body });
  return data.addComment.commentEdge.node.url;
}

const ADD_ASSIGNEE = `
mutation ($id: ID!, $me: ID!) {
  addAssigneesToAssignable(input: { assignableId: $id, assigneeIds: [$me] }) {
    assignable { ... on Issue { assignees(first: 10) { nodes { login } } } ... on PullRequest { assignees(first: 10) { nodes { login } } } }
  }
}`;

const REMOVE_ASSIGNEE = `
mutation ($id: ID!, $me: ID!) {
  removeAssigneesFromAssignable(input: { assignableId: $id, assigneeIds: [$me] }) {
    assignable { ... on Issue { assignees(first: 10) { nodes { login } } } ... on PullRequest { assignees(first: 10) { nodes { login } } } }
  }
}`;

type AssigneesPayload = { assignable: { assignees: { nodes: { login: string }[] } } };

/** The viewer's node id, asked once per session: it never changes for a token's owner. */
let viewerId: Promise<string> | null = null;

function viewerNodeId(token: string): Promise<string> {
  viewerId ??= graphql<{ viewer: { id: string } }>(token, "{ viewer { id } }", {}).then((d) => d.viewer.id);
  return viewerId.catch((e: unknown) => {
    viewerId = null;
    throw e;
  });
}

/**
 * Adds the token's owner to an issue's or pull request's assignees, like "assign yourself" on
 * GitHub; others stay assigned. One request of 1 point, plus one for the viewer's node id the
 * first time in a session.
 *
 * @param token   A token with the `repo` scope.
 * @param itemId  The node id of the issue or pull request, i.e. `Item.id`.
 * @returns The item's assignees after the change, as GitHub has them.
 * @throws Error with GitHub's message, e.g. when the viewer cannot be assigned in that repository.
 *
 * @example
 *   await assignSelf(token, item.id); // ["alice", "octocat"]
 */
export async function assignSelf(token: string, itemId: string): Promise<string[]> {
  const me = await viewerNodeId(token);
  const data = await graphql<{ addAssigneesToAssignable: AssigneesPayload }>(token, ADD_ASSIGNEE, { id: itemId, me });
  return data.addAssigneesToAssignable.assignable.assignees.nodes.map((n) => n.login);
}

/**
 * Removes the token's owner from an issue's or pull request's assignees; others stay assigned.
 * Costs like `assignSelf`.
 *
 * @returns The item's assignees after the change, as GitHub has them.
 * @throws Error with GitHub's message, e.g. when the viewer lacks write access to the repository.
 *
 * @example
 *   await unassignSelf(token, item.id); // ["alice"]
 */
export async function unassignSelf(token: string, itemId: string): Promise<string[]> {
  const me = await viewerNodeId(token);
  const data = await graphql<{ removeAssigneesFromAssignable: AssigneesPayload }>(token, REMOVE_ASSIGNEE, { id: itemId, me });
  return data.removeAssigneesFromAssignable.assignable.assignees.nodes.map((n) => n.login);
}

/** Why an issue is closed; pull requests have no reason. */
export type CloseReason = "COMPLETED" | "NOT_PLANNED";

const MUTATIONS = {
  closeIssue: "mutation ($id: ID!, $reason: IssueClosedStateReason) { closeIssue(input: { issueId: $id, stateReason: $reason }) { clientMutationId } }",
  closePullRequest: "mutation ($id: ID!) { closePullRequest(input: { pullRequestId: $id }) { clientMutationId } }",
  reopenIssue: "mutation ($id: ID!) { reopenIssue(input: { issueId: $id }) { clientMutationId } }",
  reopenPullRequest: "mutation ($id: ID!) { reopenPullRequest(input: { pullRequestId: $id }) { clientMutationId } }",
};

/**
 * Closes or reopens an issue or pull request, like the button next to GitHub's comment box.
 * Merged pull requests cannot be reopened.
 *
 * @param token   A token with the `repo` scope.
 * @param item    The item's node id and kind.
 * @param action  "close" or "reopen".
 * @param reason  For closing issues: completed (the default) or not planned.
 * @throws Error with GitHub's message, e.g. when the viewer lacks write access.
 *
 * @example
 *   await setOpen(token, { id: item.id, kind: "issue" }, "close", "NOT_PLANNED");
 */
export async function setOpen(token: string, item: { id: string; kind: "issue" | "pr" }, action: "close" | "reopen", reason: CloseReason = "COMPLETED"): Promise<void> {
  const name: keyof typeof MUTATIONS = `${action}${item.kind === "pr" ? "PullRequest" : "Issue"}`;
  await graphql(token, MUTATIONS[name], item.kind === "issue" && action === "close" ? { id: item.id, reason } : { id: item.id });
}

const REACTION_GROUPS = "subject { reactionGroups { content viewerHasReacted reactors { totalCount } } }";
const ADD_REACTION = `mutation ($id: ID!, $content: ReactionContent!) { addReaction(input: { subjectId: $id, content: $content }) { ${REACTION_GROUPS} } }`;
const REMOVE_REACTION = `mutation ($id: ID!, $content: ReactionContent!) { removeReaction(input: { subjectId: $id, content: $content }) { ${REACTION_GROUPS} } }`;

type ReactionPayload = { subject: { reactionGroups: RawReactionGroup[] } };

/**
 * Adds or takes back the token owner's reaction on an issue's or pull request's description, a
 * comment, a review or an inline review comment, like GitHub's emoji picker. Only the viewer's
 * own reaction; one request of 1 point. Adding one that is there, or removing one that is not,
 * changes nothing.
 *
 * @param token    A token with the `repo` scope (`public_repo` suffices for public repos).
 * @param subject  The node id of the item (`Item.id`) or the post (`Comment.id`).
 * @param content  The emoji, e.g. "HEART".
 * @param on       True adds, false removes.
 * @returns The post's reactions after the change, as GitHub has them (see `reactionsOf`).
 * @throws Error with GitHub's message, e.g. for a locked conversation or a node that is gone.
 *
 * @example
 *   await setReaction(token, comment.id, "THUMBS_UP", true); // [{ content: "THUMBS_UP", count: 3, mine: true }]
 */
export async function setReaction(token: string, subject: string, content: ReactionContent, on: boolean): Promise<Reaction[]> {
  const variables = { id: subject, content };
  if (on) return reactionsOf((await graphql<{ addReaction: ReactionPayload }>(token, ADD_REACTION, variables)).addReaction.subject.reactionGroups);
  return reactionsOf((await graphql<{ removeReaction: ReactionPayload }>(token, REMOVE_REACTION, variables)).removeReaction.subject.reactionGroups);
}
