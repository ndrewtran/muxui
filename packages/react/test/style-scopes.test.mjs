import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

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
  assert.match(combined, /:scope\s+:where\(\.muxui-meter-fill, \.muxui-progress-bar-fill\)/u);
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

test('migrated families paint mode-aware tokens instead of colour-scheme overrides', async () => {
  const combined = (await Promise.all(sourceFiles.map((url) => readFile(url, 'utf8')))).join('\n');
  const selectors = schemeScopedSelectors(combined);
  for (const scheme of ['light', 'dark']) {
    assert.ok(selectors.some((rule) => rule.scheme === scheme), `other families still author ${scheme}-scheme rules`);
  }
  // Figma variables hold one value per mode, so these families must not switch tokens by selector.
  const migrated = /\.muxui-(?:checkbox(?:-indicator|-field(?:__\w+)?)?|switch(?:-label|-indicator)?|text-field|tabs?|tab-(?:list|panels?|label)|tag(?:-group|-list|-remove)?|select-native(?:-field|__\w+)?)(?![\w-])|(?<!\.muxui-toolbar > |:not\()\.muxui-button(?![\w-])/u;
  const offenders = selectors
    .map(({ scheme, selector }) => `${scheme} ${selector}`)
    .filter((rule) => migrated.test(rule));
  assert.deepEqual(offenders, []);
});
