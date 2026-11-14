import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { SELECTED_GUIDE_ROUTES } from '../src/lib/selected-guide-routes.ts';
import { groupComponentNavigation } from '../../component-navigation.mjs';
import { componentRecordCategory } from '../src/lib/component-categories.ts';
import { accessibilityGuideId, accessibilityGuideSections, linkedFamilies, linkedSiteRoutes } from '../../guide-links.mjs';

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

test('the site routes a guide links are its slash-led inline links, outside code', () => {
  const guide = [
    'See the [tested profile](/installation/#tested-profile), [Checkbox](/components/checkbox/ "Group"), the [web](https://example.com/), [here](#top) and [again](/installation/#tested-profile).',
    '',
    'A [protocol-relative link](//example.com/x) and `[code](/components/code/)` are not routes.',
    '',
    '```md',
    '[Fenced](/fenced/)',
    '```',
  ].join('\n');
  assert.deepEqual(linkedSiteRoutes(guide), ['/installation/#tested-profile', '/components/checkbox/']);
});

const fence = (marker, lines) => [`${marker}md`, ...lines, marker].join('\n');

test('the accessibility sections are cut at the guide\'s second level headings and keep their deeper ones', () => {
  const guide = [
    '# Accessibility', '', 'Intro.', '',
    '## Support status', '', 'Experimental.', 'No claim.', '', '### Limits', '', 'One limit.', '',
    '## Names', '', 'A name.', '',
    '## Verification', '', 'Test it.', '',
  ].join('\n');
  assert.deepEqual(accessibilityGuideSections(guide), [
    { heading: 'Support status', markdown: 'Experimental.\nNo claim.\n\n### Limits\n\nOne limit.' },
    { heading: 'Verification', markdown: 'Test it.' },
  ]);
});

test('a heading inside a fenced block is code, whatever the fence is made of', () => {
  const body = (support, verification) => ['## Support status', '', support, '', '## Verification', '', verification, ''].join('\n');
  // A four-backtick block holds a three-backtick block, with a heading inside.
  const nested = fence('````', [fence('```', ['## Support status']), '## Verification']);
  assert.deepEqual(accessibilityGuideSections(body(`Real.\n\n${nested}`, 'Test it.')), [
    { heading: 'Support status', markdown: `Real.\n\n${nested}` },
    { heading: 'Verification', markdown: 'Test it.' },
  ]);
  // A tilde line inside a backtick block does not close it.
  const tilde = fence('```', ['~~~', '## Verification', '~~~']);
  assert.deepEqual(accessibilityGuideSections(body(`Real.\n\n${tilde}`, 'Test it.')), [
    { heading: 'Support status', markdown: `Real.\n\n${tilde}` },
    { heading: 'Verification', markdown: 'Test it.' },
  ]);
  // A tilde block can hold backtick lines, and an indented block is code too.
  const backticks = fence('~~~', ['```', '## Support status']);
  const indented = '    ## Verification';
  assert.equal(accessibilityGuideSections(body(`${backticks}\n\n${indented}`, 'Test it.'))[0].markdown, `${backticks}\n\n${indented}`);
});

test('the accessibility guide must have each section once, with something in it', () => {
  assert.throws(() => accessibilityGuideSections('## Verification\n\nTest it.'), /exactly one "Support status" section, found 0/u);
  assert.throws(() => accessibilityGuideSections('## Support status\n\nA.\n\n## Support status\n\nB.\n\n## Verification\n\nC.'), /exactly one "Support status" section, found 2/u);
  assert.throws(() => accessibilityGuideSections('## Support status\n\n## Verification\n\nC.'), /"Support status" section is empty/u);
  // A heading at another level is not the section.
  assert.throws(() => accessibilityGuideSections('### Support status\n\nA.\n\n## Verification\n\nC.'), /exactly one "Support status" section, found 0/u);
});

test('the canonical accessibility guide supplies the sections both surfaces show', () => {
  const root = resolve(import.meta.dirname, '../../..');
  const record = JSON.parse(readFileSync(resolve(root, 'catalog/guides/accessibility.json'), 'utf8'));
  assert.equal(record.id, accessibilityGuideId);
  const file = readFileSync(resolve(root, record.source), 'utf8');
  const sections = accessibilityGuideSections(file);
  assert.deepEqual(sections.map(({ heading }) => heading), ['Support status', 'Verification']);
  // Each section is a verbatim part of the guide file that Starlight renders whole, so neither surface can word it differently.
  for (const { markdown } of sections) assert.ok(file.includes(markdown));
  // The projection keeps the guide's own assistive-technology non-claim.
  assert.match(sections[0].markdown, /makes no assistive-technology\s+support claim/u);
});

test('the accessibility guide links pages that exist, states no version, and makes no assistive-technology or blanket claim', () => {
  const root = resolve(import.meta.dirname, '../../..');
  const guide = readFileSync(resolve(root, 'catalog/guides/accessibility.md'), 'utf8');
  const flat = (markdown) => markdown.replace(/\s+/gu, ' ');
  const [support] = accessibilityGuideSections(guide);
  const subsection = (heading) => flat(support.markdown.split(/^### /mu).find((part) => part.startsWith(`${heading}\n`))).trim();

  // Automated proof states no version, so it cannot drift from the compatibility record, and the profile it links is rendered.
  assert.doesNotMatch(subsection('Automated proof'), /\d|Chrome|axe \d/u, 'the automated proof states no browser or tool version');
  assert.deepEqual(linkedSiteRoutes(support.markdown), ['/installation/#tested-profile']);
  assert.match(readFileSync(resolve(root, 'apps/docs/src/components/InstallationGuide.astro'), 'utf8'), /<h2 id="tested-profile">/u);
  // Keyboard and focus points to the Known limitations subsection, which the support status holds.
  assert.ok(subsection('Known limitations'), 'the support status has a Known limitations subsection');
  const keyboard = flat(guide.split(/^## /mu).find((part) => part.startsWith('Keyboard and focus\n')));
  assert.match(keyboard, /\[Known limitations\]\(#known-limitations\)/u);

  // No assistive-technology or blanket support claim is made in what the projection carries.
  const projected = accessibilityGuideSections(guide).map(({ markdown }) => flat(markdown)).join(' ');
  assert.match(projected, /makes no assistive-technology support claim/u);
  assert.doesNotMatch(projected, /\b(?:fully|WCAG|compliant|conforms?|certified|guarantees?)\b/iu);
});


// Exercise the production command rather than a test-only route assertion. Fixture HTML
// isolates navigation from layout; a real build remains the projection proof.
test('the navigation command requires every selected guide route, identity and sidebar destination', () => {
  const catalog = createRequire(import.meta.url)('@muxui/catalog');
  const items = [];
  let cursor;
  do {
    const response = catalog.listArtifacts({ kind: 'component', platform: 'web.react', detail: 'brief', limit: 100, ...(cursor ? { cursor } : {}) });
    assert.equal(response.type, 'artifact.list');
    items.push(...response.data.items);
    cursor = response.meta.nextCursor;
  } while (cursor);
  const groups = groupComponentNavigation(items, ({ id }) => componentRecordCategory(id.slice(id.lastIndexOf(':') + 1))).filter(({ items }) => items.length);
  const componentRoutes = groups.flatMap(({ items }) => items.map(({ id }) => `/components/${id.slice(id.lastIndexOf(':') + 1)}/`));
  // These existing nonguide pages are deliberately outside the guide identity assertion.
  const docsRoutes = ['/', '/installation/', '/package-exports/', '/scale/', ...SELECTED_GUIDE_ROUTES.map(({ route }) => route)];
  const docsRoot = resolve(import.meta.dirname, '..');
  const directory = mkdtempSync(resolve(docsRoot, '.navigation-test-'));
  const pathOf = (route) => resolve(directory, route.slice(1), 'index.html');
  const links = (routes) => routes.map((route) => `<a href="${route}">Page</a>`).join('');
  const header = (label) => `<nav class="mux-site-nav"><a aria-current="page">${label}</a></nav>`;
  const pages = new Map();
  for (const route of docsRoutes) {
    const selected = SELECTED_GUIDE_ROUTES.find((item) => item.route === route);
    pages.set(route, `${header('Docs')}<aside class="mux-sidebar-content">${links(docsRoutes)}</aside>${selected ? `<div data-guide-id="${selected.id}"></div>` : ''}`);
  }
  for (const route of componentRoutes) pages.set(route, `${header('Components')}<aside class="mux-sidebar-content">${groups.map(({ label }) => `<summary>${label}</summary>`).join('')}${links(componentRoutes)}</aside>`);
  pages.set('/blocks/', header('Blocks'));
  const write = (route, html) => { mkdirSync(resolve(pathOf(route), '..'), { recursive: true }); writeFileSync(pathOf(route), html); };
  const run = () => spawnSync(process.execPath, [resolve(docsRoot, 'scripts/check-navigation.mjs'), directory], { encoding: 'utf8' });
  try {
    for (const [route, html] of pages) write(route, html);
    const positive = run();
    assert.equal(positive.status, 0, positive.stderr);
    assert.match(positive.stdout, /Navigation contract passed/u);
    for (const route of ['/discovery/', '/foundations/colour/']) {
      rmSync(pathOf(route));
      const result = run();
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Built route is missing/u);
      write(route, pages.get(route));
    }
    for (const [route, before, after, message] of [
      ['/', '<a href="/themes/">Page</a>', '', /sidebar cannot reach selected guide muxui:guide:themes/u],
      ['/', 'href="/discovery/"', 'href="/themes/"', /sidebar cannot reach selected guide muxui:guide:discovery/u],
      ['/token-migration/', 'data-guide-id="muxui:guide:token-migration"', 'data-guide-id="muxui:guide:themes"', /must project selected guide muxui:guide:token-migration/u],
      ['/foundations/colour/', 'data-guide-id="muxui:guide:foundations-colour"', 'data-guide-id="muxui:guide:foundations-shape"', /must project selected guide muxui:guide:foundations-colour/u],
    ]) {
      assert.ok(pages.get(route).includes(before), 'mutation precondition');
      write(route, pages.get(route).replace(before, after));
      const result = run();
      assert.equal(result.status, 1, result.stdout);
      assert.match(result.stderr, message);
      write(route, pages.get(route));
    }
    assert.equal(run().status, 0, 'restored unmodified navigation passes');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
