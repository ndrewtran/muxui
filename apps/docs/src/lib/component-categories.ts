import { createRequire } from 'node:module';
import { componentRecordCategories } from '../../../component-navigation.mjs';

let categories: ReadonlyMap<string, string | undefined> | undefined;

/**
 * A component's record `category`, read from the generated catalog bundle (the declared
 * `@muxui/catalog/bundle` export), the same bundle the query API serves. The query API's
 * component brief carries no category.
 */
export function componentRecordCategory(slug: string): string | undefined {
	if (categories === undefined) {
		const { catalogJson } = createRequire(import.meta.url)('@muxui/catalog/bundle');
		categories = componentRecordCategories(JSON.parse(catalogJson));
	}
	if (!categories.has(slug)) throw new Error(`The catalog bundle has no component record for ${slug}.`);
	return categories.get(slug);
}
