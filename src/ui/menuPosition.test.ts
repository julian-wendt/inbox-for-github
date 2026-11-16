import { describe, expect, it } from "vitest";
import { menuPosition } from "./menuPosition";

const view = { width: 1000, height: 700 };
const size = { width: 200, height: 100 };
const place = (at: Parameters<typeof menuPosition>[1]) => menuPosition(size, at, view, 6, 8);
const button = (left: number, top: number) => ({ left, right: left + 30, top, bottom: top + 26 });

describe("menuPosition", () => {
  it("hangs below its control, left edges lined up", () => {
    expect(place({ anchor: button(100, 10) })).toEqual({ x: 100, y: 42 });
  });

  it("lines up right edges for a control at the end of a bar", () => {
    expect(place({ anchor: button(500, 10), end: true })).toEqual({ x: 330, y: 42 });
  });

  it("switches to the other edge where the window ends", () => {
    expect(place({ anchor: button(900, 10) })).toEqual({ x: 730, y: 42 });
    expect(place({ anchor: button(20, 10), end: true })).toEqual({ x: 20, y: 42 });
  });

  it("opens above its control when there is no room below", () => {
    expect(place({ anchor: button(100, 640) })).toEqual({ x: 100, y: 534 });
  });

  it("stays inside the window when neither side has room", () => {
    expect(menuPosition({ width: 200, height: 680 }, { anchor: button(100, 300) }, view, 6, 8)).toEqual({ x: 100, y: 12 });
  });

  it("centers on the control's width for a menu a key opens", () => {
    expect(place({ anchor: { left: 300, right: 700, top: 100, bottom: 160 }, centerX: true })).toEqual({ x: 400, y: 166 });
  });

  it("opens at the pointer, pushed back inside the window", () => {
    expect(place({ x: 950, y: 690 })).toEqual({ x: 792, y: 592 });
    expect(place({ x: 500, y: 350, centered: true })).toEqual({ x: 400, y: 300 });
  });
});
