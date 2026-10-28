import { GripVertical } from "lucide-react";
import { useState } from "react";
import { moveAttribute, type AttributeOption, type CombinedAttribute } from "../attributes";
import { t, type MessageKey } from "../i18n";

/**
 * The attribute settings in one list: one order for the detail and the tables, reorderable by
 * drag and drop, and the detail's switch in each row; the tables switch theirs in their header.
 * Board fields show their name (and board, when given); built-in attributes their translated name.
 *
 * @param list      The attributes in order, from `combineAttributes`.
 * @param options   From `attributeOptions`, for the names.
 * @param onChange  Called with the new list after a switch or a move.
 *
 * @example
 *   <AttributeList list={combined} options={options} onChange={(list) => change(splitAttributes(list))} />
 */
export function AttributeList({ list, options, onChange }: { list: CombinedAttribute[]; options: AttributeOption[]; onChange: (list: CombinedAttribute[]) => void }) {
  const [dragged, setDragged] = useState<string | null>(null);
  const flip = (key: string, on: boolean) => onChange(list.map((x) => (x.key === key ? { ...x, detail: on } : x)));
  return (
    <div className="field">
      <span className="attribute-head">
        {t("settings.attributesAll")}
        <small>{t("settings.attributes.detail")}</small>
      </span>
      <ul className="attribute-list">
        {list.map((a) => {
          const option = options.find((o) => o.key === a.key)!;
          const name = option.field ? option.name : t(`attr.${a.key}` as MessageKey);
          return (
            <li
              key={a.key}
              className={`attribute-row${dragged && dragged !== a.key ? " droppable" : ""}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                setDragged(a.key);
              }}
              onDragEnd={() => setDragged(null)}
              onDragOver={(e) => dragged && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragged) onChange(moveAttribute(list, dragged, a.key));
                setDragged(null);
              }}
            >
              <GripVertical size={14} className="attribute-grip" />
              <span className="attribute-name">
                {name}
                {option.board && <small>{option.board}</small>}
              </span>
              <input type="checkbox" className="switch" checked={a.detail} onChange={(e) => flip(a.key, e.target.checked)} aria-label={`${name} · ${t("settings.attributes.detail")}`} />
            </li>
          );
        })}
      </ul>
      <small>{t("settings.attributesAllHint")}</small>
    </div>
  );
}
