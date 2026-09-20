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
