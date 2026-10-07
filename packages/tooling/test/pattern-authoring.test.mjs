import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { createCatalogApi } from '@muxui/catalog';
import { compileCatalog } from '@muxui/catalog/compiler';
import { CANONICAL_IMPORT_FORM } from '@muxui/catalog/pattern-imports';
import {
  SchemaValidationError,
  canonicalJson,
  loadFieldOwnershipRegistry,
  validateFamily,
} from '@muxui/schema';
import {
  AuthoringPolicyError,
  affectedClosure,
  diagnoseCanonicalSource,
  diagnoseCompileFailure,
  explainRevisions,
  loadRepositoryAuthoringContext,
  previewChangeIntent,
  scaffoldPattern,
  semanticDiff,
} from '../src/index.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const patternId = 'muxui:pattern:poster-grid';
const cssId = 'muxui:example:poster-grid-css-grid';
const virtualizedId = 'muxui:example:poster-grid-virtualized';
const directory = 'catalog/patterns/poster-grid';
const cssSource = `${directory}/examples/react/css-grid.tsx`;
const patternPath = `${directory}/artifact.json`;

/** The sources the scaffolded patterns need, for fast compiles. */
const MINIMAL_SOURCES = /^catalog\/(?:capabilities\/|tokens\/|components\/(?:button|grid-list|virtualizer)\/)/u;

const cssText = `import { GridList } from '@muxui/react';

export function PosterGridCssGrid() {
  return <GridList aria-label="Posters" items={[]} />;
}
`;
const virtualizedText = `import { GridList, Virtualizer, type GridListProps } from '@muxui/react';

export function PosterGridVirtualized(props: Partial<GridListProps>) {
  return (
    <Virtualizer aria-label="Posters" items={[]}>
      <GridList aria-label="Posters" items={[]} {...props} />
    </Virtualizer>
  );
}
`;

const patternDecisions = () => ({
  name: 'Poster grid',
  summary: 'A scrollable grid of poster tiles with selection.',
  lifecycle: 'experimental',
  keywords: ['grid', 'gallery'],
  platforms: ['web.react'],
  category: 'collections',
  intent: {
    useWhen: ['Browsing many image-led items'],
    avoidWhen: ['Rows need sortable columns'],
  },
  participants: [
    { role: 'list', component: 'muxui:component:grid-list', requirement: 'required' },
    { role: 'scroller', component: 'muxui:component:virtualizer', requirement: 'optional' },
  ],
  accessibility: ['Tiles expose grid semantics and a visible focus ring.'],
  unsupported: ['Drag reordering'],
  workflowValue: 'Replaces hand-assembling GridList and Virtualizer layout props.',
});

const posterGridInput = () => ({
  slug: 'poster-grid',
  decisions: patternDecisions(),
  variants: [
    {
      slug: 'css-grid',
      name: 'CSS grid',
      summary: 'GridList grid layout.',
      lifecycle: 'experimental',
      complexity: 'representative',
      prerequisites: [],
      sourceText: cssText,
    },
    {
      slug: 'virtualized',
      name: 'Virtualized grid',
      summary: 'Virtualizer over a GridList.',
      lifecycle: 'experimental',
      complexity: 'advanced',
      prerequisites: [],
      sourceText: virtualizedText,
    },
  ],
});

/** A second pattern that composes a different component. */
const calloutInput = () => ({
  slug: 'callout',
  decisions: {
    ...patternDecisions(),
    name: 'Callout',
    summary: 'A short call to action.',
    category: 'call-to-action',
    keywords: ['cta'],
    participants: [{ role: 'action', component: 'muxui:component:button', requirement: 'required' }],
  },
  variants: [{
    slug: 'basic',
    name: 'Basic callout',
    summary: 'One button.',
    lifecycle: 'experimental',
    complexity: 'minimal',
    prerequisites: [],
    sourceText: "import { Button } from '@muxui/react';\n\nexport const Callout = () => <Button>Start</Button>;\n",
  }],
});

const previews = () => [scaffoldPattern(posterGridInput()), scaffoldPattern(calloutInput())];

const exampleRecords = (list) => list.flatMap(({ examples }) => examples.map(({ record }) => record));
const exampleSources = (list) => Object.fromEntries(list.flatMap(({ examples, writeSet }) => (
  examples.map(({ record }) => [
    record.id,
    writeSet.find(({ path }) => path === record.source).bytes,
  ])
)));

/**
 * Stages the previews' write sets verbatim under their canonical paths in a
 * temporary root that symlinks the repository (except `.git` and
 * `catalog/patterns`), then compiles the minimal manifest plus the previews'
 * entries. `edit(files, entries)` may change the staged files and entries.
 * Returns the compile result, or the error, with the parsed manifest records.
 */
async function compileStaged(list, { edit = () => {} } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'muxui-pattern-authoring-'));
  try {
    for (const name of await readdir(repositoryRoot)) {
      if (name !== '.git' && name !== 'catalog') await symlink(join(repositoryRoot, name), join(root, name));
    }
    await mkdir(join(root, 'catalog'));
    for (const name of await readdir(join(repositoryRoot, 'catalog'))) {
      if (name !== 'patterns') await symlink(join(repositoryRoot, 'catalog', name), join(root, 'catalog', name));
    }
    const files = new Map(list.flatMap(({ writeSet }) => writeSet.map(({ path, bytes }) => [path, bytes])));
    const entries = list.flatMap(({ manifestEntries }) => manifestEntries);
    edit(files, entries);
    for (const [path, bytes] of files) {
      await mkdir(join(root, dirname(path)), { recursive: true });
      await writeFile(join(root, path), bytes);
    }
    const manifest = JSON.parse(await readFile(
      join(repositoryRoot, 'packages/catalog/catalog-sources.json'),
      'utf8',
    ));
    manifest.records = [
      ...manifest.records.filter(({ path }) => MINIMAL_SOURCES.test(path)),
      ...entries,
    ];
    await writeFile(join(root, 'catalog-sources.json'), JSON.stringify(manifest));
    const records = entries.map(({ family, path }) => ({ family, path, record: JSON.parse(files.get(path)) }));
    const outcome = { manifest, records, files };
    try {
      return { ...outcome, compiled: await compileCatalog({ repositoryRoot: root, sourceManifestPath: 'catalog-sources.json' }) };
    } catch (error) {
      return { ...outcome, error };
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function compileFailure(options) {
  const outcome = await compileStaged(previews(), options);
  assert.ok(outcome.error, 'the staged catalog unexpectedly compiled');
  return outcome;
}

let shared;
const fixture = () => (shared ??= (async () => {
  const list = previews();
  const outcome = await compileStaged(list);
  assert.equal(outcome.error, undefined);
  return { list, ...outcome };
})());

let realContext;
const repositoryContext = () => (realContext ??= (async () => {
  const bundle = JSON.parse(await readFile(
    resolve(repositoryRoot, 'packages/catalog/generated/catalog.json'),
    'utf8',
  ));
  return loadRepositoryAuthoringContext({
    repositoryRoot,
    expectedSourceRevision: bundle.sourceRevision,
  });
})());

/** The repository context with the staged catalog and manifest substituted. */
async function stagedContext() {
  const { compiled, manifest } = await fixture();
  return {
    ...await repositoryContext(),
    sourceRevision: compiled.bundle.sourceRevision,
    sourceManifest: manifest,
    catalogBundle: compiled.bundle,
  };
}

const revisionContext = async () => {
  const { list } = await fixture();
  return { examples: exampleRecords(list), exampleSources: exampleSources(list) };
};

function authoringFailure(run) {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof AuthoringPolicyError, String(error));
    return error;
  }
  return assert.fail('the scaffold unexpectedly succeeded');
}

test('E-BL1-02: a scaffold emits only canonical inputs under catalog/patterns and previews the manifest', () => {
  const preview = scaffoldPattern(posterGridInput());
  assert.equal(preview.mode, 'preview-only');
  assert.equal(preview.family, 'pattern');
  assert.equal(preview.recordPath, patternPath);
  assert.deepEqual(preview.writeSet.map(({ path }) => path), [
    patternPath,
    `${directory}/examples/react/css-grid.example.json`,
    `${directory}/examples/react/css-grid.tsx`,
    `${directory}/examples/react/virtualized.example.json`,
    `${directory}/examples/react/virtualized.tsx`,
  ]);
  assert.deepEqual(preview.manifestEntries, [
    { family: 'pattern', path: patternPath },
    { family: 'example', path: `${directory}/examples/react/css-grid.example.json` },
    { family: 'example', path: `${directory}/examples/react/virtualized.example.json` },
  ]);
  // Variants follow the authored order; derived fields stay out of the record.
  assert.deepEqual(preview.record.variants, [{ example: cssId }, { example: virtualizedId }]);
  assert.equal(preview.record.id, patternId);
  for (const derived of ['group', 'patternRevision']) assert.equal(Object.hasOwn(preview.record, derived), false);
  // Records are canonical JSON and sources are the caller's exact bytes; no manifest, generated, or consumer file is written.
  for (const { path, bytes } of preview.writeSet) {
    assert.ok(path.startsWith(`${directory}/`), path);
    assert.equal(path.includes('generated'), false, path);
    if (path.endsWith('.json')) assert.equal(bytes, `${canonicalJson(JSON.parse(bytes))}\n`, path);
  }
  assert.equal(preview.writeSet.find(({ path }) => path === cssSource).bytes, cssText);
  assert.equal(Object.hasOwn(preview.examples[0].record, 'binding'), false);
  assert.equal(Object.isFrozen(preview), true);
});

test('E-BL1-02: a scaffold round-trips through schema validation, compile, and get', async () => {
  const { list, compiled, files } = await fixture();
  const [preview] = list;
  // Each emitted record validates as written, and passes canonical source diagnosis.
  const context = await stagedContext();
  for (const { path, bytes } of preview.writeSet.filter(({ path: item }) => item.endsWith('.json'))) {
    const record = JSON.parse(bytes);
    validateFamily(record.kind, record);
    assert.deepEqual(
      diagnoseCanonicalSource({ context, family: record.kind, record, recordPath: path }),
      { valid: true, diagnostics: [] },
      path,
    );
  }

  const api = createCatalogApi(compiled.bundle);
  const full = api.getArtifact({ id: patternId, detail: 'full' });
  assert.equal(full.type, 'artifact.detail');
  assert.equal(full.data.artifact.source.record, patternPath);
  assert.equal(
    canonicalJson(Object.fromEntries(Object.keys(preview.record).map((key) => [key, full.data.artifact[key]]))),
    canonicalJson(preview.record),
  );
  const variants = api.getArtifact({ id: patternId, section: 'examples', purpose: 'generation' }).data.value;
  assert.deepEqual(variants.map(({ id }) => id), [cssId, virtualizedId]);
  assert.deepEqual(variants.map(({ code }) => code), [cssText, virtualizedText]);
  assert.equal(files.get(cssSource), cssText);

  // The explainer agrees with the compiler on every pattern and variant digest.
  const bundlePattern = compiled.bundle.artifacts.find(({ id }) => id === patternId);
  const explained = explainRevisions({
    family: 'pattern',
    record: preview.record,
    examples: exampleRecords(list),
    exampleSources: exampleSources(list),
  });
  assert.deepEqual(explained.axes.map(({ name }) => name), ['contentRevision', 'patternRevision']);
  assert.equal(explained.axes[0].digest, bundlePattern.contentRevision);
  assert.equal(explained.axes[1].digest, bundlePattern.patternRevision);
});

test('E-BL1-02 negative: a scaffold refuses missing decisions, unowned fields, and non-canonical sources', () => {
  const rule = (mutate, expected) => {
    const input = posterGridInput();
    mutate(input);
    const error = authoringFailure(() => scaffoldPattern(input));
    assert.equal(error.ruleId, expected, error.message);
    return error;
  };
  rule((input) => { input.slug = 'Poster Grid'; }, 'authoring.scaffold.slug');
  rule((input) => { input.decisions.extra = true; }, 'authoring.scaffold.decisions');
  // `variants` come from the variant list, not the decisions.
  rule((input) => { input.decisions.variants = []; }, 'authoring.scaffold.decisions');
  assert.equal(rule((input) => { delete input.decisions.category; }, 'authoring.scaffold.decision-required').details.field, 'category');
  assert.equal(rule((input) => { delete input.variants[1].complexity; }, 'authoring.scaffold.decision-required').details.field, 'complexity');
  rule((input) => { input.variants = []; }, 'authoring.scaffold.variants-required');
  rule((input) => { input.variants[0].extra = true; }, 'authoring.scaffold.variants');
  rule((input) => { input.variants[0].binding = { ref: 'muxui:component:button#web.react' }; }, 'authoring.scaffold.variant-binding');
  rule((input) => { input.variants[1].slug = 'css-grid'; }, 'authoring.scaffold.variant-duplicate');
  rule((input) => { input.variants[0].slug = 'CSS'; }, 'authoring.scaffold.slug');
  rule((input) => { input.variants[0].sourceText = ''; }, 'authoring.scaffold.source-required');
  rule((input) => { input.variants[0].sourceText = cssText.replaceAll('\n', '\r\n'); }, 'authoring.scaffold.source-newline');
  const imported = rule((input) => {
    input.variants[0].sourceText = `// header\nimport * as Mux from '@muxui/react';\n`;
  }, 'authoring.scaffold.source-import');
  assert.equal(imported.details.line, 2);
  assert.equal(imported.details.canonicalImportForm, CANONICAL_IMPORT_FORM);
  assert.match(imported.message, /namespace import/u);
  assert.ok(imported.message.includes(CANONICAL_IMPORT_FORM));
  // The header and allowlist rules of the compiler's scanner apply at scaffold time.
  const late = rule((input) => {
    input.variants[0].sourceText = `${cssText}\nimport { Button } from '@muxui/react';\n`;
  }, 'authoring.scaffold.source-import');
  assert.match(late.message, /an import after the leading import header/u);
  assert.equal(late.details.line, 7);
  rule((input) => {
    input.variants[0].sourceText = `import lodash from 'lodash';\n${cssText}`;
  }, 'authoring.scaffold.source-import');
  const accepted = posterGridInput();
  accepted.variants[0].sourceText = `// A leading comment.\nimport { useState } from 'react';\nimport { jsx } from 'react/jsx-runtime';\n${cssText}`;
  assert.equal(scaffoldPattern(accepted).mode, 'preview-only');
  // An invalid record is a schema failure, not a scaffold rule.
  const input = posterGridInput();
  input.decisions.category = 'carousel';
  assert.throws(() => scaffoldPattern(input), SchemaValidationError);
});

test('E-BL1-02: semantic diff separates editorial, compatible, and incompatible pattern edits', async () => {
  const { list } = await fixture();
  const [{ record }] = list;
  const context = await revisionContext();
  const extra = { ...context.examples[0], id: 'muxui:example:poster-grid-extra', source: `${directory}/examples/react/extra.tsx` };
  const withExtra = {
    examples: [...context.examples, extra],
    exampleSources: { ...context.exampleSources, [extra.id]: cssText },
  };
  const diff = (after, revisionContextValue = context) => semanticDiff({
    family: 'pattern',
    before: record,
    after,
    revisionContext: revisionContextValue,
  });
  const edit = (change) => {
    const after = structuredClone(record);
    change(after);
    return after;
  };
  const expectOne = (result, path, operation, effect, versionEffect, owner = 'pattern-contract') => {
    assert.deepEqual(result.changes.map((change) => [change.path, change.operation]), [[path, operation]]);
    assert.equal(result.effect, effect);
    assert.equal(result.versionEffect, versionEffect);
    assert.equal(result.changes[0].effect, effect);
    assert.equal(result.changes[0].owner.name, owner);
  };

  // Editorial: the record changes, the pattern revision does not.
  const editorial = diff(edit((after) => { after.summary = `${after.summary} Clarified.`; }));
  expectOne(editorial, '$/summary', 'replace', 'editorial', 'patch');
  assert.deepEqual(editorial.changes[0].revisionAxes, ['content']);
  assert.equal(editorial.revisions.contentRevision.changed, true);
  assert.equal(editorial.revisions.patternRevision.changed, false);

  // Compatible: an added optional participant or variant.
  const participant = diff(edit((after) => {
    after.participants.push({ role: 'toolbar', component: 'muxui:component:button', requirement: 'optional' });
  }));
  expectOne(participant, '$/participants/2', 'add', 'compatible', 'minor');
  assert.deepEqual(participant.changes[0].revisionAxes, ['content', 'pattern-spec']);
  assert.equal(participant.revisions.patternRevision.changed, true);
  const variant = diff(edit((after) => { after.variants.push({ example: extra.id }); }), withExtra);
  expectOne(variant, '$/variants/2', 'add', 'compatible', 'minor');
  assert.equal(variant.revisions.patternRevision.changed, true);

  // Incompatible: a removed participant or variant, or a new unsupported case.
  const removed = diff(edit((after) => { after.participants.pop(); }));
  expectOne(removed, '$/participants/1', 'remove', 'incompatible', 'major');
  assert.equal(removed.revisions.patternRevision.changed, true);
  expectOne(
    diff(edit((after) => { after.variants.pop(); })),
    '$/variants/1',
    'remove',
    'incompatible',
    'major',
  );
  const unsupported = diff(edit((after) => { after.unsupported.push('Inline editing'); }));
  expectOne(unsupported, '$/unsupported/1', 'add', 'incompatible', 'major');
  assert.equal(unsupported.revisions.patternRevision.changed, true);

  // A source-byte edit leaves the record alone and still moves the pattern revision.
  const edited = semanticDiff({
    family: 'pattern',
    before: record,
    after: record,
    revisionContext: {
      ...context,
      after: { exampleSources: { ...context.exampleSources, [cssId]: `${cssText}// edited\n` } },
    },
  });
  assert.deepEqual(edited.changes, []);
  assert.equal(edited.revisions.contentRevision.changed, false);
  assert.equal(edited.revisions.patternRevision.changed, true);

  // Variant examples diff at field level through the example family.
  const [css] = context.examples;
  const renamed = semanticDiff({
    family: 'example',
    before: css,
    after: { ...css, name: 'Renamed' },
    revisionContext: context,
  });
  expectOne(renamed, '$/name', 'replace', 'editorial', 'patch', 'example-contract');
  assert.equal(renamed.revisions.contentRevision.changed, true);
  const bindingless = semanticDiff({
    family: 'example',
    before: css,
    after: { ...css, complexity: 'advanced' },
    revisionContext: context,
  });
  expectOne(bindingless, '$/complexity', 'replace', 'incompatible', 'major', 'example-contract');

  // The revision context must carry every variant record and source.
  for (const [incomplete, ruleId] of [
    [{ ...context, examples: context.examples.slice(1) }, 'authoring.revision.variant-missing'],
    [{ ...context, exampleSources: {} }, 'authoring.revision.variant-source-missing'],
  ]) {
    assert.throws(
      () => diff(record, incomplete),
      (error) => error instanceof AuthoringPolicyError && error.ruleId === ruleId,
    );
  }
  assert.throws(
    () => semanticDiff({ family: 'example', before: css, after: css }),
    (error) => error instanceof AuthoringPolicyError && error.ruleId === 'authoring.revision.source-missing',
  );
});

test('E-BL1-02: change intent previews a pattern edit with its variants and checks', async () => {
  const { list } = await fixture();
  const [{ record, recordPath }] = list;
  const after = structuredClone(record);
  after.participants.push({ role: 'toolbar', component: 'muxui:component:button', requirement: 'optional' });
  const intent = previewChangeIntent({
    context: await stagedContext(),
    family: 'pattern',
    recordPath,
    before: record,
    after,
    objective: 'Offer a toolbar participant.',
    revisionContext: await revisionContext(),
  });
  assert.equal(intent.versionEffect, 'minor');
  assert.equal(intent.writeSet[0].path, patternPath);
  assert.equal(intent.semantic.revisions.patternRevision.changed, true);
  for (const id of [patternId, cssId, virtualizedId]) assert.ok(intent.invalidated.artifacts.includes(id), id);
  assert.ok(intent.invalidated.checks.includes('pnpm --filter @muxui/catalog check'));
});

test('E-BL1-02: a variant source edit moves only patternRevision and that example\'s contentRevision', async () => {
  const { list } = await fixture();
  const [{ record, examples }] = list;
  const sources = exampleSources(list);
  const edited = { ...sources, [cssId]: `${cssText}// edited\n` };
  const digests = (bytes) => {
    const axis = (explanation, name) => explanation.axes.find((candidate) => candidate.name === name);
    const pattern = explainRevisions({
      family: 'pattern',
      record,
      examples: exampleRecords(list),
      exampleSources: bytes,
    });
    return {
      patternContent: axis(pattern, 'contentRevision').digest,
      patternRevision: axis(pattern, 'patternRevision'),
      examples: examples.map((example) => axis(explainRevisions({
        family: 'example',
        record: example.record,
        sourceBytes: bytes[example.record.id],
      }), 'contentRevision').digest),
    };
  };
  const before = digests(sources);
  const after = digests(edited);
  assert.equal(after.patternContent, before.patternContent);
  assert.notEqual(after.patternRevision.digest, before.patternRevision.digest);
  assert.notEqual(after.examples[0], before.examples[0]);
  assert.equal(after.examples[1], before.examples[1]);
  // The changed normalized input is exactly the edited variant's revision.
  const rows = (axis) => new Map(axis.normalizedInputs.map(({ path, value }) => [path, value]));
  const [left, right] = [rows(before.patternRevision), rows(after.patternRevision)];
  assert.deepEqual(
    [...right.keys()].filter((path) => JSON.stringify(left.get(path)) !== JSON.stringify(right.get(path))),
    ['$/variants/0/revision'],
  );
  assert.equal(right.get('$/variants/0/id'), cssId);

  // The compiler agrees: no component, token, or other revision moves.
  const base = (await fixture()).compiled.bundle;
  const { compiled } = await compileStaged(list, {
    edit: (files) => files.set(cssSource, edited[cssId]),
  });
  const moved = {};
  for (const artifact of base.artifacts) {
    const other = compiled.bundle.artifacts.find(({ id }) => id === artifact.id);
    const fields = ['contentRevision', 'bindingContentRevisions', 'bindingSpecRevisions', 'patternRevision']
      .filter((field) => JSON.stringify(artifact[field]) !== JSON.stringify(other[field]));
    if (fields.length > 0) moved[artifact.id] = fields;
  }
  assert.deepEqual(moved, { [patternId]: ['patternRevision'], [cssId]: ['contentRevision'] });
});

test('E-BL1-02: affected closure reaches a pattern from a variant source, its schema, and its components', async () => {
  const context = await stagedContext();
  const closure = (sourcePaths) => affectedClosure({ context, sourcePaths });
  const isRecordPath = (value) => value.startsWith('catalog/patterns/');

  // From a variant .tsx to its pattern and sibling variants, but not up to its components.
  const fromSource = closure([cssSource]);
  for (const id of [cssId, patternId, virtualizedId]) assert.ok(fromSource.artifacts.includes(id), id);
  assert.equal(fromSource.artifacts.includes('muxui:component:grid-list'), false);
  assert.ok(fromSource.canonicalSources.includes(patternPath));
  assert.ok(fromSource.canonicalSources.includes(`${directory}/examples/react/virtualized.tsx`));
  assert.ok(fromSource.packages.some(({ name }) => name === '@muxui/catalog'));
  assert.ok(fromSource.projections.includes('packages/catalog/generated/catalog.json'));
  assert.deepEqual(fromSource.participantLinks.map(({ pattern }) => pattern), [patternId, patternId]);

  // From a schema to every pattern, with the declared type projection.
  const fromSchema = closure(['packages/schema/schemas/pattern.schema.json']);
  for (const id of ['muxui:pattern:poster-grid', 'muxui:pattern:callout']) assert.ok(fromSchema.artifacts.includes(id), id);
  assert.ok(fromSchema.canonicalSources.filter(isRecordPath).includes('catalog/patterns/callout/artifact.json'));
  assert.ok(fromSchema.projections.includes('packages/schema/generated/types.d.ts'));
  assert.ok(fromSchema.requiredChecks.includes('pnpm --filter @muxui/schema check'));
  const fromExampleSchema = closure(['packages/schema/schemas/example.schema.json']);
  for (const id of [cssId, patternId]) assert.ok(fromExampleSchema.artifacts.includes(id), id);

  // From a component to the patterns that use it, through the derived participant link.
  const fromComponent = closure(['catalog/components/virtualizer/artifact.json']);
  assert.ok(fromComponent.artifacts.includes(patternId));
  assert.ok(fromComponent.artifacts.includes(virtualizedId));
  assert.ok(fromComponent.canonicalSources.includes(patternPath));
  assert.deepEqual(
    fromComponent.participantLinks.filter(({ pattern }) => pattern === patternId),
    [
      { pattern: patternId, role: 'list', component: 'muxui:component:grid-list' },
      { pattern: patternId, role: 'scroller', component: 'muxui:component:virtualizer' },
    ],
  );
  assert.throws(
    () => closure([`${directory}/examples/react/undeclared.tsx`]),
    (error) => error.ruleId === 'authoring.closure.source-undeclared',
  );
});

test('E-BL1-02: an orphan example is diagnosed at its owner, now resolvable', async () => {
  const { error, records } = await compileFailure({
    edit: (files, entries) => {
      const path = `${directory}/examples/react/orphan.example.json`;
      files.set(path, files.get(`${directory}/examples/react/css-grid.example.json`)
        .replace('poster-grid-css-grid', 'poster-grid-orphan')
        .replace('css-grid.tsx', 'orphan.tsx'));
      files.set(`${directory}/examples/react/orphan.tsx`, cssText);
      entries.push({ family: 'example', path });
    },
  });
  const { valid, diagnostics: [diagnostic] } = diagnoseCompileFailure({ error, records });
  assert.equal(valid, false);
  assert.equal(diagnostic.ruleId, 'authoring.compile.graph-invalid');
  assert.equal(diagnostic.code, 'MUXUI_RELATION_INVALID');
  assert.equal(diagnostic.details.artifactId, 'muxui:example:poster-grid-orphan');
  assert.deepEqual(diagnostic.details.source, {
    record: `${directory}/examples/react/orphan.example.json`,
    path: '$/binding',
  });
  assert.deepEqual(diagnostic.details.owner, {
    name: 'example-contract',
    schema: 'example.schema.json',
    schemaPointer: '#/properties/binding',
  });
  assert.match(diagnostic.message, /list it in one pattern's variants/u);
});

test('E-BL1-02: an undeclared import is diagnosed with its file, line, and the canonical form', async () => {
  const { error, records } = await compileFailure({
    edit: (files) => files.set(cssSource, `import { Button, GridList } from '@muxui/react';\n${cssText}`),
  });
  const { diagnostics: [diagnostic] } = diagnoseCompileFailure({ error, records });
  assert.equal(diagnostic.ruleId, 'authoring.compile.import-invalid');
  assert.equal(diagnostic.details.artifactId, patternId);
  assert.deepEqual(diagnostic.details.source, {
    record: patternPath,
    path: '$/participants',
    file: cssSource,
    line: 1,
  });
  assert.equal(diagnostic.details.owner.name, 'pattern-contract');
  assert.equal(diagnostic.details.owner.schemaPointer, '#/properties/participants');
  assert.match(diagnostic.message, /imports Button, which pattern\.participants does not declare/u);
  assert.ok(diagnostic.message.includes(CANONICAL_IMPORT_FORM));
  assert.equal(diagnostic.details.canonicalImportForm, CANONICAL_IMPORT_FORM);

  // A late import carries the same link and the same canonical text.
  const lateImport = await compileFailure({
    edit: (files) => files.set(cssSource, `${cssText}\nimport { Button } from '@muxui/react';\n`),
  });
  const { diagnostics: [late] } = diagnoseCompileFailure(lateImport);
  assert.equal(late.ruleId, 'authoring.compile.import-invalid');
  assert.equal(late.details.source.line, 7);
  assert.match(late.message, /an import after the leading import header/u);
  assert.ok(late.message.includes(CANONICAL_IMPORT_FORM));

  // A non-canonical form carries the same link and the same canonical text.
  const namespace = await compileFailure({
    edit: (files) => files.set(cssSource, `// header\nimport * as Mux from '@muxui/react';\n`),
  });
  const { diagnostics: [shape] } = diagnoseCompileFailure(namespace);
  assert.equal(shape.details.source.line, 2);
  assert.match(shape.message, /namespace import/u);
  assert.ok(shape.message.includes(CANONICAL_IMPORT_FORM));
});

test('E-BL1-02: an unknown participant is diagnosed at the participant component', async () => {
  const { error, records } = await compileFailure({
    edit: (files) => files.set(patternPath, files.get(patternPath).replace(
      'muxui:component:virtualizer',
      'muxui:component:carousel',
    )),
  });
  const { diagnostics: [diagnostic] } = diagnoseCompileFailure({ error, records });
  assert.equal(diagnostic.ruleId, 'authoring.compile.graph-invalid');
  assert.equal(diagnostic.details.artifactId, patternId);
  assert.deepEqual(diagnostic.details.source, { record: patternPath, path: '$/participants/1/component' });
  assert.deepEqual(diagnostic.details.owner, {
    name: 'pattern-contract',
    schema: 'pattern.schema.json',
    schemaPointer: '#/properties/participants/items/properties/component',
  });
  assert.match(diagnostic.message, /muxui:component:carousel does not exist/u);
});

test('E-BL1-02: a duplicate variant is diagnosed through the manifest entry the compiler stopped at', async () => {
  const { error, records } = await compileFailure({
    edit: (files) => {
      const record = JSON.parse(files.get(patternPath));
      record.variants.push(record.variants[0]);
      files.set(patternPath, JSON.stringify(record));
    },
  });
  // The compiler's per-file schema error names neither a file nor an artifact.
  assert.equal(error.issues[0].artifactId, undefined);
  const { diagnostics: [diagnostic] } = diagnoseCompileFailure({ error, records });
  assert.equal(diagnostic.ruleId, 'authoring.compile.schema-invalid');
  assert.equal(diagnostic.code, 'MUXUI_SCHEMA_INVALID');
  assert.equal(diagnostic.details.artifactId, patternId);
  assert.deepEqual(diagnostic.details.source, { record: patternPath, path: '$/variants/2/example' });
  assert.equal(diagnostic.details.owner.name, 'pattern-contract');
  assert.equal(diagnostic.details.owner.schemaPointer, '#/properties/variants/items/properties/example');
  assert.match(diagnostic.message, /is listed more than once/u);

  // A failure no record can explain stays unlinked instead of guessing.
  const unattributed = diagnoseCompileFailure({ error, records: [] }).diagnostics[0];
  assert.equal(unattributed.details.source.record, null);
  assert.equal(unattributed.details.owner, null);
  assert.throws(() => diagnoseCompileFailure({ error: new Error('plain'), records }), /plain/u);
});

test('E-BL1-02: pattern records diagnose at their field owners through canonical source diagnosis', async () => {
  const { list } = await fixture();
  const context = await stagedContext();
  const [{ record, recordPath, examples }] = list;
  const invalid = structuredClone(record);
  invalid.category = 'carousel';
  const [category] = diagnoseCanonicalSource({
    context,
    family: 'pattern',
    record: invalid,
    recordPath,
  }).diagnostics;
  assert.equal(category.details.source.path, '$/category');
  assert.equal(category.details.owner.name, 'pattern-contract');
  assert.equal(category.details.owner.schemaPointer, '#/properties/category');

  const badExample = { ...examples[0].record, complexity: 'huge' };
  const [complexity] = diagnoseCanonicalSource({
    context,
    family: 'example',
    record: badExample,
    recordPath: examples[0].recordPath,
  }).diagnostics;
  assert.deepEqual(complexity.details.owner, {
    name: 'example-contract',
    schema: 'example.schema.json',
    schemaPointer: '#/properties/complexity',
  });
  assert.equal(diagnoseCanonicalSource({
    context,
    family: 'pattern',
    record,
    recordPath: `${directory}/inferred.json`,
  }).diagnostics[0].ruleId, 'authoring.source.declared-owner');
});

test('E-BL1-02: an authored derived field is diagnosed at its reserved owner, not the family contract', async () => {
  const { list } = await fixture();
  const context = await stagedContext();
  const [{ record, recordPath, examples }] = list;
  const ownerOf = (diagnostics, path) => diagnostics.find(({ details }) => details.source.path === path).details.owner;

  // Canonical source diagnosis of a pattern and of a variant example.
  const { diagnostics } = diagnoseCanonicalSource({
    context,
    family: 'pattern',
    record: { ...record, group: 'application', patternRevision: 'sha256:0' },
    recordPath,
  });
  assert.equal(ownerOf(diagnostics, '$/group').name, 'pattern-category-groups');
  assert.equal(ownerOf(diagnostics, '$/patternRevision').name, 'pattern-revision-compiler');
  assert.equal(ownerOf(diagnostics, '$/patternRevision').schema, 'field-ownership.json');
  assert.ok(diagnostics.some(({ message }) => /derived or proved and cannot be authored/u.test(message)));
  const example = diagnoseCanonicalSource({
    context,
    family: 'example',
    record: { ...examples[0].record, contentRevision: 'sha256:0' },
    recordPath: examples[0].recordPath,
  }).diagnostics;
  assert.equal(ownerOf(example, '$/contentRevision').name, 'artifact-revision-compiler');

  // The compiler stops on the same field; the mapped diagnostic names the same owner and the record.
  const { error, records } = await compileFailure({
    edit: (files) => files.set(patternPath, JSON.stringify({ ...record, patternRevision: 'sha256:0' })),
  });
  const [compiled] = diagnoseCompileFailure({ error, records }).diagnostics;
  assert.equal(compiled.details.source.record, patternPath);
  assert.equal(compiled.details.source.path, '$/patternRevision');
  assert.equal(compiled.details.owner.name, 'pattern-revision-compiler');
});

test('E-BL1-02: every pattern and example path reports its own revision members, never the generic fallback', async () => {
  const { list } = await fixture();
  const [{ record, examples }] = list;
  const context = await revisionContext();
  const [css] = examples;
  const cases = [
    {
      family: 'pattern',
      record,
      after: { ...record, unsupported: [...record.unsupported, 'Inline editing'] },
      explain: { examples: context.examples, exampleSources: context.exampleSources },
      axes: ['contentRevision', 'patternRevision'],
    },
    {
      family: 'example',
      record: css.record,
      after: { ...css.record, complexity: 'advanced' },
      explain: { sourceBytes: context.exampleSources[css.record.id] },
      axes: ['contentRevision'],
    },
  ];
  for (const { family, record: before, after, explain, axes } of cases) {
    const diff = semanticDiff({ family, before, after, revisionContext: context });
    assert.deepEqual(Object.keys(diff.revisions), axes, `${family} diff`);
    assert.ok(Object.values(diff.revisions).every(({ changed }) => changed), `${family} diff changed`);
    const explained = explainRevisions({ family, record: before, ...explain });
    assert.deepEqual(explained.axes.map(({ name }) => name), axes, `${family} explain`);
    const intent = previewChangeIntent({
      context: await stagedContext(),
      family,
      recordPath: family === 'pattern' ? patternPath : css.recordPath,
      before,
      after,
      objective: 'Exercise every path.',
      revisionContext: context,
    });
    assert.deepEqual(Object.keys(intent.semantic.revisions), axes, `${family} intent`);
  }
});

test('E-BL1-02: an injected stable pattern field must couple scaffold, diff, diagnostics, and closure', async () => {
  const context = await stagedContext();
  const { list } = await fixture();
  const patternSchema = JSON.parse(await readFile(
    resolve(repositoryRoot, 'packages/schema/schemas/pattern.schema.json'),
    'utf8',
  ));
  const ownership = structuredClone(loadFieldOwnershipRegistry());
  patternSchema.required.push('newStableField');
  patternSchema.properties.newStableField = { type: 'string', minLength: 1 };
  const authoring = { schemas: { 'pattern.schema.json': patternSchema }, ownership };
  const input = { ...posterGridInput(), authoring };
  input.decisions.newStableField = 'baseline';

  // Without authoring metadata the field cannot be scaffolded at all.
  assert.throws(
    () => scaffoldPattern(input),
    (error) => error instanceof SchemaValidationError
      && /missing x-muxui-authoring metadata/u.test(error.message),
  );

  patternSchema.properties.newStableField['x-muxui-authoring'] = {
    effect: 'incompatible',
    revisionAxes: ['content'],
  };
  ownership.fields.push({
    class: 'authored',
    name: 'newStableField',
    owner: 'pattern-contract',
    schema: 'pattern.schema.json',
    schemaPointer: '#/properties/newStableField',
  });
  const readiness = { scaffold: false, diff: false, diagnostics: false, closure: false };

  const preview = scaffoldPattern(input);
  readiness.scaffold = preview.record.newStableField === 'baseline';
  assert.equal(Object.values(readiness).every(Boolean), false);

  const after = { ...preview.record, newStableField: 'changed' };
  const diff = semanticDiff({
    family: 'pattern',
    before: preview.record,
    after,
    revisionContext: await revisionContext(),
    authoring,
  });
  readiness.diff = diff.changes.some(({ path, owner }) => (
    path === '$/newStableField' && owner.name === 'pattern-contract'
  ));
  assert.equal(Object.values(readiness).every(Boolean), false);

  const diagnosis = diagnoseCanonicalSource({
    context,
    family: 'pattern',
    record: { ...preview.record, newStableField: '' },
    recordPath: list[0].recordPath,
    authoring,
  });
  readiness.diagnostics = diagnosis.diagnostics.some(({ details }) => (
    details.source.path === '$/newStableField' && details.owner.name === 'pattern-contract'
  ));
  assert.equal(Object.values(readiness).every(Boolean), false);

  const closure = affectedClosure({
    context,
    sourcePaths: ['packages/schema/schemas/pattern.schema.json'],
    authoring,
  });
  readiness.closure = closure.artifacts.includes(patternId)
    && closure.canonicalSources.includes(patternPath)
    && closure.projections.includes('packages/catalog/generated/catalog.json');
  assert.equal(Object.values(readiness).every(Boolean), true);
});
