import assert from 'node:assert/strict';
import test from 'node:test';
import { linkedFamilies } from '../../guide-links.mjs';

test('a guide links to another family by its docs path', () => {
  const guide = 'Use [Checkbox](/components/checkbox/) or [CheckboxGroup](/components/checkbox-group/), then [Checkbox again](/components/checkbox/). See the [API](#api-reference), [Themes](/themes/), and [the web](https://example.com/components/x/).';
  assert.deepEqual(linkedFamilies(guide), ['checkbox', 'checkbox-group']);
  assert.deepEqual(linkedFamilies('No links.'), []);
});

test('a link title, an angle-bracket destination, a reference, a list item and a table cell still name their family', () => {
  const guide = [
    'A [Switch](/components/switch/ "Setting"), a [Select](</components/select/> \'Choose\'), and a [ComboBox][combo].',
    '',
    '- [Checkbox](/components/checkbox/)',
    '',
    '| Field | Use |',
    '| --- | --- |',
    '| Filtering | [SelectNative](/components/select-native/) |',
    '',
    '[combo]: /components/combo-box/ "Filtering"',
  ].join('\n');
  assert.deepEqual(linkedFamilies(guide), ['switch', 'select', 'combo-box', 'checkbox', 'select-native']);
});

test('a malformed family destination fails, with or without a title', () => {
  for (const destination of [
    '/components/checkbox',
    '/components/checkbox/#mixed-state',
    '/components/checkbox/?x=1',
    '/components/Checkbox/',
    '/components/',
    '/components',
  ]) {
    assert.throws(() => linkedFamilies(`[Checkbox](${destination})`), /must be a family page path/u, destination);
    assert.throws(() => linkedFamilies(`[Checkbox](${destination} "Group")`), /must be a family page path/u, `${destination} with a title`);
  }
  assert.throws(() => linkedFamilies('[Checkbox](/components/checkbox "Group")'), /\/components\/checkbox must be a family page path/u);
});

test('a link written as HTML fails because Storybook cannot resolve it', () => {
  assert.throws(() => linkedFamilies('See <a href="/components/checkbox/">Checkbox</a>.'), /Write a Markdown link/u);
  assert.deepEqual(linkedFamilies('See <a href="https://example.com/">the site</a>.'), []);
});

test('a link inside a code span or a code block is example text, not a link', () => {
  const guide = [
    'Write `[Checkbox](/components/checkbox/)` or `[Bad](/components/bad)` in a guide.',
    '',
    '```md',
    '[Checkbox](/components/checkbox/ "Group")',
    '[Bad](/components/bad)',
    '```',
    '',
    '    [Indented](/components/indented)',
    '',
    'Then [Switch](/components/switch/).',
  ].join('\n');
  assert.deepEqual(linkedFamilies(guide), ['switch']);
});
