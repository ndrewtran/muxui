import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { createCatalogApi } from '@muxui/catalog';
import { compileCatalog } from '@muxui/catalog/compiler';
import { canonicalJson, loadFieldOwnershipRegistry, mergeDerivedApis } from '@muxui/schema';
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

/** Freezes a value and everything it reaches, so a test that mutates the shared baseline throws. */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Loads the live repository's authoring context; throws when it drifts from `sourceRevision`. */
function loadContext(sourceRevision) {
  return loadRepositoryAuthoringContext({ repositoryRoot, expectedSourceRevision: sourceRevision });
}

async function buildBaseline() {
  const compiled = await compileCatalog({ repositoryRoot });
  // Frozen copies, so no test can change what the others read. Tests clone a record before changing it.
  const { sourceRevision, artifacts } = deepFreeze(structuredClone(compiled.bundle));
  const button = artifacts.find(({ id }) => id === 'muxui:component:button');
  // Button's web.react API is derived from its React source (Decision 0031). The bundle holds the
  // merged record; authoring reads the authored record, with each derived block in the revision context.
  const component = deepFreeze({
    ...button,
    record: JSON.parse(await readFile(resolve(repositoryRoot, button.source.record), 'utf8')),
  });
  const derivedApis = Object.fromEntries(await Promise.all(Object.entries(button.source.derivedApis ?? {})
    .map(async ([bindingId, { path }]) => [bindingId, JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8'))])));
  const exampleArtifacts = artifacts.filter(({ kind }) => kind === 'example');
  const exampleSources = {};
  for (const artifact of exampleArtifacts) {
    exampleSources[artifact.id] = await readFile(
      resolve(repositoryRoot, artifact.source.content),
      'utf8',
    );
  }
  return {
    sourceRevision,
    context: await loadContext(sourceRevision),
    component,
    revisionContext: deepFreeze({
      examples: exampleArtifacts.map(({ record }) => record),
      tokenSources: artifacts.filter(({ kind }) => kind === 'token').map(({ record }) => record),
      exampleSources,
      tokenRequirementSets: component.tokenRequirementSets,
      platformSafetyRequirementSets: component.platformSafetyRequirementSets,
      derivedApis,
    }),
  };
}

// One compile and context load serves every test that only reads the catalog. Tests that detect drift or
// recompilation call the loader and compiler themselves instead of reading this.
let baseline;
const setup = () => (baseline ??= buildBaseline());

async function temporaryCatalogRepository() {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'muxui-g0-5-'));
  await Promise.all([
    mkdir(resolve(temporaryRoot, 'packages/tooling'), { recursive: true }),
    mkdir(resolve(temporaryRoot, 'packages/tokens'), { recursive: true }),
    mkdir(resolve(temporaryRoot, 'tooling/audits/repository-policy'), { recursive: true }),
    mkdir(resolve(temporaryRoot, 'packages/schema/schemas'), { recursive: true }),
    mkdir(resolve(temporaryRoot, 'strategy'), { recursive: true }),
  ]);
  await Promise.all([
    cp(resolve(repositoryRoot, 'catalog'), resolve(temporaryRoot, 'catalog'), { recursive: true }),
    cp(
      resolve(repositoryRoot, 'packages/catalog'),
      resolve(temporaryRoot, 'packages/catalog'),
      { recursive: true },
    ),
    cp(resolve(repositoryRoot, 'packages/react/api'), resolve(temporaryRoot, 'packages/react/api'), { recursive: true }),
    cp(
      resolve(repositoryRoot, 'packages/tooling/command-registry.json'),
      resolve(temporaryRoot, 'packages/tooling/command-registry.json'),
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
  const { context, component, revisionContext } = await setup();
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
    // Retrieval returns the compiled record, with the derived web.react API merged in.
    assert.equal(canonicalJson(Object.fromEntries(
      Object.keys(preview.record).map((key) => [key, retrieved.data.artifact[key]]),
    )), canonicalJson(mergeDerivedApis(preview.record, revisionContext.derivedApis)));
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

  // Button's web.react API is derived, so restating it in the record is the error now.
  const restatedBindingApi = structuredClone(preview.record);
  restatedBindingApi.bindings['web.react'].api = { props: [], events: [], parts: [], defaults: {} };
  const bindingDiagnosis = diagnoseCanonicalSource({
    context,
    family: 'component',
    record: restatedBindingApi,
    recordPath: sourcePath,
  });
  assert.equal(bindingDiagnosis.diagnostics[0].details.source.path, '$/bindings/web.react/api');
  assert.match(bindingDiagnosis.diagnostics[0].message, /remove the authored api/u);
  assert.deepEqual(bindingDiagnosis.diagnostics[0].details.owner, {
    name: 'binding-contract',
    schema: 'binding.schema.json',
    schemaPointer: '#/properties/api',
  });

  const missingReason = structuredClone(preview.record);
  delete missingReason.bindings['web.html'].reason;
  const reasonDiagnosis = diagnoseCanonicalSource({
    context,
    family: 'component',
    record: missingReason,
    recordPath: sourcePath,
  });
  assert.equal(reasonDiagnosis.diagnostics[0].details.source.path, '$/bindings/web.html/reason');
  assert.deepEqual(reasonDiagnosis.diagnostics[0].details.owner, {
    name: 'binding-contract',
    schema: 'binding.schema.json',
    schemaPointer: '#/properties/reason',
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
  const { sourceRevision, component } = await setup();
  // The drift and revision checks load the live repository themselves, so this test's context is not the shared one.
  const context = await loadContext(sourceRevision);
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
  assert.equal(context.sourceRevision, sourceRevision);

  const temporaryRoot = await temporaryCatalogRepository();
  try {
    const changed = structuredClone(component.record);
    changed.summary = `${changed.summary} Drift`;
    await writeFile(resolve(temporaryRoot, component.source.record), `${canonicalJson(changed)}\n`);
    await assert.rejects(
      loadRepositoryAuthoringContext({
        repositoryRoot: temporaryRoot,
        expectedSourceRevision: sourceRevision,
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

test('Decision 0031: a derived API change is classified like an authored one and moves only the binding spec', async () => {
  const { component, revisionContext } = await setup();
  const authored = component.record;
  assert.equal(authored.bindings['web.react'].api, undefined, 'Button authors no web.react api');
  const derived = {
    schema: 'muxui-derived-api-v1',
    generatedFrom: 'packages/react/src/button.ts',
    component: 'muxui:component:button',
    binding: 'web.react',
    export: 'Button',
    api: {
      props: ['disabled', 'variant'],
      events: [],
      defaults: {},
      propDetails: {
        disabled: { type: { kind: 'boolean' }, required: false },
        variant: { type: { kind: 'string' }, required: false },
      },
      eventDetails: {},
      types: {},
    },
  };
  const narrowed = structuredClone(derived);
  narrowed.api.props = ['variant'];
  delete narrowed.api.propDetails.disabled;
  const result = semanticDiff({
    before: authored,
    after: authored,
    revisionContext: {
      ...revisionContext,
      before: { derivedApis: { 'web.react': derived } },
      after: { derivedApis: { 'web.react': narrowed } },
    },
  });
  assert.deepEqual(result.changes.map(({ path, operation, effect, revisionAxes }) => ({ path, operation, effect, revisionAxes })), [
    { path: '$/bindings/web.react/api/propDetails/disabled', operation: 'remove', effect: 'incompatible', revisionAxes: ['binding-spec'] },
    { path: '$/bindings/web.react/api/props/0', operation: 'remove', effect: 'incompatible', revisionAxes: ['binding-spec'] },
  ]);
  assert.equal(result.effect, 'incompatible');
  assert.equal(result.revisions.contentRevision.changed, false);
  assert.equal(result.revisions.bindings['web.react'].bindingContentRevision.changed, false);
  assert.equal(result.revisions.bindings['web.react'].bindingSpecRevision.changed, true);

  const axes = explainRevisions({
    family: 'component',
    record: authored,
    bindingId: 'web.react',
    ...revisionContext,
    derivedApis: { 'web.react': derived },
  }).axes;
  const inputs = (name) => axes.find((axis) => axis.name === name).normalizedInputs.map(({ path }) => path);
  assert.ok(inputs('bindingSpecRevision').includes('$/binding/api/propDetails/disabled/required'));
  assert.equal(inputs('contentRevision').some((path) => path.startsWith('$/bindings/web.react/api')), false);
  assert.equal(inputs('bindingContentRevision').some((path) => path.startsWith('$/api')), false);
  // Without its derived block the binding has no api at all.
  assert.throws(
    () => semanticDiff({ before: authored, after: authored, revisionContext: { ...revisionContext, derivedApis: {} } }),
    /needs an authored api or a derived API source/u,
  );

  // Source diagnosis reads which bindings the compiled catalog derived.
  const { context } = await setup();
  const withDerivedApis = (derivedApis) => ({
    ...context,
    catalogBundle: {
      ...context.catalogBundle,
      artifacts: context.catalogBundle.artifacts.map((artifact) => {
        if (artifact.id !== component.id) return artifact;
        const { derivedApis: _derivedApis, ...source } = artifact.source;
        return { ...artifact, source: derivedApis === undefined ? source : { ...source, derivedApis } };
      }),
    },
  });
  const derivedContext = withDerivedApis({ 'web.react': { path: 'packages/react/api/button.json' } });
  const authoredContext = withDerivedApis(undefined);
  const diagnose = (record, diagnosisContext) => diagnoseCanonicalSource({
    context: diagnosisContext,
    family: 'component',
    record,
    recordPath: component.source.record,
  });
  assert.equal(diagnose(authored, derivedContext).valid, true);
  const restated = structuredClone(authored);
  restated.bindings['web.react'].api = { props: [], events: [], parts: [], defaults: {} };
  for (const [record, diagnosisContext, message] of [
    [restated, derivedContext, 'remove the authored api'],
    [authored, authoredContext, 'needs an authored api or a derived API source'],
  ]) {
    const diagnosis = diagnose(record, diagnosisContext);
    assert.equal(diagnosis.valid, false);
    assert.equal(diagnosis.diagnostics[0].details.source.path, '$/bindings/web.react/api');
    assert.match(diagnosis.diagnostics[0].message, new RegExp(message, 'u'));
    assert.equal(diagnosis.diagnostics[0].details.owner.name, 'binding-contract');
  }
});

test('Decision 0031: adding a required derived prop or event is incompatible, and a description edit is editorial', async () => {
  const { component, revisionContext } = await setup();
  const authored = component.record;
  const derived = {
    schema: 'muxui-derived-api-v1',
    generatedFrom: 'packages/react/src/button.ts',
    component: 'muxui:component:button',
    binding: 'web.react',
    export: 'Button',
    api: {
      props: ['variant', 'config'],
      events: ['activate'],
      defaults: {},
      propDetails: {
        variant: { type: { kind: 'string' }, required: false, description: 'The recipe.' },
        // config?: { label: string }
        config: { type: { kind: 'object', members: [{ name: 'label', type: { kind: 'string' }, required: true, readonly: false }] }, required: false },
      },
      eventDetails: {
        activate: {
          prop: 'onActivate',
          type: { kind: 'function', parameters: [{ name: 'event', type: { kind: 'reference', name: 'ActivationEvent' }, required: true }], returns: { kind: 'void' } },
          required: false,
        },
      },
      types: {
        ActivationEvent: {
          type: { kind: 'object', members: [{ name: 'pointer', type: { kind: 'string' }, required: true, readonly: true, description: 'The pointer.' }] },
        },
      },
    },
  };
  const diff = (edit) => {
    const after = structuredClone(derived);
    edit(after.api);
    return semanticDiff({
      before: authored,
      after: authored,
      revisionContext: { ...revisionContext, before: { derivedApis: { 'web.react': derived } }, after: { derivedApis: { 'web.react': after } } },
    });
  };
  const summary = (result) => result.changes.map(({ path, operation, effect }) => `${operation} ${path.replace('$/bindings/web.react/api/', '')} ${effect}`);

  const addProp = (required) => (api) => {
    api.props.push('label');
    api.propDetails.label = { type: { kind: 'string' }, required };
  };
  assert.deepEqual(summary(diff(addProp(false))), ['add propDetails/label compatible', 'add props/2 compatible']);
  const requiredProp = diff(addProp(true));
  assert.deepEqual(summary(requiredProp), ['add propDetails/label incompatible', 'add props/2 incompatible']);
  assert.deepEqual([requiredProp.effect, requiredProp.versionEffect], ['incompatible', 'major']);
  const addEvent = (required) => (api) => {
    api.events.push('dismiss');
    api.eventDetails.dismiss = { prop: 'onDismiss', type: { kind: 'function', parameters: [], returns: { kind: 'void' } }, required };
  };
  assert.equal(diff(addEvent(false)).effect, 'compatible');
  assert.deepEqual(summary(diff(addEvent(true))), ['add eventDetails/dismiss incompatible', 'add events/1 incompatible']);

  // So is a required member added to an object type a prop or event reaches, inline or named.
  const id = (required) => ({ name: 'id', type: { kind: 'string' }, required, readonly: false });
  const inline = (required) => diff((api) => api.propDetails.config.type.members.push(id(required)));
  assert.deepEqual(summary(inline(true)), ['add propDetails/config/type/members/1 incompatible']);
  assert.deepEqual([inline(true).effect, inline(true).versionEffect], ['incompatible', 'major']);
  assert.equal(inline(false).effect, 'compatible');
  const named = (required) => diff((api) => api.types.ActivationEvent.type.members.push(id(required)));
  assert.deepEqual(summary(named(true)), ['add types/ActivationEvent/type/members/1 incompatible']);
  assert.equal(named(false).effect, 'compatible');
  // An absent member (`id?: never`) rejects input that carried the key, so it narrows like a required one.
  const absent = diff((api) => api.propDetails.config.type.members.push({ name: 'id', type: { kind: 'never' }, required: false, readonly: true }));
  assert.deepEqual(summary(absent), ['add propDetails/config/type/members/1 incompatible']);

  // A description is editorial wherever it sits, though the block, and so the spec revision, changes.
  const described = diff((api) => {
    api.propDetails.variant.description = 'The visual recipe.';
    api.eventDetails.activate.description = 'Fires on activation.';
    api.types.ActivationEvent.type.members[0].description = 'The pointer that activated it.';
  });
  assert.equal(described.changes.length, 4);
  assert.ok(described.changes.every(({ effect }) => effect === 'editorial'), summary(described).join('\n'));
  assert.deepEqual([described.effect, described.versionEffect], ['editorial', 'patch']);
  assert.equal(described.revisions.bindings['web.react'].bindingSpecRevision.changed, true);
  // Beside a real change, the entry classifies by that change.
  const retyped = diff((api) => {
    api.propDetails.variant.description = 'The visual recipe.';
    api.propDetails.variant.type = { kind: 'number' };
  });
  assert.equal(retyped.effect, 'incompatible');

  // A record (a string index signature) classifies by the same rules: a description edit is
  // editorial, and a change to its value type or readonly flag, or to or from a record, is not.
  const withValues = (api) => {
    api.props.push('values');
    api.propDetails.values = { type: { kind: 'reference', name: 'Values' }, required: false };
    api.types.Values = { type: { kind: 'record', value: { kind: 'string' }, readonly: true } };
  };
  const recordDiff = (edit) => {
    const before = structuredClone(derived);
    withValues(before.api);
    const after = structuredClone(before);
    edit(after.api);
    return semanticDiff({
      before: authored,
      after: authored,
      revisionContext: { ...revisionContext, before: { derivedApis: { 'web.react': before } }, after: { derivedApis: { 'web.react': after } } },
    });
  };
  assert.deepEqual(summary(recordDiff((api) => { api.types.Values.description = 'Values by column id.'; })), ['add types/Values/description editorial']);
  assert.deepEqual(summary(recordDiff((api) => { api.types.Values.type.value = { kind: 'number' }; })), ['replace types/Values/type/value/kind incompatible']);
  assert.equal(recordDiff((api) => { api.types.Values.type.readonly = false; }).effect, 'incompatible');
  assert.equal(recordDiff((api) => { api.types.Values.type = { kind: 'object', members: [] }; }).effect, 'incompatible');
  assert.deepEqual(summary(diff(withValues)), ['add propDetails/values compatible', 'add props/2 compatible', 'add types/Values compatible']);
});

/** A Button derived block with parts, and the diff of one derived-block edit, for the D2 classification tests. */
async function partFixture() {
  const { component, revisionContext } = await setup();
  // Button's anatomy is root and label, and a second part lets a test add one beside an existing part.
  const authored = { ...structuredClone(component.record), anatomy: ['root', 'label', 'other'] };
  const part = (edit = () => {}) => {
    const block = {
      member: 'Label',
      props: ['title'],
      events: [],
      defaults: {},
      propDetails: { title: { type: { kind: 'string' }, required: false, description: 'The title.' } },
      eventDetails: {},
      types: {},
    };
    edit(block);
    return block;
  };
  const document = (partApis) => ({
    schema: 'muxui-derived-api-v1',
    generatedFrom: 'packages/react/src/button.ts',
    component: 'muxui:component:button',
    binding: 'web.react',
    export: 'Button',
    api: { props: ['variant'], events: [], defaults: {}, propDetails: { variant: { type: { kind: 'string' }, required: false } }, eventDetails: {}, types: {}, ...(partApis === undefined ? {} : { partApis }) },
  });
  const diff = (before, edit) => {
    const after = structuredClone(before);
    edit(after.api);
    return semanticDiff({
      before: authored,
      after: authored,
      revisionContext: { ...revisionContext, before: { derivedApis: { 'web.react': before } }, after: { derivedApis: { 'web.react': after } } },
    });
  };
  const summary = (result) => result.changes.map(({ path, operation, effect }) => `${operation} ${path.replace('$/bindings/web.react/api/', '')} ${effect}`);
  const withOther = (edit) => (api) => { api.partApis.other = part((block) => { block.member = 'Other'; edit(block); }); };
  return { authored, revisionContext, part, document, diff, summary, withOther, base: document({ label: part() }), bare: document() };
}

test('Decision 0031 D2: inside a part, the root\'s derived rules hold', async () => {
  const { authored, revisionContext, document, diff, summary, base, part } = await partFixture();
  const addProp = (required) => (api) => {
    api.partApis.label.props.push('tone');
    api.partApis.label.propDetails.tone = { type: { kind: 'string' }, required };
  };
  assert.deepEqual(summary(diff(base, addProp(false))), ['add partApis/label/propDetails/tone compatible', 'add partApis/label/props/1 compatible']);
  assert.deepEqual(summary(diff(base, addProp(true))), ['add partApis/label/propDetails/tone incompatible', 'add partApis/label/props/1 incompatible']);
  const addEvent = (required) => (api) => {
    api.partApis.label.events.push('dismiss');
    api.partApis.label.eventDetails.dismiss = { prop: 'onDismiss', type: { kind: 'function', parameters: [], returns: { kind: 'void' } }, required };
  };
  assert.equal(diff(base, addEvent(false)).effect, 'compatible');
  assert.deepEqual(summary(diff(base, addEvent(true))), ['add partApis/label/eventDetails/dismiss incompatible', 'add partApis/label/events/0 incompatible']);
  assert.deepEqual(summary(diff(base, (api) => { api.partApis.label.propDetails.title.description = 'The heading.'; })), ['replace partApis/label/propDetails/title/description editorial']);
  assert.deepEqual(summary(diff(base, (api) => { api.partApis.label.propDetails.title.type = { kind: 'number' }; })), ['replace partApis/label/propDetails/title/type/kind incompatible']);
  // Removing or retargeting a part is incompatible, and so is changing its member.
  assert.equal(diff(base, (api) => { api.partApis.label.member = 'Caption'; }).effect, 'incompatible');
  assert.equal(diff(base, (api) => { delete api.partApis.label; api.partApis = { other: part() }; }).effect, 'incompatible');
  assert.equal(diff(base, (api) => { delete api.partApis; }).effect, 'incompatible', 'dropping the map is a removal');
  // A default inside a part is incompatible whatever the operation, as at the root.
  const withDefault = structuredClone(base);
  withDefault.api.partApis.label.defaults.title = 'Label';
  assert.equal(diff(withDefault, (api) => { api.partApis.label.defaults.title = 'Caption'; }).effect, 'incompatible', 'a part default replaced');
  assert.equal(diff(withDefault, (api) => { delete api.partApis.label.defaults.title; }).effect, 'incompatible', 'a part default removed');

  // A part moves only the binding spec revision, never the authored content revisions.
  const moved = diff(base, addProp(false));
  assert.equal(moved.revisions.contentRevision.changed, false);
  assert.equal(moved.revisions.bindings['web.react'].bindingContentRevision.changed, false);
  assert.equal(moved.revisions.bindings['web.react'].bindingSpecRevision.changed, true);
  assert.ok(moved.changes.every(({ revisionAxes }) => revisionAxes.join() === 'binding-spec'));
  const explained = explainRevisions({ family: 'component', record: authored, bindingId: 'web.react', ...revisionContext, derivedApis: { 'web.react': base } }).axes;
  const specInputs = explained.find((axis) => axis.name === 'bindingSpecRevision').normalizedInputs.map(({ path }) => path);
  assert.ok(specInputs.includes('$/binding/api/partApis/label/propDetails/title/required'));
  assert.ok(specInputs.includes('$/binding/api/partApis/label/member'));
  assert.equal(explained.find((axis) => axis.name === 'contentRevision').normalizedInputs.some(({ path }) => path.includes('partApis')), false);

  // A part key outside the component\'s anatomy is rejected when the block merges into the record.
  assert.throws(
    () => semanticDiff({ before: authored, after: authored, revisionContext: { ...revisionContext, derivedApis: { 'web.react': document({ item: part() }) } } }),
    /partApis\/item is not a part of the component anatomy/u,
  );
  // An authored api may not carry partApis.
  const restated = structuredClone(authored);
  restated.bindings['web.react'].api = { props: [], events: [], parts: [], defaults: {}, partApis: {} };
  assert.throws(() => mergeDerivedApis(restated, { 'web.react': base }), /partApis is derived only and cannot be authored/u);
});

// A part added whole, or the first partApis map, is classified by what it carries, not by the schema\'s blanket
// compatible add: a default or a required prop or event asks more of existing callers.
test('Decision 0031 D2: semantic-diff mutations of a part\'s additions', async (t) => {
  const { diff, summary, base, bare, part, withOther } = await partFixture();
  const requiredEvent = (block) => {
    block.events.push('dismiss');
    block.eventDetails.dismiss = { prop: 'onDismiss', type: { kind: 'function', parameters: [], returns: { kind: 'void' } }, required: true };
  };

  await t.test('mutation 1: a default added inside an existing part is incompatible', () => {
    const defaulted = diff(base, (api) => { api.partApis.label.defaults.title = 'Label'; });
    assert.deepEqual(summary(defaulted), ['add partApis/label/defaults/title incompatible']);
    assert.deepEqual([defaulted.effect, defaulted.versionEffect], ['incompatible', 'major']);
    assert.equal(defaulted.changes[0].revisionAxes.join(), 'binding-spec');
  });

  await t.test('mutation 2: a whole part added with a required prop (or event) is incompatible', () => {
    const requiredPart = diff(base, withOther((block) => { block.propDetails.title.required = true; }));
    assert.deepEqual(summary(requiredPart), ['add partApis/other incompatible']);
    assert.deepEqual([requiredPart.effect, requiredPart.versionEffect], ['incompatible', 'major']);
    assert.equal(diff(base, withOther(requiredEvent)).effect, 'incompatible', 'a required event');
  });

  await t.test('mutation 3: a whole part added with a default is incompatible', () => {
    assert.deepEqual(summary(diff(base, withOther((block) => { block.defaults.title = 'Other'; }))), ['add partApis/other incompatible']);
  });

  await t.test('mutation 4: the first partApis map with a required prop (or event) is incompatible', () => {
    const first = (edit) => diff(bare, (api) => { api.partApis = { label: part(edit) }; });
    const requiredFirst = first((block) => { block.propDetails.title.required = true; });
    assert.deepEqual(summary(requiredFirst), ['add partApis incompatible']);
    assert.deepEqual([requiredFirst.effect, requiredFirst.versionEffect], ['incompatible', 'major']);
    assert.equal(first(requiredEvent).effect, 'incompatible', 'a required event');
    // One obligating part among several makes the whole map incompatible.
    assert.equal(diff(bare, (api) => {
      api.partApis = { label: part(), other: part((block) => { block.member = 'Other'; block.propDetails.title.required = true; }) };
    }).effect, 'incompatible');
  });

  await t.test('mutation 5: the first partApis map with a default is incompatible', () => {
    const first = (edit) => diff(bare, (api) => { api.partApis = { label: part(edit) }; });
    assert.deepEqual(summary(first((block) => { block.defaults.title = 'Label'; })), ['add partApis incompatible']);
    assert.equal(diff(bare, (api) => {
      api.partApis = { label: part(), other: part((block) => { block.member = 'Other'; block.defaults.title = 'Other'; }) };
    }).effect, 'incompatible');
  });

  await t.test('an addition that carries nothing a caller must supply stays compatible', () => {
    assert.deepEqual(summary(diff(base, withOther(() => {}))), ['add partApis/other compatible']);
    const optional = diff(bare, (api) => { api.partApis = { label: part() }; });
    assert.deepEqual([...summary(optional)], ['add partApis compatible']);
    assert.deepEqual([optional.effect, optional.versionEffect], ['compatible', 'minor']);
  });
});

test('Decision 0031: any change inside a host type\'s typeArguments is incompatible', async () => {
  const { component, revisionContext } = await setup();
  const authored = component.record;
  const reactNode = { kind: 'host', name: 'React.ReactNode' };
  const excluded = { kind: 'union', members: [{ kind: 'null' }, { kind: 'undefined' }, { kind: 'boolean' }] };
  const derived = {
    schema: 'muxui-derived-api-v1',
    generatedFrom: 'packages/react/src/button.ts',
    component: 'muxui:component:button',
    binding: 'web.react',
    export: 'Button',
    api: {
      props: ['title', 'items', 'item', 'other', 'bare'],
      events: [],
      defaults: {},
      propDetails: {
        // title?: Exclude<React.ReactNode, null | undefined | boolean>
        title: { type: { kind: 'host', name: 'Exclude', typeArguments: [reactNode, excluded] }, required: false, description: 'The title.' },
        // items?: AsyncIterable<Item>
        items: { type: { kind: 'host', name: 'AsyncIterable', typeArguments: [{ kind: 'reference', name: 'Item' }] }, required: false },
        item: { type: { kind: 'reference', name: 'Item' }, required: false },
        other: { type: { kind: 'reference', name: 'Other' }, required: false },
        bare: { type: { kind: 'host', name: 'React.ReactNode' }, required: false },
      },
      eventDetails: {},
      types: {
        Item: { type: { kind: 'object', members: [{ name: 'entries', type: { kind: 'host', name: 'Promise', typeArguments: [{ kind: 'string' }] }, required: false, readonly: true }] } },
        Other: { type: { kind: 'string' } },
      },
    },
  };
  const diff = (edit) => {
    const after = structuredClone(derived);
    edit(after.api);
    return semanticDiff({
      before: authored,
      after: authored,
      revisionContext: { ...revisionContext, before: { derivedApis: { 'web.react': derived } }, after: { derivedApis: { 'web.react': after } } },
    });
  };
  const summary = (result) => result.changes.map(({ path, operation, effect }) => `${operation} ${path.replace('$/bindings/web.react/api/', '')} ${effect}`);
  const titleArguments = (api) => api.propDetails.title.type.typeArguments;

  // Every kind of change under typeArguments narrows or changes what the prop accepts. The diff
  // reads an array's objects by identity, so an edited argument is a remove and an add, and an
  // appended argument or a new typeArguments key is an add alone: the rule is what makes that add incompatible.
  const at = 'propDetails/title/type/typeArguments';
  const incompatible = [
    ['adding an excluded member', (api) => titleArguments(api)[1].members.push({ kind: 'string' }), [`add ${at}/1`, `remove ${at}/1`]],
    ['removing an excluded member', (api) => titleArguments(api)[1].members.pop(), [`add ${at}/1`, `remove ${at}/1`]],
    ['reordering the excluded members', (api) => titleArguments(api)[1].members.reverse(), [`add ${at}/1`, `remove ${at}/1`]],
    ['replacing the excluded set', (api) => { titleArguments(api)[1] = { kind: 'null' }; }, [`add ${at}/1`, `remove ${at}/1`]],
    ['replacing the first argument', (api) => { titleArguments(api)[0] = { kind: 'host', name: 'React.ReactElement' }; }, [`add ${at}/0`, `remove ${at}/0`]],
    ['adding an argument', (api) => titleArguments(api).push({ kind: 'string' }), [`add ${at}/2`]],
    ['removing an argument', (api) => titleArguments(api).pop(), [`remove ${at}/1`]],
    ['dropping the arguments', (api) => { delete api.propDetails.title.type.typeArguments; }, [`remove ${at}`]],
    ['giving a bare host type arguments', (api) => { api.propDetails.bare.type.typeArguments = [{ kind: 'string' }]; }, ['add propDetails/bare/type/typeArguments']],
    ['swapping a Mux UI-owned argument', (api) => { api.propDetails.items.type.typeArguments[0] = { kind: 'reference', name: 'Other' }; },
      ['add propDetails/items/type/typeArguments/0', 'remove propDetails/items/type/typeArguments/0']],
    ['changing an application inside a named type', (api) => { api.types.Item.type.members[0].type.typeArguments[0] = { kind: 'number' }; },
      ['add types/Item/type/members/0', 'remove types/Item/type/members/0']],
  ];
  for (const [name, edit, changes] of incompatible) {
    const result = diff(edit);
    assert.deepEqual(result.changes.map(({ path, operation }) => `${operation} ${path.replace('$/bindings/web.react/api/', '')}`), changes, name);
    assert.deepEqual([result.effect, result.versionEffect], ['incompatible', 'major'], `${name}: ${summary(result).join(', ')}`);
  }
  // Each change in the paths that run under typeArguments is incompatible by itself.
  const underArguments = incompatible.slice(0, 9).flatMap(([, edit]) => diff(edit).changes).filter(({ path }) => /\/typeArguments(?:\/|$)/u.test(path));
  assert.equal(underArguments.length, 14);
  assert.ok(underArguments.every(({ effect }) => effect === 'incompatible'), underArguments.map(({ path, effect }) => `${path} ${effect}`).join('\n'));

  // A description edit beside the arguments is editorial, and a new prop that uses an application is compatible.
  const described = diff((api) => { api.propDetails.title.description = 'The heading.'; });
  assert.deepEqual(summary(described), ['replace propDetails/title/description editorial']);
  assert.equal(described.effect, 'editorial');
  const added = diff((api) => {
    api.props.push('footer');
    api.propDetails.footer = { type: { kind: 'host', name: 'Exclude', typeArguments: [reactNode, excluded] }, required: false };
  });
  assert.equal(added.effect, 'compatible', summary(added).join(', '));
  // A prop named typeArguments is an ordinary prop: adding it is not a change inside a host application.
  const named = diff((api) => {
    api.props.push('typeArguments');
    api.propDetails.typeArguments = { type: { kind: 'string' }, required: false };
  });
  assert.equal(named.effect, 'compatible', summary(named).join(', '));
});

test('Decision 0031: any change inside a tuple is incompatible, at the root, in a named type, and in a part', async (t) => {
  const { authored, revisionContext, document, part, diff: partDiff } = await partFixture();
  const string = { kind: 'string' };
  const block = { kind: 'reference', name: 'Block' };
  // data?: [string, ...(string | number | boolean)[]]; fixed?: [string, number]; quote?: Quote, whose content is [Block, ...Block[]]; pair?: Pair = [string, ...string[]].
  const tuples = () => ({
    props: ['data', 'fixed', 'quote', 'pair'],
    propDetails: {
      data: { type: { kind: 'tuple', elements: [string], rest: { kind: 'union', members: [string, { kind: 'number' }, { kind: 'boolean' }] } }, required: false, description: 'The data.' },
      fixed: { type: { kind: 'tuple', elements: [string, { kind: 'number' }] }, required: false },
      quote: { type: { kind: 'reference', name: 'Quote' }, required: false },
      pair: { type: { kind: 'reference', name: 'Pair' }, required: false },
    },
    types: {
      Block: { type: string },
      Quote: { type: { kind: 'object', members: [{ name: 'content', type: { kind: 'tuple', elements: [block], rest: block }, required: true, readonly: false }] } },
      Pair: { type: { kind: 'tuple', elements: [string], rest: string } },
    },
  });
  const root = document();
  Object.assign(root.api, tuples());
  const inPart = document({ label: part((label) => Object.assign(label, tuples())) });
  const ofRoot = (api) => api;
  const ofPart = (api) => api.partApis.label;
  const classify = (before, edit) => {
    const after = structuredClone(before);
    edit(after.api);
    return semanticDiff({
      before: authored,
      after: authored,
      revisionContext: { ...revisionContext, before: { derivedApis: { 'web.react': before } }, after: { derivedApis: { 'web.react': after } } },
    });
  };
  const paths = (result) => result.changes.map(({ path, operation }) => `${operation} ${path.replace('$/bindings/web.react/api/', '')}`);

  for (const [where, base, at, prefix] of [['the root', root, ofRoot, ''], ['a part', inPart, ofPart, 'partApis/label/']]) {
    await t.test(where, () => {
      const incompatible = [
        // The case that read as compatible: a required element appended to the prefix rejects the one-element values.
        ['adding a required element to the prefix', (api) => at(api).propDetails.data.type.elements.push({ kind: 'number' }), [`add ${prefix}propDetails/data/type/elements/1`]],
        ['inserting an element before the rest', (api) => at(api).propDetails.data.type.elements.unshift({ kind: 'number' }), [`add ${prefix}propDetails/data/type/elements/0`]],
        ['removing an element', (api) => at(api).propDetails.fixed.type.elements.pop(), [`remove ${prefix}propDetails/fixed/type/elements/1`]],
        ['reordering the elements', (api) => at(api).propDetails.fixed.type.elements.reverse(), [`add ${prefix}propDetails/fixed/type/elements/0`, `remove ${prefix}propDetails/fixed/type/elements/1`]],
        ['retyping an element', (api) => { at(api).propDetails.fixed.type.elements[1] = string; }, [`add ${prefix}propDetails/fixed/type/elements/1`, `remove ${prefix}propDetails/fixed/type/elements/1`]],
        ['widening an element', (api) => { at(api).propDetails.fixed.type.elements[0] = { kind: 'union', members: [string, { kind: 'number' }] }; }, [`add ${prefix}propDetails/fixed/type/elements/0`, `remove ${prefix}propDetails/fixed/type/elements/0`]],
        ['dropping the rest', (api) => { delete at(api).propDetails.data.type.rest; }, [`remove ${prefix}propDetails/data/type/rest`]],
        ['giving a fixed tuple a rest', (api) => { at(api).propDetails.fixed.type.rest = string; }, [`add ${prefix}propDetails/fixed/type/rest`]],
        ['retyping the rest', (api) => { at(api).propDetails.data.type.rest = { kind: 'number' }; }, [`replace ${prefix}propDetails/data/type/rest/kind`]],
        // A union gains a member compatibly elsewhere; the rest of a tuple is not a list of options.
        ['widening the rest', (api) => at(api).propDetails.data.type.rest.members.push({ kind: 'null' }), [`add ${prefix}propDetails/data/type/rest/members/3`]],
        ['narrowing the rest', (api) => at(api).propDetails.data.type.rest.members.pop(), [`remove ${prefix}propDetails/data/type/rest/members/2`]],
        // A tuple that is a named type's whole body.
        ['adding an element to a named tuple', (api) => at(api).types.Pair.type.elements.push({ kind: 'number' }), [`add ${prefix}types/Pair/type/elements/1`]],
        ['dropping the rest of a named tuple', (api) => { delete at(api).types.Pair.type.rest; }, [`remove ${prefix}types/Pair/type/rest`]],
        // A tuple inside a named type's member: the diff replaces the member as a whole.
        ['adding an element inside a named type\'s member', (api) => at(api).types.Quote.type.members[0].type.elements.push(block), [`add ${prefix}types/Quote/type/members/0`, `remove ${prefix}types/Quote/type/members/0`]],
        ['dropping the rest inside a named type\'s member', (api) => { delete at(api).types.Quote.type.members[0].type.rest; }, [`add ${prefix}types/Quote/type/members/0`, `remove ${prefix}types/Quote/type/members/0`]],
      ];
      for (const [name, edit, changes] of incompatible) {
        const result = classify(base, edit);
        assert.ok(paths(result).length > 0, name);
        for (const change of changes) assert.ok(paths(result).includes(change), `${name}: ${paths(result).join(', ')}`);
        assert.ok(result.changes.filter(({ path }) => /\/(?:elements|rest)(?:\/|$)/u.test(path)).every(({ effect }) => effect === 'incompatible'), `${name}: ${result.changes.map(({ path, effect }) => `${path} ${effect}`).join(', ')}`);
        assert.deepEqual([result.effect, result.versionEffect], ['incompatible', 'major'], name);
      }
      // Only a change inside a tuple is so classified: a union outside one keeps the generic rules, and so does a description.
      const widened = classify(base, (api) => {
        at(api).props.push('mode');
        at(api).propDetails.mode = { type: { kind: 'union', members: [{ kind: 'literal', value: 'a' }, { kind: 'literal', value: 'b' }] }, required: false };
      });
      assert.equal(widened.effect, 'compatible');
      const withMode = structuredClone(base);
      at(withMode.api).props.push('mode');
      at(withMode.api).propDetails.mode = { type: { kind: 'union', members: [{ kind: 'literal', value: 'a' }, { kind: 'literal', value: 'b' }] }, required: false };
      assert.equal(classify(withMode, (api) => at(api).propDetails.mode.type.members.push({ kind: 'literal', value: 'c' })).effect, 'compatible', 'a union gains a member compatibly');
      const described = classify(base, (api) => { at(api).propDetails.data.description = 'The rows.'; });
      assert.deepEqual([described.effect, described.versionEffect], ['editorial', 'patch']);
      // A new prop whose type is a tuple is a compatible addition, like any optional prop.
      const added = classify(base, (api) => {
        at(api).props.push('more');
        at(api).propDetails.more = { type: { kind: 'tuple', elements: [string], rest: string }, required: false };
      });
      assert.equal(added.effect, 'compatible', paths(added).join(', '));
    });
  }
});

test('Decision 0031: source diagnosis rejects an authored derived-only field as the compiler does', async () => {
  const { context } = await setup();
  // Text is generic over its element, which the closed grammar cannot derive, so it keeps an authored api.
  const recordPath = 'catalog/components/text/artifact.json';
  const record = JSON.parse(await readFile(resolve(repositoryRoot, recordPath), 'utf8'));
  const diagnose = (candidate) => diagnoseCanonicalSource({ context, family: 'component', record: candidate, recordPath });
  assert.equal(diagnose(record).valid, true, 'Text authors its web.react api');
  const typed = structuredClone(record);
  typed.bindings['web.react'].api.propDetails = {};
  const diagnosis = diagnose(typed);
  assert.equal(diagnosis.valid, false);
  assert.deepEqual(diagnosis.diagnostics.map(({ message, details }) => [details.source.path, message]), [
    ['$/bindings/web.react/api/propDetails', 'The canonical source is invalid: is derived only and cannot be authored'],
  ]);
  assert.throws(() => mergeDerivedApis(typed), /\$\/bindings\/web\.react\/api\/propDetails is derived only/u);
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

  // Button's web.react API is derived, so the spec axis takes its empty container from the derived block.
  const derivedAfter = structuredClone(revisionContext.derivedApis['web.react']);
  derivedAfter.api.props.push('emptyContract');
  derivedAfter.api.propDetails.emptyContract = { type: { kind: 'object', members: [] }, required: false };
  const specBeforeAxis = explainRevisions({
    family: 'component',
    record: component.record,
    bindingId: 'web.react',
    ...revisionContext,
  }).axes.find(({ name }) => name === 'bindingSpecRevision');
  const specAfterAxis = explainRevisions({
    family: 'component',
    record: component.record,
    bindingId: 'web.react',
    ...revisionContext,
    derivedApis: { 'web.react': derivedAfter },
  }).axes.find(({ name }) => name === 'bindingSpecRevision');
  const emptyMembers = '$/binding/api/propDetails/emptyContract/type/members';
  assert.notEqual(specBeforeAxis.digest, specAfterAxis.digest);
  assert.equal(specBeforeAxis.normalizedInputs.some(({ path }) => path === emptyMembers), false);
  assert.deepEqual(specAfterAxis.normalizedInputs.find(({ path }) => path === emptyMembers).value, []);
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
    '@muxui/docs',
    '@muxui/react-playground',
    '@muxui/react-storybook',
    '@muxui/scale',
    '@muxui/catalog',
    '@muxui/react',
    '@muxui/tooling',
    '@muxui/repository-policy',
    '@muxui/figma',
  ]);
  assert.ok(closure.requiredChecks.includes('pnpm --filter @muxui/docs check'));
  assert.ok(closure.requiredChecks.includes('pnpm --filter @muxui/react-playground check'));
  assert.ok(closure.requiredChecks.includes('pnpm --filter @muxui/react-storybook check'));
  assert.ok(closure.requiredChecks.includes('pnpm --filter @muxui/scale check'));
  assert.ok(closure.requiredChecks.includes('pnpm --filter @muxui/catalog check'));
  assert.ok(closure.requiredChecks.includes('pnpm --filter @muxui/react check'));
  assert.ok(closure.requiredChecks.includes('pnpm --filter @muxui/tooling check'));
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
    '@muxui/docs',
    '@muxui/react-playground',
    '@muxui/react-storybook',
    '@muxui/scale',
    '@muxui/catalog',
    '@muxui/react',
    '@muxui/schema',
    '@muxui/tokens',
    '@muxui/tooling',
    '@muxui/repository-policy',
    '@muxui/figma',
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
  // Every component artifact the source manifest declares is diagnosed, once.
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, 'packages/catalog/catalog-sources.json'), 'utf8'));
  const declaredIds = manifest.records
    .map(({ path }) => /^catalog\/components\/([^/]+)\/artifact\.json$/u.exec(path)?.[1])
    .filter(Boolean)
    .map((slug) => `muxui:component:${slug}`);
  assert.ok(components.length > 0);
  assert.deepEqual(components.map(({ id }) => id).sort(), declaredIds.sort());
  assert.ok(examples.length >= components.length);
  assert.deepEqual(
    [...new Set(examples.map(({ record }) => record.binding.ref))].sort(),
    components.map(({ id }) => `${id}#web.react`).sort(),
  );
  for (const artifact of [...components, ...examples]) {
    // The source record, which a derived API (Decision 0031) completes only in the compiled catalog.
    const diagnosis = diagnoseCanonicalSource({
      context,
      family: artifact.kind,
      record: JSON.parse(await readFile(resolve(repositoryRoot, artifact.source.record), 'utf8')),
      recordPath: artifact.source.record,
    });
    assert.equal(diagnosis.valid, true, artifact.id);
    assert.deepEqual(diagnosis.diagnostics, [], artifact.id);
  }
});

test('E-G0.5-04: an injected stable field must couple scaffold, diff, diagnostics, and closure', async () => {
  const { context, component, revisionContext } = await setup();
  const [componentSchema, bindingSchema] = await Promise.all([
    readFile(resolve(repositoryRoot, 'packages/schema/schemas/component.schema.json'), 'utf8'),
    readFile(resolve(repositoryRoot, 'packages/schema/schemas/binding.schema.json'), 'utf8'),
  ]).then((documents) => documents.map((document) => JSON.parse(document)));
  const ownership = structuredClone(loadFieldOwnershipRegistry());
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
