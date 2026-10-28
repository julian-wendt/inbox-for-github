import type { Span } from "../textFilter";

/**
 * Prints text with the parts the search matched marked. Without a hit it prints the plain text.
 *
 * @param spans  The text split by `titleSpans` or `numberSpans`.
 *
 * @example
 *   <Highlight spans={titleSpans(item.title, search ?? "")} />
 */
export function Highlight({ spans }: { spans: Span[] }) {
  return spans.map((s, i) => (s.hit ? <mark key={i} className="hit">{s.text}</mark> : s.text));
}
