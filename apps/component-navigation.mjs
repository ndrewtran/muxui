/** Group label per canonical component `category`; a record without one belongs to Components. */
const categoryLabels = /** @type {Record<string, 'AI Agent'>} */ ({ 'ai-agent': 'AI Agent' });

/**
 * The navigation group of a component record's optional `category`.
 * @param {string | undefined} category @returns {'Components' | 'AI Agent'}
 */
export function componentCategory(category) {
  if (category === undefined) return 'Components';
  if (!Object.hasOwn(categoryLabels, category)) {
    throw new Error(`Component category ${category} has no navigation group.`);
  }
  return categoryLabels[category];
}

/**
 * The `category` of every component record in a compiled catalog bundle, by slug.
 * @param {{ artifacts: readonly { id: string, kind: string, record: { category?: string } }[] }} bundle
 * @returns {Map<string, string | undefined>}
 */
export function componentRecordCategories({ artifacts }) {
  return new Map(artifacts
    .filter(({ kind }) => kind === 'component')
    .map(({ id, record }) => [id.slice(id.lastIndexOf(':') + 1), record.category]));
}

/**
 * Partition a canonical inventory without copying its component records.
 * @template T
 * @param {readonly T[]} items
 * @param {(item: T) => string | undefined} categoryFor the item's record `category`
 */
export function groupComponentNavigation(items, categoryFor) {
  /** @type {{ label: 'Components' | 'AI Agent', items: T[] }[]} */
  const groups = [{ label: 'AI Agent', items: [] }, { label: 'Components', items: [] }];
  for (const item of items) {
    groups[componentCategory(categoryFor(item)) === 'AI Agent' ? 0 : 1].items.push(item);
  }
  return groups;
}
