import { describe, expect, it } from "vitest";
import type { Classified } from "../classify";
import type { Item } from "../model";
import { hiddenUnread, type Filter } from "./hiddenUnread";

const entry = (id: string, kind: Item["kind"], sprint: string): Classified => ({ item: { id, kind, sprint } as unknown as Item }) as Classified;
const kind = (chosen: string): Filter => ({ options: ["all", "issue", "pr"], chosen, passes: (c, k) => k === "all" || c.item.kind === k });
const sprint = (chosen: string): Filter => ({ options: ["all", "s1", "s2"], chosen, passes: (c, s) => s === "all" || (c.item as unknown as { sprint: string }).sprint === s });

describe("hiddenUnread", () => {
  it("hides nothing when every unread item passes the chosen options", () => {
    expect(hiddenUnread([entry("a", "pr", "s1")], { kind: kind("all"), sprint: sprint("s1") })).toEqual({ count: 0, reveals: { kind: new Set(), sprint: new Set() } });
  });

  it("names the options that would show a hidden item, given the other filters' choices", () => {
    const { count, reveals } = hiddenUnread([entry("a", "pr", "s1"), entry("b", "issue", "s2")], { kind: kind("issue"), sprint: sprint("s1") });
    expect(count).toBe(2);
    expect(reveals.kind).toEqual(new Set(["all", "pr"]));
    expect(reveals.sprint).toEqual(new Set(["all", "s2"]));
  });

  it("counts an item two filters hide, though no single option reveals it", () => {
    const { count, reveals } = hiddenUnread([entry("a", "pr", "s2")], { kind: kind("issue"), sprint: sprint("s1") });
    expect(count).toBe(1);
    expect([...reveals.kind, ...reveals.sprint]).toEqual([]);
  });
});
