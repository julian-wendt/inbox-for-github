import { LayoutList, Table2 } from "lucide-react";
import { t } from "../i18n";
import type { Layout } from "../useViewLayout";
import { HeaderMenu } from "./HeaderMenu";

/**
 * The menu in Planned's header that picks the list, with the detail beside it, or the table;
 * its icon shows the current one.
 *
 * @example
 *   <LayoutSwitch layout={layout} onLayout={setLayout} />
 */
export function LayoutSwitch({ layout, onLayout }: { layout: Layout; onLayout: (layout: Layout) => void }) {
  return (
    <HeaderMenu
      icon={layout === "table" ? <Table2 size={16} /> : <LayoutList size={16} />}
      title={t("layout.title")}
      entries={(["list", "table"] as const).map((l) => ({ label: t(`layout.${l}`), checked: layout === l, onSelect: () => onLayout(l) }))}
    />
  );
}
