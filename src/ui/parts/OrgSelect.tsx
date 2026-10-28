import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import type { Org } from "../../model";
import type { RepoFilter } from "../../repoFilter";
import { sameLogin } from "../../timeline";
import { t } from "../i18n";

/** "All repos", "3 excluded" or "4 selected": what an organization's repo filter does. */
function summary(filter: RepoFilter | undefined, off: boolean): string {
  if (!filter) return t(off ? "repos.off" : "repos.all");
  const count = filter.repos.length;
  return filter.mode === "only" ? t("repos.selected", { count }) : count === 1 ? t("repos.exception") : t("repos.exceptions", { count });
}

/**
 * Dropdown to choose the organization whose repos to edit. Shows each organization with its logo
 * and a summary of its repo filter, so active filters stand out without opening every one.
 * Closes on a pick, a click outside or Escape.
 *
 * @param orgs        Picked organization logins to choose from.
 * @param memberOrgs  The viewer's organizations, for names and logos.
 * @param value       The chosen login.
 * @param filters     Organization login → its repo filter.
 * @param onChange    Called with the newly chosen login.
 * @param off         A missing filter reads "Off" instead of "All repos".
 *
 * @example
 *   <OrgSelect orgs={orgs} memberOrgs={inbox.memberOrgs} value={org} filters={filters} onChange={setOrg} />
 */
export function OrgSelect(props: { orgs: string[]; memberOrgs: Org[]; value: string; filters: Record<string, RepoFilter>; onChange: (org: string) => void; off?: boolean }) {
  const { orgs, memberOrgs, value, filters, onChange, off = false } = props;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Captured before the dialog's own Escape handler, so Escape closes the menu, not the dialog.
    const close = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", close, true);
    return () => window.removeEventListener("keydown", close, true);
  }, [open]);

  const option = (login: string) => {
    const org = memberOrgs.find((o) => sameLogin(o.login, login));
    return (
      <>
        {org ? (
          <img className="avatar org-avatar" src={`${org.avatarUrl}${org.avatarUrl.includes("?") ? "&" : "?"}s=48`} width={22} height={22} alt="" />
        ) : (
          <span className="org-avatar placeholder">{login.slice(0, 1).toUpperCase()}</span>
        )}
        <strong>{org?.name ?? login}</strong>
        <span className="org-select-summary">{summary(filters[login], off)}</span>
      </>
    );
  };

  return (
    <div className="org-select">
      <button className="org-select-button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        {option(value)}
        <ChevronDown size={15} className="org-select-chevron" />
      </button>
      {open && (
        <>
          <div className="popover-backdrop" onMouseDown={() => setOpen(false)} />
          <ul className="org-select-menu" role="listbox">
            {orgs.map((login) => (
              <li key={login} role="option" aria-selected={login === value}>
                <button
                  className={login === value ? "on" : ""}
                  onClick={() => {
                    onChange(login);
                    setOpen(false);
                  }}
                >
                  {option(login)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
