import { attributeValue, elements, textContent } from './html-tree.mjs';

// A compound's Events section lists the root's events, then each part that declares events under its owner:
//   <h3><code>ListBox.Item</code></h3><p data-fact="binding.api.partApis.item.events">...</p>

const partEvents = /^binding\.api\.partApis\.[^.]+\.events$/u;

/** The owner headings and part event lists of a rendered Events section, in document order. */
export function renderedEventGroups(events) {
	return elements(events)
		.filter((node) => node.tagName === 'h3' || partEvents.test(attributeValue(node, 'data-fact') ?? ''))
		.map((node) => (node.tagName === 'h3' ? textContent(node) : attributeValue(node, 'data-fact')));
}

/**
 * What the catalog says the Events section holds after the root's list: for each part that declares
 * events, in anatomy order, its owner heading and then its event list.
 * @param {string} exportName the package export that holds the parts
 * @param {[string, { member: string, events: string[] }][]} partApis the parts in anatomy order
 */
export function expectedEventGroups(exportName, partApis) {
	return partApis.filter(([, api]) => api.events.length > 0)
		.flatMap(([part, api]) => [`${exportName}.${api.member}`, `binding.api.partApis.${part}.events`]);
}
