import { openUrl } from "@tauri-apps/plugin-opener";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { t } from "../i18n";
import { mentions } from "../mentions";

/** GitHub's own sanitizing rules, plus the classes our mention plugin puts on <strong>. */
const schema = {
  ...defaultSchema,
  attributes: { ...defaultSchema.attributes, strong: [...(defaultSchema.attributes?.strong ?? []), ["className", "mention", "me"]] },
};

const components: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        if (href) void openUrl(href);
      }}
    >
      {children}
    </a>
  ),
  // Attachments in private repos need a GitHub session the webview does not have.
  img: ({ src, alt }) => (
    <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} onError={(e) => (e.currentTarget.style.display = "none")} />
  ),
};

/**
 * GitHub-flavored Markdown, including the HTML GitHub allows (e.g. Dependabot's details blocks):
 * raw HTML is parsed, then sanitized with GitHub's rules, so scripts, styles and event handlers
 * never reach the page. `@login` mentions are bold, the viewer's own (`me`) also highlighted.
 */
export function Markdown({ source, me }: { source: string; me: string }) {
  if (!source.trim()) return <p className="md-empty">{t("detail.noDescription")}</p>;
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm, mentions(me)]} rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
