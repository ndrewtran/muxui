import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceFiles = [
  '../src/styles/base.css',
  '../src/styles/components.css',
  '../src/styles/fields.css',
  '../src/styles/collections.css',
  '../src/styles/overlays.css',
  '../src/supplemental/styles.css',
  '../src/text-editor/text-editor.css',
].map((path) => new URL(path, import.meta.url));

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
  const migrated = /\.muxui-(?:checkbox(?:-indicator|-field(?:__\w+)?)?|switch(?:-label|-indicator)?|text-field|tabs?|tab-(?:list|panels?|label)|tag(?:-group|-list|-remove)?)(?![\w-])|(?<!\.muxui-toolbar > |:not\()\.muxui-button(?![\w-])/u;
  // Kept deliberately: it only differs from the token in dark forced-colors mode.
  const allowed = new Set(["dark :scope .muxui-button[data-variant='primary'][data-pressed]:not([data-disabled], [data-pending], [aria-expanded='true'])"]);
  const offenders = selectors
    .map(({ scheme, selector }) => `${scheme} ${selector}`)
    .filter((rule) => migrated.test(rule) && !allowed.has(rule));
  assert.deepEqual(offenders, []);
});
