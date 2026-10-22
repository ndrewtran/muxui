import React from 'react';
import type { ReactNode } from 'react';

/** An item a collection renders from data. Other string-keyed fields are consumer data. */
export interface MuxUICollectionItem {
  id?: string;
  key?: string;
  label?: ReactNode;
  /** Consumer data; named Select and ComboBox forms submit the item `id`, not `value`. */
  value?: string;
  textValue?: string;
  disabled?: boolean;
  [key: string]: unknown;
}
export type MuxUISelection = string[] | 'all';
export type MuxUIItems = (MuxUICollectionItem | string)[];

/** An item once `normalizeItems` has given it the fields the collection families read. */
export interface NormalizedItem extends MuxUICollectionItem {
  id: string;
  key: string;
  label: ReactNode;
  value: string;
  textValue: string;
}

export function textContent(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (Array.isArray(value)) return value.map(textContent).join('');
  if (React.isValidElement<{ children?: unknown }>(value)) return textContent(value.props.children);
  return '';
}

export function normalizeItems(items: MuxUIItems = []): NormalizedItem[] {
  const used = new Set<string>();
  return items.map((item, index) => {
    const source: MuxUICollectionItem = typeof item === 'string' ? { label: item, value: item } : (item ?? {});
    const base = String(source.id ?? source.key ?? source.value ?? index);
    let id = base || String(index);
    let suffix = 1;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    // An item may carry its label as `name`, which the index signature leaves unknown.
    const label = (source.label ?? source.name ?? source.value ?? id) as ReactNode;
    return { ...source, id, key: id, label, value: source.value ?? id, textValue: source.textValue ?? (textContent(label) || id) };
  });
}

export function keySet(value: MuxUISelection | undefined): Set<string> | 'all' | undefined {
  return value === undefined ? undefined : value === 'all' ? 'all' : new Set((value ?? []).map(String));
}

export function keyList(value: 'all' | Iterable<string | number> | null | undefined): MuxUISelection {
  return value === 'all' ? 'all' : [...(value ?? [])].map(String);
}

export function collectionItem(id: string | number): MuxUICollectionItem {
  return { id: String(id), key: String(id), value: String(id) };
}
