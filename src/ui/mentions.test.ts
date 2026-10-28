import { describe, expect, it } from "vitest";
import { mentions } from "./mentions";

const paragraph = (...children: object[]) => ({ type: "root", children: [{ type: "paragraph", children }] });
const run = (tree: ReturnType<typeof paragraph>) => {
  mentions("Me")()(tree as never);
  return tree.children[0].children;
};

describe("mentions", () => {
  it("bolds every @login and marks the viewer", () => {
    expect(run(paragraph({ type: "text", value: "hi @me and @bob-2!" }))).toEqual([
      { type: "text", value: "hi " },
      { type: "strong", data: { hProperties: { className: "mention me" } }, children: [{ type: "text", value: "@me" }] },
      { type: "text", value: " and " },
      { type: "strong", data: { hProperties: { className: "mention" } }, children: [{ type: "text", value: "@bob-2" }] },
      { type: "text", value: "!" },
    ]);
  });

  it("leaves emails, team slugs, inline code and links alone", () => {
    const untouched = [
      { type: "text", value: "mail me@example.com or @org/team" },
      { type: "inlineCode", value: "@me" },
      { type: "link", children: [{ type: "text", value: "@me" }] },
    ];
    expect(run(paragraph(...structuredClone(untouched)))).toEqual(untouched);
  });
});
