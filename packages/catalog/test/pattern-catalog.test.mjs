import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  canonicalDigest,
  canonicalJson,
  resolveAuthoringField,
  sha256Digest,
} from '@muxui/schema';
import { catalogJson } from '../generated/catalog.mjs';
import { assertManifestCompleteness } from '../src/completeness.mjs';
import {
  createCatalogApi,
  getArtifact,
  getManifest,
  listArtifacts,
  searchArtifacts,
} from '../src/index.mjs';
import { patternImportIssues, scanReactImports } from '../src/pattern-imports.mjs';
import { compileFixtureCatalog } from './fixtures/fixture-catalog.mjs';

const baseBundle = JSON.parse(catalogJson);
const fixtureDirectory = resolve(import.meta.dirname, 'fixtures/patterns/poster-grid');
const patternId = 'muxui:pattern:poster-grid';
const cssId = 'muxui:example:poster-grid-css';
const virtualizedId = 'muxui:example:poster-grid-virtualized';
const cssPath = 'examples/react/css-grid.tsx';

// Compiling the whole catalog takes seconds, so the shared fixture compiles once.
let shared;
const fixtureCatalog = () => (shared ??= compileFixtureCatalog());
const fixtureApi = async () => createCatalogApi((await fixtureCatalog()).bundle);

async function compileFailure(options) {
  try {
    await compileFixtureCatalog({ minimal: true, ...options });
  } catch (error) {
    return error;
  }
  return assert.fail('the fixture catalog unexpectedly compiled');
}

test('E-BL1-01: the fixture pattern compiles with derived group, revision, and exact variant source', async () => {
  const { bundle } = await fixtureCatalog();
  const pattern = bundle.artifacts.find(({ id }) => id === patternId);
  assert.equal(pattern.group, 'application');
  assert.deepEqual(pattern.platforms, ['web.react']);
  assert.match(pattern.patternRevision, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(Object.hasOwn(pattern, 'sourceText'), false);

  const variants = bundle.artifacts.filter(({ sourceText }) => sourceText !== undefined);
  assert.deepEqual(variants.map(({ id }) => id), [cssId, virtualizedId]);
  for (const variant of variants) {
    const bytes = await readFile(join(fixtureDirectory, variant.source.content.replace('fixture/', '')), 'utf8');
    assert.equal(variant.sourceText, bytes);
    assert.equal(variant.source.contentDigest, sha256Digest(bytes));
    // A variant has no binding, so its platforms come from its pattern.
    assert.deepEqual(variant.platforms, ['web.react']);
    assert.equal(Object.hasOwn(variant.record, 'binding'), false);
  }
  assert.deepEqual(
    bundle.relations.filter(({ target }) => target === patternId),
    [
      { type: 'example-of', source: cssId, target: patternId },
      { type: 'example-of', source: virtualizedId, target: patternId },
    ],
  );
  // Real component examples keep their own sources only.
  assert.equal(
    bundle.artifacts.filter(({ sourceText }) => sourceText !== undefined).length,
    2,
  );
  const terms = bundle.searchIndex.find(({ id }) => id === patternId).terms;
  for (const [field, value] of [
    ['category', 'collections'],
    ['participant.role', 'scroller'],
    ['participant.component', 'muxui:component:virtualizer'],
  ]) {
    assert.ok(terms.some((term) => term.field === field && term.value === value), field);
  }
});

test('E-BL1-01 negative: a variant importing an undeclared component names pattern.participants and its source', async () => {
  const error = await compileFailure({
    edit: (files) => files.set(cssPath, `import { Button, GridList } from '@muxui/react';\n${files.get(cssPath)}`),
  });
  assert.equal(error.code, 'MUXUI_RELATION_INVALID');
  const [issue] = error.issues;
  assert.equal(issue.artifactId, patternId);
  assert.equal(issue.path, '$/participants');
  assert.equal(issue.source, 'fixture/examples/react/css-grid.tsx');
  assert.equal(issue.line, 1);
  assert.match(issue.message, /fixture\/examples\/react\/css-grid\.tsx:1 imports Button, which pattern\.participants does not declare/u);
  assert.equal(resolveAuthoringField('pattern', issue.path).owner, 'pattern-contract');
  assert.equal(error.issues.length, 1);
});

test('E-BL1-01 negative: a non-canonical @muxui/react reference fails the compile closed', async () => {
  const error = await compileFailure({
    edit: (files) => files.set(cssPath, "import * as Mux from '@muxui/react';\n"),
  });
  assert.equal(error.code, 'MUXUI_RELATION_INVALID');
  assert.equal(error.issues[0].path, '$/participants');
  assert.match(error.issues[0].message, /css-grid\.tsx:1 has a namespace import of '@muxui\/react'.*pattern\.participants/u);
});

test('E-BL1-01 negative: graph and record errors surface from the compile with their owners', async () => {
  const missing = await compileFailure({
    edit: (files) => files.delete('examples/react/virtualized.example.json'),
  });
  assert.equal(missing.code, 'MUXUI_RELATION_INVALID');
  assert.deepEqual(
    missing.issues.map(({ artifactId, path }) => ({ artifactId, path })),
    [{ artifactId: patternId, path: '$/variants/1/example' }],
  );

  const orphan = await compileFailure({
    edit: (files) => {
      files.set(
        'examples/react/orphan.example.json',
        files.get('examples/react/css-grid.example.json')
          .replace('poster-grid-css', 'poster-grid-orphan')
          .replace('css-grid.tsx', 'orphan.tsx'),
      );
      files.set('examples/react/orphan.tsx', files.get(cssPath));
    },
  });
  assert.deepEqual(
    orphan.issues.map(({ artifactId, path }) => ({ artifactId, path })),
    [{ artifactId: 'muxui:example:poster-grid-orphan', path: '$/binding' }],
  );
  assert.match(orphan.issues[0].message, /list it in one pattern's variants/u);

  const noVariants = await compileFailure({
    edit: (files) => files.set('artifact.json', JSON.stringify({
      ...JSON.parse(files.get('artifact.json')),
      variants: [],
    })),
  });
  assert.equal(noVariants.code, 'MUXUI_SCHEMA_INVALID');
  assert.equal(noVariants.issues[0].path, '$/variants');
  assert.equal(resolveAuthoringField('pattern', noVariants.issues[0].path).owner, 'pattern-contract');
});

test('E-BL1-01 negative: variant sources must use LF newlines so the bundle keeps exact bytes', async () => {
  const error = await compileFailure({
    edit: (files) => files.set(cssPath, files.get(cssPath).replaceAll('\n', '\r\n')),
  });
  assert.match(error.message, /MUXUI_CATALOG_SOURCE_INVALID: fixture\/examples\/react\/css-grid\.tsx must use LF newlines/u);
});

const components = baseBundle.artifacts
  .filter(({ kind }) => kind === 'component')
  .map(({ record }) => record);
const patternRecord = JSON.parse(await readFile(join(fixtureDirectory, 'artifact.json'), 'utf8'));
const issuesFor = (text) => patternImportIssues({
  pattern: patternRecord,
  components,
  variants: [{ source: 'variant.tsx', text }],
});

test('E-BL1-01: the import scanner accepts only the canonical static named import', () => {
  const accepted = [
    ['named', "import { GridList } from '@muxui/react';", ['GridList']],
    ['alias maps by export name', "import { GridList as G, Virtualizer as V } from '@muxui/react';", ['GridList', 'Virtualizer']],
    ['multi-line with a trailing comma', "import {\n  GridList,\n  type GridListProps,\n  Virtualizer,\n} from '@muxui/react'", ['GridList', 'Virtualizer']],
    ['import type is ignored', "import type { Button } from '@muxui/react';", []],
    ['type specifier is ignored', "import { type Button, type Dialog as D, GridList } from '@muxui/react';", ['GridList']],
    ['comments and strings are skipped', "// import { Button } from '@muxui/react'\n/* import { Dialog } from '@muxui/react' */\nconst a = \"import { Popover } from '@muxui/react'\";\nconst b = `import { Menu } from '@muxui/react' ${a}`;", []],
    ['other modules are ignored', "import React from 'react';\nimport { x } from '@muxui/react-native';\nimport './styles.css';", []],
    ['an unpaired JSX apostrophe is text', "import { GridList } from '@muxui/react';\nexport const x = <p>Don't</p>;", ['GridList']],
  ];
  for (const [label, text, names] of accepted) {
    const scan = scanReactImports(text);
    assert.deepEqual(scan.violations, [], label);
    assert.deepEqual(scan.imported.map(({ name }) => name), names, label);
  }
  assert.equal(scanReactImports("\n\nimport { GridList } from '@muxui/react';").imported[0].line, 3);
});

test('E-BL1-01 negative: every other @muxui/react reference fails closed with a source-linked issue', () => {
  const rejected = [
    ['namespace import', "import * as Mux from '@muxui/react';", /namespace import/u],
    ['default import', "import Mux from '@muxui/react';", /default import/u],
    ['default plus named import', "import Mux, { GridList } from '@muxui/react';", /default import/u],
    ['default specifier', "import { default as Mux } from '@muxui/react';", /default import/u],
    ['side-effect import', "import '@muxui/react';", /side-effect import/u],
    ['subpath import', "import { Markdown } from '@muxui/react/markdown';", /subpath import of '@muxui\/react\/markdown'/u],
    ['dynamic import', "const m = import('@muxui/react');", /dynamic import/u],
    ['dynamic import of another module', "const m = import('./other');", /dynamic import/u],
    ['export named from', "export { GridList } from '@muxui/react';", /export \.\.\. from/u],
    ['export all from', "export * from '@muxui/react';", /export \.\.\. from/u],
    ['require call', "const m = require('@muxui/react');", /call naming/u],
    ['import-equals', "import m = require('@muxui/react');", /unreadable import/u],
    ['string naming the package', "const name = '@muxui/react';", /string naming/u],
    ['string specifier name', "import { 'GridList' as G } from '@muxui/react';", /unsupported import specifier/u],
    ['unterminated template', 'const t = `open', /cannot be scanned/u],
    ['unterminated comment', '/* open', /cannot be scanned/u],
  ];
  for (const [label, text, message] of rejected) {
    const issues = issuesFor(`// header\n${text}\n`);
    assert.equal(issues.length, 1, `${label}: ${JSON.stringify(issues)}`);
    const [issue] = issues;
    assert.equal(issue.artifactId, patternId, label);
    assert.equal(issue.path, '$/participants', label);
    assert.equal(issue.source, 'variant.tsx', label);
    assert.match(issue.message, message, label);
    assert.match(issue.message, /^variant\.tsx:\d+ /u, label);
    assert.match(issue.message, /pattern\.participants/u, label);
  }
  // A declared participant imported through any accepted spelling is clean;
  // an undeclared one is reported by export name, even through an alias.
  assert.deepEqual(issuesFor("import { GridList as G } from '@muxui/react';"), []);
  const [aliased] = issuesFor("import { Button as B } from '@muxui/react';");
  assert.match(aliased.message, /imports Button, which pattern\.participants does not declare/u);
  // Sub-parts, hooks, and types are not component records and stay unmapped.
  assert.deepEqual(issuesFor("import { GridListItem, useDragAndDrop } from '@muxui/react';"), []);
});

test('E-BL1-01: the manifest completeness audit lists unlisted pattern records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'muxui-pattern-completeness-'));
  try {
    const record = 'catalog/patterns/poster-grid/artifact.json';
    const example = 'catalog/patterns/poster-grid/examples/react/css-grid.example.json';
    const component = 'catalog/components/button/artifact.json';
    for (const path of [component, record, example, 'catalog/patterns/poster-grid/examples/react/css-grid.tsx']) {
      await mkdir(join(root, path, '..'), { recursive: true });
      await writeFile(join(root, path), '{}');
    }
    const manifest = { records: [{ family: 'component', path: component }] };
    await assert.rejects(
      assertManifestCompleteness({ repositoryRoot: root, manifest, exclusions: {} }),
      (error) => error.message.startsWith('MUXUI_CATALOG_SOURCE_UNLISTED:')
        && error.message.includes(record)
        && error.message.includes(example)
        && !error.message.includes('css-grid.tsx'),
    );
    manifest.records.push({ family: 'pattern', path: record }, { family: 'example', path: example });
    await assertManifestCompleteness({ repositoryRoot: root, manifest, exclusions: {} });
    // `catalog/patterns` is audited only when it exists.
    await rm(join(root, 'catalog/patterns'), { recursive: true });
    await assertManifestCompleteness({
      repositoryRoot: root,
      manifest: { records: [{ family: 'component', path: component }] },
      exclusions: {},
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('E-BL1-01 negative: the bundle rejects altered variant source, group, or pattern revision', async () => {
  const { bundle } = await fixtureCatalog();
  const tamper = (mutate) => {
    const { catalogDigest: _digest, ...preimage } = structuredClone(bundle);
    mutate(preimage);
    return { ...preimage, catalogDigest: canonicalDigest(preimage) };
  };
  const artifact = (value, id) => value.artifacts.find((candidate) => candidate.id === id);
  createCatalogApi(bundle);
  for (const [label, mutate, message] of [
    ['variant source text', (value) => { artifact(value, cssId).sourceText += '\n// edited\n'; }, /variant source text does not match/u],
    ['pattern group', (value) => { artifact(value, patternId).group = 'marketing'; }, /pattern group or revision/u],
    ['pattern revision', (value) => { artifact(value, patternId).patternRevision = sha256Digest('x'); }, /pattern group or revision/u],
  ]) {
    assert.throws(() => createCatalogApi(tamper(mutate)), message, label);
  }
});

test('E-BL1-07: list, search, and get serve patterns, variants, and the derived uses views', async () => {
  const api = await fixtureApi();
  const { bundle } = await fixtureCatalog();

  const list = api.listArtifacts({ kind: 'pattern', detail: 'brief' });
  assert.deepEqual(
    list.data.items.map(({ id, category, group }) => ({ id, category, group })),
    [{ id: patternId, category: 'collections', group: 'application' }],
  );
  assert.equal(Object.hasOwn(list.data.items[0], 'contentRevision'), false);
  assert.equal(api.listArtifacts({ kind: 'pattern', platform: 'web.html' }).data.items.length, 0);

  const uses = (selector) => api.listArtifacts({ uses: selector, detail: 'brief' });
  assert.deepEqual(uses('muxui:component:grid-list').data.items.map(({ id }) => id), [patternId]);
  assert.deepEqual(uses('muxui:component:virtualizer').data.items.map(({ id }) => id), [patternId]);
  assert.deepEqual(uses('muxui:component:button').data.items, []);
  assert.deepEqual(api.listArtifacts({ kind: 'component', uses: 'muxui:component:grid-list' }).data.items, []);
  assert.deepEqual(
    api.searchArtifacts({ query: 'poster', uses: 'muxui:component:virtualizer', detail: 'brief' })
      .data.items.map(({ id }) => id),
    [patternId],
  );
  assert.deepEqual(
    api.searchArtifacts({ query: 'poster', uses: 'muxui:component:button', detail: 'brief' }).data.items,
    [],
  );
  for (const [selector, code] of [
    ['grid-list', 'MUXUI_QUERY_INVALID'],
    ['muxui:token:default-theme', 'MUXUI_QUERY_INVALID'],
    [7, 'MUXUI_QUERY_INVALID'],
    ['muxui:component:missing', 'MUXUI_ARTIFACT_NOT_FOUND'],
  ]) {
    assert.equal(api.listArtifacts({ uses: selector }).error.code, code, String(selector));
    assert.equal(api.searchArtifacts({ query: 'poster', uses: selector }).error.code, code, String(selector));
  }
  assert.equal(api.listArtifacts({ uses: 'muxui:component:grid-list', cursor: 'x' }).error.code, 'MUXUI_CURSOR_INVALID');

  // The pattern matches by category, participant role, and component id.
  for (const query of ['collections', 'scroller', 'virtualizer']) {
    assert.ok(
      api.searchArtifacts({ query, detail: 'brief', limit: 100 }).data.items.some(({ id }) => id === patternId),
      query,
    );
  }

  const compact = api.getArtifact({ id: patternId });
  assert.deepEqual(compact.data.artifact.variants, [
    { id: cssId, name: 'CSS grid' },
    { id: virtualizedId, name: 'Virtualized grid' },
  ]);
  assert.deepEqual(compact.data.artifact.participants, patternRecord.participants);
  assert.equal(compact.data.artifact.group, 'application');
  assert.deepEqual(compact.data.relations.map(({ source }) => source), [cssId, virtualizedId]);
  const pattern = bundle.artifacts.find(({ id }) => id === patternId);
  assert.equal(compact.meta.revisions.patternRevision, pattern.patternRevision);
  assert.equal(compact.meta.revisions.bindingSpec, null);

  const full = api.getArtifact({ id: patternId, detail: 'full' });
  assert.deepEqual(
    { ...full.data.artifact, group: undefined, contentRevision: undefined, patternRevision: undefined, source: undefined },
    { ...patternRecord, group: undefined, contentRevision: undefined, patternRevision: undefined, source: undefined },
  );
  assert.equal(full.data.artifact.patternRevision, pattern.patternRevision);
  assert.equal(full.data.artifact.contentRevision, pattern.contentRevision);

  // `get --section examples` returns the variants in authored order with exact source.
  const examples = api.getArtifact({ id: patternId, section: 'examples', purpose: 'generation' });
  assert.deepEqual(examples.data.value.map(({ id }) => id), [cssId, virtualizedId]);
  for (const variant of examples.data.value) {
    const artifact = bundle.artifacts.find(({ id }) => id === variant.id);
    assert.equal(variant.code, artifact.sourceText);
  }
  assert.equal(api.getArtifact({ id: patternId, platform: 'web.html' }).error.code, 'MUXUI_ARTIFACT_NOT_FOUND');

  // Variants are examples too: discoverable, platform-scoped, and linked to the pattern.
  const variant = api.getArtifact({ id: cssId });
  assert.deepEqual(variant.data.relations, [{ type: 'example-of', source: cssId, target: patternId }]);
  assert.deepEqual(variant.data.artifact.platforms, ['web.react']);
  assert.ok(api.listArtifacts({ kind: 'example', purpose: 'generation', limit: 100 }).data.items.some(({ id }) => id === cssId));
});

test('E-BL1-07: usedIn comes from the same function as --uses, and component pages list only bound examples', async () => {
  const api = await fixtureApi();
  const { bundle } = await fixtureCatalog();
  for (const component of bundle.artifacts.filter(({ kind }) => kind === 'component')) {
    const used = api.listArtifacts({ uses: component.id, detail: 'brief' }).data.items.map(({ id }) => id);
    for (const detail of ['compact', 'full']) {
      const response = api.getArtifact({ id: component.id, detail });
      assert.deepEqual(response.data.usedIn.map(({ id }) => id), used, `${component.id} ${detail}`);
    }
    assert.equal(Object.hasOwn(api.getArtifact({ id: component.id, detail: 'brief' }).data, 'usedIn'), false);
    const bound = api.getArtifact({ id: component.id, section: 'examples' }).data.value ?? [];
    assert.ok(bound.every(({ id }) => ![cssId, virtualizedId].includes(id)), component.id);
  }
  assert.deepEqual(
    api.getArtifact({ id: 'muxui:component:virtualizer' }).data.usedIn,
    [{ id: patternId, roles: [{ role: 'scroller', requirement: 'optional' }] }],
  );
  assert.deepEqual(api.getArtifact({ id: 'muxui:component:button' }).data.usedIn, []);
});

test('E-BL1-07: the real catalog enables the pattern kind with no records yet', () => {
  assert.ok(getManifest({ detail: 'brief' }).data.artifactKinds.includes('pattern'));
  assert.deepEqual(listArtifacts({ kind: 'pattern' }).data.items, []);
  assert.deepEqual(listArtifacts({ uses: 'muxui:component:button' }).data.items, []);
  assert.deepEqual(searchArtifacts({ query: 'grid', uses: 'muxui:component:grid-list' }).data.items, []);
  assert.equal(getArtifact({ id: 'muxui:component:button' }).data.usedIn.length, 0);
  assert.equal(getArtifact({ id: patternId }).error.code, 'MUXUI_ARTIFACT_NOT_FOUND');
});

test('E-BL1-08: compiles are byte-identical and listing the fixture changes only the added sources and digests', async () => {
  const first = await fixtureCatalog();
  const second = await compileFixtureCatalog();
  assert.equal(second.bytes, first.bytes);
  assert.equal(second.bundle.catalogDigest, first.bundle.catalogDigest);

  const { catalogDigest: baseDigest, sourceRevision: baseRevision, ...base } = structuredClone(baseBundle);
  const { catalogDigest, sourceRevision, ...listed } = structuredClone(first.bundle);
  assert.notEqual(catalogDigest, baseDigest);
  assert.notEqual(sourceRevision, baseRevision);
  const added = new Set([patternId, cssId, virtualizedId]);
  listed.artifacts = listed.artifacts.filter(({ id }) => !added.has(id));
  listed.relations = listed.relations.filter(({ source, target }) => !added.has(source) && !added.has(target));
  listed.searchIndex = listed.searchIndex.filter(({ id }) => !added.has(id));
  assert.equal(canonicalJson(listed), canonicalJson(base));
});
