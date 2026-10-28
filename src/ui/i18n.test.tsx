import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { RULES } from "../rules";
import { setLang, t, tRich } from "./i18n";
import { en } from "./locales/en";

describe("t", () => {
  it("fills placeholders in the current language", () => {
    setLang("en");
    expect(t("activity.commits", { count: 3 })).toBe("3 new commits");
    setLang("de");
    expect(t("activity.commits", { count: 3 })).toBe("3 neue Commits");
  });

  it("keeps unknown placeholders visible instead of dropping them", () => {
    setLang("en");
    expect(t("activity.commits")).toBe("{count} new commits");
  });
});

describe("tRich", () => {
  it("puts elements in place of placeholders", () => {
    setLang("en");
    const parts = tRich("activity.assigned", { name: <strong>alice</strong> }) as React.ReactElement<{ children: unknown }>[];
    expect(parts.map((p) => (isValidElement(p.props.children) ? "<el>" : p.props.children))).toEqual(["", "<el>", " assigned you"]);
  });
});

describe("rule texts", () => {
  it("has a title and a description for every rule", () => {
    for (const rule of RULES) {
      expect(Object.keys(en)).toContain(`rule.${rule.id}.title`);
      expect(Object.keys(en)).toContain(`rule.${rule.id}.description`);
    }
  });
});
