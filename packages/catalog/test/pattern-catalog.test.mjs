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
import { CatalogSourceError } from '../src/compiler.mjs';
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
  // Authoring tools link the failure by its structured shape, not the message.
  assert.ok(error instanceof CatalogSourceError);
  assert.equal(error.code, 'MUXUI_CATALOG_SOURCE_INVALID');
  assert.equal(error.reason, 'source-newline');
  assert.equal(error.path, 'fixture/examples/react/css-grid.tsx');
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

const header = "import { GridList } from '@muxui/react';\n";
const messageOf = (issues) => issues.map(({ message }) => message.replace(/;.*$/su, ''));

test('E-BL1-01: the import scanner accepts only the canonical static named import', () => {
  const accepted = [
    ['named', "import { GridList } from '@muxui/react';", ['GridList']],
    ['alias maps by export name', "import { GridList as G, Virtualizer as V } from '@muxui/react';", ['GridList', 'Virtualizer']],
    ['multi-line with a trailing comma', "import {\n  GridList,\n  type GridListProps,\n  Virtualizer,\n} from '@muxui/react'", ['GridList', 'Virtualizer']],
    ['import type is ignored', "import type { Button } from '@muxui/react';", []],
    ['type specifier is ignored', "import { type Button, type Dialog as D, GridList } from '@muxui/react';", ['GridList']],
    ['header comments and blank lines are skipped', "// import { Button } from '@muxui/react'\n\n/* import { Dialog } from '@muxui/react' */\nimport { GridList } from '@muxui/react';", ['GridList']],
    ['react and its jsx runtime are allowed in any form', "import React, { useState } from 'react';\nimport * as Runtime from 'react/jsx-runtime';\nimport type { ReactNode } from 'react';", []],
    ['an unpaired JSX apostrophe is text', `${header}export const x = <p>Don't</p>;`, ['GridList']],
    // Unmapped export names stay unchecked: they belong to no component record.
    ['unmapped exports', "import { GridListItem, useDragAndDrop, useToast, ToastProvider } from '@muxui/react';", ['GridListItem', 'useDragAndDrop', 'useToast', 'ToastProvider']],
  ];
  for (const [label, text, names] of accepted) {
    const scan = scanReactImports(text);
    assert.deepEqual(scan.violations, [], label);
    assert.deepEqual(scan.imported.map(({ name }) => name), names, label);
  }
  assert.equal(scanReactImports("\n\nimport { GridList } from '@muxui/react';").imported[0].line, 3);
});

test('E-BL1-01: the import scanner raises no false positives after the header', () => {
  const clean = [
    ['a member import call', `${header}const m = loader.import('./x');\nconst n = loader?.import(1);`],
    ['a member require call', `${header}const m = loader.require('./x');`],
    ['the bare word import in JSX text', `${header}export const x = <p>Please import your photos, then export them.</p>;`],
    ['import opening a wrapped JSX text line', `${header}export const x = (\n  <p>\n    import your photos\n    export them\n  </p>\n);`],
    ['import.meta', `${header}const url = import.meta.url;`],
    ['an email address in JSX text', `${header}export const x = <a>you@example.com</a>;`],
    ['a // inside JSX text', `${header}export const x = <p>http://example.com</p>;`],
    ['words that only contain import, require, or export', `${header}const important = 1, required = 2, exports = 3;\nimportant(); required(); exports.x = 1;`],
    ['a local export', `${header}const a = 1;\nexport { a };\nexport default a;`],
  ];
  for (const [label, text] of clean) {
    assert.deepEqual(scanReactImports(text).violations, [], label);
  }
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
    ['require call', "const m = require('@muxui/react');", /require call/u],
    ['import-equals', "import m = require('@muxui/react');", /unreadable import/u],
    ['string naming the package', "const name = '@muxui/react';", /raw '@muxui' reference/u],
    ['string specifier name', "import { 'GridList' as G } from '@muxui/react';", /unsupported import specifier/u],
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
  // Names no component record maps are unchecked, and the diagnostic says so.
  assert.deepEqual(issuesFor("import { useToast, ToastProvider } from '@muxui/react';"), []);
  const [violation] = issuesFor("import * as Mux from '@muxui/react';");
  assert.match(violation.message, /useToast and ToastProvider, are not checked/u);
});

test('E-BL1-01 negative: every import must sit in the leading header', () => {
  for (const [label, text, line] of [
    ['after a statement', `const a = 1;\n${header}`, 2],
    ['of a non-@muxui module', `${header}const a = 1;\nimport x from 'react';`, 3],
    ['in the middle of a line', `${header}const a = 1; import x from 'react';`, 2],
    ['after a closing brace', `${header}function f() {}\nimport x from 'react';`, 3],
    ['after a block comment', `${header}const a = 1; /* note */ import x from 'react';`, 2],
    ['as a side effect', `${header}const a = 1;\nimport './styles.css';`, 3],
    ['as a type', `${header}const a = 1;\nimport type { T } from './types';`, 3],
  ]) {
    const issues = issuesFor(text);
    assert.equal(issues.length, 1, `${label}: ${JSON.stringify(issues)}`);
    assert.match(issues[0].message, /an import after the leading import header/u, label);
    assert.equal(issues[0].line, line, label);
  }
  // A header may span comments and blank lines but ends at the first other statement.
  assert.deepEqual(issuesFor(`/** doc */\n\n// note\n${header}\n/* more */\nimport React from 'react';\n\nconst a = 1;`), []);
});

test('E-BL1-01 negative: the header admits only react, react/jsx-runtime, and @muxui/react', () => {
  for (const [label, text, message] of [
    ['relative specifier', "import { a } from './a';", "an import of './a'"],
    ['parent specifier', "import { a } from '../a';", "an import of '../a'"],
    ['side-effect stylesheet', "import './styles.css';", "an import of './styles.css'"],
    ['relative type import', "import type { A } from './types';", "an import of './types'"],
    ['another package', "import { debounce } from 'lodash';", "an import of 'lodash'"],
    ['another @muxui package', "import { token } from '@muxui/tokens';", "an import of '@muxui/tokens'"],
    ['a lookalike @muxui package', "import { x } from '@muxui/react-native';", "an import of '@muxui/react-native'"],
    ['a react subpath', "import { x } from 'react/jsx-dev-runtime';", "an import of 'react/jsx-dev-runtime'"],
    ['a @muxui/react subpath', "import { x } from '@muxui/react/text-editor';", "a subpath import of '@muxui/react/text-editor'"],
  ]) {
    const issues = issuesFor(text);
    assert.equal(issues.length, 1, `${label}: ${JSON.stringify(issues)}`);
    assert.ok(messageOf(issues)[0].includes(message), `${label}: ${issues[0].message}`);
    assert.match(issues[0].message, /outside the allowed react|subpath import/u, label);
  }
});

test('E-BL1-01 negative: the rest of the source is scanned raw, so hidden code still fails', () => {
  for (const [label, text, message, line] of [
    // `//` inside JSX text would hide the import from a tokenizer.
    ['JSX text hiding an import', "const a = <p>http://x</p>; import { Button } from '@muxui/react';", /import after the leading import header/u, 1],
    ['the same hiding on a later line', `${header}const a = <p>http://x</p>; import { Button } from '@muxui/react';`, /import after the leading import header/u, 2],
    ['JSX text hiding a package name', "const a = <p>http://x</p>; const m = load('@muxui/react');", /raw '@muxui' reference/u, 1],
    ['a hidden non-@muxui import', "const a = <p>http://x</p>; import x from 'lodash';", /import after the leading import header/u, 1],
    ['@muxui in a body comment', `${header}const a = 1;\n// see @muxui/react\n`, /raw '@muxui' reference/u, 3],
    ['@muxui in a body string', `${header}const a = '@muxui/react';`, /raw '@muxui' reference/u, 2],
    ['@muxui in a template', `${header}const a = \`@muxui/react\`;`, /raw '@muxui' reference/u, 2],
    ['a hex escaped @', `${header}const a = '\\x40muxui/react';`, /escaped '@'/u, 2],
    ['a unicode escaped @', `${header}const a = '\\u0040muxui/react';`, /escaped '@'/u, 2],
    ['a braced unicode escaped @', `${header}const a = '\\u{40}muxui/react';`, /escaped '@'/u, 2],
    ['require of a relative module', `${header}const a = require('./x');`, /require call/u, 2],
    ['require with a space', `${header}const a = require ('x');`, /require call/u, 2],
    ['a hidden dynamic import', `${header}const a = <p>http://x</p>; const m = import('./x');`, /dynamic import/u, 2],
    ['line-leading export * from', `${header}export * from './x';`, /export \.\.\. from/u, 2],
    ['line-leading export * as from', `${header}export * as ns from './x';`, /export \.\.\. from/u, 2],
    ['line-leading export type from', `${header}export type { T } from './x';`, /export \.\.\. from/u, 2],
    ['export from after a statement end', `${header}const a = 1; export { a } from './x';`, /export \.\.\. from/u, 2],
  ]) {
    const issues = issuesFor(text);
    assert.equal(issues.length, 1, `${label}: ${JSON.stringify(issues)}`);
    assert.match(issues[0].message, message, label);
    assert.equal(issues[0].line, line, label);
  }
  // A multi-line re-export is one issue at its first line, not one per line.
  const multiline = issuesFor(`${header}export {\n  a,\n  b,\n} from '@muxui/react';`);
  assert.equal(multiline.length, 1);
  assert.equal(multiline[0].line, 2);
  assert.match(multiline[0].message, /export \.\.\. from/u);
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

test('E-BL1-07: patterns and variants need every required participant binding installed', async () => {
  const { bundle } = await fixtureCatalog();
  const platform = 'web.react';
  const grid = 'muxui:component:grid-list#web.react';
  const scroller = 'muxui:component:virtualizer#web.react';
  const present = (api, id, options = {}) => api.getArtifact({ id, platform, ...options }).type !== 'error';
  const patternVisibleIn = (api) => {
    const listed = api.listArtifacts({ kind: 'pattern', platform }).data.items.some(({ id }) => id === patternId);
    const searched = api.searchArtifacts({ query: 'poster', platform, detail: 'brief', limit: 100 })
      .data.items.some(({ id }) => id === patternId);
    const used = api.listArtifacts({ uses: 'muxui:component:virtualizer', platform })
      .data.items.some(({ id }) => id === patternId);
    const served = present(api, patternId);
    const examples = present(api, patternId, { section: 'examples' });
    const variants = [cssId, virtualizedId].map((id) => present(api, id));
    // Every surface agrees: the pattern and its variants appear or hide together.
    const surfaces = new Set([listed, searched, used, served, examples, ...variants]);
    assert.equal(surfaces.size, 1, JSON.stringify({ listed, searched, used, served, examples, variants }));
    return listed;
  };

  // The required `list` participant installed: optional ones never hide the pattern.
  assert.equal(patternVisibleIn(createCatalogApi(bundle, { availableBindings: [grid, scroller] })), true);
  assert.equal(patternVisibleIn(createCatalogApi(bundle, { availableBindings: [grid] })), true);
  // The tuple lacks a required participant's binding: the pattern and variants hide.
  const lacking = createCatalogApi(bundle, { availableBindings: [scroller, 'muxui:component:button#web.react'] });
  assert.equal(patternVisibleIn(lacking), false);
  const error = lacking.getArtifact({ id: patternId, section: 'examples', platform });
  assert.equal(error.error.code, 'MUXUI_ARTIFACT_NOT_FOUND');
  assert.equal(lacking.getArtifact({ id: cssId, platform }).error.code, 'MUXUI_ARTIFACT_NOT_FOUND');
  // `usedIn` and `--uses` hide it too, and the component page itself stays.
  assert.deepEqual(lacking.getArtifact({ id: 'muxui:component:virtualizer', platform }).data.usedIn, []);
  assert.equal(lacking.getArtifact({ id: 'muxui:component:virtualizer', platform }).type, 'artifact.detail');
  // Gating follows platform, like components: with no platform nothing is filtered.
  assert.equal(present(lacking, patternId, { platform: null }), true);
});

test('E-BL1-07: usedIn follows the requested platform', async () => {
  const withButton = await compileFixtureCatalog({
    minimal: true,
    edit: (files) => {
      const record = JSON.parse(files.get('artifact.json'));
      record.participants.push({ role: 'action', component: 'muxui:component:button', requirement: 'optional' });
      files.set('artifact.json', JSON.stringify(record));
    },
  });
  const api = createCatalogApi(withButton.bundle);
  const usedIn = (platform) => api.getArtifact({ id: 'muxui:component:button', platform }).data.usedIn.map(({ id }) => id);
  const uses = (platform) => api.listArtifacts({ uses: 'muxui:component:button', platform }).data.items.map(({ id }) => id);
  // Button supports web.html and web.react; the pattern is web.react only.
  assert.deepEqual(usedIn(null), [patternId]);
  assert.deepEqual(usedIn('web.react'), [patternId]);
  assert.deepEqual(usedIn('web.html'), []);
  // `list --uses` is the same view.
  assert.deepEqual(uses('web.react'), usedIn('web.react'));
  assert.deepEqual(uses('web.html'), usedIn('web.html'));
});

test('E-BL1-07: a pattern serves accessibility notes, and api is null like every non-component kind', async () => {
  const api = await fixtureApi();
  const accessibility = api.getArtifact({ id: patternId, section: 'accessibility' });
  assert.deepEqual(accessibility.data.value, { concept: patternRecord.accessibility, binding: null });
  // A section a kind does not own is null, never an error.
  assert.equal(api.getArtifact({ id: patternId, section: 'api' }).data.value, null);
  assert.equal(api.getArtifact({ id: cssId, section: 'api' }).data.value, null);
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

test('E-BL1-07: the real catalog serves the shipped poster grid and its derived uses views', () => {
  assert.ok(getManifest({ detail: 'brief' }).data.artifactKinds.includes('pattern'));
  const ids = (response) => response.data.items.map(({ id }) => id);
  assert.ok(ids(listArtifacts({ kind: 'pattern' })).includes(patternId));
  // Every participant of the shipped pattern lists it; a component outside it does not.
  for (const component of ['grid-list', 'virtualizer', 'image', 'text', 'link', 'button']) {
    const id = `muxui:component:${component}`;
    assert.ok(ids(listArtifacts({ uses: id })).includes(patternId), component);
    assert.ok(getArtifact({ id }).data.usedIn.some((use) => use.id === patternId), component);
  }
  assert.ok(!ids(listArtifacts({ uses: 'muxui:component:dialog' })).includes(patternId));
  assert.ok(ids(searchArtifacts({ query: 'grid', uses: 'muxui:component:grid-list' })).includes(patternId));
  assert.equal(getArtifact({ id: patternId }).type, 'artifact.detail');
});

test('E-BL1-08: compiles are byte-identical and listing the fixture changes only the added sources and digests', async () => {
  const first = await fixtureCatalog();
  const second = await compileFixtureCatalog();
  assert.equal(second.bytes, first.bytes);
  assert.equal(second.bundle.catalogDigest, first.bundle.catalogDigest);

  // The base is the real catalog without any pattern: the fixture replaces the shipped poster grid.
  const withoutPatterns = (await compileFixtureCatalog({ fixture: false })).bundle;
  const { catalogDigest: baseDigest, sourceRevision: baseRevision, ...base } = structuredClone(withoutPatterns);
  const { catalogDigest, sourceRevision, ...listed } = structuredClone(first.bundle);
  assert.notEqual(catalogDigest, baseDigest);
  assert.notEqual(sourceRevision, baseRevision);
  const added = new Set([patternId, cssId, virtualizedId]);
  listed.artifacts = listed.artifacts.filter(({ id }) => !added.has(id));
  listed.relations = listed.relations.filter(({ source, target }) => !added.has(source) && !added.has(target));
  listed.searchIndex = listed.searchIndex.filter(({ id }) => !added.has(id));
  assert.equal(canonicalJson(listed), canonicalJson(base));
});
