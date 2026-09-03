import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { createCatalogApi } from '@muxui/catalog';
import { compileCatalog } from '@muxui/catalog/compiler';
import { canonicalJson } from '@muxui/schema';
import {
  AuthoringPolicyError,
  affectedClosure,
  diagnoseCanonicalSource,
  explainRevisions,
  loadRepositoryAuthoringContext,
  previewAutofix,
  previewChangeIntent,
  scaffoldComponent,
  semanticDiff,
} from '../src/index.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');

async function corpus() {
  return JSON.parse(await readFile(
    resolve(repositoryRoot, 'tests/fixtures/g0.5/corpus.json'),
    'utf8',
  ));
}

async function setup() {
  const compiled = await compileCatalog({ repositoryRoot });
  const context = await loadRepositoryAuthoringContext({
    repositoryRoot,
    expectedSourceRevision: compiled.bundle.sourceRevision,
  });
  const component = compiled.bundle.artifacts.find(
    ({ id }) => id === 'muxui:component:button',
  );
  const examples = compiled.bundle.artifacts
    .filter(({ kind }) => kind === 'example')
    .map(({ record }) => record);
  const tokenSources = compiled.bundle.artifacts
    .filter(({ kind }) => kind === 'token')
    .map(({ record }) => record);
  const exampleSources = {};
  for (const artifact of compiled.bundle.artifacts.filter(({ kind }) => kind === 'example')) {
    exampleSources[artifact.id] = await readFile(
      resolve(repositoryRoot, artifact.source.content),
      'utf8',
    );
  }
  return {
    compiled,
    context,
    component,
    revisionContext: {
      examples,
      tokenSources,
      exampleSources,
      tokenRequirementSets: component.tokenRequirementSets,
      platformSafetyRequirementSets: component.platformSafetyRequirementSets,
    },
  };
}

async function temporaryCatalogRepository() {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'muxui-g0-5-'));
  await Promise.all([
    mkdir(resolve(temporaryRoot, 'packages/tooling'), { recursive: true }),
    mkdir(resolve(temporaryRoot, 'packages/tokens'), { recursive: true }),
    mkdir(resolve(temporaryRoot, 'decisions'), { recursive: true }),
    mkdir(resolve(temporaryRoot, 'tooling/audits/repository-policy'), { recursive: true }),
    mkdir(resolve(temporaryRoot, 'packages/schema/schemas'), { recursive: true }),
    mkdir(resolve(temporaryRoot, 'strategy'), { recursive: true }),
  ]);
  await Promise.all([
    cp(resolve(repositoryRoot, 'catalog'), resolve(temporaryRoot, 'catalog'), { recursive: true }),
    cp(
      resolve(repositoryRoot, 'decisions/0003-tale-token-classification-annex.json'),
      resolve(temporaryRoot, 'decisions/0003-tale-token-classification-annex.json'),
    ),
    cp(
      resolve(repositoryRoot, 'packages/catalog'),
      resolve(temporaryRoot, 'packages/catalog'),
      { recursive: true },
    ),
    cp(
      resolve(repositoryRoot, 'packages/tooling/command-registry.json'),
      resolve(temporaryRoot, 'packages/tooling/command-registry.json'),
      { recursive: true },
    ),
    cp(
      resolve(repositoryRoot, 'packages/tokens/generated'),
      resolve(temporaryRoot, 'packages/tokens/generated'),
      { recursive: true },
    ),
    cp(
      resolve(repositoryRoot, 'tooling/audits/repository-policy/repository-policy.json'),
      resolve(temporaryRoot, 'tooling/audits/repository-policy/repository-policy.json'),
      { recursive: true },
    ),
    cp(
      resolve(repositoryRoot, 'packages/schema/schemas/type-projection.json'),
      resolve(temporaryRoot, 'packages/schema/schemas/type-projection.json'),
      { recursive: true },
    ),
    cp(
      resolve(repositoryRoot, 'strategy/platform-safety-contract.json'),
      resolve(temporaryRoot, 'strategy/platform-safety-contract.json'),
    ),
  ]);
  return temporaryRoot;
}

function applyCase(record, change) {
  const result = structuredClone(record);
  const segments = change.path.slice(2).split('/').map((segment) => (
    segment.replaceAll('~1', '/').replaceAll('~0', '~')
  ));
  const final = segments.pop();
  const parent = segments.reduce((value, segment) => value[segment], result);
  if (change.operation === 'add' && Array.isArray(parent)) {
    parent.splice(Number(final), 0, change.value);
  } else {
    parent[final] = change.value;
  }
  return result;
}

test('E-G0.5-01: scaffold, validation, compilation, retrieval, diagnosis, and repair stay canonical', async () => {
  const { context, component } = await setup();
  const sourcePath = component.source.record;
  const sourceBefore = await readFile(resolve(repositoryRoot, sourcePath), 'utf8');
  const { schemaVersion: _schemaVersion, id: _id, kind: _kind, ...decisions } =
    component.record;
  const preview = scaffoldComponent({
    slug: 'button',
    recordPath: sourcePath,
    decisions,
  });
  assert.equal(preview.mode, 'preview-only');
  assert.equal(preview.writeSet[0].path, sourcePath);
  assert.equal(canonicalJson(preview.record), canonicalJson(component.record));
  assert.equal(diagnoseCanonicalSource({
    context,
    family: 'component',
    record: preview.record,
    recordPath: sourcePath,
  }).valid, true);

  const temporaryRoot = await temporaryCatalogRepository();
  try {
    await writeFile(resolve(temporaryRoot, sourcePath), preview.writeSet[0].bytes);
    const compiledFromScaffold = await compileCatalog({ repositoryRoot: temporaryRoot });
    const retrieved = createCatalogApi(compiledFromScaffold.bundle).getArtifact({
      id: preview.record.id,
      detail: 'full',
    });
    assert.equal(retrieved.type, 'artifact.detail');
    assert.equal(retrieved.data.artifact.source.record, sourcePath);
    assert.equal(canonicalJson(Object.fromEntries(
      Object.keys(preview.record).map((key) => [key, retrieved.data.artifact[key]]),
    )), canonicalJson(preview.record));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  const broken = structuredClone(preview.record);
  delete broken.summary;
  const diagnosed = diagnoseCanonicalSource({
    context,
    family: 'component',
    record: broken,
    recordPath: sourcePath,
  });
  assert.equal(diagnosed.valid, false);
  assert.equal(diagnosed.diagnostics[0].ruleId, 'authoring.source.schema-invalid');
  assert.equal(diagnosed.diagnostics[0].details.source.record, sourcePath);
  assert.equal(diagnosed.diagnostics[0].details.source.path, '$/summary');
  assert.equal(diagnosed.diagnostics[0].details.owner.name, 'component-contract');
  assert.equal(
    diagnosed.diagnostics[0].details.owner.schemaPointer,
    '#/properties/summary',
  );

  const missingBindingApi = structuredClone(preview.record);
  delete missingBindingApi.bindings['web.react'].api;
  const bindingDiagnosis = diagnoseCanonicalSource({
    context,
    family: 'component',
    record: missingBindingApi,
    recordPath: sourcePath,
  });
  assert.equal(bindingDiagnosis.diagnostics[0].details.source.path, '$/bindings/web.react/api');
  assert.deepEqual(bindingDiagnosis.diagnostics[0].details.owner, {
    name: 'binding-contract',
    schema: 'binding.schema.json',
    schemaPointer: '#/properties/api',
  });

  const missingRuntimeReason = structuredClone(preview.record);
  delete missingRuntimeReason.bindings['native.react-native']
    .runtimeProfiles['native.react-native-web'].reason;
  const runtimeDiagnosis = diagnoseCanonicalSource({
    context,
    family: 'component',
    record: missingRuntimeReason,
    recordPath: sourcePath,
  });
  assert.equal(
    runtimeDiagnosis.diagnostics[0].details.source.path,
    '$/bindings/native.react-native/runtimeProfiles/native.react-native-web/reason',
  );
  assert.deepEqual(runtimeDiagnosis.diagnostics[0].details.owner, {
    name: 'binding-contract',
    schema: 'binding.schema.json',
    schemaPointer: '#/$defs/runtimeProfile/properties/reason',
  });
  assert.equal(diagnoseCanonicalSource({
    context,
    family: 'component',
    record: preview.record,
    recordPath: sourcePath,
  }).valid, true);
  assert.equal(await readFile(resolve(repositoryRoot, sourcePath), 'utf8'), sourceBefore);
  assert.equal(preview.writeSet.some(({ path }) => path.includes('/generated/')), false);
});

test('E-G0.5-01 negative: diagnostics require an exact manifest source and source revision', async () => {
  const { compiled, context, component } = await setup();
  await assert.rejects(
    loadRepositoryAuthoringContext({
      repositoryRoot,
      expectedSourceRevision: `sha256:${'0'.repeat(64)}`,
    }),
    (error) => {
      assert.ok(error instanceof AuthoringPolicyError);
      assert.equal(error.ruleId, 'authoring.source.revision-stale');
      return true;
    },
  );
  const undeclared = diagnoseCanonicalSource({
    context,
    family: 'component',
    record: component.record,
    recordPath: 'catalog/components/button/inferred.json',
  });
  assert.equal(undeclared.valid, false);
  assert.equal(undeclared.diagnostics[0].ruleId, 'authoring.source.declared-owner');
  assert.equal(context.sourceRevision, compiled.bundle.sourceRevision);

  const temporaryRoot = await temporaryCatalogRepository();
  try {
    const changed = structuredClone(component.record);
    changed.summary = `${changed.summary} Drift`;
    await writeFile(resolve(temporaryRoot, component.source.record), `${canonicalJson(changed)}\n`);
    await assert.rejects(
      loadRepositoryAuthoringContext({
        repositoryRoot: temporaryRoot,
        expectedSourceRevision: compiled.bundle.sourceRevision,
      }),
      (error) => {
        assert.ok(error instanceof AuthoringPolicyError);
        assert.equal(error.ruleId, 'authoring.source.bundle-drift');
        return true;
      },
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('E-G0.5-02: semantic golden corpus reports owning fields and exact revision effects', async () => {
  const value = await corpus();
  const { component, revisionContext } = await setup();
  for (const change of value.semanticCases) {
    const after = applyCase(component.record, change);
    const result = semanticDiff({
      before: component.record,
      after,
      revisionContext,
    });
    assert.equal(result.changes.length, 1, change.id);
    assert.equal(result.changes[0].path, change.path, change.id);
    assert.equal(result.changes[0].effect, change.effect, change.id);
    assert.equal(result.versionEffect, change.versionEffect, change.id);
    assert.equal(result.revisions.contentRevision.changed, true, change.id);
    assert.equal(
      result.revisions.bindings['web.react'].bindingSpecRevision.changed,
      change.bindingSpecChanged,
      change.id,
    );
    assert.match(result.changes[0].owner.schemaPointer, /^#\//u, change.id);
  }
});

test('E-G0.5-02: sequence diffs preserve one add or remove at every array position', async () => {
  const { component, revisionContext } = await setup();
  for (let index = 0; index <= component.record.states.length; index += 1) {
    const after = structuredClone(component.record);
    after.states.splice(index, 0, `inserted-${index}`);
    const result = semanticDiff({ before: component.record, after, revisionContext });
    assert.deepEqual(
      result.changes.map(({ path, operation }) => ({ path, operation })),
      [{ path: `$/states/${index}`, operation: 'add' }],
    );
  }
  for (let index = 0; index < component.record.states.length; index += 1) {
    const after = structuredClone(component.record);
    after.states.splice(index, 1);
    const result = semanticDiff({ before: component.record, after, revisionContext });
    assert.deepEqual(
      result.changes.map(({ path, operation }) => ({ path, operation })),
      [{ path: `$/states/${index}`, operation: 'remove' }],
    );
  }
});

test('E-G0.5-02: revision explainer lists the normalized inputs behind each digest', async () => {
  const { component, revisionContext } = await setup();
  const explanation = explainRevisions({
    family: 'component',
    record: component.record,
    bindingId: 'web.react',
    ...revisionContext,
  });
  assert.deepEqual(explanation.axes.map(({ name }) => name), [
    'contentRevision',
    'bindingContentRevision',
    'bindingSpecRevision',
  ]);
  assert.ok(explanation.axes.every(({ digest, normalizedInputs }) => (
    /^sha256:[a-f0-9]{64}$/u.test(digest)
    && normalizedInputs.length > 0
    && normalizedInputs.every(({ path }) => path.startsWith('$'))
  )));
  assert.equal(
    explanation.axes.find(({ name }) => name === 'contentRevision').digest,
    component.contentRevision,
  );
  assert.equal(
    explanation.axes.find(({ name }) => name === 'bindingSpecRevision').digest,
    component.bindingSpecRevisions['web.react'],
  );
});

test('E-G0.5-02: revision explanations distinguish absent and empty containers on every axis', async () => {
  const { component, revisionContext } = await setup();

  const conceptAfter = structuredClone(component.record);
  conceptAfter.extensions = {};
  const conceptBeforeRows = explainRevisions({
    family: 'component',
    record: component.record,
  }).axes.find(({ name }) => name === 'contentRevision').normalizedInputs;
  const conceptAfterRows = explainRevisions({
    family: 'component',
    record: conceptAfter,
  }).axes.find(({ name }) => name === 'contentRevision').normalizedInputs;
  assert.equal(conceptBeforeRows.some(({ path }) => path === '$/extensions'), false);
  assert.deepEqual(conceptAfterRows.find(({ path }) => path === '$/extensions').value, {});

  const bindingBefore = component.record.bindings['web.react'];
  const bindingAfter = structuredClone(bindingBefore);
  bindingAfter.editorialNotes = [];
  const bindingBeforeAxis = explainRevisions({
    family: 'binding',
    record: bindingBefore,
  }).axes.find(({ name }) => name === 'bindingContentRevision');
  const bindingAfterAxis = explainRevisions({
    family: 'binding',
    record: bindingAfter,
  }).axes.find(({ name }) => name === 'bindingContentRevision');
  assert.notEqual(bindingBeforeAxis.digest, bindingAfterAxis.digest);
  assert.equal(
    bindingBeforeAxis.normalizedInputs.some(({ path }) => path === '$/editorialNotes'),
    false,
  );
  assert.deepEqual(
    bindingAfterAxis.normalizedInputs.find(({ path }) => path === '$/editorialNotes').value,
    [],
  );

  const specAfter = structuredClone(component.record);
  specAfter.bindings['web.react'].api.defaults.emptyContract = {};
  const specBeforeAxis = explainRevisions({
    family: 'component',
    record: component.record,
    bindingId: 'web.react',
    ...revisionContext,
  }).axes.find(({ name }) => name === 'bindingSpecRevision');
  const specAfterAxis = explainRevisions({
    family: 'component',
    record: specAfter,
    bindingId: 'web.react',
    ...revisionContext,
  }).axes.find(({ name }) => name === 'bindingSpecRevision');
  assert.notEqual(specBeforeAxis.digest, specAfterAxis.digest);
  assert.equal(
    specBeforeAxis.normalizedInputs.some(
      ({ path }) => path === '$/binding/api/defaults/emptyContract',
    ),
    false,
  );
  assert.deepEqual(
    specAfterAxis.normalizedInputs.find(
      ({ path }) => path === '$/binding/api/defaults/emptyContract',
    ).value,
    {},
  );
});

test('E-G0.5-03: autofix is preview-only and denies every product-meaning category', async () => {
  const value = await corpus();
  const { component } = await setup();
  const record = structuredClone(component.record);
  record.summary = '  Triggers an immediate action.  ';
  const preview = previewAutofix({ record, path: '$/summary' });
  assert.equal(preview.mode, 'preview-only');
  assert.deepEqual(preview.changedPaths, ['$/summary']);
  assert.equal(preview.record.summary, 'Triggers an immediate action.');
  assert.equal(record.summary, '  Triggers an immediate action.  ');

  for (const denied of value.autofixDenied) {
    assert.throws(
      () => previewAutofix({ record: component.record, path: denied.path }),
      (error) => {
        assert.ok(error instanceof AuthoringPolicyError, denied.category);
        assert.match(error.ruleId, /^authoring\.autofix\./u, denied.category);
        return true;
      },
    );
  }
});

test('E-G0.5-04: affected closure is graph-derived and extends through declared Gate 1 dependents', async () => {
  const { context, component } = await setup();
  const closure = affectedClosure({
    context,
    sourcePaths: [component.source.record],
  });
  assert.equal(closure.sourceRevision, context.sourceRevision);
  assert.ok(closure.artifacts.includes('muxui:component:button'));
  assert.ok(closure.artifacts.includes('muxui:example:button-basic-react'));
  assert.ok(closure.artifacts.includes('muxui:token:default-theme'));
  assert.ok(closure.canonicalSources.includes(component.source.record));
  assert.ok(closure.projections.includes('packages/catalog/generated/catalog.json'));
  assert.deepEqual(closure.packages.map(({ name }) => name), [
    '@muxui/react-playground',
    '@muxui/react-storybook',
    '@muxui/catalog',
    '@muxui/react',
    '@muxui/react-native',
    '@muxui/tooling',
    '@muxui/web',
    '@muxui/repository-policy',
  ]);
  assert.ok(closure.requiredChecks.includes('pnpm --filter @muxui/react-playground check'));
  assert.ok(closure.requiredChecks.includes('pnpm --filter @muxui/react-storybook check'));
  assert.ok(closure.requiredChecks.includes('pnpm --filter @muxui/catalog check'));
  assert.ok(closure.requiredChecks.includes('pnpm --filter @muxui/react check'));
  assert.ok(closure.requiredChecks.includes('pnpm --filter @muxui/react-native check'));
  assert.ok(closure.requiredChecks.includes('pnpm --filter @muxui/tooling check'));
  assert.ok(closure.requiredChecks.includes('pnpm --filter @muxui/web check'));
  assert.ok(closure.requiredChecks.includes('pnpm --filter @muxui/repository-policy check'));
  assert.deepEqual(closure.deferred, [{
    capability: 'renderer-proof-evaluation-closure',
    readiness: 'unavailable',
    earliestBoundary: 'Gate 1',
  }]);

  const schemaClosure = affectedClosure({
    context,
    sourcePaths: ['packages/schema/schemas/component.schema.json'],
  });
  assert.ok(schemaClosure.projections.includes('packages/schema/generated/types.d.ts'));
  assert.deepEqual(schemaClosure.packages.map(({ name }) => name), [
    '@muxui/react-playground',
    '@muxui/react-storybook',
    '@muxui/catalog',
    '@muxui/react',
    '@muxui/react-native',
    '@muxui/schema',
    '@muxui/tokens',
    '@muxui/tooling',
    '@muxui/web',
    '@muxui/repository-policy',
  ]);
  assert.throws(
    () => affectedClosure({ context, sourcePaths: ['catalog/components/inferred.json'] }),
    (error) => error instanceof AuthoringPolicyError
      && error.ruleId === 'authoring.closure.source-undeclared',
  );
});

test('E-R1.5-04: change intent previews canonical impact without authorizing a write', async () => {
  const { context, component, revisionContext } = await setup();
  const after = structuredClone(component.record);
  after.summary = `${after.summary} Updated`;
  const intent = previewChangeIntent({
    context,
    family: 'component',
    recordPath: component.source.record,
    before: component.record,
    after,
    objective: 'Clarify the Button summary.',
    revisionContext,
  });
  assert.equal(intent.mode, 'preview-only');
  assert.deepEqual(intent.base, {
    sourceRevision: context.sourceRevision,
    artifactId: component.id,
    recordPath: component.source.record,
  });
  assert.equal(intent.objective, 'Clarify the Button summary.');
  assert.deepEqual(intent.writeSet, [{
    path: component.source.record,
    artifactId: component.id,
    bytes: `${canonicalJson(after)}\n`,
  }]);
  assert.equal(intent.semantic.changes.length, 1);
  assert.equal(intent.versionEffect, 'patch');
  assert.ok(intent.invalidated.artifacts.includes(component.id));
  assert.ok(intent.invalidated.projections.includes('packages/catalog/generated/catalog.json'));
  assert.ok(intent.invalidated.packages.some(({ name }) => name === '@muxui/catalog'));
  assert.ok(intent.invalidated.checks.includes('pnpm --filter @muxui/catalog check'));
  assert.equal(intent.proofEffects.status, 'pending');
  assert.equal(intent.readiness.status, 'not-ready');
  assert.equal(intent.confirmationPolicy.requiresConfirmation, false);
  assert.equal(Object.isFrozen(intent), true);
  assert.equal(component.record.summary.endsWith('Updated'), false);
});

test('E-R1.5-04 negative: change intent rejects stale bases and invalid proposed sources', async () => {
  const { context, component, revisionContext } = await setup();
  const after = structuredClone(component.record);
  after.summary = `${after.summary} Updated`;
  const stale = structuredClone(component.record);
  stale.summary = `${stale.summary} Stale`;
  assert.throws(
    () => previewChangeIntent({
      context,
      recordPath: component.source.record,
      before: stale,
      after,
      objective: 'Clarify the Button summary.',
      revisionContext,
    }),
    (error) => error instanceof AuthoringPolicyError
      && error.ruleId === 'authoring.change-intent.base-drift',
  );
  const invalid = structuredClone(component.record);
  invalid.summary = '';
  assert.throws(
    () => previewChangeIntent({
      context,
      recordPath: component.source.record,
      before: component.record,
      after: invalid,
      objective: 'Clarify the Button summary.',
      revisionContext,
    }),
    (error) => error instanceof AuthoringPolicyError
      && error.ruleId === 'authoring.change-intent.proposed-invalid',
  );
});

test('E-R1.5-02: every React family and example source passes canonical diagnosis', async () => {
  const { context } = await setup();
  const components = context.catalogBundle.artifacts.filter(({ kind }) => kind === 'component');
  const examples = context.catalogBundle.artifacts.filter(({ kind, record }) => (
    kind === 'example' && record.binding?.ref?.endsWith('#web.react')
  ));
  assert.equal(components.length, 53);
  assert.ok(examples.length >= components.length);
  assert.deepEqual(
    [...new Set(examples.map(({ record }) => record.binding.ref))].sort(),
    components.map(({ id }) => `${id}#web.react`).sort(),
  );
  for (const artifact of [...components, ...examples]) {
    const diagnosis = diagnoseCanonicalSource({
      context,
      family: artifact.kind,
      record: artifact.record,
      recordPath: artifact.source.record,
    });
    assert.equal(diagnosis.valid, true, artifact.id);
    assert.deepEqual(diagnosis.diagnostics, [], artifact.id);
  }
});

test('E-G0.5-04: an injected stable field must couple scaffold, diff, diagnostics, and closure', async () => {
  const { context, component, revisionContext } = await setup();
  const [componentSchema, bindingSchema, ownership] = await Promise.all([
    readFile(resolve(repositoryRoot, 'packages/schema/schemas/component.schema.json'), 'utf8'),
    readFile(resolve(repositoryRoot, 'packages/schema/schemas/binding.schema.json'), 'utf8'),
    readFile(resolve(repositoryRoot, 'packages/schema/schemas/field-ownership.json'), 'utf8'),
  ]).then((documents) => documents.map((document) => JSON.parse(document)));
  componentSchema.required.push('newStableField');
  componentSchema.properties.newStableField = {
    type: 'string',
    minLength: 1,
    'x-muxui-authoring': { effect: 'incompatible', revisionAxes: ['content'] },
  };
  ownership.fields.push({
    class: 'authored',
    name: 'newStableField',
    owner: 'component-contract',
    schema: 'component.schema.json',
    schemaPointer: '#/properties/newStableField',
  });
  const authoring = {
    schemas: {
      'component.schema.json': componentSchema,
      'binding.schema.json': bindingSchema,
    },
    ownership,
  };
  const decisions = structuredClone(component.record);
  delete decisions.schemaVersion;
  delete decisions.id;
  delete decisions.kind;
  decisions.newStableField = 'baseline';
  const readiness = { scaffold: false, diff: false, diagnostics: false, closure: false };
  assert.equal(Object.values(readiness).every(Boolean), false);

  const preview = scaffoldComponent({
    slug: 'button',
    recordPath: component.source.record,
    decisions,
    authoring,
  });
  readiness.scaffold = preview.record.newStableField === 'baseline';
  assert.equal(Object.values(readiness).every(Boolean), false);

  const after = structuredClone(preview.record);
  after.newStableField = 'changed';
  const diff = semanticDiff({
    before: preview.record,
    after,
    revisionContext,
    authoring,
  });
  readiness.diff = diff.changes.some(({ path, owner }) => (
    path === '$/newStableField' && owner.name === 'component-contract'
  ));
  assert.equal(Object.values(readiness).every(Boolean), false);

  const invalid = structuredClone(preview.record);
  invalid.newStableField = '';
  const diagnosis = diagnoseCanonicalSource({
    context,
    family: 'component',
    record: invalid,
    recordPath: component.source.record,
    authoring,
  });
  readiness.diagnostics = diagnosis.diagnostics.some(({ details }) => (
    details.source.path === '$/newStableField'
    && details.owner.name === 'component-contract'
  ));
  assert.equal(Object.values(readiness).every(Boolean), false);

  const closure = affectedClosure({
    context,
    sourcePaths: ['packages/schema/schemas/component.schema.json'],
    authoring,
  });
  readiness.closure = closure.artifacts.includes(component.id)
    && closure.canonicalSources.includes(component.source.record)
    && closure.projections.includes('packages/catalog/generated/catalog.json');
  assert.equal(Object.values(readiness).every(Boolean), true);
});
