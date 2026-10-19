import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComponentDocs } from '../.storybook/component-docs-page.mjs';
import manifest from '../.storybook/generated/manifest.mjs';

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

test('every family Docs page runs the continuous reference sections in order, projected from the catalog', async () => {
  const guideIds = new Set(canonicalCatalog.listArtifacts({ kind: 'guide', platform: 'web.react', detail: 'brief', limit: 100 }).data.items.map(({ id }) => id));
  // Every Block story with the canonical variant source it renders.
  const blockStories = manifest.pageIndex.filter(({ family }) => manifest.patterns.some((pattern) => pattern.family === family)).flatMap(({ stories }) => stories);
  const all = await families();
  assert.equal(all.length, manifest.count);

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
    assert.deepEqual([...section('api-reference').children].map((node) => node.localName === 'h2' ? 'h2' : node.getAttribute('data-block')), ['h2', 'controls'], `${family} API reference is the Controls table alone`);

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
    const nameRequired = section('accessibility').querySelector('[data-fact="accessibility.nameRequired"]').textContent;
    assert.equal(nameRequired, `Accessible name required: ${artifact.accessibility.nameRequired ? 'yes' : 'no'}`, `${family} accessible name`);
    assert.deepEqual(list(section('accessibility'), 'accessibility.obligations'), artifact.accessibility.obligations, `${family} obligations`);
    const bindingAccessibility = binding.accessibility ?? [];
    assert.deepEqual(
      list(section('accessibility'), 'binding.accessibility'),
      JSON.stringify(bindingAccessibility) === JSON.stringify(artifact.accessibility.obligations) ? [] : bindingAccessibility,
      `${family} binding accessibility`,
    );

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
      [artifact.source.record, ...examples.map((example) => example.source.content), runtime, 'packages/react/package.json']
        .map((path) => `https://github.com/ndrewtran/muxui/blob/main/${path}`),
      `${family} sources`,
    );
  }
});

test('a usage guide shows without its front matter or title, and its headings sit below the page sections', async () => {
  // Storybook's own Markdown block needs a document at import, so give it one for this test only.
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator };
  const previous = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  try {
    const { Markdown } = await import('@storybook/addon-docs/blocks');
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

    const page = new JSDOM(renderToStaticMarkup(h(ComponentDocs, { entry: meta.parameters.muxuiReference, blocks: { ...blocks, Markdown } }))).window.document;
    const shown = page.querySelector('[data-guide-id]');
    assert.equal(shown.querySelectorAll('h1, h2, h3').length, 1, 'only the guidance heading remains above h4');
    assert.equal(shown.querySelector('h3').textContent, 'Related usage guidance');
    const headings = raw.split('\n').filter((line) => line.startsWith('## ')).map((line) => line.slice(3));
    assert.ok(headings.length > 1, 'the guide has second level headings');
    assert.deepEqual(texts(shown.querySelectorAll('h4')), headings, 'each second level heading becomes an h4');
    assert.ok(shown.querySelector('table'), 'the guide table renders');
    // Only the eleven sections are h2 on the page.
    assert.deepEqual(texts(page.querySelectorAll('h2')), sections.filter(([id]) => id !== 'used-in-blocks' || page.querySelector('#used-in-blocks')).map(([, title]) => title));
  } finally {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
