import manifest from '../.storybook/generated/manifest.mjs';

function slugForFamily(family) {
  return family.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

// A Block (pattern) page group is selected like a family, by its pattern name or slug.
const records = [
  ...manifest.families.map((record) => ({
    ...record,
    slug: slugForFamily(record.family),
  })),
  ...(manifest.patterns ?? []).map(({ family, slug }) => ({ family, slug })),
];
const byKey = new Map(records.flatMap((record) => [
  [record.family.toLowerCase(), record],
  [record.slug, record],
]));

export function selectedStorybookFamilies(environment = process.env) {
  const raw = environment.MUXUI_STORYBOOK_FAMILIES
    ?? environment.MUXUI_STORYBOOK_FAMILY_FILTER
    ?? environment.MUXUI_STORYBOOK_FAMILY;
  if (raw === undefined || raw === null) return null;
  const values = [...new Set(raw.split(',').map((value) => value.trim()))];
  if (values.length === 0 || values.some((value) => !value)) {
    throw new Error('MUXUI_STORYBOOK_FAMILY_SELECTION_EMPTY: provide at least one non-empty family');
  }
  const unknown = values.filter((value) => !byKey.has(value.toLowerCase()));
  if (unknown.length > 0) throw new Error(`MUXUI_STORYBOOK_FAMILY_UNKNOWN: ${unknown.join(', ')}`);
  return [...new Set(values.map((value) => byKey.get(value.toLowerCase()).family))].sort();
}

export function isFocusedStorybookSelection(environment = process.env) {
  return selectedStorybookFamilies(environment) !== null;
}

export function filterStorybookEntries(entries, families = selectedStorybookFamilies()) {
  if (!families) return entries;
  const selected = new Set(families);
  return entries.filter((entry) => selected.has(entry.title?.split('/').at(-1) ?? entry.id));
}

export function storybookSelectionLabel(families = selectedStorybookFamilies()) {
  return families ? `focused families: ${families.join(', ')}` : 'all manifest families';
}
