// The Blocks drift guard's matcher: does app source name a catalog pattern?
//
// A pattern's id or slug is a catalog fact, so app source may not author one. The
// match is on literal references only (a quoted id or slug, or a path segment), so
// ordinary words such as hero or pricing in prose, identifiers, and CSS pass.

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** The text of the first authored reference to the pattern `id` (`muxui:pattern:<slug>`) in `text`, or null. */
export function authoredPatternReference(text, id) {
	const slug = id.slice(id.lastIndexOf(':') + 1);
	const forms = [
		// The whole ArtifactRef, not the prefix of a longer id.
		new RegExp(`(?<![\\w:-])${escapeRegExp(id)}(?![\\w-])`, 'u'),
		// The slug as an entire string literal.
		new RegExp(`(["'\`])${escapeRegExp(slug)}\\1`, 'u'),
		// The slug as a whole path segment: /slug/, /slug?, /slug#, or /slug at the end of a literal.
		new RegExp(`/${escapeRegExp(slug)}(?=[/?#"'\`\\s)]|$)`, 'u'),
	];
	for (const form of forms) {
		const match = form.exec(text);
		if (match) return match[0];
	}
	return null;
}
