import assert from 'node:assert/strict';
import test from 'node:test';
import { linkedFamilies } from '../../guide-links.mjs';

test('a guide links to another family by its docs path', () => {
  const guide = 'Use [Checkbox](/components/checkbox/) or [CheckboxGroup](/components/checkbox-group/), then [Checkbox again](/components/checkbox/). See the [API](#api-reference), [Themes](/themes/), and [the web](https://example.com/components/x/).';
  assert.deepEqual(linkedFamilies(guide), ['checkbox', 'checkbox-group']);
  assert.deepEqual(linkedFamilies('No links.'), []);
});

test('the inline link, with or without a double-quoted title, names its family wherever it sits', () => {
  const guide = [
    'A [Switch](/components/switch/ "Setting"), a [`Select`](/components/select/), and a [**Combo**Box](/components/combo-box/).',
    '',
    '- [Checkbox](/components/checkbox/ "Select an option")',
    '',
    '| Field | Use |',
    '| --- | --- |',
    '| Filtering | [SelectNative](/components/select-native/) |',
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

test('every other form of a family link fails and names the accepted form', () => {
  const definition = '\n\n[checkbox]: /components/checkbox/ "Group"';
  const rejected = {
    'a full reference': `[Checkbox][checkbox]${definition}`,
    'a collapsed reference': `[Checkbox][]${definition}`,
    'a shortcut reference': `[checkbox]${definition}`,
    'a parenthesized title': '[Checkbox](/components/checkbox/ (Group))',
    'a single-quoted title': "[Checkbox](/components/checkbox/ 'Group')",
    'an angle-bracket destination': '[Checkbox](</components/checkbox/>)',
    'spaces around the destination': '[Checkbox]( /components/checkbox/ )',
  };
  for (const [form, guide] of Object.entries(rejected)) {
    assert.throws(() => linkedFamilies(guide), /is not one Storybook can resolve\. Write an inline link such as \[Checkbox\]\(\/components\/checkbox\/\), with an optional double-quoted title\./u, form);
  }
});

test('an HTML anchor to a family fails whatever its spacing, quoting or case', () => {
  for (const anchor of [
    '<a href="/components/checkbox/">Checkbox</a>',
    '<a href=" /components/checkbox/ ">Checkbox</a>',
    "<A HREF='/components/checkbox/'>Checkbox</A>",
    '<a class="link" href=/components/checkbox/>Checkbox</a>',
    '<a\n  href="/components/checkbox">Checkbox</a>',
  ]) {
    assert.throws(() => linkedFamilies(`See ${anchor}.`), /links to a family with HTML[\s\S]* Write an inline link/u, anchor);
    assert.throws(() => linkedFamilies(anchor), /links to a family with HTML/u, `${anchor} alone`);
  }
});

test('HTML that is not an anchor to a family, or sits in a comment, is not a family link', () => {
  const comment = '<!-- Link a family as <a href="/components/checkbox/">Checkbox</a> or [Checkbox](/components/checkbox "Group"). -->';
  assert.deepEqual(linkedFamilies(`${comment}\n\nThen [Switch](/components/switch/).`), ['switch']);
  assert.deepEqual(linkedFamilies(`Inline ${comment} text and <a href="https://example.com/components/">the web</a>, <a data-href="/components/x/" href="/themes/">Themes</a>, and <a name="/components/y/">x</a>.`), []);
  assert.deepEqual(linkedFamilies('<!--\n<a href="/components/checkbox/">Checkbox</a>\n-->'), []);
});

test('a link inside a code span or a code block is example text, not a link', () => {
  const guide = [
    'Write `[Checkbox](/components/checkbox/)` or `[Bad](/components/bad)` in a guide.',
    '',
    '```md',
    '[Checkbox](/components/checkbox/ "Group")',
    '[Bad](/components/bad)',
    '<a href="/components/bad/">Bad</a>',
    '```',
    '',
    '    [Indented](/components/indented)',
    '',
    'Then [Switch](/components/switch/).',
  ].join('\n');
  assert.deepEqual(linkedFamilies(guide), ['switch']);
});
