import { Copy, KeyRound } from "lucide-react";
import { useState } from "react";
import { REQUIRED_SCOPES, type Scope } from "../../github/client";
import { t } from "../i18n";

/**
 * Notice for a token that lacks scopes the app needs: what is missing, what that costs, and the
 * `gh` command that adds them, with a copy button. Renders nothing when nothing is missing.
 *
 * @example
 *   <ScopeNotice missing={["project"]} />
 */
export function ScopeNotice({ missing }: { missing: Scope[] }) {
  const [copied, setCopied] = useState(false);
  if (missing.length === 0) return null;
  const command = `gh auth refresh -s ${REQUIRED_SCOPES.join(",")}`;
  const copy = () => {
    void navigator.clipboard.writeText(command).then(() => setCopied(true));
  };
  return (
    <div className="scope-notice" role="status">
      <strong>
        <KeyRound size={13} /> {t("scopes.title")}
      </strong>
      <ul>
        {missing.map((scope) => (
          <li key={scope}>
            <code>{scope}</code> {t(`scopes.${scope}`)}
          </li>
        ))}
      </ul>
      <small>{t("scopes.fix")}</small>
      <button className="scope-command" onClick={copy} title={t("scopes.copy")}>
        <code>{command}</code>
        <Copy size={12} />
      </button>
      {copied && <small>{t("scopes.copied")}</small>}
    </div>
  );
}
