import { useCallback, useEffect, useState } from "react";

/**
 * Keeps one id selected within an ordered list that changes under it.
 *
 * When the selected id leaves the list (e.g. an item moved to another bucket after a status
 * change), the item that took its place is selected, so working through a list never jumps back
 * to the top. That successor is chosen in the same render the list changes in, so whatever shows
 * the selection (the detail, its pop-up) never sees a frame without one.
 *
 * @param ids     The selectable ids in order.
 * @param header  Ids that only head a group (e.g. "bar:…"); a vanished item is followed by the
 *                next item, not by a header, so an open detail stays open.
 * @returns The selected id, moves by offset (`move(1)` = next) or to a given id, `select(null)`
 *   to select nothing until the next move or click, and `replaced`: true in the render where the
 *   selected id is a successor standing in for one that left the list.
 */
export function useSelection(ids: string[], header: (id: string) => boolean = () => false) {
  const [chosen, setChosen] = useState<{ id: string | null; index: number; none?: boolean }>({ id: ids[0] ?? null, index: 0 });
  const found = chosen.id ? ids.indexOf(chosen.id) : -1;
  const selected = chosen.none ? null : found >= 0 ? chosen.id : successor(ids, chosen, header);

  // Remembers where the selection sits, so the next change of the list finds its successor.
  useEffect(() => {
    const index = selected ? ids.indexOf(selected) : -1;
    if (chosen.none || (selected === chosen.id && (index < 0 || index === chosen.index))) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bookkeeping only; what renders is derived above
    setChosen({ id: selected, index: index >= 0 ? index : chosen.index });
  }, [ids, selected, chosen]);

  const select = useCallback(
    (id: string | null) => setChosen((current) => (id ? { id, index: Math.max(0, ids.indexOf(id)) } : { id: null, index: current.index, none: true })),
    [ids],
  );

  const move = useCallback(
    (offset: number) => {
      if (ids.length === 0) return;
      const index = selected ? ids.indexOf(selected) : -1;
      // After selecting nothing, the first move picks up where the selection was.
      const next = chosen.none ? Math.min(chosen.index, ids.length - 1) : Math.max(0, Math.min(ids.length - 1, index + offset));
      setChosen({ id: ids[next], index: next });
    },
    [ids, selected, chosen],
  );

  const replaced = !chosen.none && found < 0 && selected !== null;
  return { selected, select, move, replaced };
}

/** What takes a vanished selection's place: the id now at its index, or for an item the nearest item from there. */
export function successor(ids: string[], chosen: { id: string | null; index: number }, header: (id: string) => boolean): string | null {
  const start = Math.min(chosen.index, ids.length - 1);
  if (start < 0) return null;
  if (!chosen.id || header(chosen.id)) return ids[start];
  const after = ids.slice(start).find((id) => !header(id));
  const before = ids.slice(0, start).reverse().find((id) => !header(id));
  return after ?? before ?? ids[start];
}
