import { afterEach, describe, expect, it } from "vitest";
import { detectPlatform, isWindows, modifiersOf, platform, platformOf, setPlatform } from "./platform";

afterEach(() => setPlatform("mac"));

const held = (keys: Partial<Record<"metaKey" | "ctrlKey" | "altKey", boolean>>) => ({ metaKey: false, ctrlKey: false, altKey: false, ...keys });

describe("platformOf", () => {
  it("reads Windows from WebView2's user agent and takes everything else as macOS", () => {
    expect(platformOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0")).toBe("windows");
    expect(platformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)")).toBe("mac");
    expect(platformOf("")).toBe("mac");
  });
});

describe("detectPlatform", () => {
  it("lets the address force a platform, and ignores values it does not know", () => {
    expect(detectPlatform("?lang=de&platform=windows")).toBe("windows");
    expect(detectPlatform("?platform=mac")).toBe("mac");
    expect(detectPlatform("?platform=linux")).toBe("mac");
  });
});

describe("platform", () => {
  it("is macOS without a window, so the tests run alike on every machine", () => {
    expect(platform()).toBe("mac");
    expect(isWindows()).toBe(false);
  });

  it("follows setPlatform", () => {
    setPlatform("windows");
    expect(platform()).toBe("windows");
    expect(isWindows()).toBe(true);
  });
});

describe("modifiersOf", () => {
  it("takes ⌘ as mod and ⌃ as ctrl on macOS", () => {
    expect(modifiersOf(held({ metaKey: true }))).toEqual({ mod: true, ctrl: false, altGr: false });
    expect(modifiersOf(held({ ctrlKey: true }))).toEqual({ mod: false, ctrl: true, altGr: false });
    expect(modifiersOf(held({ altKey: true }))).toEqual({ mod: false, ctrl: false, altGr: false });
    expect(modifiersOf(held({ ctrlKey: true, altKey: true }))).toEqual({ mod: false, ctrl: true, altGr: false });
  });

  it("takes Ctrl as mod and Alt as ctrl on Windows", () => {
    setPlatform("windows");
    expect(modifiersOf(held({ ctrlKey: true }))).toEqual({ mod: true, ctrl: false, altGr: false });
    expect(modifiersOf(held({ altKey: true }))).toEqual({ mod: false, ctrl: true, altGr: false });
    expect(modifiersOf(held({ metaKey: true }))).toEqual({ mod: false, ctrl: false, altGr: false });
  });

  it("counts AltGr, which Windows reports as Ctrl and Alt together, as neither, and says it is held", () => {
    setPlatform("windows");
    expect(modifiersOf(held({ ctrlKey: true, altKey: true }))).toEqual({ mod: false, ctrl: false, altGr: true });
  });
});
