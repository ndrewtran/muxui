import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { importantCategory, importantDeclarations, importantIdentity } from './support/important-declarations.mjs';
import { guardedPrefixes } from './support/styling-inventory.mjs';

// Every authored stylesheet, so a new one is checked without being listed.
const sourceRoot = new URL('../src/', import.meta.url);
const sourceFiles = (await readdir(sourceRoot, { recursive: true }))
  .filter((path) => path.endsWith('.css'))
  .sort()
  .map((path) => new URL(path, sourceRoot));

test('authored stylesheets are all found', () => {
  const names = sourceFiles.map((url) => url.pathname.slice(sourceRoot.pathname.length));
  for (const name of ['styles/base.css', 'supplemental/styles.css', 'text-editor/text-editor.css']) {
    assert.ok(names.includes(name), name);
  }
});

// The reduced-motion scope is data-muxui-motion="reduced"; the older data-reduced-motion attribute is gone
// from every authored stylesheet and script, so no rule or observer can still honor it.
const authoredFiles = (await readdir(new URL('../src/', import.meta.url), { recursive: true }))
  .filter((path) => /\.(?:css|mjs|ts|tsx)$/u.test(path))
  .sort();
const namesRemovedMotionAttribute = (text) => /data-reduced-motion/u.test(text);

test('no authored stylesheet or script names the removed data-reduced-motion attribute', async () => {
  const offenders = [];
  for (const path of authoredFiles) {
    if (namesRemovedMotionAttribute(await readFile(new URL(`../src/${path}`, import.meta.url), 'utf8'))) offenders.push(path);
  }
  assert.ok(authoredFiles.length > 100 && authoredFiles.includes('motion.mjs'), 'the scan reaches the sources');
  assert.deepEqual(offenders, []);
  assert.equal(namesRemovedMotionAttribute(":where([data-reduced-motion], [data-muxui-motion='reduced']) .a { transition-duration: 0s; }"), true);
  assert.equal(namesRemovedMotionAttribute("current.hasAttribute('data-reduced-motion')"), true);
  assert.equal(namesRemovedMotionAttribute(":where([data-muxui-motion='reduced']) .a { transition-duration: 0s; }"), false);
});

test('authored color-mode descendants use nearest explicit @scope boundaries', async () => {
  const sources = await Promise.all(sourceFiles.map((url) => readFile(url, 'utf8')));
  const combined = sources.join('\n');
  const scopes = [...combined.matchAll(/@scope \(([^)]+)\) to \(\[data-muxui-color-scheme\]\)/gu)];
  assert.ok(scopes.length > 0, 'authored styles contain scoped color-mode rules');
  assert.deepEqual(
    new Set(scopes.map(([, root]) => root)),
    new Set([
      "[data-muxui-color-scheme='light']",
      "[data-muxui-color-scheme='dark']",
      '[data-muxui-color-scheme]',
    ]),
  );
  assert.doesNotMatch(
    combined,
    /^\s*\[data-muxui-color-scheme(?:\s*=\s*['"](?:light|dark)['"])?\]\s+(?!\{)/mu,
    'mode descendants are not globally scoped',
  );
  assert.match(combined, /:scope\s+:where\(\.muxui-meter__fill, \.muxui-progress-bar__fill\)/u);
});

// Returns every rule selector inside light or dark colour-scheme @scope blocks,
// including rules nested in at-rules or CSS nesting within those blocks.
function schemeScopedSelectors(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//gu, '');
  const selectors = [];
  const walk = (scheme, index) => {
    let prelude = '';
    while (index < source.length) {
      const char = source[index++];
      if (char === '{') {
        const selector = prelude.replace(/\s+/gu, ' ').trim();
        if (!selector.startsWith('@')) selectors.push({ scheme, selector });
        index = walk(scheme, index);
        prelude = '';
      } else if (char === '}') {
        return index;
      } else if (char === ';') {
        prelude = '';
      } else {
        prelude += char;
      }
    }
    return index;
  };
  for (const match of source.matchAll(/@scope\s*\(\s*\[data-muxui-color-scheme\s*=\s*(['"])(light|dark)\1\s*\]\s*\)\s*to\s*\([^)]*\)\s*\{/gu)) {
    walk(match[2], match.index + match[0].length);
  }
  return selectors;
}

// Figma variables hold one value per mode, so these families must not switch tokens by selector. The pattern matches the root and
// every part class of the listed families (`.muxui-tabs`, `.muxui-tabs__tab`), and Button outside the Toolbar.
const migrated = new RegExp(`\\.muxui-(?:${guardedPrefixes.modeAwareFamilies.join('|')})(?:__[a-z0-9-]+)?(?![\\w-])|(?<!\\.muxui-toolbar > |:not\\()\\.muxui-button(?![\\w-])`, 'u');
const modeOffenders = (css) => schemeScopedSelectors(css)
  .map(({ scheme, selector }) => `${scheme} ${selector}`)
  .filter((rule) => migrated.test(rule));

test('migrated families paint mode-aware tokens instead of colour-scheme overrides', async () => {
  const combined = (await Promise.all(sourceFiles.map((url) => readFile(url, 'utf8')))).join('\n');
  const selectors = schemeScopedSelectors(combined);
  for (const scheme of ['light', 'dark']) {
    assert.ok(selectors.some((rule) => rule.scheme === scheme), `other families still author ${scheme}-scheme rules`);
  }
  assert.deepEqual(modeOffenders(combined), []);
});

test('the mode-aware guard reads the renamed part classes of the migrated families', () => {
  const scoped = (scheme, selector) => `@scope ([data-muxui-color-scheme='${scheme}']) to (.muxui-nested) { ${selector} { color: red; } }`;
  assert.deepEqual(modeOffenders(scoped('dark', '.muxui-checkbox__indicator')), ['dark .muxui-checkbox__indicator']);
  assert.deepEqual(modeOffenders(scoped('light', '.muxui-tabs__tab')), ['light .muxui-tabs__tab']);
  assert.deepEqual(modeOffenders(scoped('dark', '.muxui-tag-group .muxui-tag-group__tag')), ['dark .muxui-tag-group .muxui-tag-group__tag']);
  assert.deepEqual(modeOffenders(scoped('dark', '.muxui-calendar__cell')), []);
});

// Every `!important` declaration Mux UI ships, pinned by category and identity (file, enclosing rules, property,
// value) in test/fixtures/important-declarations.json. This is a baseline, not an accessibility audit: it fails
// when one is added, removed, changed or moved, so each such change is reviewed on its own.
const importantPin = JSON.parse(await readFile(new URL('./fixtures/important-declarations.json', import.meta.url), 'utf8'));
const authoredCss = Object.fromEntries(await Promise.all(sourceFiles.map(async (url) => [url.pathname.slice(sourceRoot.pathname.length), await readFile(url, 'utf8')])));
const generatedCss = Object.fromEntries(await Promise.all(['styles.css', 'supplemental.css', 'themes.css'].map(async (name) => [name, await readFile(new URL(`../generated/${name}`, import.meta.url), 'utf8')])));

/** The authored declarations by category, as sorted `file | context` identities. */
function importantByCategory(files) {
  const byCategory = { 'forced-colors': [], 'reduced-motion-media': [], 'reduced-motion-attribute': [], structural: [] };
  for (const [file, css] of Object.entries(files)) {
    for (const declaration of importantDeclarations(css)) byCategory[importantCategory(declaration)].push(`${file} | ${importantIdentity(declaration)}`);
  }
  for (const list of Object.values(byCategory)) list.sort();
  return byCategory;
}

/** The declarations of a generated stylesheet with their layer, without the file they came from. */
const generatedIdentities = (css) => importantDeclarations(css).map(importantIdentity).sort();
const authoredIdentities = (files) => Object.entries(files).flatMap(([file, css]) => importantDeclarations(css).map((declaration) => [file, importantIdentity(declaration)]));
/** What a generated stylesheet must hold: the authored declarations, all in muxui.components. */
const inComponentsLayer = (rows) => rows.map(([, identity]) => `@layer muxui.components { ${identity}`).sort();

test('the authored !important declarations are exactly the pinned ones, by category and identity', () => {
  for (const [file, css] of Object.entries(authoredCss)) {
    // The reader must see every declaration, not only the ones it can place.
    const raw = css.replace(/\/\*[\s\S]*?\*\//gu, '').match(/!\s*important/giu)?.length ?? 0;
    assert.equal(importantDeclarations(css).length, raw, `${file}: every !important is read`);
  }
  const found = importantByCategory(authoredCss);
  assert.deepEqual(Object.fromEntries(Object.entries(found).map(([category, list]) => [category, list.length])), {
    'forced-colors': 43, 'reduced-motion-media': 6, 'reduced-motion-attribute': 27, structural: 10,
  });
  assert.deepEqual(found, importantPin);
  // The structural ones are internal parts, not accessibility adaptations.
  assert.ok(found.structural.every((identity) => /\.muxui-toggle-button-group__motion-label \{|\.muxui-progress-bar\[data-muxui-state-indeterminate\]/u.test(identity)));
});

test('the generated stylesheets keep every !important declaration in muxui.components', () => {
  const authored = authoredIdentities(authoredCss);
  // styles.css carries all 86 once; supplemental.css carries the shared stylesheet's 15; themes.css carries none.
  assert.equal(authored.length, 86);
  assert.deepEqual(generatedIdentities(generatedCss['styles.css']), inComponentsLayer(authored));
  assert.deepEqual(generatedIdentities(generatedCss['supplemental.css']), inComponentsLayer(authored.filter(([file]) => file === 'supplemental/styles.css')));
  assert.deepEqual(importantDeclarations(generatedCss['themes.css']), []);
});

// Each mutant changes one thing a reviewer must see, and the pin must fail on it.
test('the !important pin fails when one is removed, swapped, changed, split by a comment, moved to a later layer or added', () => {
  const file = 'styles/components.css';
  const mutated = (change) => importantByCategory({ ...authoredCss, [file]: change(authoredCss[file]) });
  const first = /(:\s*)([^:;{}]*?)(\s*!important)/u;
  const unknown = (css) => `${css}\n.muxui-unknown { color: red !important; }\n`;
  assert.notDeepEqual(mutated((css) => css.replace(/\s*!important/u, '')), importantPin);
  // Equal count: one removed and an unrelated one added.
  const swapped = mutated((css) => unknown(css.replace(/\s*!important/u, '')));
  assert.equal(Object.values(swapped).flat().length, 86);
  assert.notDeepEqual(swapped, importantPin);
  assert.notDeepEqual(mutated((css) => css.replace(first, '$1inherit$3')), importantPin);
  assert.notDeepEqual(mutated(unknown), importantPin);
  // A comment between tokens splits them: `4/**/0%` is not `40%` (Chromium rejects it), so the value must change.
  const split = (css) => css.replace('width: 40% !important', 'width: 4/**/0% !important');
  assert.notEqual(split(authoredCss[file]), authoredCss[file], 'the mutation applies');
  assert.notDeepEqual(mutated(split), importantPin);

  // The generated stylesheet is read apart from the authored one: the last chunk moved to a later layer keeps
  // every category count and identity but changes its layer.
  const styles = generatedCss['styles.css'];
  const chunk = authoredCss['supplemental/select-native.css'].trim();
  assert.ok(styles.includes(chunk), 'the generated stylesheet carries the chunk verbatim');
  const relayered = styles.replace(chunk, `}\n\n@layer muxui.utilities {\n${chunk}\n}\n\n@layer muxui.components {`);
  assert.equal(importantDeclarations(relayered).length, 86);
  assert.notDeepEqual(generatedIdentities(relayered), inComponentsLayer(authoredIdentities(authoredCss)));
  assert.notDeepEqual(generatedIdentities(split(styles)), inComponentsLayer(authoredIdentities(authoredCss)));
});
