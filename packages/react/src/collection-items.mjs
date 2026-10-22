import React from 'react';

export function textContent(value) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (Array.isArray(value)) return value.map(textContent).join('');
  if (React.isValidElement(value)) return textContent(value.props.children);
  return '';
}

export function normalizeItems(items = []) {
  const used = new Set();
  return items.map((item, index) => {
    const source = typeof item === 'string' ? { label: item, value: item } : (item ?? {});
    const base = String(source.id ?? source.key ?? source.value ?? index);
    let id = base || String(index);
    let suffix = 1;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    const label = source.label ?? source.name ?? source.value ?? id;
    return { ...source, id, key: id, label, value: source.value ?? id, textValue: source.textValue ?? (textContent(label) || id) };
  });
}

export function keySet(value) {
  return value === undefined ? undefined : value === 'all' ? 'all' : new Set((value ?? []).map(String));
}

export function keyList(value) {
  return value === 'all' ? 'all' : [...(value ?? [])].map(String);
}

export function collectionItem(id) {
  return { id: String(id), key: String(id), value: String(id) };
}
