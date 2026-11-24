import { afterEach, describe, expect, it } from "vitest";
import { setPlatform } from "./platform";
import { hotkeyOf } from "./useHotkeys";

afterEach(() => setPlatform("mac"));

const press = (key: string, held: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) => ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...held });

describe("hotkeyOf", () => {
  it("names ⌘ as mod and ⌃ as ctrl on macOS", () => {
    expect(hotkeyOf(press("k", { metaKey: true }))).toBe("mod+k");
    expect(hotkeyOf(press("a", { ctrlKey: true }))).toBe("ctrl+a");
    expect(hotkeyOf(press("R", { metaKey: true, shiftKey: true }))).toBe("mod+shift+r");
    expect(hotkeyOf(press(",", { metaKey: true }))).toBe("mod+,");
  });

  it("counts Shift for letters, and leaves shifted symbols and named keys as they arrive", () => {
    expect(hotkeyOf(press("A", { shiftKey: true }))).toBe("shift+a");
    expect(hotkeyOf(press("?", { shiftKey: true }))).toBe("?");
    expect(hotkeyOf(press("ArrowDown", { shiftKey: true }))).toBe("ArrowDown");
    expect(hotkeyOf(press("d"))).toBe("d");
  });

  it("names Ctrl as mod and Alt as ctrl on Windows, so one binding serves both platforms", () => {
    setPlatform("windows");
    expect(hotkeyOf(press("k", { ctrlKey: true }))).toBe("mod+k");
    expect(hotkeyOf(press("a", { altKey: true }))).toBe("ctrl+a");
    expect(hotkeyOf(press("R", { ctrlKey: true, shiftKey: true }))).toBe("mod+shift+r");
    expect(hotkeyOf(press("d"))).toBe("d");
  });

  it("gives a key pressed with AltGr on Windows a name nothing is bound under, also a plain letter", () => {
    setPlatform("windows");
    expect(hotkeyOf(press("@", { ctrlKey: true, altKey: true }))).toBe("altgr+@");
    expect(hotkeyOf(press("d", { ctrlKey: true, altKey: true }))).toBe("altgr+d");
  });
});
