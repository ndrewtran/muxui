import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const styles = read('../generated/styles.css');
const body = (path) => read(path).trim();
const count = (text) => styles.split(text).length - 1;

// Families that name supplemental/styles.css as their styleSource share one copy of it, emitted after IconButton's CSS.
// A small IconButton's padding comes from a shared rule that ties icon-button.css on specificity and wins only by
// following it, so the copy must neither repeat nor move before IconButton or (as families convert) after Lightbox.
test('the generated stylesheet carries the shared supplemental stylesheet once, between IconButton and Lightbox CSS', () => {
  const shared = body('../src/supplemental/styles.css');
  const iconButton = body('../src/supplemental/icon-button.css');
  const lightbox = body('../src/supplemental/lightbox.css');
  assert.equal(count(shared), 1, 'the shared stylesheet appears exactly once');
  assert.equal(count(iconButton), 1);
  assert.equal(count(lightbox), 1);
  const start = styles.indexOf(shared);
  assert.ok(styles.indexOf(iconButton) + iconButton.length <= start, 'the shared stylesheet follows IconButton CSS');
  assert.ok(start + shared.length <= styles.indexOf(lightbox), 'the shared stylesheet precedes Lightbox CSS');
});
