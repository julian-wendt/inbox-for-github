/** The few Markdown syntax tree fields this plugin reads and writes. */
interface Node {
  type: string;
  value?: string;
  children?: Node[];
  data?: { hProperties?: Record<string, unknown> };
}

const MENTION = /(^|[^\w/-])@([a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38})(?![\w/-])/gi;
const SKIP = new Set(["link", "linkReference", "inlineCode", "code"]);

/**
 * A remark plugin that turns `@login` in plain text into bold mentions, like GitHub does. The
 * viewer's own login also gets the class `me`. Code, inline code and links stay untouched.
 *
 * @param me  The viewer's login; matched case-insensitively.
 * @returns The plugin, to pass in `remarkPlugins`.
 *
 * @example
 *   <ReactMarkdown remarkPlugins={[remarkGfm, mentions("octocat")]}>{body}</ReactMarkdown>
 *   // "@octocat" → <strong class="mention me">@octocat</strong>
 */
export function mentions(me: string) {
  return () => (tree: Node) => markMentions(tree, me.toLowerCase());
}

function markMentions(node: Node, me: string): void {
  if (!node.children || SKIP.has(node.type)) return;
  node.children = node.children.flatMap((child) => {
    if (child.type === "text" && child.value) return split(child.value, me);
    markMentions(child, me);
    return [child];
  });
}

function split(text: string, me: string): Node[] {
  const nodes: Node[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION)) {
    const start = match.index + match[1].length;
    if (start > last) nodes.push({ type: "text", value: text.slice(last, start) });
    const login = match[2];
    nodes.push({
      type: "strong",
      data: { hProperties: { className: login.toLowerCase() === me ? "mention me" : "mention" } },
      children: [{ type: "text", value: `@${login}` }],
    });
    last = start + login.length + 1;
  }
  if (last < text.length) nodes.push({ type: "text", value: text.slice(last) });
  return nodes.length ? nodes : [{ type: "text", value: text }];
}
