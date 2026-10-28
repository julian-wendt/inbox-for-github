import { Plus } from "lucide-react";
import { useState } from "react";
import type { Org } from "../../model";
import { sameLogin } from "../../timeline";
import { t } from "../i18n";

/**
 * Picks the organizations to watch: the viewer's own organizations as switches, plus any other
 * organization added by its login (e.g. one the viewer contributes to without membership).
 *
 * @param memberOrgs  The viewer's organizations; empty while they load.
 * @param selected    Logins currently picked.
 * @param onChange    Called with the new list of picked logins.
 *
 * @example
 *   <OrgPicker memberOrgs={inbox.memberOrgs} selected={orgs} onChange={setOrgs} />
 */
export function OrgPicker({ memberOrgs, selected, onChange }: { memberOrgs: Org[]; selected: string[]; onChange: (orgs: string[]) => void }) {
  const [extra, setExtra] = useState("");
  const isPicked = (login: string) => selected.some((s) => sameLogin(s, login));
  const toggle = (login: string, on: boolean) => onChange(on ? [...selected, login] : selected.filter((s) => !sameLogin(s, login)));
  const others = selected.filter((s) => !memberOrgs.some((o) => sameLogin(o.login, s)));
  const add = () => {
    const login = extra.trim().replace(/^@/, "");
    if (login && !isPicked(login)) onChange([...selected, login]);
    setExtra("");
  };

  return (
    <div className="field">
      {memberOrgs.length === 0 && <small>{t("orgs.loading")}</small>}
      {memberOrgs.map((org) => (
        <div key={org.login}>
          <label className="toggle-row org-row">
            <img className="avatar org-avatar" src={org.avatarUrl.startsWith("data:") ? org.avatarUrl : `${org.avatarUrl}${org.avatarUrl.includes("?") ? "&" : "?"}s=56`} width={28} height={28} alt="" />
            <span>
              <strong>{org.name ?? org.login}</strong>
              {org.name && org.name !== org.login && <small>{org.login}</small>}
            </span>
            <input type="checkbox" className="switch" checked={isPicked(org.login)} onChange={(e) => toggle(org.login, e.target.checked)} />
          </label>
        </div>
      ))}
      {others.map((login) => (
        <div key={login}>
          <label className="toggle-row org-row">
            <span className="org-avatar placeholder">{login.slice(0, 1).toUpperCase()}</span>
            <span>
              <strong>{login}</strong>
              <small>{t("orgs.notMember")}</small>
            </span>
            <input type="checkbox" className="switch" checked onChange={() => toggle(login, false)} />
          </label>
        </div>
      ))}
      <div className="org-add">
        <input
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.metaKey) {
              e.preventDefault();
              add();
            }
          }}
          placeholder={t("orgs.addPlaceholder")}
          spellCheck={false}
        />
        <button className="btn" onClick={add} disabled={!extra.trim()}>
          <Plus size={14} /> {t("orgs.add")}
        </button>
      </div>
      <small>{t("orgs.localOnly")}</small>
    </div>
  );
}
