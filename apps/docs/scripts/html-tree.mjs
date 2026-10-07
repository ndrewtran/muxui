// Small parse5 tree helpers shared by the rendered-output contracts.

export function classNames(node) {
	return new Set((node.attrs?.find(({ name }) => name === 'class')?.value ?? '').split(/\s+/u).filter(Boolean));
}

/** Every descendant element, depth first. */
export function elements(node) {
	const descendants = [];
	for (const child of node.childNodes ?? []) {
		if (child.tagName !== undefined) {
			descendants.push(child, ...elements(child));
		}
	}
	return descendants;
}

export function textContent(node) {
	return (node.childNodes ?? []).map((child) => {
		if (child.nodeName === '#text') return child.value;
		if (child.nodeName === '#comment') return '';
		return textContent(child);
	}).join('');
}

export function attributeValue(node, name) {
	return node.attrs?.find(({ name: attributeName }) => attributeName === name)?.value;
}
