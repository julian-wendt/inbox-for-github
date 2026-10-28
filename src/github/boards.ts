import type { Board, BoardField } from "../model";
import { graphql } from "./client";

const BATCH = 50;

// Loading every field kind costs the same as Status and sprint alone (6 points per 50 items, measured 2026-10-23).
const FIELD = "field { ... on ProjectV2FieldCommon { id name } }";

/** GitHub's own fields, shown elsewhere already. */
const BUILT_IN = new Set(["Title", "Status"]);

const BOARD_ITEMS = `
  id
  projectItems(first: 10) {
    nodes {
      project { id title }
      fieldValues(first: 20) {
        nodes {
          ... on ProjectV2ItemFieldSingleSelectValue { name color ${FIELD} }
          ... on ProjectV2ItemFieldIterationValue { title ${FIELD} }
          ... on ProjectV2ItemFieldTextValue { text ${FIELD} }
          ... on ProjectV2ItemFieldNumberValue { number ${FIELD} }
          ... on ProjectV2ItemFieldDateValue { date ${FIELD} }
        }
      }
    }
  }
`;

const QUERY = `
query ($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Issue { ${BOARD_ITEMS} }
    ... on PullRequest { ${BOARD_ITEMS} }
  }
}`;

interface RawFieldValue {
  name?: string;
  color?: string;
  title?: string;
  text?: string;
  number?: number;
  date?: string;
  field?: { id?: string; name?: string };
}

export interface RawBoardNode {
  id?: string;
  projectItems?: {
    nodes: {
      project: { id: string; title: string } | null;
      fieldValues: { nodes: RawFieldValue[] };
    }[];
  };
}

/**
 * Loads the GitHub Projects boards each item sits on, with its "Status", its sprint (the first
 * iteration field) and every other field value there (`fields`), except GitHub's built-in ones.
 *
 * Runs apart from the item search and never throws: a token without the `project` scope, or any
 * other failure, leaves the affected items without boards instead of breaking the inbox.
 *
 * @param token  GitHub token; needs the `project` (or `read:project`) scope for any result.
 * @param ids    Node ids of issues and pull requests.
 * @returns Board list per node id; ids without boards or with failed batches are missing.
 *
 * @example
 *   const boards = await fetchBoards(token, items.map((i) => i.id));
 *   boards.get(item.id); // [{ id: "PVT_…", title: "Roadmap", status: "Backlog", sprint: "Sprint 2026-11", fields: […] }]
 */
export async function fetchBoards(token: string, ids: string[], signal?: AbortSignal): Promise<Map<string, Board[]>> {
  const batches = Array.from({ length: Math.ceil(ids.length / BATCH) }, (_, i) => ids.slice(i * BATCH, (i + 1) * BATCH));
  const results = await Promise.allSettled(batches.map((batch) => graphql<{ nodes: RawBoardNode[] }>(token, QUERY, { ids: batch }, signal)));
  const byId = new Map<string, Board[]>();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const node of result.value.nodes) {
      if (node?.id) byId.set(node.id, toBoards(node));
    }
  }
  return byId;
}

export function toBoards(node: RawBoardNode): Board[] {
  return (node.projectItems?.nodes ?? []).flatMap(({ project, fieldValues }) => {
    if (!project) return [];
    const values = fieldValues.nodes;
    return [
      {
        id: project.id,
        title: project.title,
        status: values.find((v) => v.name && v.field?.name === "Status")?.name ?? null,
        ...statusColor(values),
        sprint: values.find((v) => v.title)?.title ?? null,
        fields: values.flatMap(toField),
      },
    ];
  });
}

function toField(v: RawFieldValue): BoardField[] {
  const { id, name } = v.field ?? {};
  if (!id || !name || BUILT_IN.has(name)) return [];
  if (v.name !== undefined) return [{ id, name, kind: "select", value: v.name, ...(v.color && { color: v.color }) }];
  if (v.title !== undefined) return [{ id, name, kind: "iteration", value: v.title }];
  if (v.text !== undefined) return [{ id, name, kind: "text", value: v.text }];
  if (v.number !== undefined) return [{ id, name, kind: "number", value: String(v.number) }];
  if (v.date !== undefined) return [{ id, name, kind: "date", value: v.date }];
  return [];
}

function statusColor(values: RawFieldValue[]): { statusColor?: string } {
  const color = values.find((v) => v.name && v.field?.name === "Status")?.color;
  return color ? { statusColor: color } : {};
}
