const escapeHtml = (text: string) => text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');

/**
 * The README and the reference write inline code between backticks. This is that text as HTML: the code is `<code>`, everything is
 * escaped. An unpaired backtick stays text.
 */
export function inlineHtml(text: string): string {
	const parts = text.split('`');
	return parts.map((part, index) => {
		if (index % 2 === 0) return escapeHtml(part);
		return index === parts.length - 1 ? `\`${escapeHtml(part)}` : `<code>${escapeHtml(part)}</code>`;
	}).join('');
}
