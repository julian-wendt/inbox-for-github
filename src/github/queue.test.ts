import { describe, expect, it } from "vitest";
import { queueWrite } from "./queue";

describe("queueWrite", () => {
  it("runs writes one after another, also past a failure", async () => {
    const log: string[] = [];
    const slow = queueWrite(() => new Promise<void>((done) => setTimeout(() => (log.push("slow"), done()), 20)));
    const failing = queueWrite(() => {
      log.push("failing");
      return Promise.reject(new Error("no"));
    });
    const fast = queueWrite(() => {
      log.push("fast");
      return Promise.resolve();
    });
    await Promise.allSettled([slow, failing, fast]);
    expect(log).toEqual(["slow", "failing", "fast"]);
    await expect(failing).rejects.toThrow("no");
  });
});
