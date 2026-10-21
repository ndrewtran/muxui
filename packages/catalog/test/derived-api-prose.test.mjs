import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const read = (path) => readFile(resolve(repositoryRoot, path), 'utf8');

/** The values each bullet of a guide section opens with: "- `a` is ..." or "- `a` and `b` are ...". */
function bulletSubjects(markdown, heading) {
  const start = markdown.indexOf(`\n## ${heading}\n`);
  assert.notEqual(start, -1, `the guide has a ${heading} section`);
  const end = markdown.indexOf('\n## ', start + 1);
  return markdown.slice(start, end === -1 ? undefined : end).split('\n')
    .map((line) => /^- ((?:`[^`]+`(?:, | and )?)+) (?:is|are) /u.exec(line)?.[1])
    .filter(Boolean)
    .flatMap((subjects) => [...subjects.matchAll(/`([^`]+)`/gu)].map(([, value]) => value));
}

// Decision 0031: Button's variant values live in its React source. The usage guide
// no longer lists them; its variant guidance names each one, in source order.
test('the Button guide covers exactly the variants its derived API declares', async () => {
  const [guide, derived] = await Promise.all([
    read('catalog/guides/button-usage.md'),
    read('packages/react/api/button.json').then(JSON.parse),
  ]);
  const variants = derived.api.propDetails.variant.enum;
  assert.deepEqual(bulletSubjects(guide, 'Choosing a variant'), variants);
  assert.equal(bulletSubjects('\n## Choosing a variant\n- `primary` is the main action.\n- `ghost` and `danger` are quiet.\n', 'Choosing a variant').join(), 'primary,ghost,danger');
  // The value list and defaults are the generated API reference's, not restated prose.
  assert.doesNotMatch(guide, /finite `variant` values|They default to/u);
  assert.match(guide, /\[API reference\]\(#api-reference\) lists the `variant` and `size` values/u);
});

// Architecture, "One owner per fact": a guide states no prop, enum member, event, or import
// path in prose unless a check compares it with the block. Every code span in the Button
// guide is checked here, apart from the native button attribute, its values, and the DOM API.
test('every API name the Button guide states is in its derived API or the React package', async () => {
  const [guide, derived, reactPackage] = await Promise.all([
    read('catalog/guides/button-usage.md'),
    read('packages/react/api/button.json').then(JSON.parse),
    read('packages/react/package.json').then(JSON.parse),
  ]);
  const checked = new Set([
    derived.export,
    reactPackage.name,
    ...derived.api.props,
    ...derived.api.events,
    ...Object.values(derived.api.propDetails).flatMap(({ enum: values = [] }) => values),
  ]);
  const native = new Set(['type', 'submit', 'reset', 'requestSubmit']);
  const unchecked = [...guide.matchAll(/`([^`]+)`/gu)].map(([, name]) => name)
    .filter((name) => !checked.has(name) && !native.has(name) && name !== 'tone');
  assert.deepEqual(unchecked, []);
  // The guide says there is no `tone` property.
  assert.equal(derived.api.props.includes('tone'), false);
});
