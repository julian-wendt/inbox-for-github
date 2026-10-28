import { describe, expect, it } from "vitest";
import { applyFormat } from "./markdownFormat";

describe("applyFormat", () => {
  it("wraps the selection and keeps it selected", () => {
    expect(applyFormat("fix this", 4, 8, "bold")).toEqual({ text: "fix **this**", start: 6, end: 10 });
    expect(applyFormat("fix this", 4, 8, "code")).toEqual({ text: "fix `this`", start: 5, end: 9 });
  });

  it("puts the cursor between the markers without a selection", () => {
    expect(applyFormat("", 0, 0, "italic")).toEqual({ text: "__", start: 1, end: 1 });
  });

  it("fences code that spans lines", () => {
    expect(applyFormat("a\nb", 0, 3, "code").text).toBe("```\na\nb\n```");
  });

  it("turns the selection into link text and selects the URL", () => {
    const edit = applyFormat("see docs", 4, 8, "link");
    expect(edit.text).toBe("see [docs](url)");
    expect(edit.text.slice(edit.start, edit.end)).toBe("url");
  });

  it("prefixes every selected line, numbering ordered lists", () => {
    expect(applyFormat("one\ntwo", 0, 7, "numbers").text).toBe("1. one\n2. two");
    expect(applyFormat("intro\nitem", 8, 8, "tasks").text).toBe("intro\n- [ ] item");
  });
});
