export type Format = "heading" | "bold" | "italic" | "quote" | "code" | "link" | "bullets" | "numbers" | "tasks" | "mention";

export interface Edit {
  text: string;
  /** The selection after the edit, as offsets into `text`. */
  start: number;
  end: number;
}

const WRAP: Partial<Record<Format, string>> = { bold: "**", italic: "_" };
const LINE_PREFIX: Partial<Record<Format, (index: number) => string>> = {
  heading: () => "### ",
  quote: () => "> ",
  bullets: () => "- ",
  numbers: (i) => `${i + 1}. `,
  tasks: () => "- [ ] ",
};

/**
 * Applies a toolbar format to the selection of a Markdown text, the way GitHub's comment box
 * does: bold and italic wrap the selection, code wraps it in backticks (a fence when it spans
 * lines), a link turns it into the link text and selects the URL placeholder, and the line
 * formats prefix every selected line. An empty selection gets the markers with the cursor
 * between them.
 *
 * @param text    The whole text.
 * @param start   Selection start offset.
 * @param end     Selection end offset; equal to `start` for a plain cursor.
 * @param format  The toolbar action.
 * @returns The new text and the selection to restore.
 *
 * @example
 *   applyFormat("fix this", 4, 8, "bold"); // { text: "fix **this**", start: 6, end: 10 }
 */
export function applyFormat(text: string, start: number, end: number, format: Format): Edit {
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);
  const wrap = (open: string, close = open): Edit => ({
    text: before + open + selected + close + after,
    start: start + open.length,
    end: end + open.length,
  });

  if (WRAP[format]) return wrap(WRAP[format]);
  if (format === "code") return selected.includes("\n") ? wrap("```\n", "\n```") : wrap("`");
  if (format === "mention") return wrap("@", "");
  if (format === "link") {
    const linked = `${before}[${selected}](url)${after}`;
    const url = start + selected.length + 3;
    return { text: linked, start: url, end: url + 3 };
  }

  const prefix = LINE_PREFIX[format]!;
  const lineStart = before.lastIndexOf("\n") + 1;
  const lines = text.slice(lineStart, end).split("\n");
  const prefixed = lines.map((line, i) => prefix(i) + line).join("\n");
  const added = prefixed.length - (end - lineStart);
  return { text: text.slice(0, lineStart) + prefixed + after, start: start + prefix(0).length, end: end + added };
}
