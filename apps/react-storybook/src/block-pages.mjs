// Naming rules for generated Block (pattern) pages, shared by the generator
// (`generate-stories.mjs`) and the scoped selection (`test/storybook-family-selection.mjs`)
// so neither can accept what the other cannot resolve.

/** The kebab-case slug the scoped selection resolves a component family by. */
export function slugForFamily(family) {
  return family.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * The story export for a variant slug: its PascalCase words, prefixed with
 * `Variant` when that would not start a valid identifier (`2-column` becomes
 * `Variant2Column`).
 */
export function blockExportName(variantSlug) {
  const name = variantSlug.split('-').map((word) => `${word[0].toUpperCase()}${word.slice(1)}`).join('');
  return /^[A-Za-z_$]/u.test(name) ? name : `Variant${name}`;
}

/**
 * The story exports of one pattern's variants, in order. A variant slug that
 * emits an export another variant emits, `React`, or a component the page
 * imports would redeclare a binding, so each of those throws.
 * `variants` are `{ variantSlug, importName }`.
 */
export function blockStoryExports(patternId, variants) {
  const imported = new Set(['React', ...variants.map(({ importName }) => importName)]);
  const exports = [];
  for (const { variantSlug } of variants) {
    const exportName = blockExportName(variantSlug);
    if (exports.includes(exportName)) throw new Error(`${patternId} has two variants that both emit the story export ${exportName}`);
    if (imported.has(exportName)) throw new Error(`${patternId} variant ${variantSlug} emits the story export ${exportName}, which its page already imports; rename the variant`);
    exports.push(exportName);
  }
  return exports;
}

/**
 * Maps every key the scoped selection resolves a page group by (its lowercased
 * name and its slug) to its owner. `entries` are `{ family, slug }` for
 * component families and Block patterns alike. A key two groups share would
 * let one silently shadow the other, so it throws.
 */
export function selectionKeyOwners(entries) {
  const owners = new Map();
  for (const entry of entries) {
    for (const key of new Set([entry.family.toLowerCase(), entry.slug])) {
      const owner = owners.get(key);
      if (owner !== undefined && owner.family !== entry.family) {
        throw new Error(`"${key}" selects both ${owner.family} and ${entry.family}; rename one so a scoped run resolves it unambiguously`);
      }
      owners.set(key, entry);
    }
  }
  return owners;
}
