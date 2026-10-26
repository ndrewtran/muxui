// Exact class-token checks on rendered markup. A regex such as /muxui-tag-group/ also matches muxui-tag-group__list, so once parts
// carry the family name as a prefix it no longer proves the root class is present.

/** The class tokens of every `class="..."` attribute in a server-rendered HTML string. */
export const classTokens = (html) => new Set([...html.matchAll(/\bclass="([^"]*)"/gu)].flatMap(([, value]) => value.split(/\s+/u).filter(Boolean)));

/** Whether some element in the markup carries exactly this class. */
export const hasClassToken = (html, name) => classTokens(html).has(name);
