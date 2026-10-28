import { describe, expect, it } from "vitest";
import { restoreCollapsed } from "./useCollapsed";

describe("restoreCollapsed", () => {
  it("starts with the initial bars on a device without a choice", () => {
    expect(restoreCollapsed(null, null, ["later", "inbox:later"], ["inbox:later"])).toEqual({ collapsed: ["later", "inbox:later"], applied: ["inbox:later"] });
  });

  it("collapses an added bar once where a choice was stored, and keeps the rest of the choice", () => {
    expect(restoreCollapsed('["todo"]', null, ["later", "inbox:later"], ["inbox:later"])).toEqual({ collapsed: ["todo", "inbox:later"], applied: ["inbox:later"] });
  });

  it("leaves an added bar open once the viewer opened it", () => {
    expect(restoreCollapsed('["todo"]', '["inbox:later"]', ["later", "inbox:later"], ["inbox:later"]).collapsed).toEqual(["todo"]);
  });

  it("treats garbage like no choice", () => {
    expect(restoreCollapsed('{"a":1}', "nonsense", ["later"], []).collapsed).toEqual(["later"]);
  });
});
