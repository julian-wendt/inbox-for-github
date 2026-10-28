import { RotateCcw, Shuffle } from "lucide-react";
import { useOrbLogins } from "../avatarKinds";
import { t } from "../i18n";
import { preferredLook } from "../orb";
import { resetLook, shuffleLook } from "../orbLooks";
import { Avatar } from "./Avatar";

/**
 * The list in Settings → Avatars where the viewer draws a person's orb again until it pleases
 * them: everyone seen without a picture of their own. No two people share an orb, so a shuffle
 * only lands on orbs nobody has; resetting returns to the first orb the name gives, or the next
 * free one. The choice is a look per login (`Settings.orbLooks`).
 *
 * @param looks     Login → the look that person has.
 * @param onChange  Receives the whole new map after a shuffle or a reset.
 *
 * @example
 *   <OrbShuffle looks={draft.orbLooks} onChange={(orbLooks) => change({ orbLooks })} />
 */
export function OrbShuffle({ looks, onChange }: { looks: Record<string, number>; onChange: (next: Record<string, number>) => void }) {
  const seen = useOrbLogins();
  const logins = [...new Set([...seen, ...Object.keys(looks)])].sort((a, b) => a.localeCompare(b));

  if (logins.length === 0) return <p className="hint">{t("settings.orbsEmpty")}</p>;

  return (
    <ul className="orb-list">
      {logins.map((login) => (
        <li key={login}>
          <Avatar login={login} size={28} />
          <span className="orb-name">{login}</span>
          <button className="icon-btn" title={t("settings.orbReset", { name: login })} aria-label={t("settings.orbReset", { name: login })} disabled={looks[login] === undefined || looks[login] === preferredLook(login)} onClick={() => onChange(resetLook(login, looks))}>
            <RotateCcw size={14} />
          </button>
          <button className="icon-btn" title={t("settings.orbShuffle", { name: login })} aria-label={t("settings.orbShuffle", { name: login })} onClick={() => onChange(shuffleLook(login, looks))}>
            <Shuffle size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}
