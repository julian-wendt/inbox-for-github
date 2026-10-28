import { describe, expect, it } from "vitest";
import { GitHubSimulator, avatarUrl } from "./world";

const HOUR = 3_600_000;

describe("the world's clock", () => {
  it("stands still until moved", () => {
    const world = new GitHubSimulator({ now: new Date("2026-10-25T12:00:00Z") });

    world.advance(HOUR);

    expect(world.stamp()).toBe("2026-10-25T13:00:00Z");
  });

  it("follows the wall clock when live", () => {
    const world = new GitHubSimulator({ live: true });
    const before = Date.now();

    const stamped = Date.parse(world.stamp());

    expect(stamped).toBeGreaterThanOrEqual(before - 1000);
    expect(stamped).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("writes older times inside `at` and puts the clock back after", () => {
    const world = new GitHubSimulator({ live: true });
    const issue = world.issue({ author: "alice" });

    world.at(2 * HOUR, () => world.comment(issue, "bob", "Earlier"));
    world.comment(issue, "bob", "Now");

    const [earlier, now] = world.raw(issue).comments.nodes.map((c) => Date.parse(c.createdAt));
    expect(now - earlier).toBeGreaterThan(2 * HOUR - 2000);
    expect(Date.now() - now).toBeLessThan(2000);
  });

  it("puts the clock back when the scenario throws", () => {
    const world = new GitHubSimulator({ now: new Date("2026-10-25T12:00:00Z") });

    expect(() => world.at(HOUR, () => { throw new Error("boom"); })).toThrow("boom");

    expect(world.stamp()).toBe("2026-10-25T12:00:00Z");
  });
});

describe("avatarUrl", () => {
  it("is an inline image with the login's initials, the same for the same login", () => {
    expect(avatarUrl("lena-f")).toBe(avatarUrl("lena-f"));
    expect(decodeURIComponent(avatarUrl("lena-f"))).toContain(">LF<");
    expect(decodeURIComponent(avatarUrl("juniper"))).toContain(">JU<");
    expect(decodeURIComponent(avatarUrl("ci-sentinel[bot]"))).toContain(">CS<");
    expect(avatarUrl("lena-f")).not.toBe(avatarUrl("sam-r"));
  });
});
