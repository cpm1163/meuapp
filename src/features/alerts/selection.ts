// Selection rules of the alerts screen, kept apart from the screen so they can be tested without rendering it.
export type AlertSelection = ReadonlySet<string>;

export function toggleOne(selected: AlertSelection, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

export function isAllSelected(selected: AlertSelection, loadedIds: string[]) {
  return loadedIds.length > 0 && loadedIds.every(id => selected.has(id));
}

// Marks every loaded alert or, when all of them are already marked, unmarks them.
export function toggleAll(selected: AlertSelection, loadedIds: string[]): Set<string> {
  return isAllSelected(selected, loadedIds) ? new Set() : new Set(loadedIds);
}

// After a deletion, only the deleted ids leave the selection.
export function withoutIds(selected: AlertSelection, ids: string[]): Set<string> {
  const next = new Set(selected);
  ids.forEach(id => next.delete(id));
  return next;
}

// After a reload, alerts that no longer exist leave the selection.
export function keepLoaded(selected: AlertSelection, loadedIds: string[]): Set<string> {
  const loaded = new Set(loadedIds);
  return new Set([...selected].filter(id => loaded.has(id)));
}

// The list is limited, so "Marcar todos" may not reach every alert; null total means the count is unavailable.
export function selectionNotice(selectedCount: number, loadedCount: number, total: number | null) {
  if (selectedCount === 0 || total === null || total <= loadedCount) return null;
  return `${selectedCount} de ${total} marcados`;
}
