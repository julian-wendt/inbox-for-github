import { describe, expect, it } from "vitest";
import { NEW_SETTINGS, unseenSettings } from "./newSettings";

describe("unseenSettings", () => {
  it("lists every new setting until seen, per section when asked", () => {
    expect(unseenSettings([])).toHaveLength(NEW_SETTINGS.length);
    expect(unseenSettings(NEW_SETTINGS.map((s) => s.key))).toEqual([]);
    expect(unseenSettings([], "general")).toEqual([]);
    expect(unseenSettings(["tabToButtons"], "look")).not.toContain("tabToButtons");
  });
});
