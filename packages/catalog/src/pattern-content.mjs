/**
 * Content rules for pattern variant sources and assets (Decision 0026, E-BL1-10).
 *
 * A variant is copy-and-paste demonstration material, so its source must be
 * self-contained and token-driven. The compiler fails on:
 *
 * - `content.remote-reference`: an `http:` or `https:` URL, any `scheme://`
 *   URL, or a protocol-relative `//host` reference in a quote, `(`, or `=`
 *   position (so `url(//cdn...)` and `src="//cdn..."` fail while a `// note`
 *   comment passes), or a protocol-relative entry anywhere in a `srcSet`
 *   value. A `data:` URI is local and passes: it fetches nothing. The only
 *   tolerated URLs are `xmlns` attribute values naming the SVG, XLink, or
 *   XHTML namespace (plain, escaped-quote, `xmlnsXlink`, or `{"..."}` forms),
 *   which identify a namespace and are never fetched, so a data-URI
 *   placeholder image can declare its SVG namespace.
 * - `content.local-reference`: a string-literal `src`, `href`, `xlink:href`,
 *   `poster`, `action`, `formAction`, `srcSet` entry, `url()`, `image-set()`
 *   string, or `@import` that names a local path. `src`, `href`, and `srcSet`
 *   count as attributes (`href="/x"`, `href={'/x'}`) and as object
 *   properties (`{ href: '/x' }`), since a data model holds URLs there.
 *   `poster`, `action`, and `formAction` are also ordinary words in data
 *   (`{ action: 'Start free' }`, `const action = 'Save'`), so they count only
 *   as attributes: `name="..."`, `name='...'`, or `name={'...'}`. A reference
 *   must resolve, relative
 *   to the file that holds it, to a licensed asset inside the pattern
 *   directory. `#fragment` and `data:` references and values that start with
 *   a `${...}` placeholder are exempt; every other scheme (`mailto:`,
 *   `javascript:`), root-absolute path (`/pricing`), `..` escape, or unlicensed
 *   file fails closed. Needs the pattern directory, so only the compiler runs
 *   it (see `scanLocalReferences`).
 * - `content.colour-literal`: a hex colour, or a `rgb()`, `rgba()`, `hsl()`,
 *   `hsla()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()`, or `color()`
 *   function (any case) whose arguments are not built from `var()` (`oklch(from
 *   var(--x) l c h)` passes), or a CSS named colour. Hex and named colours are
 *   detected in colour contexts only: a declaration whose property carries a
 *   colour or is a custom property (`color: red`, `BACKGROUND: #fff`), a style
 *   object key (`{ borderColor: 'red' }`), an SVG or JSX colour attribute
 *   (`fill`, `stroke`, `color`, `stop-color`/`stopColor`, `flood-color`,
 *   `lighting-color`, as a string or inside `{...}`), plus a quoted string that
 *   is exactly a hex colour. So `url(#fade)`, `href="#add"`, `#100` in text,
 *   and a CSS `#id` selector pass. `transparent` and `currentColor` carry no
 *   colour and pass. Use a `--muxui-semantic-*` token instead.
 * - `content.asset-license`: an asset file in a pattern's directory (every
 *   file but `.DS_Store`, dotfiles included) without a valid
 *   `<asset>.license.json` beside it recording its license and disclosure.
 *
 * Limits: sources are scanned raw, comments included, because a small
 * tokenizer cannot read JSX text and templates (see pattern-imports.mjs); a
 * colour declaration or URL in a comment therefore fails closed, while a hex
 * word in prose does not. A data URI's payload is not decoded, nor are HTML
 * entities in attribute strings. Binary assets get only the license rule.
 * Brand marks, real names, and likenesses need the independent content review
 * E-BL1-10 records; no scanner can decide them.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, posix } from 'node:path';

/** Rules, in report order. */
export const CONTENT_RULES = Object.freeze(['content.remote-reference', 'content.local-reference', 'content.colour-literal', 'content.asset-license']);

// CSS Color 4 named colours. `transparent` and `currentcolor` are keywords, not colours.
const NAMED_COLOURS = new Set(`aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(' '));

// A declaration property that can carry a colour, in kebab-case.
const COLOUR_PROPERTY = /(?:^|-)color$|^(?:background|background-image|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?|border-image(?:-source)?|outline|box-shadow|text-shadow|text-decoration|text-emphasis|column-rule|fill|stroke|filter|mask(?:-image)?|list-style)$/u;
// `property:` in CSS or a style object, a custom property included, in any case.
const DECLARATION = /(?<![\w-])["']?(--[a-zA-Z][\w-]*|[a-zA-Z][a-zA-Z-]*)["']?\s*:(?!:)/gu;
// An SVG or JSX attribute (or assigned name) that holds a paint.
const PAINT_ATTRIBUTE = /(?<![\w-])(?:fill|stroke|stop-?color|flood-?color|lighting-?color|color)\s*=\s*/giu;
const HEX = /(?<![&\w#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/gu;
// A quoted string that is exactly a hex colour, unless it is the target of a link or url().
const HEX_STRING = /(["'`])\s*(#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4}))\s*\1/gu;
const FRAGMENT_CONTEXT = /(?:url\(\s*|(?<![\w-])["']?(?:href|xlink:href|xlinkHref|to|src|poster|action|formAction)["']?\s*[=:]\s*\{?\s*)$/iu;
const COLOUR_FUNCTION = /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/giu;
// A colour function built from a token: `rgb(var(--c))` or relative `oklch(from var(--c) l c h)`.
const TOKEN_ARGUMENTS = /^\s*(?:from\s+)?var\(/iu;

// Namespace identifiers, never fetched: the one URL form a variant may spell out.
const XMLNS_NAMESPACE = /xmlns(?::[a-z]+|[A-Z][a-z]*)?\s*=\s*(?:\{\s*)?(\\?["'])http:\/\/www\.w3\.org\/(?:2000\/svg|1999\/xlink|1999\/xhtml)\1(?:\s*\})?/gu;

const REMOTE_RULES = [
  [/(?<![\w-])https?:/giu, 'an http or https URL'],
  [/(?<![\w-])[a-z][a-z0-9+.-]*:\/\//giu, 'a URL with a scheme'],
  [/(?<=['"`(=]\s*)\/\/(?=[a-z0-9])/giu, 'a protocol-relative URL'],
];

// Attributes (or keys) whose string value is a URL, and the one that lists several.
const REFERENCE_ATTRIBUTE = /(?<![\w-])["']?(?:src|href|xlink:href|xlinkHref)["']?\s*[=:]\s*(?:\{\s*)?(["'`])([^]*?)\1/giu;
// Names that are also plain words in data, so only attribute syntax counts: not
// `{ action: 'Save' }`, `obj.action = 'x'`, or `const action = 'x'`.
const ATTRIBUTE_ONLY_REFERENCE = /(?<![\w.-])(?<!(?:const|let|var)\s+)(?:poster|action|formAction)\s*=\s*(?:\{\s*)?(["'`])([^]*?)\1/giu;
const SRCSET_ATTRIBUTE = /(?<![\w-])["']?(?:srcSet|imageSrcSet)["']?\s*[=:]\s*(?:\{\s*)?(["'`])([^]*?)\1/giu;
const CSS_URL = /url\(\s*(["']?)([^"')]*)\1\s*\)/giu;
const CSS_IMAGE_SET = /image-set\(([^)]*)\)/giu;
const CSS_IMPORT = /@import\s+(?:url\(\s*)?(["'])([^"']+)\1/giu;

const LICENSE_SIDECAR_SUFFIX = '.license.json';
const LICENSE_KEYS = new Set(['schemaVersion', 'asset', 'license', 'disclosure', 'author', 'source']);
const TEXT_ASSET = /\.(?:svg|css|html?|[cm]?js|jsx|tsx?)$/u;

const lineAt = (source, offset) => source.slice(0, offset).split('\n').length;
const snippet = (value) => JSON.stringify(value.length > 40 ? `${value.slice(0, 37)}...` : value);
const camelToKebab = (name) => name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
// `BACKGROUND`, `BackgroundColor`, and `backgroundColor` all mean their kebab-case property.
const propertyName = (name) => (name.includes('-') || name === name.toUpperCase() ? name.toLowerCase() : camelToKebab(name).replace(/^-/u, ''));
// Keeps offsets and line numbers while hiding text from later rules.
const blank = (text) => text.replace(/[^\n]/gu, ' ');

/**
 * Reads a declaration value from `start`: up to `;`, `}`, a newline, or a
 * top-level comma that starts the next `property:` of a one-line style object.
 */
function declarationValue(source, start) {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === '(') depth += 1;
    else if (character === ')') depth = Math.max(0, depth - 1);
    else if (character === '\n' || character === ';' || character === '}') return source.slice(start, index);
    else if (character === ',' && depth === 0 && /^,\s*[a-zA-Z-][a-zA-Z-]*\s*:/u.test(source.slice(index, index + 80))) {
      return source.slice(start, index);
    }
  }
  return source.slice(start);
}

/** The text inside the braces that open at `start` (a `{`), or to the end of a short window. */
function braceContent(source, start) {
  let depth = 0;
  for (let index = start; index < Math.min(source.length, start + 600); index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}' && (depth -= 1) === 0) return { offset: start + 1, text: source.slice(start + 1, index) };
  }
  return { offset: start + 1, text: source.slice(start + 1, start + 600) };
}

/** The colour literals of one declaration or attribute value: hex colours and named colours. */
function* colourWords(value, offset, property) {
  // A url() holds a path or a fragment, not a colour.
  const visible = value.replace(/url\([^)]*\)/giu, blank);
  for (const match of visible.matchAll(HEX)) yield { offset: offset + match.index, kind: 'hex', text: match[0], property };
  for (const word of visible.matchAll(/(?<![\w-])[a-zA-Z]+(?![\w-])/gu)) {
    if (NAMED_COLOURS.has(word[0].toLowerCase())) yield { offset: offset + word.index, kind: 'named', text: word[0], property };
  }
}

function* colourLiterals(source) {
  for (const match of source.matchAll(DECLARATION)) {
    const name = match[1];
    const property = name.startsWith('--') ? name : propertyName(name);
    if (!name.startsWith('--') && !COLOUR_PROPERTY.test(property)) continue;
    const start = match.index + match[0].length;
    yield* colourWords(declarationValue(source, start), start, property);
  }
  for (const match of source.matchAll(PAINT_ATTRIBUTE)) {
    const start = match.index + match[0].length;
    const [open] = source.slice(start);
    if (open === '"' || open === "'" || open === '`') {
      const end = source.indexOf(open, start + 1);
      if (end !== -1) yield* colourWords(source.slice(start + 1, end), start + 1, 'a colour attribute');
    } else if (open === '{') {
      // Every string literal in the expression: `fill={on ? 'red' : 'none'}`.
      const { offset, text } = braceContent(source, start);
      for (const literal of text.matchAll(/(["'`])([^"'`]*)\1/gu)) {
        yield* colourWords(literal[2], offset + literal.index + 1, 'a colour attribute');
      }
    }
  }
  for (const match of source.matchAll(HEX_STRING)) {
    if (!FRAGMENT_CONTEXT.test(source.slice(Math.max(0, match.index - 40), match.index))) {
      yield { offset: match.index + 1, kind: 'hex', text: match[2], property: 'a string' };
    }
  }
}

/** The URLs of a `srcSet` value: each entry's URL, which ends at whitespace, then its descriptors up to the next comma. */
function srcsetUrls(value) {
  const urls = [];
  let rest = value;
  for (;;) {
    rest = rest.replace(/^[\s,]+/u, '');
    const url = /^\S+/u.exec(rest)?.[0];
    if (url === undefined) return urls;
    rest = rest.slice(url.length);
    if (url.endsWith(',')) {
      urls.push(url.replace(/,+$/u, ''));
    } else {
      urls.push(url);
      rest = rest.replace(/^[^,]*/u, '');
    }
  }
}

/** Every URL a source spells out as a string literal, with its offset: link attributes, `srcSet` entries, `url()`, `image-set()`, and `@import`. */
function* urlReferences(source) {
  for (const match of source.matchAll(REFERENCE_ATTRIBUTE)) yield { offset: match.index, reference: match[2] };
  for (const match of source.matchAll(ATTRIBUTE_ONLY_REFERENCE)) yield { offset: match.index, reference: match[2] };
  for (const match of source.matchAll(SRCSET_ATTRIBUTE)) {
    for (const reference of srcsetUrls(match[2])) yield { offset: match.index, reference, srcset: true };
  }
  for (const match of source.matchAll(CSS_URL)) yield { offset: match.index, reference: match[2] };
  for (const match of source.matchAll(CSS_IMAGE_SET)) {
    for (const literal of match[1].matchAll(/(["'])([^"']*)\1/gu)) yield { offset: match.index, reference: literal[2] };
  }
  for (const match of source.matchAll(CSS_IMPORT)) yield { offset: match.index, reference: match[2] };
}

/** `remote` for a URL the remote rule owns, `exempt` for nothing to fetch, else `local`. */
function referenceKind(reference) {
  const value = reference.trim();
  if (value === '' || value.startsWith('#') || value.startsWith('${') || /^data:/iu.test(value) || /^var\(/iu.test(value)) return 'exempt';
  if (value.startsWith('//') || /^https?:/iu.test(value) || /^[a-z][a-z0-9+.-]*:\/\//iu.test(value)) return 'remote';
  return 'local';
}

/**
 * Scans one text source against the remote-reference and colour rules, which
 * need no pattern context. Returns one violation per rule and line, each with
 * its 1-based line.
 */
export function scanPatternContent(source) {
  const text = source.replace(XMLNS_NAMESPACE, blank);
  const found = [];
  const remote = (offset, what, reference) => found.push({
    ruleId: 'content.remote-reference',
    line: lineAt(text, offset),
    message: `has ${what} (${snippet(reference)}); a variant is self-contained, so inline a data: URI or use Mux-authored markup`,
  });
  for (const [pattern, what] of REMOTE_RULES) {
    for (const match of text.matchAll(pattern)) remote(match.index, what, text.slice(match.index).split(/[\s"'`)]/u, 1)[0]);
  }
  // A srcSet entry can sit after a comma, where no quote or `=` marks it.
  for (const { offset, reference, srcset } of urlReferences(text)) {
    if (srcset && reference.startsWith('//')) remote(offset, 'a protocol-relative URL', reference);
  }
  for (const match of text.matchAll(COLOUR_FUNCTION)) {
    if (TOKEN_ARGUMENTS.test(text.slice(match.index + match[0].length))) continue;
    found.push({
      ruleId: 'content.colour-literal',
      line: lineAt(text, match.index),
      message: `has a colour function with literal arguments (${snippet(match[0])}); use a --muxui-semantic-* token, a var() reference, or currentColor`,
    });
  }
  for (const { offset, kind, text: literal, property } of colourLiterals(text)) {
    found.push({
      ruleId: 'content.colour-literal',
      line: lineAt(text, offset),
      message: kind === 'hex'
        ? `has a hex colour (${snippet(literal)}); use a --muxui-semantic-* token, a var() reference, or currentColor`
        : `has the named colour ${snippet(literal)} in ${property}; use a --muxui-semantic-* token, a var() reference, or currentColor`,
    });
  }
  const reported = new Set();
  return found
    .sort((left, right) => left.line - right.line || (left.ruleId < right.ruleId ? -1 : 1))
    .filter(({ ruleId, line }) => {
      const key = `${ruleId}\0${line}`;
      if (reported.has(key)) return false;
      reported.add(key);
      return true;
    });
}

/**
 * Returns the local-reference violations of one text file at `path`, which
 * lives in `directory` (the pattern directory). A reference is fine when it is
 * a `#fragment`, a `data:` URI, or resolves from `path` to a file in
 * `licensed`, the set of licensed asset paths inside `directory`.
 */
export function scanLocalReferences({ text, path, directory, licensed }) {
  const reported = new Set();
  const violations = [];
  for (const { offset, reference } of urlReferences(text)) {
    if (referenceKind(reference) !== 'local') continue;
    const target = reference.trim().split(/[?#]/u, 1)[0];
    const resolved = target === '' || target.startsWith('/') ? null : posix.normalize(posix.join(posix.dirname(path), target));
    if (resolved !== null && resolved.startsWith(`${directory}/`) && licensed.has(resolved)) continue;
    const line = lineAt(text, offset);
    if (reported.has(line)) continue;
    reported.add(line);
    violations.push({
      ruleId: 'content.local-reference',
      line,
      message: `references the local path ${snippet(reference)}; it must be a #fragment, a data: URI, or a licensed asset inside ${directory} (add the file and its ${LICENSE_SIDECAR_SUFFIX})`,
    });
  }
  return violations;
}

/**
 * Returns one issue per content violation in a pattern's variant sources.
 * `variants` are `{ source, text }`; `directory` is the pattern directory and
 * `licensed` the set of its licensed asset paths, which local references must
 * resolve to. Issues name the owning field `pattern.variants` and link the
 * source line.
 */
export function patternContentIssues({ pattern, variants, directory = '', licensed = new Set() }) {
  return variants.flatMap(({ source, text }) => [
    ...scanPatternContent(text),
    ...scanLocalReferences({ text, path: source, directory, licensed }),
  ].sort((left, right) => left.line - right.line).map(({ ruleId, line, message }) => ({
    artifactId: pattern.id,
    path: '$/variants',
    ruleId,
    source,
    line,
    message: `${source}:${line} ${message}`,
  })));
}

function licenseProblem(record, assetName) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return 'must be a JSON object';
  const unknown = Object.keys(record).filter((key) => !LICENSE_KEYS.has(key));
  if (unknown.length > 0) return `has unknown fields ${unknown.join(', ')}`;
  if (record.schemaVersion !== '1.0.0') return 'must set schemaVersion "1.0.0"';
  if (record.asset !== assetName) return `must name its asset "${assetName}" in "asset"`;
  for (const field of ['license', 'disclosure']) {
    if (typeof record[field] !== 'string' || record[field].trim().length === 0) return `needs a non-empty "${field}"`;
  }
  for (const field of ['author', 'source']) {
    if (record[field] !== undefined && (typeof record[field] !== 'string' || record[field].trim().length === 0)) {
      return `needs a non-empty "${field}" when present`;
    }
  }
  return null;
}

async function listFiles(repositoryRoot, directory) {
  const files = [];
  for (const entry of await readdir(join(repositoryRoot, directory), { withFileTypes: true })) {
    // Finder's .DS_Store is never an asset; every other dotfile is.
    if (entry.name === '.DS_Store') continue;
    const path = posix.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(repositoryRoot, path));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`MUXUI_CATALOG_SOURCE_INVALID: ${path} must be a plain file or directory`);
  }
  return files;
}

/**
 * Audits the asset files of one pattern directory: every file that is neither
 * a listed record, a variant source, nor a license sidecar is an asset. Each
 * needs a valid `<asset>.license.json` beside it, a sidecar needs its asset,
 * and a text asset passes the same content rules as a variant source, local
 * references included. `known` is the set of repository-relative record and
 * source paths. Returns the issues and `licensed`, the asset paths with a valid
 * license record, which variant sources may reference.
 */
export async function auditPatternAssets({ repositoryRoot, pattern, directory, known }) {
  const files = (await listFiles(repositoryRoot, directory)).sort();
  const issues = [];
  const issue = (ruleId, source, message, line) => issues.push({
    artifactId: pattern.id,
    path: '$/variants',
    ruleId,
    source,
    ...(line === undefined ? {} : { line }),
    message: `${source}${line === undefined ? '' : `:${line}`} ${message}`,
  });
  const license = 'content.asset-license';
  const isSidecar = (path) => path.endsWith(LICENSE_SIDECAR_SUFFIX);
  const assets = files.filter((path) => !known.has(path) && !isSidecar(path));
  const licensed = new Set();
  for (const path of files.filter(isSidecar)) {
    if (!assets.includes(path.slice(0, -LICENSE_SIDECAR_SUFFIX.length))) {
      issue(license, path, 'is a license record with no asset beside it');
    }
  }
  for (const asset of assets) {
    const sidecar = `${asset}${LICENSE_SIDECAR_SUFFIX}`;
    if (!files.includes(sidecar)) {
      issue(license, asset, `is an asset without a license and disclosure record; add ${posix.basename(sidecar)} beside it with its license and disclosure`);
    } else {
      let record;
      try {
        record = JSON.parse(await readFile(join(repositoryRoot, sidecar), 'utf8'));
      } catch {
        record = undefined;
      }
      const problem = record === undefined ? 'is not valid JSON' : licenseProblem(record, posix.basename(asset));
      if (problem) {
        issue(license, sidecar, `${problem}; a license record is {"schemaVersion":"1.0.0","asset","license","disclosure"} with optional author and source`);
      } else {
        licensed.add(asset);
      }
    }
  }
  // Licenses are known for every asset before any asset's references resolve.
  for (const asset of assets.filter((path) => TEXT_ASSET.test(path))) {
    const text = await readFile(join(repositoryRoot, asset), 'utf8');
    const violations = [...scanPatternContent(text), ...scanLocalReferences({ text, path: asset, directory, licensed })];
    for (const { ruleId, line, message } of violations.sort((left, right) => left.line - right.line)) issue(ruleId, asset, message, line);
  }
  return { issues, licensed };
}

/** The issues of `auditPatternAssets`. */
export async function patternAssetIssues(options) {
  return (await auditPatternAssets(options)).issues;
}
