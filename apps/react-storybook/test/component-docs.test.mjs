import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { CacheProvider, ThemeProvider, convert, createCache } from 'storybook/theming';
import { buildTheme } from '../.storybook/theme.mjs';
import { ComponentDocs } from '../.storybook/component-docs-page.mjs';
import manifest from '../.storybook/generated/manifest.mjs';
import { linkedFamilies } from '../../guide-links.mjs';
import { guideLinks, siteLinks } from '../src/component-docs.mjs';

const h = React.createElement;
const appRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(appRoot, '../..');
const { JSDOM } = createRequire(resolve(repositoryRoot, 'packages/react/package.json'))('jsdom');
// The catalog query API and the package files are read here directly, not through the page's projection.
const canonicalCatalog = createRequire(import.meta.url)('@muxui/catalog');
const read = (path) => readFileSync(resolve(repositoryRoot, path), 'utf8');
const reactManifest = JSON.parse(read('packages/react/package.json'));
const descriptor = JSON.parse(read('packages/react/generated/descriptor.json'));
// The generated renderer contract names the runtime file of every family, after two marker comment lines.
const contract = JSON.parse(read('packages/react/generated/r1-6-contract.json').split('\n').filter((line) => !line.startsWith('// @generated-')).join('\n'));
const tokenGroupThreshold = 8;
// The approved option A order, stated here so a reordered page fails. Used in blocks appears only for a component a Block uses.
const sections = [
  ['basic', 'Basic example'],
  ['installation', 'Installation and imports'],
  ['usage', 'Usage'],
  ['behavior', 'Behavior'],
  ['examples', 'Examples'],
  ['used-in-blocks', 'Used in blocks'],
  ['api-reference', 'API reference'],
  ['events', 'Events'],
  ['accessibility', 'Accessibility'],
  ['anatomy-and-styling', 'Anatomy and styling'],
  ['sources', 'Sources'],
];

// Stand-ins for the Storybook blocks, so node renders the page's own markup and order.
const blocks = {
  Title: () => h('h1', null, 'Title'),
  Primary: () => h('div', { 'data-block': 'primary' }),
  Controls: () => h('div', { 'data-block': 'controls' }),
  Source: ({ code }) => h('pre', null, code),
  Markdown: ({ children }) => h('div', { 'data-block': 'markdown' }, children),
  Anchor: 'a',
};

const texts = (nodes) => [...nodes].map((node) => node.textContent);
const githubUrl = (path) => `https://github.com/ndrewtran/muxui/blob/main/${path}`;

/** A guide file's body once its front matter, when it has any, and its title line are removed. */
function guideBody(raw) {
  const lines = raw.split('\n');
  const afterFrontMatter = lines[0] === '---' ? lines.slice(lines.indexOf('---', 1) + 1) : lines;
  const titleAt = afterFrontMatter.findIndex((line) => line.trim() !== '');
  assert.match(afterFrontMatter[titleAt], /^# /u, 'a guide body opens with its title');
  return afterFrontMatter.slice(titleAt + 1).join('\n').trim();
}

/** The body of a guide's `## <heading>` section, split on the heading lines rather than by the projection under test. */
const guideSection = (raw, heading) => raw.split(/^## /mu).find((part) => part.startsWith(`${heading}\n`)).slice(heading.length + 1).trim();

/**
 * The declarations a family's typed reference was read from: its reference file, then the source of each declaration
 * module that file was generated from, taken from the committed reference rather than from the page.
 */
function declarationSources(family) {
  const inventory = JSON.parse(read('packages/react/reference/inventory.json'));
  const owner = inventory.entries.flatMap(({ exports = [] }) => exports).find(({ name }) => name === family).owner;
  const file = JSON.parse(read(`packages/react/reference/${inventory.owners[owner]}`));
  return [`packages/react/reference/${inventory.owners[owner]}`, ...Object.values(file.sources)];
}

/** The generated story modules the Docs pages read, one per family, with the catalog record each projects. */
async function families() {
  return Promise.all(manifest.families.map(async ({ family, tranche }) => {
    const slug = family.replace(/([a-z])([A-Z])/gu, '$1-$2').toLowerCase();
    const { default: meta } = await import(`../.storybook/generated/${tranche.replaceAll('.', '-').toLowerCase()}-${slug}.stories.mjs`);
    const detail = canonicalCatalog.getArtifact({ id: `muxui:component:${slug}`, platform: 'web.react', detail: 'full' });
    assert.equal(detail.type, 'artifact.detail', `${family} has a catalog record`);
    const examples = canonicalCatalog.getArtifact({ id: `muxui:component:${slug}`, platform: 'web.react', detail: 'full', section: 'examples' }).data.value;
    return { family, slug, meta, artifact: detail.data.artifact, usedIn: detail.data.usedIn ?? [], examples };
  }));
}

test('the Events section lists a part\'s events under its owner, and says when only the parts have any', async () => {
  const { meta } = (await families()).find(({ family }) => family === 'ListBox');
  const entry = meta.parameters.muxuiReference;
  const render = (changes) => new JSDOM(renderToStaticMarkup(h(ComponentDocs, { entry: { ...entry, ...changes }, blocks }))).window.document.querySelector('#events');
  assert.equal(entry.parts.length, 2, 'ListBox lists its Section and Item');
  assert.equal(render({}).querySelectorAll('h3').length, 0, 'a part with no events adds nothing');
  const row = { part: 'row', owner: 'ListBox.Row', props: ['id'], events: ['pick', 'drop'], defaults: {} };
  const withEvents = render({ parts: [...entry.parts, row] });
  assert.deepEqual(texts(withEvents.querySelectorAll('h3')), ['ListBox.Row']);
  assert.deepEqual(texts(withEvents.querySelectorAll('[data-fact="binding.api.partApis.row.events"] code')), ['pick', 'drop']);
  assert.deepEqual(texts(withEvents.querySelectorAll('[data-fact="binding.api.events"] code')), entry.events, 'the root events stay first');
  // With no root events the root line says so, and with none anywhere it says the binding declares none.
  assert.equal(render({ events: [], parts: [row] }).querySelector('[data-fact="binding.api.events"]').textContent, 'The root declares no events.');
  assert.equal(render({ events: [], parts: [] }).querySelector('[data-fact="binding.api.events"]').textContent, 'This binding does not declare events.');
});

test('every family Docs page runs the continuous reference sections in order, projected from the catalog', async () => {
  const guideIds = new Set(canonicalCatalog.listArtifacts({ kind: 'guide', platform: 'web.react', detail: 'brief', limit: 100 }).data.items.map(({ id }) => id));
  // Every Block story with the canonical variant source it renders.
  const blockStories = manifest.pageIndex.filter(({ family }) => manifest.patterns.some((pattern) => pattern.family === family)).flatMap(({ stories }) => stories);
  const all = await families();
  assert.equal(all.length, manifest.count);
  // The shared accessibility guide, whose support and verification sections every family page carries.
  const accessibilityGuide = canonicalCatalog.getArtifact({ id: 'muxui:guide:accessibility', platform: 'web.react', detail: 'full' }).data.artifact;
  const accessibilityFile = read(accessibilityGuide.source.content);
  assert.equal(`sha256:${createHash('sha256').update(accessibilityFile).digest('hex')}`, accessibilityGuide.source.contentDigest, 'the accessibility guide file matches its record');

  for (const { family, slug, meta, artifact, usedIn, examples } of all) {
    const entry = meta.parameters.muxuiReference;
    assert.ok(entry, `${family} story module carries its docs entry`);
    const binding = artifact.bindings['web.react'];
    const page = new JSDOM(renderToStaticMarkup(h(ComponentDocs, { entry, blocks }))).window.document;
    const rendered = [...page.querySelectorAll('section.muxui-docs-section')];
    const section = (id) => rendered.find((node) => node.id === id);

    // Section ids, titles and order, with Used in blocks only for a component a Block uses.
    const expected = sections.filter(([id]) => id !== 'used-in-blocks' || usedIn.length > 0);
    assert.deepEqual(rendered.map((node) => node.id), expected.map(([id]) => id), `${family} sections`);
    for (const [id, title] of expected) {
      assert.deepEqual(texts([...section(id).children].filter((node) => node.localName === 'h2')), [title], `${family} ${id} title`);
    }
    assert.deepEqual([...page.body.children].map((node) => node.localName).slice(0, 3), ['h1', 'p', 'p'], `${family} opens with the title, summary and binding line`);
    assert.doesNotMatch(page.body.textContent, /\u2014/u, `${family} docs page has no em dash`);

    // The summary is the catalog's, and replaces the constant description.
    assert.equal(page.querySelector('.muxui-docs-summary').textContent, artifact.summary, `${family} summary`);
    assert.equal(meta.parameters.docs.description.component, artifact.summary, `${family} description`);

    // The live preview is the existing Primary story, over the first canonical example's static source. Controls is the API reference.
    const basic = [...section('basic').children].filter((node) => node.localName !== 'h2');
    assert.equal(basic[0].getAttribute('data-block'), 'primary', `${family} preview comes first in Basic example`);
    assert.equal(basic.at(-1).textContent, read(examples[0].source.content), `${family} basic example source`);
    assert.equal(page.querySelectorAll('[data-block="primary"]').length, 1, `${family} one live preview`);
    assert.equal(page.querySelectorAll('[data-block="controls"]').length, 1, `${family} one Controls table`);
    // The API reference is the typed reference of the declarations, then the live Controls beside it (see typed-reference.test.mjs).
    assert.deepEqual(
      [...section('api-reference').children].map((node) => node.localName === 'h2' ? 'h2' : node.getAttribute('data-typed-reference') !== null ? 'typed' : node.localName === 'h3' ? node.textContent : node.getAttribute('data-block')),
      ['h2', 'typed', 'Controls', 'controls'],
      `${family} API reference is the typed reference, then the Controls table`,
    );

    // Installation: the import follows the descriptor and the package exports.
    const exported = descriptor.bindings.find(({ binding: ref }) => ref === `${artifact.id}#web.react`);
    const specifier = exported.module === '.' ? reactManifest.name : `${reactManifest.name}${exported.module.slice(1)}`;
    assert.equal(section('installation').querySelector('pre').textContent, `import '${reactManifest.name}/styles.css';\nimport { ${exported.export} } from '${specifier}';\n`, `${family} imports`);

    // Usage, behavior, events, accessibility.
    const list = (root, fact) => [...root.querySelectorAll(`[data-fact="${fact}"] li`)].map((node) => node.textContent);
    assert.deepEqual(list(section('usage'), 'intent.useWhen'), artifact.intent?.useWhen ?? [], `${family} use when`);
    assert.deepEqual(list(section('usage'), 'intent.avoidWhen'), artifact.intent?.avoidWhen ?? [], `${family} avoid when`);
    // The related usage guide: its id, name, source and body come from the guide record and its canonical file.
    const guideId = `muxui:guide:${slug}-usage`;
    const guides = [...section('usage').querySelectorAll('[data-guide-id]')];
    assert.deepEqual(guides.map((node) => node.getAttribute('data-guide-id')), guideIds.has(guideId) ? [guideId] : [], `${family} related usage guide`);
    if (guides.length === 1) {
      const guide = canonicalCatalog.getArtifact({ id: guideId, platform: 'web.react', detail: 'full' }).data.artifact;
      const raw = read(guide.source.content);
      assert.equal(`sha256:${createHash('sha256').update(raw).digest('hex')}`, guide.source.contentDigest, `${family} guide file matches its record`);
      const caption = guides[0].querySelector('.muxui-docs-caption');
      assert.equal(caption.textContent, `${guide.name}: ${guide.source.content}`, `${family} guide name and source`);
      assert.equal(caption.querySelector('a').getAttribute('href'), githubUrl(guide.source.content), `${family} guide source link`);
      assert.equal(guides[0].querySelector('[data-block="markdown"]').textContent, guideBody(raw), `${family} guide body`);
    }
    assert.deepEqual(list(section('behavior'), 'binding.behavior'), binding.behavior ?? [], `${family} behavior`);
    assert.deepEqual(texts(section('events').querySelectorAll('[data-fact="binding.api.events"] code')), binding.api.events, `${family} events`);
    // A part's events follow the root's, under the part's owner, and a part with none lists none.
    // The docs list the parts in anatomy order, whatever order the catalog record keys them in.
    const partsWithEvents = Object.entries(binding.api.partApis ?? {}).filter(([, api]) => api.events.length > 0)
      .sort(([left], [right]) => artifact.anatomy.indexOf(left) - artifact.anatomy.indexOf(right));
    for (const [part, api] of Object.entries(binding.api.partApis ?? {})) {
      assert.deepEqual(texts(section('events').querySelectorAll(`[data-fact="binding.api.partApis.${part}.events"] code`)), api.events, `${family} ${part} events`);
    }
    assert.deepEqual(texts(section('events').querySelectorAll('h3')), partsWithEvents.map(([, api]) => `${descriptor.bindings.find(({ binding: ref }) => ref === `${artifact.id}#web.react`).export}.${api.member}`), `${family} part event owners`);
    const nameRequired = section('accessibility').querySelector('[data-fact="accessibility.nameRequired"]').textContent;
    assert.equal(nameRequired, `Accessible name required: ${artifact.accessibility.nameRequired ? 'yes' : 'no'}`, `${family} accessible name`);
    assert.deepEqual(list(section('accessibility'), 'accessibility.obligations'), artifact.accessibility.obligations, `${family} obligations`);
    const bindingAccessibility = binding.accessibility ?? [];
    assert.deepEqual(
      list(section('accessibility'), 'binding.accessibility'),
      JSON.stringify(bindingAccessibility) === JSON.stringify(artifact.accessibility.obligations) ? [] : bindingAccessibility,
      `${family} binding accessibility`,
    );

    // The guide's support status and verification follow the family's obligations, word for word from the guide file, with a link to all of it.
    const shared = section('accessibility').querySelector('[data-shared-guide]');
    assert.equal(shared.getAttribute('data-shared-guide'), accessibilityGuide.id, `${family} shared accessibility guide`);
    assert.equal(section('accessibility').lastElementChild, shared, `${family} shared accessibility guide comes after the family obligations`);
    assert.deepEqual(texts(shared.querySelectorAll('h3')), ['Support status', 'Verification'], `${family} shared accessibility headings`);
    assert.deepEqual(
      texts(shared.querySelectorAll('[data-block="markdown"]')),
      ['Support status', 'Verification'].map((heading) => guideSection(accessibilityFile, heading)),
      `${family} shared accessibility text`,
    );
    // The route the guide links to the tested profile opens the file that owns it, which exists.
    assert.deepEqual(entry.accessibilityGuide.links, { '/installation/#tested-profile': 'catalog/react-r1-5/closure.json' }, `${family} shared accessibility links`);
    // The guide's sentence promises the tested browser and display profiles, so that file's compatibility record holds both.
    for (const source of Object.values(entry.accessibilityGuide.links)) {
      const { browserMatrix } = JSON.parse(read(source)).compatibility;
      assert.ok(typeof browserMatrix.browser === 'string' && browserMatrix.browser !== '', `${family} ${source} has the tested browser`);
      assert.ok(Array.isArray(browserMatrix.profiles) && browserMatrix.profiles.length > 0 && browserMatrix.profiles.every((profile) => typeof profile === 'string' && profile !== ''), `${family} ${source} has display profiles`);
    }
    const guideCaption = shared.querySelector('.muxui-docs-caption');
    assert.equal(guideCaption.textContent, `Full guide: ${accessibilityGuide.source.content}`, `${family} shared accessibility caption`);
    assert.equal(guideCaption.querySelector('a').getAttribute('href'), githubUrl(accessibilityGuide.source.content), `${family} link to the full accessibility guide`);

    // Examples: the canonical examples after the first, each with its exact source.
    assert.deepEqual(
      texts(section('examples').querySelectorAll('pre')),
      examples.slice(1).map((example) => read(example.source.content)),
      `${family} examples`,
    );
    assert.deepEqual(texts(section('examples').querySelectorAll('h3')), examples.slice(1).map(({ name }) => name), `${family} example names`);

    // Used in blocks: each declared relation in order, by its pattern's name, its first variant's story and its roles.
    const items = [...(section('used-in-blocks')?.querySelectorAll('li') ?? [])];
    assert.equal(items.length, usedIn.length, `${family} used in blocks`);
    for (const [position, relation] of usedIn.entries()) {
      const pattern = canonicalCatalog.getArtifact({ id: relation.id, platform: 'web.react', detail: 'full' }).data.artifact;
      const firstVariant = canonicalCatalog.getArtifact({ id: pattern.variants[0].example, platform: 'web.react', detail: 'full' }).data.artifact;
      const story = blockStories.find(({ source }) => source === firstVariant.source.content);
      assert.ok(story, `${relation.id} has a Block story for its first variant`);
      const link = items[position].querySelector('a');
      assert.equal(link.textContent, pattern.name, `${family} Block ${relation.id} name`);
      assert.equal(link.getAttribute('href'), `?path=/story/${story.id}`, `${family} Block ${relation.id} story`);
      assert.equal(
        items[position].querySelector('.muxui-docs-roles').textContent,
        relation.roles.map(({ role, requirement }) => requirement === 'optional' ? `${role} (optional)` : role).join(', '),
        `${family} Block ${relation.id} roles`,
      );
    }

    // Anatomy and styling: parts, states and every token requirement, with no class names or selectors.
    const styling = section('anatomy-and-styling');
    assert.deepEqual(texts(styling.querySelectorAll('[data-fact="anatomy"] code')), artifact.anatomy, `${family} anatomy`);
    assert.deepEqual(texts(styling.querySelectorAll('[data-fact="states"] code')), artifact.states, `${family} states`);
    assert.equal(styling.querySelector('[data-fact="tokenRecipe.source"]').textContent, `Token source: ${binding.tokenRecipe.source}`, `${family} token source`);
    const requirements = binding.tokenRecipe.requirements;
    const annotation = ({ requirement, profiles }) => requirement === 'required' ? null : [requirement, ...(profiles ?? [])].join(', ');
    const byToken = ([left], [right]) => left < right ? -1 : left > right ? 1 : 0;
    assert.deepEqual(
      [...styling.querySelectorAll('[data-fact="tokenRecipe.requirements"] li')]
        .map((item) => [item.querySelector('code').textContent, item.querySelector('.muxui-docs-token-requirement')?.textContent ?? null]).sort(byToken),
      requirements.map((entry) => [entry.token, annotation(entry)]).sort(byToken),
      `${family} token requirements`,
    );
    assert.deepEqual(
      texts(styling.querySelectorAll('h4.muxui-docs-token-group')),
      requirements.length > tokenGroupThreshold ? [...new Set(requirements.map(({ token }) => token.split('.').slice(0, 2).join('.')))] : [],
      `${family} token groups`,
    );
    assert.doesNotMatch(styling.textContent, /\.muxui-|data-muxui|\[data-/u, `${family} anatomy and styling shows a class name or selector`);

    // Sources: the record, the canonical examples, the family's runtime file and the package manifest.
    const runtime = contract.components.find((component) => component.slug === slug)?.source;
    assert.ok(runtime, `${family} has a runtime source in the renderer contract`);
    assert.deepEqual(
      [...section('sources').querySelectorAll('a')].map((node) => node.getAttribute('href')),
      [artifact.source.record, ...examples.map((example) => example.source.content), runtime, 'packages/react/package.json', ...declarationSources(family)]
        .map((path) => `https://github.com/ndrewtran/muxui/blob/main/${path}`),
      `${family} sources`,
    );
  }
});

/**
 * The Docs page as static markup, under the theme and style cache that Storybook's own Markdown block needs for the
 * code spans every page now shows. `extra` replaces the stand-in blocks, such as with the real Markdown.
 */
const staticDocs = (entry, extra = {}) => new JSDOM(renderToStaticMarkup(h(
  CacheProvider,
  { value: createCache({ key: 'muxui-static' }) },
  h(ThemeProvider, { theme: convert(buildTheme('light')) }, h(ComponentDocs, { entry, blocks: { ...blocks, ...extra } })),
))).window.document;

/**
 * Runs `run` with Storybook's own blocks, which need a document at import, so give them one for the run only.
 * The window is a standalone page unless one is given, such as a manager's preview frame.
 */
async function withStorybookBlocks(run, window = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' }).window) {
  const globals = { window, document: window.document, navigator: window.navigator };
  const previous = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  try {
    await run(await import('@storybook/addon-docs/blocks'));
  } finally {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('a usage guide shows without its front matter or title, and its headings sit below the page sections', async () => {
  await withStorybookBlocks(async ({ Markdown }) => {
    // Some guide files open with front matter and every one with a title; the shown body keeps neither.
    let withFrontMatter = 0;
    for (const { family, tranche } of manifest.families) {
      const slug = family.replace(/([a-z])([A-Z])/gu, '$1-$2').toLowerCase();
      const { default: module } = await import(`../.storybook/generated/${tranche.replaceAll('.', '-').toLowerCase()}-${slug}.stories.mjs`);
      const { guide } = module.parameters.muxuiReference;
      if (guide === null) continue;
      const guideFile = read(guide.source);
      if (guideFile.startsWith('---\n')) withFrontMatter += 1;
      assert.doesNotMatch(guide.markdown, /^---$|^id: |^# /mu, `${family} guide shows no front matter or title`);
      assert.ok(guide.markdown.length > 0 && guideFile.includes(guide.markdown), `${family} guide body is part of its file`);
    }
    assert.ok(withFrontMatter > 0, 'a guide with front matter is covered');

    // Virtualizer's guide has several second level headings and a table.
    const { default: meta } = await import('../.storybook/generated/r1-3-virtualizer.stories.mjs');
    const raw = read(meta.parameters.muxuiReference.guide.source);

    const page = staticDocs(meta.parameters.muxuiReference, { Markdown });
    const shown = page.querySelector('[data-guide-id]');
    assert.equal(shown.querySelectorAll('h1, h2, h3').length, 1, 'only the guidance heading remains above h4');
    assert.equal(shown.querySelector('h3').textContent, 'Related usage guidance');
    const headings = raw.split('\n').filter((line) => line.startsWith('## ')).map((line) => line.slice(3));
    assert.ok(headings.length > 1, 'the guide has second level headings');
    assert.deepEqual(texts(shown.querySelectorAll('h4')), headings, 'each second level heading becomes an h4');
    assert.ok(shown.querySelector('table'), 'the guide table renders');
    // Only the eleven sections are h2 on the page.
    assert.deepEqual(texts(page.querySelectorAll('h2')), sections.filter(([id]) => id !== 'used-in-blocks' || page.querySelector('#used-in-blocks')).map(([, title]) => title));
  });
});

test('the shared accessibility sections render through Storybook\'s own Markdown as the guide wrote them', async () => {
  await withStorybookBlocks(async ({ Markdown }) => {
    const raw = read('catalog/guides/accessibility.md');
    const shared = staticDocs(await familyEntry('Dialog'), { Markdown }).querySelector('[data-shared-guide]');
    // One h3 per section, the guide's own subsections one level below, and no other heading.
    assert.deepEqual(texts(shared.querySelectorAll('h3')), ['Support status', 'Verification']);
    assert.deepEqual(texts(shared.querySelectorAll('h4')), ['Automated proof', 'Known limitations']);
    assert.equal(shared.querySelectorAll('h1, h2, h5, h6').length, 0);
    // Every paragraph is the guide's, in its words, with its code span and link kept.
    const plain = (markdown) => markdown.split(/\n\n+/u).filter((block) => !block.startsWith('#'))
      .map((block) => block.replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1').replaceAll('`', '').replace(/\s+/gu, ' '));
    assert.deepEqual(
      texts(shared.querySelectorAll('p:not(.muxui-docs-caption)')).map((text) => text.replace(/\s+/gu, ' ')),
      ['Support status', 'Verification'].flatMap((heading) => plain(guideSection(raw, heading))),
    );
    assert.deepEqual(texts(shared.querySelectorAll('code')), ['S1.0']);
    // The tested profile link leaves Storybook for the file that owns the profile, and the guide link follows it.
    const links = [...shared.querySelectorAll('a')].map((node) => [node.textContent, node.getAttribute('href'), node.getAttribute('target')]);
    assert.deepEqual(links, [
      ['tested profile', githubUrl('catalog/react-r1-5/closure.json'), '_blank'],
      ['catalog/guides/accessibility.md', githubUrl('catalog/guides/accessibility.md'), '_blank'],
    ]);
  });
});

test('a site route in the shared accessibility text opens its owner file, and a route with none fails generation', () => {
  assert.deepEqual(
    siteLinks([{ markdown: 'See the [tested profile](/installation/#tested-profile) and [again](/installation/#tested-profile).' }, { markdown: 'No links.' }], repositoryRoot),
    { '/installation/#tested-profile': 'catalog/react-r1-5/closure.json' },
  );
  assert.deepEqual(siteLinks([{ markdown: 'Only [an anchor](#top) and [the web](https://example.com/).' }], repositoryRoot), {});
  assert.throws(() => siteLinks([{ markdown: 'See [Themes](/themes/).' }], repositoryRoot), /links \/themes\/, which Storybook can open only when siteRouteSources names the file that owns it/u);
});

test('guide links resolve to Storybook Docs pages and fail on a family without one', () => {
  const pages = new Map([['muxui:component:checkbox', '?path=/docs/muxui-react-r1-1-checkbox--docs']]);
  const guide = 'Use [Checkbox](/components/checkbox/), [again](/components/checkbox/ "Group"), the [API](#api-reference), or [the site](https://example.com/).';
  assert.deepEqual(guideLinks(guide, pages), { '/components/checkbox/': '?path=/docs/muxui-react-r1-1-checkbox--docs' });
  assert.deepEqual(guideLinks('No links here.', pages), {});
  assert.throws(() => guideLinks('[Switch](/components/switch/ "Setting")', pages), /\/components\/switch\/, which has no Storybook Docs page/u);
  assert.throws(() => guideLinks('[Checkbox](/components/checkbox "Group")', pages), /must be a family page path/u);
  assert.throws(() => guideLinks('[Mixed state](/components/checkbox/#mixed-state)', pages), /must be a family page path/u);
});

const slugOf = (family) => family.replace(/([a-z])([A-Z])/gu, '$1-$2').toLowerCase();
/** The Docs page of a family is its first story's group id, taken from the manifest rather than rebuilt from the tranche. */
const docsId = (slug) => {
  const { family } = manifest.families.find(({ family: name }) => slugOf(name) === slug);
  return `${manifest.pageIndex.find((page) => page.family === family).stories[0].id.split('--')[0]}--docs`;
};
/** A preview frame hosted by a Storybook manager: the iframe the manager names, inside a same-origin parent. */
const managerFrame = () => {
  const manager = new JSDOM('<!doctype html><html><body><iframe id="storybook-preview-iframe"></iframe></body></html>', { url: 'http://localhost/storybook/' });
  return manager.window.document.getElementById('storybook-preview-iframe').contentWindow;
};
const familyEntry = async (name) => {
  const { tranche } = manifest.families.find(({ family }) => family === name);
  const { default: meta } = await import(`../.storybook/generated/${tranche.replaceAll('.', '-').toLowerCase()}-${slugOf(name)}.stories.mjs`);
  return meta.parameters.muxuiReference;
};

test('a guide link to another family names that family Docs page in the manager', async () => {
  await withStorybookBlocks(async ({ Markdown }) => {
    const linked = new Map();
    for (const { family } of manifest.families) {
      const entry = await familyEntry(family);
      if (entry.guide === null) continue;
      const slugs = linkedFamilies(read(entry.guide.source));
      const page = staticDocs(entry, { Markdown });
      const anchors = [...page.querySelectorAll('[data-guide-id] a')];
      const hrefs = anchors.map((node) => node.getAttribute('href')).filter((href) => !href.startsWith('#') && !href.startsWith('http'));
      assert.deepEqual([...new Set(hrefs)], slugs.map((slug) => `?path=/docs/${docsId(slug)}`), `${family} guide links`);
      if (slugs.length > 0) linked.set(family, anchors.filter((node) => node.getAttribute('href').startsWith('?path=')).map((node) => [node.textContent, node.getAttribute('href')]));
    }
    // The pilot families link to their alternatives by name.
    assert.deepEqual(linked.get('Checkbox'), [['Switch', `?path=/docs/${docsId('switch')}`], ['CheckboxField', `?path=/docs/${docsId('checkbox-field')}`], ['CheckboxGroup', `?path=/docs/${docsId('checkbox-group')}`]]);
    assert.deepEqual(linked.get('Switch'), [['Checkbox', `?path=/docs/${docsId('checkbox')}`], ['SwitchField', `?path=/docs/${docsId('switch-field')}`]]);
    assert.deepEqual(linked.get('Select'), [['SelectNative', `?path=/docs/${docsId('select-native')}`], ['ComboBox', `?path=/docs/${docsId('combo-box')}`]]);
    assert.deepEqual(linked.get('SelectNative'), [['Select', `?path=/docs/${docsId('select')}`], ['ComboBox', `?path=/docs/${docsId('combo-box')}`]]);
  }, managerFrame());
});

/**
 * Renders a Docs page into `window` with Storybook's real Markdown and Anchor blocks, and a manager channel that records what it is sent.
 * Clicks are recorded, then cancelled so the DOM does not try to navigate.
 */
async function renderDocs({ entry, window }) {
  const sent = [];
  const clicks = [];
  const { Markdown, AnchorMdx, DocsContext } = await import('@storybook/addon-docs/blocks');
  window.document.addEventListener('click', (event) => {
    clicks.push({ href: event.target.closest('a')?.getAttribute('href'), prevented: event.defaultPrevented });
    event.preventDefault();
  });
  const container = window.document.body.appendChild(window.document.createElement('div'));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(container);
  // The styled Anchor needs the theme and a style cache that the Docs container supplies in Storybook.
  await act(async () => root.render(h(
    CacheProvider,
    { value: createCache({ key: 'muxui-test', container: window.document.head }) },
    h(
      ThemeProvider,
      { theme: convert(buildTheme('light')) },
      h(
        DocsContext.Provider,
        { value: { channel: { emit: (...message) => sent.push(message) } } },
        h(ComponentDocs, { entry, blocks: { ...blocks, Markdown, Anchor: AnchorMdx } }),
      ),
    ),
  )));
  const click = (node) => node.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  const link = (text) => [...container.querySelectorAll('a')].find((node) => node.textContent === text);
  return { sent, clicks, click, link, unmount: () => act(async () => root.unmount()) };
}

test('a family link in a manager frame navigates the manager through the real Anchor', async () => {
  const frame = managerFrame();
  await withStorybookBlocks(async () => {
    const page = await renderDocs({ entry: await familyEntry('Switch'), window: frame });
    const checkbox = page.link('Checkbox');
    assert.equal(checkbox.getAttribute('href'), `?path=/docs/${docsId('checkbox')}`);
    await act(async () => page.click(checkbox));
    assert.deepEqual(page.sent, [['navigateUrl', `?path=/docs/${docsId('checkbox')}`]], 'the manager is sent the family Docs page');
    assert.equal(page.clicks[0].prevented, true, 'the Anchor leaves the navigation to the manager');
    await page.unmount();
  }, frame);
});

test('a family link in standalone Docs is a real link that keeps the hosting base path', async () => {
  const standalone = new JSDOM('<!doctype html><html><body></body></html>', {
    url: `http://localhost/docs-site/storybook/iframe.html?viewMode=docs&id=muxui-react-r1-2-switch--docs&globals=colorScheme:dark&args=size:lg`,
  });
  await withStorybookBlocks(async () => {
    const entry = await familyEntry('Switch');
    const page = await renderDocs({ entry, window: standalone.window });
    const checkbox = page.link('Checkbox');
    // Same frame, same base path and globals, the family's id, and none of the previous page's args.
    assert.equal(checkbox.getAttribute('href'), `/docs-site/storybook/iframe.html?viewMode=docs&id=${docsId('checkbox')}&globals=colorScheme%3Adark`);
    await act(async () => page.click(checkbox));
    assert.deepEqual(page.sent, [], 'there is no manager to send to');
    assert.equal(page.clicks[0].prevented, false, 'the click is left to the browser');
    await page.unmount();

    // A Block link on a family page takes the same route, to the story view.
    const button = await familyEntry('Button');
    const blocksPage = await renderDocs({ entry: button, window: standalone.window });
    const block = blocksPage.link(button.usedIn[0].name);
    assert.equal(block.getAttribute('href'), `/docs-site/storybook/iframe.html?viewMode=story&id=${button.usedIn[0].storyId}&globals=colorScheme%3Adark`);
    await blocksPage.unmount();
  }, standalone.window);
});

/** A family guide whose body is `markdown`, with the Docs page of Checkbox as the only family it can link to. */
const guideEntry = async (markdown, links) => {
  const entry = await familyEntry('Switch');
  return { ...entry, guide: { ...entry.guide, markdown, links } };
};
const checkboxPage = () => new Map([['muxui:component:checkbox', `?path=/docs/${docsId('checkbox')}`]]);

// The one form a guide may use to link a family, as the contribution guide documents it. The parser accepts exactly these,
// and the real renderer must resolve every one of them.
const acceptedForms = [
  ['an inline link', '[Checkbox](/components/checkbox/)', null],
  ['an inline link with a double-quoted title', '[Checkbox](/components/checkbox/ "Select an option")', 'Select an option'],
  ['a code span as the name', '[`Checkbox`](/components/checkbox/)', null],
  ['emphasis in the name', '[**Check**box](/components/checkbox/)', null],
  ['a list item', '- [Checkbox](/components/checkbox/ "Select an option")', 'Select an option'],
  ['a table cell', '| Use |\n| --- |\n| [Checkbox](/components/checkbox/) |', null],
];

test('every accepted family link form is resolved by the real renderer and opens the Docs page', async () => {
  for (const [form, markdown, title] of acceptedForms) {
    const frame = managerFrame();
    await withStorybookBlocks(async () => {
      assert.deepEqual(linkedFamilies(markdown), ['checkbox'], `${form} is accepted`);
      const entry = await guideEntry(markdown, guideLinks(markdown, checkboxPage()));
      const page = await renderDocs({ entry, window: frame });
      const links = [...frame.document.querySelectorAll('[data-guide-id] a')].filter((node) => node.getAttribute('href') !== null && !node.getAttribute('href').startsWith('https://github.com/'));
      assert.equal(links.length, 1, `${form} renders one link`);
      assert.equal(links[0].getAttribute('href'), `?path=/docs/${docsId('checkbox')}`, `${form} resolves to the family Docs page`);
      assert.equal(links[0].textContent, 'Checkbox', `${form} keeps its name`);
      assert.equal(links[0].getAttribute('title'), title, `${form} keeps its title`);
      await act(async () => page.click(links[0]));
      assert.deepEqual(page.sent, [['navigateUrl', `?path=/docs/${docsId('checkbox')}`]], `${form} opens the Docs page in the manager`);
      await page.unmount();
    }, frame);
  }
});

test('the family link forms the parser rejects are not ones the real renderer resolves', async () => {
  // Even with the Docs page ready, Storybook leaves these as text or as an unresolved link.
  const rejected = {
    'a collapsed reference': '[Checkbox][]\n\n[Checkbox]: /components/checkbox/',
    'a shortcut reference': '[Checkbox]\n\n[Checkbox]: /components/checkbox/',
    'a parenthesized title': '[Checkbox](/components/checkbox/ (Setting))',
    'an HTML anchor with spaces in its href': '<a href=" /components/checkbox/ ">Checkbox</a>',
  };
  for (const [form, markdown] of Object.entries(rejected)) {
    assert.throws(() => linkedFamilies(markdown), /Write an inline link/u, `${form} is rejected`);
    const frame = managerFrame();
    await withStorybookBlocks(async ({ Markdown }) => {
      const entry = await guideEntry(markdown, { '/components/checkbox/': `?path=/docs/${docsId('checkbox')}` });
      const page = staticDocs(entry, { Markdown });
      const resolved = [...page.querySelectorAll('[data-guide-id] a')].filter((node) => node.getAttribute('href')?.startsWith('?path='));
      assert.deepEqual(resolved, [], `${form} is not a resolved link`);
    }, frame);
  }
});
