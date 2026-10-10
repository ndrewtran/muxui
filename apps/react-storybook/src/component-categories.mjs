import { catalogJson } from '../../../packages/catalog/generated/catalog.mjs';
import { componentRecordCategories } from '../../component-navigation.mjs';

const categories = componentRecordCategories(JSON.parse(catalogJson));

/**
 * A component's record `category`, read from the generated catalog bundle. Node only: browser
 * code takes the group label from its caller.
 * @param {string} slug @returns {string | undefined}
 */
export function componentRecordCategory(slug) {
  if (!categories.has(slug)) throw new Error(`The catalog bundle has no component record for ${slug}.`);
  return categories.get(slug);
}
