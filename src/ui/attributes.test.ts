import { describe, expect, it } from "vitest";
import type { Board } from "../model";
import { attributeOptions, reviewersOf, combineAttributes, moveAttribute, resolveAttributes, shownKeys, splitAttributes, tableKeys } from "./attributes";

const board = (title: string, fields: Board["fields"]): Board => ({ id: title, title, status: null, sprint: null, fields });
const items = [
  { boards: [board("Roadmap", [{ id: "F_comp", name: "Component", kind: "select", value: "API" }, { id: "F_sprint", name: "Sprint", kind: "iteration", value: "S1" }])] },
  { boards: [board("Roadmap", [{ id: "F_comp", name: "Component", kind: "select", value: "Portal" }])] },
];

describe("attributes", () => {
  it("lists the built-in attributes, then each board field once", () => {
    expect(attributeOptions(items).map((o) => o.key)).toEqual(["repo", "type", "status", "pr", "labels", "assignees", "reviewers", "field:F_comp", "field:F_sprint"]);
  });

  it("leaves out hidden boards and names the board only with two or more", () => {
    const two = [...items, { boards: [board("Tech", [{ id: "F_size", name: "Size", kind: "select", value: "S" }])] }];
    expect(attributeOptions(two).find((o) => o.key === "field:F_size")?.board).toBe("Tech");
    expect(attributeOptions(two, ["Tech"]).find((o) => o.key === "field:F_comp")?.board).toBeUndefined();
    expect(attributeOptions(two, ["Tech"]).some((o) => o.key === "field:F_size")).toBe(false);
  });

  it("shows built-ins and iterations by default", () => {
    const list = resolveAttributes(null, attributeOptions(items));
    expect(list.filter((s) => s.shown).map((s) => s.key)).toEqual(["repo", "type", "status", "pr", "labels", "assignees", "reviewers", "field:F_sprint"]);
  });

  it("keeps the stored order and appends attributes it does not know yet", () => {
    const list = resolveAttributes([{ key: "field:F_comp", shown: true }, { key: "repo", shown: false }, { key: "gone", shown: true }], attributeOptions(items));
    expect(list.map((s) => `${s.key}:${s.shown}`)).toEqual(["field:F_comp:true", "repo:false", "type:true", "status:true", "pr:true", "labels:true", "assignees:true", "reviewers:true", "field:F_sprint:true"]);
  });

  it("moves an attribute before the one it was dropped on", () => {
    const list = resolveAttributes(null, attributeOptions(items));
    expect(moveAttribute(list, "field:F_sprint", "repo").map((s) => s.key)[0]).toBe("field:F_sprint");
  });
});

describe("combined attributes", () => {
  it("shows both views in the table's order, each with its own switch", () => {
    const options = attributeOptions(items);
    const list = combineAttributes([{ key: "pr", shown: true }, { key: "repo", shown: false }], [{ key: "repo", shown: true }, { key: "pr", shown: false }], options);
    expect(list.slice(0, 2)).toEqual([
      { key: "pr", table: true, detail: false },
      { key: "repo", table: false, detail: true },
    ]);
    expect(shownKeys(list, "detail")[0]).toBe("repo");
    expect(splitAttributes(list).detailAttributes.slice(0, 2)).toEqual([
      { key: "pr", shown: false },
      { key: "repo", shown: true },
    ]);
  });

  it("lets each table switch attributes of its own, falling back to the shared table switch", () => {
    const list = [
      { key: "pr", table: true, detail: false },
      { key: "repo", table: false, detail: true },
      { key: "labels", table: true, detail: true },
    ];
    expect(tableKeys(list)).toEqual(["pr", "labels"]);
    expect(tableKeys(list, { repo: true, labels: false })).toEqual(["pr", "repo"]);
  });
});

describe("reviewersOf", () => {
  it("joins requested and submitted reviewers, without the author and teams", () => {
    const pr = {
      author: "alice",
      reviewRequests: [
        { reviewer: "bob", at: "2026-10-01T00:00:00Z" },
        { reviewer: "team:security", at: "2026-10-01T00:00:00Z" },
      ],
      reviews: [
        { author: "bob", at: "2026-10-02T00:00:00Z" },
        { author: "carol", at: "2026-10-02T00:00:00Z" },
        { author: "alice", at: "2026-10-02T00:00:00Z" },
      ],
    };
    expect(reviewersOf(pr)).toEqual(["bob", "carol"]);
  });
});
