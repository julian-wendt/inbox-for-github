import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./Markdown";

const html = (source: string) => renderToStaticMarkup(<Markdown source={source} me="me" />);

describe("Markdown", () => {
  it("renders the HTML GitHub allows, like Dependabot's details blocks", () => {
    const out = html("<details>\n<summary>Release notes</summary>\n\n<p>Fixed <b>a bug</b></p>\n</details>");
    expect(out).toContain("<details>");
    expect(out).toContain("<summary>Release notes</summary>");
    expect(out).toContain("<b>a bug</b>");
  });

  it("strips scripts, event handlers and comments", () => {
    const out = html('<!-- hidden --><script>alert(1)</script><img src="x.png" onerror="alert(2)"><a href="javascript:alert(3)">x</a>');
    expect(out).not.toMatch(/script|onerror|javascript:|hidden/);
  });

  it("keeps the mention classes and task list checkboxes", () => {
    const out = html("- [x] done for @me");
    expect(out).toContain('<strong class="mention me">@me</strong>');
    expect(out).toContain('type="checkbox"');
  });
});
