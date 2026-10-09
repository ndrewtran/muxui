const aiAgentSlugs = new Set(['code-block', 'prompt-composer', 'message', 'activity', 'data-diff']);

/** @param {string} slug @returns {'Components' | 'AI Agent'} */
export function componentCategory(slug) {
  return aiAgentSlugs.has(slug) ? 'AI Agent' : 'Components';
}

/**
 * Partition a canonical inventory without copying its component records.
 * @template T
 * @param {readonly T[]} items
 * @param {(item: T) => string} slugFor
 */
export function groupComponentNavigation(items, slugFor) {
  /** @type {{ label: 'Components' | 'AI Agent', items: T[] }[]} */
  const groups = [{ label: 'AI Agent', items: [] }, { label: 'Components', items: [] }];
  for (const item of items) {
    groups[componentCategory(slugFor(item)) === 'AI Agent' ? 0 : 1].items.push(item);
  }
  return groups;
}
