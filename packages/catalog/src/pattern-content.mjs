/**
 * Content rules for pattern variant sources and assets (Decision 0026, E-BL1-10).
 *
 * A variant is copy-and-paste demonstration material, so its source must be
 * self-contained and token-driven. The compiler fails on:
 *
 * - `content.remote-reference`: an `http:` or `https:` URL, any `scheme://`
 *   URL, or a protocol-relative `//host` reference in a quote, `(`, or `=`
 *   position (so `url(//cdn...)` and `src="//cdn..."` fail while a `// note`
 *   comment passes). A `data:` URI is local and passes: it fetches nothing.
 *   The one tolerated URL is an `xmlns` attribute value naming the SVG or
 *   XLink namespace, which identifies a namespace and is never fetched, so a
 *   data-URI placeholder image can declare its SVG namespace.
 * - `content.colour-literal`: a hex colour, a `rgb()`, `rgba()`, `hsl()`,
 *   `hsla()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()`, or `color()`
 *   function that is not built from `var()`, or a CSS named colour in a style
 *   context (a colour-bearing declaration such as `background: red`, a style
 *   object such as `{ borderColor: 'red' }`, or an SVG paint attribute such
 *   as `fill="red"`). `transparent` and `currentColor` carry no colour and
 *   pass. Use a `--muxui-semantic-*` token instead.
 * - `content.asset-license`: an asset file in a pattern's directory without a
 *   valid `<asset>.license.json` beside it recording its license and
 *   disclosure.
 *
 * Limits: sources are scanned raw, comments included, because a small
 * tokenizer cannot read JSX text and templates (see pattern-imports.mjs); a
 * colour or URL in a comment therefore fails closed. A data URI's payload is
 * not decoded. Binary assets get only the license rule. Brand marks, real
 * names, and likenesses need the independent content review E-BL1-10
 * records; no scanner can decide them.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, posix } from 'node:path';

/** Rules, in report order. */
export const CONTENT_RULES = Object.freeze(['content.remote-reference', 'content.colour-literal', 'content.asset-license']);

// CSS Color 4 named colours. `transparent` and `currentcolor` are keywords, not colours.
const NAMED_COLOURS = new Set(`aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(' '));

// A declaration property that can carry a colour, in kebab-case.
const COLOUR_PROPERTY = /(?:^|-)color$|^(?:background|background-image|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?|outline|box-shadow|text-shadow|text-decoration|column-rule|fill|stroke|filter)$/u;
const SVG_PAINT_ATTRIBUTE = /(?<![\w-])(?:fill|stroke|stop-color|flood-color|lighting-color)\s*=\s*(["'])\s*([a-zA-Z]+)\s*\1/gu;
const DECLARATION = /(?<![\w-])["']?([a-z][a-zA-Z-]*)["']?\s*:(?!:)/gu;

const XMLNS_NAMESPACE = /xmlns(?::[a-z]+)?\s*=\s*(["'])(?:http:\/\/www\.w3\.org\/2000\/svg|http:\/\/www\.w3\.org\/1999\/xlink)\1/gu;

const REMOTE_RULES = [
  [/(?<![\w-])https?:/giu, 'an http or https URL'],
  [/(?<![\w-])[a-z][a-z0-9+.-]*:\/\//giu, 'a URL with a scheme'],
  [/(?<=['"`(=]\s*)\/\/(?=[a-z0-9])/giu, 'a protocol-relative URL'],
];

const COLOUR_FUNCTION = /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(\s*(?!var\()/gu;
// `#` after `&` or a word character is an entity or a fragment, not a colour.
const HEX_COLOUR = /(?<![&\w#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/gu;

const LICENSE_SIDECAR_SUFFIX = '.license.json';
const LICENSE_KEYS = new Set(['schemaVersion', 'asset', 'license', 'disclosure', 'author', 'source']);
const TEXT_ASSET = /\.(?:svg|css|html?|[cm]?js|jsx|tsx?)$/u;

const lineAt = (source, offset) => source.slice(0, offset).split('\n').length;
const snippet = (value) => JSON.stringify(value.length > 40 ? `${value.slice(0, 37)}...` : value);
const camelToKebab = (name) => name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
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
    else if (character === ',' && depth === 0 && /^,\s*[a-zA-Z][a-zA-Z-]*\s*:/u.test(source.slice(index, index + 80))) {
      return source.slice(start, index);
    }
  }
  return source.slice(start);
}

function* namedColourUses(source) {
  for (const match of source.matchAll(DECLARATION)) {
    const property = match[1].includes('-') ? match[1].toLowerCase() : camelToKebab(match[1]);
    if (!COLOUR_PROPERTY.test(property)) continue;
    const start = match.index + match[0].length;
    // A url() holds a path, not a colour.
    const value = declarationValue(source, start).replace(/url\([^)]*\)/giu, (url) => blank(url));
    for (const word of value.matchAll(/(?<![\w-])[a-zA-Z]+(?![\w-])/gu)) {
      if (NAMED_COLOURS.has(word[0].toLowerCase())) yield { offset: start + word.index, name: word[0], property };
    }
  }
  for (const match of source.matchAll(SVG_PAINT_ATTRIBUTE)) {
    if (NAMED_COLOURS.has(match[2].toLowerCase())) yield { offset: match.index, name: match[2], property: 'an SVG paint attribute' };
  }
}

/**
 * Scans one text source against the remote-reference and colour rules.
 * Returns one violation per rule and line, each with its 1-based line.
 */
export function scanPatternContent(source) {
  const text = source.replace(XMLNS_NAMESPACE, blank);
  const found = [];
  for (const [pattern, what] of REMOTE_RULES) {
    for (const match of text.matchAll(pattern)) {
      const reference = text.slice(match.index).split(/[\s"'`)]/u, 1)[0];
      found.push({
        ruleId: 'content.remote-reference',
        line: lineAt(text, match.index),
        message: `has ${what} (${snippet(reference)}); a variant is self-contained, so inline a data: URI or use Mux-authored markup`,
      });
    }
  }
  for (const [pattern, what] of [[HEX_COLOUR, 'a hex colour'], [COLOUR_FUNCTION, 'a colour function with literal arguments']]) {
    for (const match of text.matchAll(pattern)) {
      found.push({
        ruleId: 'content.colour-literal',
        line: lineAt(text, match.index),
        message: `has ${what} (${snippet(match[0])}); use a --muxui-semantic-* token, a var() reference, or currentColor`,
      });
    }
  }
  for (const { offset, name, property } of namedColourUses(text)) {
    found.push({
      ruleId: 'content.colour-literal',
      line: lineAt(text, offset),
      message: `has the named colour ${snippet(name)} in ${property}; use a --muxui-semantic-* token, a var() reference, or currentColor`,
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
 * Returns one issue per content violation in a pattern's variant sources.
 * `variants` are `{ source, text }`. Issues name the owning field
 * `pattern.variants` and link the source line.
 */
export function patternContentIssues({ pattern, variants }) {
  return variants.flatMap(({ source, text }) => scanPatternContent(text).map(({ ruleId, line, message }) => ({
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
    // Dotfiles such as .DS_Store are never assets.
    if (entry.name.startsWith('.')) continue;
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
 * and a text asset passes the same content rules as a variant source.
 * `known` is the set of repository-relative record and source paths.
 */
export async function patternAssetIssues({ repositoryRoot, pattern, directory, known }) {
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
      }
    }
    if (TEXT_ASSET.test(asset)) {
      for (const { ruleId, line, message } of scanPatternContent(await readFile(join(repositoryRoot, asset), 'utf8'))) {
        issue(ruleId, asset, message, line);
      }
    }
  }
  return issues;
}
