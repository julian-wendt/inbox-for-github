import {
  GitBranch,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Item } from "../../model";
import { t } from "../i18n";

/**
 * Pull request facts as pills for the detail's meta line, each when present: branch with size,
 * and conflicts. Renders nothing for issues.
 *
 * @example
 *   <ItemProps item={item} />
 */
export function ItemProps({ item }: { item: Item }) {
  const pull = item.pull;
  const chips: ReactNode[] = [];
  if (pull) {
    chips.push(
      <Chip key="branch" icon={GitBranch} title={t("props.branch", { head: pull.head, base: pull.base })}>
        <span className="chip-text mono">{pull.head}</span>
        <span className="diff">
          <span className="good">+{pull.additions}</span> <span className="bad">−{pull.deletions}</span>
        </span>
      </Chip>,
    );
    if (pull.conflicts) {
      chips.push(
        <Chip key="conflicts" icon={TriangleAlert} tone="bad" title={t("props.conflictsHint")}>
          {t("props.conflicts")}
        </Chip>,
      );
    }
  }
  return <>{chips}</>;
}

interface ChipProps {
  icon: LucideIcon;
  title: string;
  /** "good" or "bad" colors the icon. */
  tone?: string;
  children: ReactNode;
}

function Chip({ icon: Icon, title, tone = "", children }: ChipProps) {
  return (
    <span className="chip" title={title}>
      <Icon size={13} className={`chip-icon ${tone}`} />
      {children}
    </span>
  );
}
