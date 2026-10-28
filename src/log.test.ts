import { describe, expect, it } from "vitest";
import { formatLine } from "./log";

describe("formatLine", () => {
  it("writes time, level, message and key=value pairs", () => {
    expect(formatLine(new Date("2026-10-25T14:03:01.123Z"), "debug", "refresh", { kind: "delta", items: 12 })).toBe("2026-10-25T14:03:01.123Z debug refresh kind=delta items=12");
  });

  it("quotes values with spaces and leaves undefined ones out", () => {
    expect(formatLine(new Date("2026-10-25T14:03:01.123Z"), "verbose", "classify", { why: "pending mention", skipped: undefined })).toBe(
      '2026-10-25T14:03:01.123Z verbose classify why="pending mention"',
    );
  });
});
