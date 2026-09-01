import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildStatus } from '../advisory/capability-enrichment/generate-status.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const advisoryRoot = resolve(packageRoot, 'advisory/capability-enrichment');
const dimensions = [
  'requiredWorkflows',
  'accessibilityAndInteraction',
  'controlledAndUncontrolledState',
  'meaningfulStatesAndEvents',
  'compoundPartsAndRelationships',
  'stylingAndDomHooks',
  'advancedCapabilities',
  'explicitOmissions',
];
const dispositionVocabulary = ['adopt', 'adapt', 'defer', 'omit'];
const dimensionStatusVocabulary = ['assessed', 'unassessed'];
const sourceLockSchema = 'muxui-react-capability-enrichment-source-lock-v1';
const expectedRacSnapshot = {
  commit: '5ecb3333001313e83898cd07644227897e3bae1f',
  rootTree: 'eb6f6e25b83b2095536c4ab7671a0d977726738c',
  packageTree: 'cf646e6aba1680d1d62caa8a24d9efeae96d2251',
  docsTree: '03d35846665158610a6edfcfbc55695dc8973fb8',
  npmIntegrity: 'sha512-BMbpIgoV9aELeBrB0Y120NgoigHb5OdcJwc+4e7uSnbTbamea6lo+gqcc4LAxzMaK3Jf+7LI1oCDE6yANsmxIQ==',
};
const expectedBaseIdentity = {
  repository: 'mui/base-ui',
  package: '@base-ui/react',
  version: '1.7.0',
  tag: 'v1.7.0',
  tagObject: 'c79b80c9068936a1a39e352433900ae6cec07573',
  commit: '254f4744f0a241c20697b9eeab33402f4469a081',
  rootTree: '04588e3fd4b1807d09d439fd57b7531270f048f7',
  packagesReactTree: 'd8bab30bb90cc19ae78abdce28adf8011e95be45',
  docsTree: 'efd39d0f313a083481f17c7a693ffd1722b84fa6',
  docsSrcTree: 'a6aac28d856ac23b493dcb0c40cdeb550ef84bf3',
  npmIntegrity: 'sha512-j+8QjX44C32jrXD/qyEAGpFr70FRpGL2CY61mQd9nBPWN737CK0xxD1ceJ055rW4RtdvFDT1e7otzdlfxvsYug==',
  releaseDate: '2026-08-04',
  releaseTimestamp: '2026-08-04T19:48:08+10:00',
  retrievalDate: '2026-09-01',
};
const expectedBaseDocumentation = {
  'Button': ['docs/src/app/(docs)/react/components/button/page.mdx', '6eb3194185481942882d0462def7499a2879c9ac'],
  'Checkbox': ['docs/src/app/(docs)/react/components/checkbox/page.mdx', 'e24593de35229c9f327849e87c10d08b791d883f'],
  'Disclosure': ['docs/src/app/(docs)/react/components/collapsible/page.mdx', '34ad38f46c76eaf019391441c652083d7d832d2b'],
  'DisclosureGroup': ['docs/src/app/(docs)/react/components/accordion/page.mdx', '3cc8ff5231b3c686711985c5b63377433a1ffb18'],
  'Meter': ['docs/src/app/(docs)/react/components/meter/page.mdx', '24416675dbe0b63d36de92e30a9394d3231b5909'],
  'ProgressBar': ['docs/src/app/(docs)/react/components/progress/page.mdx', 'b5424e40c4b08353a40db6a31755c34d2fb4be79'],
  'ToggleButton': ['docs/src/app/(docs)/react/components/toggle/page.mdx', '75eac8711d56a5477e57db5cc196c9e0868f8bda'],
  'Autocomplete': ['docs/src/app/(docs)/react/components/autocomplete/page.mdx', '6407b7c3274242fd0dde32110b735c06071afd2e'],
  'CheckboxGroup': ['docs/src/app/(docs)/react/components/checkbox-group/page.mdx', '95e7ec7b01887d3a4fbfff56c70470b7861bcd2b'],
  'Form': ['docs/src/app/(docs)/react/components/form/page.mdx', '913e36d75727da3b4f9d8dfc5f32c97e9a4adbce'],
  'NumberField': ['docs/src/app/(docs)/react/components/number-field/page.mdx', '220ba1dcf368bc725ce53dca554b1a59acecd3b4'],
  'Switch': ['docs/src/app/(docs)/react/components/switch/page.mdx', 'd1e416c26a965aa2fe4db12ff59a3b8c4e7614e9'],
  'ComboBox': ['docs/src/app/(docs)/react/components/combobox/page.mdx', '48bd610f74be790c578658492409c908f41ec0df'],
  'Menu': ['docs/src/app/(docs)/react/components/menu/page.mdx', 'fcbafc8fb25bee46635b3eddd33f8a38a9034398'],
  'Select': ['docs/src/app/(docs)/react/components/select/page.mdx', '2deeaea78e8450488655addd60b2f83f506dd729'],
  'Slider': ['docs/src/app/(docs)/react/components/slider/page.mdx', 'cdb9284568cdd075926cceedc545b72cf86dc7f4'],
  'Tabs': ['docs/src/app/(docs)/react/components/tabs/page.mdx', 'bf6ff688878fdea55f811582c50b0f96a7949165'],
  'ToggleButtonGroup': ['docs/src/app/(docs)/react/components/toggle-group/page.mdx', '3b84795efda67809661cb63d185ec9230a16936d'],
  'Toolbar': ['docs/src/app/(docs)/react/components/toolbar/page.mdx', '9c9875af841b66e490b7fb731a827e62ca139225'],
  'Modal': ['docs/src/app/(docs)/react/components/dialog/page.mdx', '784a3e70a176d04369c2ced9b89cff46db03d3ef'],
  'Popover': ['docs/src/app/(docs)/react/components/popover/page.mdx', '98da7125ccd4e5f2b690023536b903275689333a'],
  'PreviewTrigger': ['docs/src/app/(docs)/react/components/preview-card/page.mdx', 'dfb68bff3904b3b19dd9ea830d83a229778ba1c9'],
  'Toast': ['docs/src/app/(docs)/react/components/toast/page.mdx', '52496ae36ebc63286067e09faf782ff00a4ae269'],
  'Tooltip': ['docs/src/app/(docs)/react/components/tooltip/page.mdx', '9c0b561b77431c01cb15534a67d8854165b6b844'],
  'RadioGroup': ['docs/src/app/(docs)/react/components/radio-group/types.md', 'ddb1565474616a84853e24eb97043a2599985979'],
};
const decisionKeys = [
  'capability',
  'disposition',
  'rationale',
  'workflowRationale',
  'proposedMuxSemantics',
  'portability',
  'apiCost',
  'testingCost',
  'proofRefs',
  'proofRequirements',
  'evidenceRefKeys',
];
const expectedTranches = {
  'R1.1': [
    'Breadcrumbs', 'Button', 'Checkbox', 'Disclosure', 'DisclosureGroup',
    'Group', 'Link', 'Meter', 'ProgressBar', 'Separator', 'ToggleButton',
  ],
  'R1.2': [
    'Autocomplete', 'CheckboxGroup', 'DateField', 'DatePicker',
    'DateRangePicker', 'Form', 'NumberField', 'SearchField', 'Switch',
    'TextField', 'TimeField',
  ],
  'R1.3': [
    'Calendar', 'ColorArea', 'ColorField', 'ColorPicker', 'ColorSlider',
    'ColorSwatch', 'ColorSwatchPicker', 'ColorWheel', 'ComboBox', 'GridList',
    'ListBox', 'Menu', 'RadioGroup', 'RangeCalendar', 'Select', 'Slider',
    'Table', 'Tabs', 'TagGroup', 'ToggleButtonGroup', 'TokenField', 'Toolbar',
    'Tree', 'Virtualizer',
  ],
  'R1.4': [
    'DropZone', 'FileTrigger', 'Modal', 'Popover', 'PreviewTrigger', 'Toast',
    'Tooltip',
  ],
};

async function readAdvisoryJson(name) {
  return JSON.parse(await readFile(join(advisoryRoot, name), 'utf8'));
}

function assertBaselineIdentity(baseline) {
  assert.deepEqual(baseline.sources.reactAriaComponents.acceptedSnapshot, expectedRacSnapshot);
  assert.deepEqual(baseline.sources.baseUi, expectedBaseIdentity);
  assert.match(expectedRacSnapshot.npmIntegrity, /^sha512-[A-Za-z0-9+/]+=*$/u);
  assert.match(expectedBaseIdentity.npmIntegrity, /^sha512-[A-Za-z0-9+/]+=*$/u);
}

function gitOutput(checkout, ...args) {
  const result = spawnSync('git', ['-C', checkout, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
}

function matrixCitedPaths(matrix, sourceKey) {
  const paths = new Set();
  for (const family of matrix.families.filter(({ status }) => status === 'assessed')) {
    for (const reference of family.evidenceRefs[sourceKey]) {
      const matches = [...reference.matchAll(/packages\/[A-Za-z0-9_./-]+/gu)];
      assert.equal(matches.length, 1, `${family.family}/${sourceKey} citation must contain exactly one packages path: ${reference}`);
      const [match] = matches;
      const suffix = reference.slice(match.index + match[0].length);
      assert.match(suffix, /^(?::\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)?(?:\s+\([^)]*\))?$/u, `${family.family}/${sourceKey} citation anchor/suffix: ${reference}`);
      paths.add(match[0]);
    }
  }
  return [...paths].sort();
}

function assertDocumentationLockShape(matrix, lock, baseline) {
  const base = lock.sources.baseUi;
  assert.equal(base.commit, baseline.sources.baseUi.commit);
  assert.deepEqual(matrix.documentationRefs, {
    baseUi: {
      sourceLock: './source-lock.json#/sources/baseUi/documentationFiles',
      commit: baseline.sources.baseUi.commit,
      families: Object.fromEntries(Object.entries(expectedBaseDocumentation).map(([family, [path]]) => [family, path])),
    },
  });
  const documentationEntries = base.documentationFiles;
  assert.equal(Array.isArray(documentationEntries), true, 'baseUi documentationFiles');
  assert.equal(documentationEntries.length, 25, 'Base UI documentation file count');
  assert.equal(new Set(documentationEntries.map(({ path }) => path)).size, documentationEntries.length, 'Base UI documentation duplicate paths');
  assert.deepEqual(
    documentationEntries.map(({ path }) => path).sort(),
    Object.values(expectedBaseDocumentation).map(([path]) => path).sort(),
    'Base UI documentation path inventory',
  );
  for (const [family, [path, blob]] of Object.entries(expectedBaseDocumentation)) {
    const entry = documentationEntries.find(({ path: candidate }) => candidate === path);
    assert.deepEqual(entry, { path, blob }, `Base UI documentation identity for ${family}`);
    assert.match(entry.path, /^docs\/src\/app\/\(docs\)\/react\/components\//u);
    assert.match(entry.blob, /^[0-9a-f]{40}$/u);
  }
  assert.equal(documentationEntries.every(({ path }) => !path.startsWith('packages/')), true, 'documentation files stay separate from package-source files');
}

function assertSourceLockShape(matrix, lock, baseline) {
  assert.equal(lock.schema, sourceLockSchema);
  assert.deepEqual(lock.policy, {
    immutableSources: true,
    noMovingRefs: true,
    noRuntimeDependency: true,
    retainedCheckoutOnly: true,
  });
  const sourceNames = {
    rac: 'reactAriaComponents',
    base: 'baseUi',
  };
  assert.deepEqual(Object.keys(lock.sources).sort(), Object.values(sourceNames).sort(), 'source lock source inventory');
  assertDocumentationLockShape(matrix, lock, baseline);
  for (const [matrixKey, lockKey] of Object.entries(sourceNames)) {
    const source = lock.sources[lockKey];
    assert.ok(source, `${lockKey} source lock`);
    const expectedCommit = matrixKey === 'rac'
      ? baseline.sources.reactAriaComponents.acceptedSnapshot.commit
      : baseline.sources.baseUi.commit;
    assert.match(source.commit, /^[0-9a-f]{40}$/u, `${lockKey} commit identity`);
    assert.equal(source.commit, expectedCommit, `${lockKey} commit`);
    const expectedPaths = matrixCitedPaths(matrix, matrixKey);
    const lockEntries = source.files;
    assert.equal(Array.isArray(lockEntries), true, `${lockKey} files`);
    assert.equal(new Set(lockEntries.map(({ path }) => path)).size, lockEntries.length, `${lockKey} duplicate paths`);
    assert.deepEqual(lockEntries.map(({ path }) => path), expectedPaths, `${lockKey} path inventory`);
    for (const entry of lockEntries) {
      assert.match(entry.path, /^packages\//u);
      assert.match(entry.blob, /^[0-9a-f]{40}$/u);
    }
  }
}

function strictCheckout(name) {
  const environmentName = name === 'reactAriaComponents' ? 'MUXUI_RAC_CHECKOUT' : 'MUXUI_BASE_UI_CHECKOUT';
  const checkout = process.env[environmentName];
  assert.ok(checkout, `strict source-lock verification requires ${environmentName}`);
  try {
    assert.equal(gitOutput(checkout, 'rev-parse', '--git-dir').length > 0, true);
  } catch (error) {
    throw new Error(`strict source-lock verification could not resolve ${environmentName}=${checkout}`, { cause: error });
  }
  return checkout;
}

function assertSourceLockAgainstCheckouts(matrix, lock, baseline) {
  assertBaselineIdentity(baseline);
  assertSourceLockShape(matrix, lock, baseline);
  const sourceNames = {
    rac: 'reactAriaComponents',
    base: 'baseUi',
  };
  for (const [matrixKey, lockKey] of Object.entries(sourceNames)) {
    const source = lock.sources[lockKey];
    const checkout = strictCheckout(lockKey);
    const expectedCommit = matrixKey === 'rac'
      ? baseline.sources.reactAriaComponents.acceptedSnapshot.commit
      : baseline.sources.baseUi.commit;
    assert.equal(gitOutput(checkout, 'rev-parse', 'HEAD'), expectedCommit, `${lockKey} checkout must be pinned`);
    assert.equal(gitOutput(checkout, 'status', '--porcelain'), '', `${lockKey} checkout must be clean`);
    assert.equal(gitOutput(checkout, 'cat-file', '-t', `${expectedCommit}^{commit}`), 'commit', `${lockKey} commit object`);
    const identity = matrixKey === 'rac'
      ? baseline.sources.reactAriaComponents.acceptedSnapshot
      : baseline.sources.baseUi;
    assert.equal(gitOutput(checkout, 'rev-parse', `${expectedCommit}^{tree}`), identity.rootTree, `${lockKey} root tree`);
    if (matrixKey === 'rac') {
      assert.equal(gitOutput(checkout, 'rev-parse', `${expectedCommit}:packages/react-aria-components`), identity.packageTree, `${lockKey} package tree`);
      assert.equal(gitOutput(checkout, 'rev-parse', `${expectedCommit}:packages/dev/s2-docs/pages/react-aria`), identity.docsTree, `${lockKey} docs tree`);
      const packageJson = JSON.parse(gitOutput(checkout, 'show', `${expectedCommit}:packages/react-aria-components/package.json`));
      assert.equal(packageJson.version, baseline.sources.reactAriaComponents.version, `${lockKey} package version`);
    } else {
      assert.equal(gitOutput(checkout, 'rev-parse', `${expectedCommit}:packages/react`), identity.packagesReactTree, `${lockKey} package tree`);
      assert.equal(gitOutput(checkout, 'rev-parse', `${expectedCommit}:docs`), identity.docsTree, `${lockKey} docs tree`);
      assert.equal(gitOutput(checkout, 'rev-parse', `${expectedCommit}:docs/src`), identity.docsSrcTree, `${lockKey} docs source tree`);
      const packageJson = JSON.parse(gitOutput(checkout, 'show', `${expectedCommit}:packages/react/package.json`));
      assert.equal(packageJson.name, baseline.sources.baseUi.package, `${lockKey} package name`);
      assert.equal(packageJson.version, baseline.sources.baseUi.version, `${lockKey} package version`);
      assert.equal(gitOutput(checkout, 'cat-file', '-t', identity.tagObject), 'tag', `${lockKey} annotated tag object`);
      assert.equal(gitOutput(checkout, 'rev-parse', `${identity.tag}^{tag}`), identity.tagObject, `${lockKey} tag object identity`);
      assert.equal(gitOutput(checkout, 'rev-parse', `${identity.tag}^{}`), identity.commit, `${lockKey} peeled tag commit`);
    }
    for (const entry of source.files) {
      assert.equal(gitOutput(checkout, 'cat-file', '-e', `${expectedCommit}:${entry.path}`), '', `${lockKey}/${entry.path} must exist`);
      assert.equal(gitOutput(checkout, 'cat-file', '-t', `${expectedCommit}:${entry.path}`), 'blob', `${lockKey}/${entry.path} must be a file`);
      assert.equal(gitOutput(checkout, 'rev-parse', `${expectedCommit}:${entry.path}`), entry.blob, `${lockKey}/${entry.path} blob drift`);
    }
    if (lockKey === 'baseUi') {
      for (const entry of source.documentationFiles) {
        assert.equal(gitOutput(checkout, 'cat-file', '-e', `${expectedCommit}:${entry.path}`), '', `${lockKey}/${entry.path} must exist`);
        assert.equal(gitOutput(checkout, 'cat-file', '-t', `${expectedCommit}:${entry.path}`), 'blob', `${lockKey}/${entry.path} must be a file`);
        assert.equal(gitOutput(checkout, 'rev-parse', `${expectedCommit}:${entry.path}`), entry.blob, `${lockKey}/${entry.path} blob drift`);
      }
    }
  }
}

const strictRequested = process.env.MUXUI_CAPABILITY_ENRICHMENT_STRICT === '1';

test('capability-enrichment baseline records exact immutable source identities', async () => {
  const baseline = await readAdvisoryJson('baseline.json');
  assert.equal(baseline.schema, 'muxui-react-capability-enrichment-baseline-v1');
  assert.equal(baseline.status, 'locked');
  assert.equal(baseline.advisoryOnly, true);
  assert.equal(baseline.evidenceRole, 'input-only');
  assertBaselineIdentity(baseline);
  assert.deepEqual(baseline.sources.muxUi, {
    repository: 'ndrewtran/muxui',
    commit: '933dc0e25eb0745d86154c2d0ad06962f8c1d9b9',
  });
  assert.deepEqual(baseline.sources.reactAriaComponents.acceptedSnapshot, {
    commit: '5ecb3333001313e83898cd07644227897e3bae1f',
    rootTree: 'eb6f6e25b83b2095536c4ab7671a0d977726738c',
    packageTree: 'cf646e6aba1680d1d62caa8a24d9efeae96d2251',
    docsTree: '03d35846665158610a6edfcfbc55695dc8973fb8',
    npmIntegrity: 'sha512-BMbpIgoV9aELeBrB0Y120NgoigHb5OdcJwc+4e7uSnbTbamea6lo+gqcc4LAxzMaK3Jf+7LI1oCDE6yANsmxIQ==',
  });
  assert.deepEqual(baseline.sources.baseUi, {
    repository: 'mui/base-ui',
    package: '@base-ui/react',
    version: '1.7.0',
    tag: 'v1.7.0',
    tagObject: 'c79b80c9068936a1a39e352433900ae6cec07573',
    commit: '254f4744f0a241c20697b9eeab33402f4469a081',
    rootTree: '04588e3fd4b1807d09d439fd57b7531270f048f7',
    packagesReactTree: 'd8bab30bb90cc19ae78abdce28adf8011e95be45',
    docsTree: 'efd39d0f313a083481f17c7a693ffd1722b84fa6',
    docsSrcTree: 'a6aac28d856ac23b493dcb0c40cdeb550ef84bf3',
    npmIntegrity: 'sha512-j+8QjX44C32jrXD/qyEAGpFr70FRpGL2CY61mQd9nBPWN737CK0xxD1ceJ055rW4RtdvFDT1e7otzdlfxvsYug==',
    releaseDate: '2026-08-04',
    releaseTimestamp: '2026-08-04T19:48:08+10:00',
    retrievalDate: '2026-09-01',
  });
  assert.deepEqual(baseline.policy.runtimeDependenciesAdded, []);
  assert.equal(baseline.policy.immutableSources, true);
  assert.equal(baseline.policy.noMovingRefs, true);
  assert.equal(baseline.policy.noRuntimeDependency, true);
});

test('capability-enrichment baseline rejects missing immutable identities', async () => {
  const baseline = await readAdvisoryJson('baseline.json');
  const omissions = [
    ['reactAriaComponents', 'rootTree'],
    ['reactAriaComponents', 'packageTree'],
    ['reactAriaComponents', 'docsTree'],
    ['reactAriaComponents', 'npmIntegrity'],
    ['baseUi', 'rootTree'],
    ['baseUi', 'packagesReactTree'],
    ['baseUi', 'docsTree'],
    ['baseUi', 'docsSrcTree'],
    ['baseUi', 'tagObject'],
    ['baseUi', 'commit'],
    ['baseUi', 'version'],
    ['baseUi', 'npmIntegrity'],
  ];
  for (const [sourceName, key] of omissions) {
    const changed = structuredClone(baseline);
    const source = sourceName === 'reactAriaComponents'
      ? changed.sources.reactAriaComponents.acceptedSnapshot
      : changed.sources.baseUi;
    delete source[key];
    assert.throws(() => assertBaselineIdentity(changed), new RegExp(key, 'u'), `${sourceName}.${key} omission`);
  }
});

test('capability-enrichment source lock resolves every cited frozen file and rejects drift', async () => {
  const baseline = await readAdvisoryJson('baseline.json');
  const matrix = await readAdvisoryJson('matrix.json');
  const lock = await readAdvisoryJson('source-lock.json');
  assert.doesNotThrow(() => assertSourceLockShape(matrix, lock, baseline));

  const missingCitation = structuredClone(matrix);
  missingCitation.families.find(({ family }) => family === 'Autocomplete').evidenceRefs.rac[0] = 'packages/react-aria-components/src/NotARealFile.tsx:1-2';
  assert.throws(() => assertSourceLockShape(missingCitation, lock, baseline), /path inventory/u);

  const alternateExtension = structuredClone(matrix);
  alternateExtension.families.find(({ family }) => family === 'Autocomplete').evidenceRefs.rac[0] = 'packages/react-aria-components/src/Autocomplete.txt:1-2';
  assert.throws(() => assertSourceLockShape(alternateExtension, lock, baseline), /path inventory/u);

  const unparseableCitation = structuredClone(matrix);
  unparseableCitation.families.find(({ family }) => family === 'Autocomplete').evidenceRefs.rac[0] = 'unparseable upstream citation';
  assert.throws(() => assertSourceLockShape(unparseableCitation, lock, baseline), /exactly one packages path/u);

  const multiplePathCitation = structuredClone(matrix);
  multiplePathCitation.families.find(({ family }) => family === 'Autocomplete').evidenceRefs.rac[0] = 'packages/react-aria-components/src/Autocomplete.tsx:1-2 plus packages/react-aria-components/src/ComboBox.tsx:1-2';
  assert.throws(() => assertSourceLockShape(multiplePathCitation, lock, baseline), /exactly one packages path/u);

  const duplicatePath = structuredClone(lock);
  duplicatePath.sources.reactAriaComponents.files.push({ ...duplicatePath.sources.reactAriaComponents.files[0] });
  assert.throws(() => assertSourceLockShape(matrix, duplicatePath, baseline), /duplicate paths/u);

  const malformedBlob = structuredClone(lock);
  malformedBlob.sources.reactAriaComponents.files[0].blob = 'not-a-blob';
  assert.throws(() => assertSourceLockShape(matrix, malformedBlob, baseline), /blob/u);

  const changedCommit = structuredClone(lock);
  changedCommit.sources.reactAriaComponents.commit = '0'.repeat(40);
  assert.throws(() => assertSourceLockShape(matrix, changedCommit, baseline), /commit/u);

  const missingDocumentation = structuredClone(lock);
  missingDocumentation.sources.baseUi.documentationFiles.pop();
  assert.throws(() => assertSourceLockShape(matrix, missingDocumentation, baseline), /documentation file count/u);

  const changedDocumentationBlob = structuredClone(lock);
  changedDocumentationBlob.sources.baseUi.documentationFiles[0].blob = '0'.repeat(40);
  assert.throws(() => assertSourceLockShape(matrix, changedDocumentationBlob, baseline), /documentation identity/u);

  const changedDocumentationPath = structuredClone(lock);
  changedDocumentationPath.sources.baseUi.documentationFiles[0].path = 'docs/src/app/(docs)/react/components/checkbox/page.txt';
  assert.throws(() => assertSourceLockShape(matrix, changedDocumentationPath, baseline), /documentation path inventory/u);
});

test('strict source lock resolves exact retained git objects when explicitly requested', { skip: !strictRequested }, async () => {
  const baseline = await readAdvisoryJson('baseline.json');
  const matrix = await readAdvisoryJson('matrix.json');
  const lock = await readAdvisoryJson('source-lock.json');
  assertSourceLockAgainstCheckouts(matrix, lock, baseline);
});

test('capability-enrichment status is a deterministic, advisory-only traceability projection', async () => {
  const matrix = await readAdvisoryJson('matrix.json');
  const status = await readAdvisoryJson('implementation-status.json');
  assert.equal(status.schema, 'muxui-react-capability-enrichment-status-v1');
  assert.equal(status.status, 'complete');
  assert.equal(status.advisoryOnly, true);
  assert.deepEqual(status.key, ['family', 'dimension', 'capability']);
  assert.deepEqual(status.implementedDispositions, ['adopt', 'adapt']);
  assert.deepEqual(status.nonImplementationDispositions, ['defer', 'omit']);
  assert.deepEqual(status.counts, {
    families: 53,
    decisions: 433,
    implemented: 303,
    adopt: 180,
    adapt: 123,
    defer: 47,
    omit: 83,
  });
  const expectedStatus = await buildStatus(matrix);
  assert.deepEqual(status, expectedStatus);
  const statusEntries = Object.entries(status.entries);
  assert.equal(statusEntries.length, 303);
  const matrixEntries = new Map();
  for (const family of matrix.families) {
    for (const [dimension, cell] of Object.entries(family.dimensions)) {
      for (const decision of cell.decisions) {
        const key = `${family.family}/${dimension}/${decision.capability}`;
        matrixEntries.set(key, { family, dimension, decision });
      }
    }
  }
  for (const [key, entry] of statusEntries) {
    const source = matrixEntries.get(key);
    assert.ok(source, `status key ${key} must map to one matrix decision`);
    assert.equal(source.decision.disposition === 'adopt' || source.decision.disposition === 'adapt', true);
    assert.equal(entry.implementation, 'implemented');
    assert.deepEqual(entry.owners.artifact, {
      path: source.family.canonical.artifactRef,
      id: source.family.canonical.componentId,
    });
    assert.deepEqual(entry.owners.binding, {
      path: `${source.family.canonical.artifactRef}#bindings/${source.family.canonical.bindingProfile}`,
      profile: 'web.react',
      lifecycle: 'experimental',
      strategy: 'direct',
    });
    assert.equal(entry.runtime.length, 1, `${key} must have one runtime owner`);
    for (const runtime of entry.runtime) {
      assert.equal(typeof runtime.path, 'string');
      assert.equal(runtime.lines === null || typeof runtime.lines === 'string', true);
      assert.match(runtime.anchor, /^#[A-Za-z][A-Za-z0-9]*$/u);
    }
    assert.equal(entry.proof.length, source.decision.proofRefs.length, `${key} proof count`);
    for (const proof of entry.proof) {
      assert.equal(typeof proof.path, 'string');
      assert.equal(proof.anchor === null || typeof proof.anchor === 'string', true);
    }
  }
  const dropZoneRuntime = statusEntries
    .find(([, entry]) => entry.family === 'DropZone' && entry.dimension === 'requiredWorkflows')?.[1].runtime[0];
  assert.deepEqual(dropZoneRuntime, {
    path: 'packages/react/src/overlays.mjs',
    lines: '97-129',
    anchor: '#DropZone',
  });
  for (const [key, source] of matrixEntries) {
    if (source.decision.disposition === 'defer' || source.decision.disposition === 'omit') {
      assert.equal(Object.hasOwn(status.entries, key), false, `${key} must not claim implementation`);
    }
  }
  const regenerationCheck = spawnSync(process.execPath, [
    'advisory/capability-enrichment/generate-status.mjs', '--check',
  ], { cwd: packageRoot, encoding: 'utf8' });
  assert.equal(regenerationCheck.status, 0, regenerationCheck.stderr);

  const changedCanonical = structuredClone(matrix);
  changedCanonical.families[0].canonical.artifactRef = 'catalog/components/not-a-component/artifact.json';
  await assert.rejects(() => buildStatus(changedCanonical), /MISSING_PATH/u);

  const changedRuntime = structuredClone(matrix);
  changedRuntime.families[0].evidenceRefs.mux[1] = 'packages/react/src/not-a-runtime.mjs#Breadcrumbs';
  await assert.rejects(() => buildStatus(changedRuntime), /MISSING_PATH/u);

  const changedRuntimeAnchor = structuredClone(matrix);
  changedRuntimeAnchor.families[0].evidenceRefs.mux[1] = 'packages/react/src/components.mjs#import';
  await assert.rejects(() => buildStatus(changedRuntimeAnchor), /RUNTIME_ANCHOR/u);

  const changedRuntimeWrongExport = structuredClone(matrix);
  changedRuntimeWrongExport.families[0].evidenceRefs.mux[1] = 'packages/react/src/components.mjs#Checkbox';
  await assert.rejects(() => buildStatus(changedRuntimeWrongExport), /RUNTIME_ANCHOR/u);

  const changedMultiAnchor = structuredClone(matrix);
  const dropZone = changedMultiAnchor.families.find(({ family }) => family === 'DropZone');
  dropZone.dimensions.requiredWorkflows.decisions[0].proofRefs[0] =
    'catalog/components/drop-zone/artifact.json#bindings/web.react#ignored';
  await assert.rejects(() => buildStatus(changedMultiAnchor), /REFERENCE_ANCHOR/u);

  const changedProof = structuredClone(matrix);
  changedProof.families[0].dimensions.requiredWorkflows.decisions[0].proofRefs = ['packages/react/test/not-a-proof.mjs'];
  await assert.rejects(() => buildStatus(changedProof), /PROOF_NAMESPACE/u);

  const unrelatedProof = structuredClone(matrix);
  unrelatedProof.families[0].dimensions.requiredWorkflows.decisions[0].proofRefs = ['package.json'];
  await assert.rejects(() => buildStatus(unrelatedProof), /PROOF_NAMESPACE/u);

  const changedDisposition = structuredClone(matrix);
  changedDisposition.families[0].dimensions.requiredWorkflows.decisions[0].disposition = 'defer';
  await assert.rejects(() => buildStatus(changedDisposition), /IMPLEMENTED_COUNT/u);
});

test('capability-enrichment matrix assesses all R1.1 through R1.4 families in the structured eight-dimension schema', async () => {
  const matrix = await readAdvisoryJson('matrix.json');
  assert.equal(matrix.schema, 'muxui-react-capability-enrichment-matrix-v1');
  assert.equal(matrix.status, 'complete');
  assert.equal(matrix.advisoryOnly, true);
  assert.deepEqual(matrix.dimensions, dimensions);
  assert.deepEqual(matrix.dispositionVocabulary, dispositionVocabulary);
  assert.deepEqual(matrix.dimensionStatusVocabulary, dimensionStatusVocabulary);
  assert.deepEqual(matrix.tranches, expectedTranches);
  assert.deepEqual(matrix.documentationRefs.baseUi, {
    sourceLock: './source-lock.json#/sources/baseUi/documentationFiles',
    commit: '254f4744f0a241c20697b9eeab33402f4469a081',
    families: Object.fromEntries(Object.entries(expectedBaseDocumentation).map(([family, [path]]) => [family, path])),
  });
  assert.deepEqual(matrix.implementationTraceability, {
    statusProjection: './implementation-status.json',
    generator: './generate-status.mjs',
    key: ['family', 'dimension', 'capability'],
    implementedDispositions: ['adopt', 'adapt'],
    nonImplementationDispositions: ['defer', 'omit'],
    ownerSources: {
      artifact: 'family.canonical.artifactRef',
      binding: 'family.canonical.bindingProfile',
      runtime: 'family.evidenceRefs.mux package source reference',
      proof: 'decision.proofRefs',
    },
  });
  assert.equal(matrix.assessedFamilyCount, 53);
  assert.equal(matrix.unassessedFamilyCount, 0);
  assert.match(matrix.evidenceRefPolicy, /inherited by each assessed dimension and decision/u);
  assert.match(matrix.capabilityDecisionPolicy, /Every assessed decision names exactly one capability/u);

  const expectedFamilies = Object.values(expectedTranches).flat();
  assert.equal(matrix.families.length, 53);
  assert.equal(new Set(matrix.families.map(({ family }) => family)).size, 53);
  assert.equal(matrix.families.reduce((count, { dimensions: familyDimensions }) => count + Object.keys(familyDimensions).length, 0), 424);
  assert.equal(matrix.families.every(({ status }) => status === 'assessed'), true);
  assert.deepEqual(matrix.families.map(({ family }) => family), expectedFamilies);
  assert.equal(matrix.families.filter(({ tranche }) => tranche === 'R1.1').length, 11);
  assert.equal(matrix.families.filter(({ tranche }) => tranche === 'R1.2').length, 11);
  assert.equal(matrix.families.filter(({ tranche, status }) => tranche === 'R1.2' && status === 'assessed').length, 11);
  assert.equal(matrix.families.filter(({ tranche, status }) => tranche === 'R1.3' && status === 'assessed').length, 24);
  assert.equal(matrix.families.filter(({ tranche, status }) => tranche === 'R1.4' && status === 'assessed').length, 7);
  for (const [index, entry] of matrix.families.entries()) {
    const tranche = Object.entries(expectedTranches)
      .find(([, families]) => families.includes(entry.family))?.[0];
    assert.equal(entry.tranche, tranche);
    const assessedTranche = tranche === 'R1.1' || tranche === 'R1.2' || tranche === 'R1.3' || tranche === 'R1.4';
    assert.equal(entry.status, assessedTranche ? 'assessed' : 'unassessed');
    const slug = entry.family === 'Modal'
      ? 'dialog'
      : entry.family.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    assert.deepEqual(entry.canonical, {
      artifactRef: `catalog/components/${slug}/artifact.json`,
      componentId: `muxui:component:${slug}`,
      bindingProfile: 'web.react',
    });
    assert.deepEqual(Object.keys(entry.dimensions), dimensions);
    if (assessedTranche) {
      assert.deepEqual(Object.keys(entry.evidenceRefs), ['mux', 'rac', 'base']);
      for (const refs of Object.values(entry.evidenceRefs)) {
        assert.ok(refs.length >= 1);
        for (const ref of refs) assert.equal(typeof ref, 'string');
      }
      assert.equal(entry.evidenceRefs.rac.some((ref) => /^packages\/react-aria-components\//u.test(ref)), true);
      assert.match(entry.evidenceRefs.base[0], /packages\/react\//u);
      if (tranche === 'R1.2' || tranche === 'R1.3') {
        assert.equal(entry.evidenceRefs.mux.some((ref) => ref.startsWith('catalog/components/')), true);
        assert.equal(entry.evidenceRefs.rac.some((ref) => ref.includes('packages/dev/s2-docs/pages/react-aria/')), true);
      }
    } else {
      assert.equal(entry.evidenceRefs, undefined);
    }
    for (const dimension of dimensions) {
      const cell = entry.dimensions[dimension];
      assert.deepEqual(Object.keys(cell), ['status', 'summary', 'decisions']);
      if (!assessedTranche) {
        assert.deepEqual(cell, {
          status: 'unassessed',
          summary: null,
          decisions: [],
        });
        continue;
      }
      assert.equal(cell.status, 'assessed');
      assert.equal(typeof cell.summary, 'string');
      assert.ok(cell.decisions.length >= 1);
      if (tranche === 'R1.2' || tranche === 'R1.3' || tranche === 'R1.4') assert.equal(new Set(cell.decisions.map(({ capability }) => capability)).size, cell.decisions.length);
      for (const decision of cell.decisions) {
        assert.deepEqual(new Set(Object.keys(decision)), new Set(decisionKeys));
        assert.equal(typeof decision.capability, 'string');
        assert.ok(decision.capability.length > 0);
        assert.equal(dispositionVocabulary.includes(decision.disposition), true);
        for (const key of decisionKeys.slice(1, 7)) assert.equal(typeof decision[key], 'string');
        assert.equal(typeof decision.testingCost, 'string');
        assert.equal(Array.isArray(decision.proofRefs), true);
        assert.equal(Array.isArray(decision.proofRequirements), true);
        assert.deepEqual(decision.evidenceRefKeys, ['mux', 'rac', 'base']);
        assert.ok(decision.proofRefs.length >= 1);
        assert.ok(decision.proofRequirements.length >= 1);
      }
    }
    assert.equal(entry.family, expectedFamilies[index]);
  }
  const assessed = Object.fromEntries(matrix.families
    .filter(({ status }) => status === 'assessed')
    .map((entry) => [entry.family, entry]));
  assert.equal(assessed.Breadcrumbs.dimensions.meaningfulStatesAndEvents.decisions[0].disposition, 'adapt');
  assert.equal(assessed.ProgressBar.dimensions.meaningfulStatesAndEvents.decisions[0].disposition, 'adapt');
  assert.equal(assessed.ToggleButton.dimensions.compoundPartsAndRelationships.decisions[0].disposition, 'defer');
  for (const family of ['Breadcrumbs', 'Group', 'Link', 'Separator', 'Button', 'Meter', 'ProgressBar']) {
    const decision = assessed[family].dimensions.controlledAndUncontrolledState.decisions[0];
    const expectedCapability = ['Button'].includes(family)
      ? 'public value state ownership'
      : ['Meter', 'ProgressBar'].includes(family)
        ? 'public mutable value and callback ownership'
        : 'public state ownership';
    assert.equal(decision.capability, expectedCapability);
    assert.equal(decision.disposition, 'omit');
    assert.match(decision.rationale, /no controlled or uncontrolled|no mutable state|read-only display value|has no controlled or uncontrolled state/u);
  }

  const r13Decision = (family, dimension) => assessed[family].dimensions[dimension].decisions[0];
  const r13Capability = (family, dimension, pattern) => assessed[family].dimensions[dimension].decisions.find(({ capability }) => pattern.test(capability));
  assert.equal(r13Decision('Calendar', 'meaningfulStatesAndEvents').disposition, 'adapt');
  assert.match(r13Decision('Calendar', 'meaningfulStatesAndEvents').capability, /unavailable/iu);
  assert.equal(r13Decision('RangeCalendar', 'controlledAndUncontrolledState').disposition, 'adapt');
  assert.match(r13Decision('RangeCalendar', 'controlledAndUncontrolledState').capability, /focused/u);
  assert.equal(r13Decision('RangeCalendar', 'meaningfulStatesAndEvents').disposition, 'adapt');
  assert.match(r13Decision('RangeCalendar', 'meaningfulStatesAndEvents').capability, /unavailable/iu);
  assert.equal(r13Decision('Select', 'controlledAndUncontrolledState').disposition, 'adopt');
  assert.match(r13Decision('Select', 'controlledAndUncontrolledState').capability, /open\/defaultOpen/u);
  const tableSorting = r13Capability('Table', 'controlledAndUncontrolledState', /sorting/u);
  assert.equal(tableSorting.disposition, 'adopt');
  assert.match(tableSorting.proposedMuxSemantics, /column: string/u);
  assert.match(tableSorting.proposedMuxSemantics, /ascending.*descending/u);
  assert.match(tableSorting.proposedMuxSemantics, /sortDescriptor\?:/u);
  assert.match(tableSorting.proposedMuxSemantics, /onSortChange\(next: \{column: string; direction: "ascending" \| "descending"\}\)/u);
  assert.doesNotMatch(tableSorting.proposedMuxSemantics, /onSortChange\(next\?:/u);
  assert.match(tableSorting.proposedMuxSemantics, /consumer clears by setting sortDescriptor to undefined.*no separate clear callback/u);
  assert.doesNotMatch(tableSorting.proposedMuxSemantics, /\bsort\?:/u);
  assert.match(tableSorting.proposedMuxSemantics, /never auto-sorts/u);
  const tableSortEvents = r13Capability('Table', 'meaningfulStatesAndEvents', /sorting/u);
  assert.equal(tableSortEvents.disposition, 'adopt');
  assert.match(tableSortEvents.proposedMuxSemantics, /onSortChange\(next: \{column: string; direction: "ascending" \| "descending"\}\)/u);
  assert.doesNotMatch(tableSortEvents.proposedMuxSemantics, /onSortChange\(next\?:/u);
  assert.match(tableSortEvents.proposedMuxSemantics, /clearing is consumer-controlled by setting sortDescriptor to undefined.*no separate clear callback/u);
  assert.equal(r13Decision('Tabs', 'meaningfulStatesAndEvents').disposition, 'adopt');
  assert.match(r13Decision('Tabs', 'meaningfulStatesAndEvents').capability, /keyboard activation/u);
  assert.equal(r13Decision('ToggleButtonGroup', 'controlledAndUncontrolledState').disposition, 'adapt');
  assert.match(r13Decision('ToggleButtonGroup', 'controlledAndUncontrolledState').capability, /selectionMode/u);
  assert.equal(r13Decision('ColorWheel', 'advancedCapabilities').disposition, 'adapt');
  const colorWheelGeometry = r13Decision('ColorWheel', 'advancedCapabilities');
  assert.match(colorWheelGeometry.capability, /outerRadius.*innerRadius/u);
  assert.match(colorWheelGeometry.proposedMuxSemantics, /outerRadius\?: number defaults to 96 and innerRadius\?: number defaults to 64/u);
  for (const family of ['ColorArea', 'ColorSlider', 'ColorWheel', 'ColorSwatchPicker', 'Slider']) {
    const colorReadOnly = r13Decision(family, 'accessibilityAndInteraction');
    assert.equal(colorReadOnly.disposition, 'adapt');
    assert.match(colorReadOnly.capability, /readOnly/u);
    assert.match(colorReadOnly.proposedMuxSemantics, /aria-readonly=true and data-readonly=true/iu);
    assert.match(colorReadOnly.proposedMuxSemantics, /before interactive paint/iu);
    assert.match(colorReadOnly.testingCost, /commit-synchronous/iu);
    assert.match(colorReadOnly.testingCost, /SSR|owned listbox/iu);
    assert.match(colorReadOnly.proofRequirements.join(' '), /synchronous/iu);
  }
  const colorPickerReadOnly = r13Decision('ColorPicker', 'accessibilityAndInteraction');
  assert.match(colorPickerReadOnly.proposedMuxSemantics, /inherited Mux readOnly.*every actual interactive input\/listbox.*both ColorArea axes/iu);
  assert.match(colorPickerReadOnly.proposedMuxSemantics, /SSR attributes.*deferred/iu);
  assert.match(colorPickerReadOnly.testingCost, /SSR root hooks/iu);
  assert.match(colorPickerReadOnly.testingCost, /commit-synchronous.*every supported input\/listbox/iu);
  for (const family of ['ColorArea', 'ColorPicker', 'ColorSlider', 'ColorWheel']) {
    assert.equal(assessed[family].evidenceRefs.rac.some((ref) => ref.startsWith('packages/react-aria-components/src/ColorThumb.tsx:1-137')), true, `${family} private ColorThumb evidence`);
  }
  assert.equal(r13Decision('Slider', 'meaningfulStatesAndEvents').disposition, 'adopt');
  const sliderCommit = r13Decision('Slider', 'meaningfulStatesAndEvents');
  assert.match(sliderCommit.capability, /onChangeEnd/u);
  assert.match(sliderCommit.proposedMuxSemantics, /enabled\/editable interaction enters and then exits the active adjustment lifecycle/u);
  assert.match(sliderCommit.proposedMuxSemantics, /handled keyboard key action.*repeats as separate actions.*clamped\/unchanged boundary keys/u);
  assert.match(sliderCommit.proposedMuxSemantics, /pointer\/touch release after press\/drag even if the value is unchanged where RAC ends dragging/u);
  assert.match(sliderCommit.proposedMuxSemantics, /pointer-cancel actually ends the RAC move lifecycle/u);
  assert.match(sliderCommit.proposedMuxSemantics, /disabled\/readOnly input.*controlled rerenders.*lifecycle that never reaches an end transition emit no synthetic onChangeEnd/iu);
  assert.match(sliderCommit.testingCost, /repeated and clamped\/unchanged boundary keys.*pointer\/touch commit on release after press\/drag even when the value is unchanged.*pointer-cancel ends the RAC move lifecycle/u);
  assert.match(sliderCommit.proofRequirements.join(' '), /disabled\/readOnly input, controlled rerenders, and lifecycles without an end transition emit no synthetic callback/u);
  assert.doesNotMatch(sliderCommit.proposedMuxSemantics, /changed-value-only|changed value filter/u);
  assert.equal(assessed.Slider.evidenceRefs.rac.some((ref) => ref.startsWith('packages/react-aria/src/slider/useSliderThumb.ts:94-100,145-176,178-214,216-247,254-305')), true);
  assert.equal(assessed.Slider.evidenceRefs.rac.some((ref) => ref.startsWith('packages/react-stately/src/slider/useSliderState.ts:19-49,246-326')), true);
  assert.equal(r13Decision('Virtualizer', 'advancedCapabilities').disposition, 'adapt');
  const virtualizerOverscan = r13Decision('Virtualizer', 'advancedCapabilities');
  assert.match(virtualizerOverscan.capability, /overscan/u);
  assert.match(virtualizerOverscan.proposedMuxSemantics, /nonnegative integer row count per edge, default 2/u);
  assert.match(virtualizerOverscan.proposedMuxSemantics, /Mux-owned fixed-row ListLayout\/visible-rect adapter rather than inheriting RAC OverscanManager/u);
  assert.match(virtualizerOverscan.testingCost, /symmetric start\/middle\/end windows.*0, 1, and 2/u);
  assert.match(virtualizerOverscan.proofRequirements.join(' '), /symmetric row-count-per-edge contract at start, middle, and end for values 0, 1, and 2/u);
  assert.equal(assessed.Virtualizer.evidenceRefs.rac.some((ref) => ref.startsWith('packages/react-stately/src/virtualizer/OverscanManager.ts:16-52')), true);
  assert.equal(assessed.Virtualizer.evidenceRefs.rac.some((ref) => ref.startsWith('packages/react-stately/src/virtualizer/Virtualizer.ts:25-48,73-90,242-259,352-388')), true);
  assert.equal(r13Decision('RadioGroup', 'accessibilityAndInteraction').disposition, 'adopt');
  assert.match(r13Decision('RadioGroup', 'accessibilityAndInteraction').capability, /orientation/u);
  assert.equal(r13Decision('ColorPicker', 'compoundPartsAndRelationships').disposition, 'adapt');
  assert.match(r13Decision('ColorPicker', 'compoundPartsAndRelationships').capability, /children/u);
  assert.equal(r13Decision('ColorArea', 'advancedCapabilities').disposition, 'defer');
  assert.match(r13Decision('ColorArea', 'advancedCapabilities').proposedMuxSemantics, /invalid/u);
  assert.equal(r13Decision('GridList', 'accessibilityAndInteraction').disposition, 'adapt');
  assert.match(r13Decision('GridList', 'accessibilityAndInteraction').capability, /disabled/u);
  assert.equal(r13Decision('Menu', 'meaningfulStatesAndEvents').disposition, 'adapt');
  assert.match(r13Decision('Menu', 'meaningfulStatesAndEvents').proposedMuxSemantics, /onAction.*onSelect/u);
  assert.equal(r13Decision('Toolbar', 'explicitOmissions').disposition, 'omit');
  assert.match(r13Decision('Toolbar', 'explicitOmissions').capability, /disabled/u);
  assert.equal(r13Decision('ComboBox', 'controlledAndUncontrolledState').disposition, 'adapt');
  assert.match(r13Decision('ComboBox', 'controlledAndUncontrolledState').proposedMuxSemantics, /open/u);

  const r14Decision = (family, dimension) => assessed[family].dimensions[dimension].decisions[0];
  const r14Capability = (family, dimension, pattern) => assessed[family].dimensions[dimension].decisions.find(({ capability }) => pattern.test(capability));
  assert.match(r14Decision('DropZone', 'requiredWorkflows').capability, /drag.*clipboard.*keyboard/iu);
  const dropZoneEvents = r14Decision('DropZone', 'meaningfulStatesAndEvents');
  assert.match(dropZoneEvents.proposedMuxSemantics, /onDrop.*serializable.*onActivate/iu);
  assert.match(dropZoneEvents.testingCost, /native file and directory items/iu);
  assert.match(dropZoneEvents.testingCost, /custom string\/text items.*paste coordinates/iu);
  assert.match(dropZoneEvents.testingCost, /disabled-mid-drag.*onActivate-timer suppression/iu);
  assert.match(dropZoneEvents.testingCost, /normalized async item methods.*handler returns/iu);
  assert.match(dropZoneEvents.proofRequirements.join(' '), /disabled-mid-drag.*pending activation.*async item methods.*handler returns/iu);
  assert.equal(r14Decision('DropZone', 'advancedCapabilities').disposition, 'defer');
  assert.match(r14Decision('DropZone', 'explicitOmissions').capability, /native DragEvent.*DataTransfer/iu);
  assert.match(r14Decision('FileTrigger', 'requiredWorkflows').capability, /native file picker/iu);
  const fileTriggerEvents = r14Decision('FileTrigger', 'meaningfulStatesAndEvents');
  assert.match(fileTriggerEvents.capability, /same-file reselection.*picker cancel/iu);
  assert.match(fileTriggerEvents.proposedMuxSemantics, /reset before each press.*emit \[\] when a selected FileList is present but empty.*emit nothing for native picker cancel/iu);
  assert.match(fileTriggerEvents.proposedMuxSemantics, /native cancel and an emitted empty FileList are distinct outcomes/iu);
  assert.match(fileTriggerEvents.testingCost, /real browser.*native cancel with no callback.*selected empty FileList producing \[\]/iu);
  assert.match(fileTriggerEvents.testingCost, /same-file reselection/iu);
  assert.match(fileTriggerEvents.proofRequirements.join(' '), /native cancel is a no-op.*emitted empty FileList becomes \[\]/iu);
  assert.match(fileTriggerEvents.proofRequirements.join(' '), /real browser cancellation/iu);
  assert.equal(r14Decision('FileTrigger', 'controlledAndUncontrolledState').disposition, 'omit');
  assert.equal(r14Capability('FileTrigger', 'advancedCapabilities', /finite defaultCamera/u).disposition, 'adopt');
  assert.equal(r14Decision('Modal', 'controlledAndUncontrolledState').disposition, 'adopt');
  assert.equal(assessed.Modal.canonical.artifactRef, 'catalog/components/dialog/artifact.json');
  assert.match(r14Decision('Modal', 'requiredWorkflows').capability, /blocking modal/iu);
  const modalAccessibility = r14Decision('Modal', 'accessibilityAndInteraction');
  assert.match(modalAccessibility.proposedMuxSemantics, /dismissable=false.*no implicit close path.*no visible close.*block Escape and outside-pointer dismissal.*hidden assistive dismiss.*programmatic controlled closure.*consumer-rendered task actions.*accessible completion or exit path/iu);
  assert.match(modalAccessibility.testingCost, /nested topmost.*trigger-backed restoration.*direct-modal restoration.*removed restore target.*trigger unmount.*SSR\/hydration/iu);
  const modalEvents = r14Decision('Modal', 'meaningfulStatesAndEvents');
  assert.match(modalEvents.rationale, /Implemented event normalization.*canonical event input at \['openChange'\].*donor \['openChange', 'dismiss'\].*without publishing onDismiss or raw dismiss reasons/iu);
  assert.match(modalEvents.proposedMuxSemantics, /Implemented behavior normalizes canonical events from \['openChange', 'dismiss'\] to the public \['openChange'\] set.*converge every dismissal source on onOpenChange\(false\).*dismissable=false.*no visible close, hidden assistive dismiss, Escape, or outside-pointer dismissal.*programmatic controlled closure.*consumer-rendered task actions.*No onDismiss.*raw dismiss reason/iu);
  assert.match(modalEvents.testingCost, /every enabled dismissal source converges on onOpenChange\(false\).*absence of a hidden assistive dismiss when false/iu);
  assert.match(modalEvents.proofRequirements.join(' '), /implemented \['openChange', 'dismiss'\] to public \['openChange'\] normalization.*converge on onOpenChange\(false\).*no implicit visible, Escape, outside-pointer, or hidden assistive close/iu);
  const modalAdvanced = r14Decision('Modal', 'advancedCapabilities');
  assert.match(modalAdvanced.testingCost, /trigger unmount.*trigger-backed restoration.*direct-modal restoration.*safe removed-target handling/iu);
  assert.match(modalAdvanced.testingCost, /SSR\/hydration/iu);
  assert.equal(r14Capability('Modal', 'advancedCapabilities', /custom portal containers/u).disposition, 'defer');
  assert.match(r14Decision('Modal', 'stylingAndDomHooks').testingCost, /Storybook contrast/iu);
  assert.equal(r14Decision('Popover', 'controlledAndUncontrolledState').disposition, 'adopt');
  const popoverEvents = r14Decision('Popover', 'meaningfulStatesAndEvents');
  assert.match(popoverEvents.rationale, /Implemented event normalization.*canonical event input at \['openChange'\].*donor \['openChange', 'dismiss'\].*without a public onDismiss\/reason event/iu);
  assert.match(popoverEvents.proposedMuxSemantics, /Implemented behavior normalizes canonical events from \['openChange', 'dismiss'\] to the public \['openChange'\] set.*converge every dismissal source on onOpenChange\(false\).*Do not publish onDismiss.*conceptual dismiss event/iu);
  assert.match(popoverEvents.testingCost, /implemented event normalization.*each dismissal source converges on onOpenChange\(false\).*no public onDismiss\/reason event/iu);
  assert.match(popoverEvents.proofRequirements.join(' '), /implemented \['openChange', 'dismiss'\] to public \['openChange'\] normalization.*raw pointer\/focus reasons remain private.*no onDismiss\/reason event is public/iu);
  const popoverPositioning = r14Capability('Popover', 'advancedCapabilities', /finite placement/u);
  assert.equal(popoverPositioning.disposition, 'adapt');
  assert.match(popoverPositioning.proposedMuxSemantics, /placement\?:.*default "bottom".*offset\?: finite number default 8.*crossOffset\?: finite number default 0.*shouldFlip\?: boolean default true.*containerPadding\?: nonnegative finite number default 12/u);
  assert.match(popoverPositioning.rationale, /adapter-owned.*not a donor-parity promise/iu);
  assert.match(popoverPositioning.proposedMuxSemantics, /shouldFlip only enables opposing-side fallback.*boundary shifting\/collision adjustment may still occur/iu);
  assert.match(popoverPositioning.portability, /Base side\/align.*advisory portability evidence only/iu);
  assert.match(popoverPositioning.testingCost, /shouldFlip=false.*opposing-side fallback.*boundary shifting\/collision/iu);
  assert.match(popoverPositioning.testingCost, /RTL start\/end/iu);
  assert.equal(r14Decision('PreviewTrigger', 'accessibilityAndInteraction').disposition, 'adapt');
  const previewAccessibility = r14Decision('PreviewTrigger', 'accessibilityAndInteraction');
  assert.match(previewAccessibility.rationale, /direct Mux-owned adapter state, not donor parity.*child-control mutation/iu);
  assert.match(previewAccessibility.proposedMuxSemantics, /disabled.*cancel pending timers\/interactions.*exactly one onOpenChange\(false\) request if it was open or pending.*while disabled ignore open\/trigger attempts.*uncontrolled state stays closed after re-enable.*controlled state remains the owner.*masked while disabled.*visible again after re-enable.*trigger remains focusable unless.*aria-disabled=true.*data-disabled.*without changing native disabled/iu);
  assert.match(previewAccessibility.proposedMuxSemantics, /Host triggers.*custom triggers that forward accessibility\/data props.*non-forwarding custom components do not satisfy the focusable trigger contract.*Do not add a DOM wrapper.*arbitrary custom-child observability/iu);
  assert.match(previewAccessibility.testingCost, /open-to-disabled.*pending-delay-to-disabled.*disabled-to-enabled.*controlled owner refusal.*(?:trigger remains focusable|while remaining focusable)/iu);
  assert.match(previewAccessibility.testingCost, /aria-disabled=true.*data-disabled/iu);
  assert.match(previewAccessibility.testingCost, /forwarding custom triggers.*non-forwarding custom components.*no DOM wrapper.*native disabled is never changed/iu);
  assert.match(previewAccessibility.proofRequirements.join(' '), /at most one false request.*ignored while disabled.*controlled parent.*masked/iu);
  const previewPositioning = r14Capability('PreviewTrigger', 'advancedCapabilities', /finite placement/u);
  assert.equal(previewPositioning.disposition, 'adapt');
  assert.match(previewPositioning.proposedMuxSemantics, /placement\?:.*default "top".*offset\?: finite number default 8.*crossOffset\?: finite number default 0.*shouldFlip\?: boolean default true.*containerPadding\?: nonnegative finite number default 12/u);
  assert.match(previewPositioning.rationale, /adapter-owned.*not a donor-parity promise/iu);
  assert.match(previewPositioning.proposedMuxSemantics, /shouldFlip only enables opposing-side fallback.*boundary shifting\/collision adjustment may still occur/iu);
  assert.match(previewPositioning.portability, /Base side\/align.*advisory portability evidence only/iu);
  assert.match(previewPositioning.testingCost, /shouldFlip=false.*opposing-side fallback.*boundary shifting\/collision/iu);
  assert.match(previewPositioning.testingCost, /RTL start\/end/iu);
  assert.match(r14Decision('Toast', 'requiredWorkflows').capability, /queue/iu);
  assert.equal(r14Decision('Toast', 'controlledAndUncontrolledState').disposition, 'adapt');
  const toastEvents = r14Decision('Toast', 'meaningfulStatesAndEvents');
  assert.match(toastEvents.proposedMuxSemantics, /at-most-once callback settlement.*Pause visible timers.*hovered or focused.*no observable state change, callback settlement, or user-visible effect.*expired hidden timeout.*internally redundant queue update/iu);
  assert.match(toastEvents.testingCost, /overflow beyond maxVisible.*visible and hidden queued removal.*unmount.*hover\/focus pause and resume.*absence of post-teardown observable state changes or user-visible effects.*at-most-once callback settlement/iu);
  assert.match(toastEvents.proofRequirements.join(' '), /overflow queues beyond maxVisible.*hidden queued removals.*unmount\/teardown cleanup.*hover\/focus pause and resume.*no post-teardown observable state change or user-visible effect.*at-most-once settlement/iu);
  assert.equal(r14Capability('Toast', 'advancedCapabilities', /promise\/update\/action\/swipe/u).disposition, 'defer');
  const toastTimerOwnership = r14Capability('Toast', 'advancedCapabilities', /adapter-owned timer registry/u);
  assert.equal(toastTimerOwnership.disposition, 'defer');
  assert.match(toastTimerOwnership.proposedMuxSemantics, /Do not add a timer-handle or cancellation prop now.*observable no-double-settlement and no-post-teardown-effect/iu);
  assert.equal(r14Decision('Tooltip', 'accessibilityAndInteraction').disposition, 'adapt');
  const tooltipAccessibility = r14Decision('Tooltip', 'accessibilityAndInteraction');
  assert.match(tooltipAccessibility.rationale, /direct Mux-owned adapter state, not donor parity/iu);
  assert.match(tooltipAccessibility.proposedMuxSemantics, /disabled.*cancel pending timers\/interactions.*exactly one onOpenChange\(false\) request if it was open or pending.*while disabled ignore open\/trigger attempts.*uncontrolled state stays closed after re-enable.*controlled state remains the owner.*masked while disabled.*visible again after re-enable.*trigger remains focusable unless.*aria-disabled=true.*data-disabled.*without changing native disabled/iu);
  assert.match(tooltipAccessibility.proposedMuxSemantics, /Host triggers.*custom triggers that forward accessibility\/data props.*non-forwarding custom components do not satisfy the focusable trigger contract.*Do not add a DOM wrapper.*arbitrary custom-child observability/iu);
  assert.match(tooltipAccessibility.testingCost, /open-to-disabled.*pending-delay-to-disabled.*disabled-to-enabled.*controlled owner refusal.*(?:trigger remains focusable|while remaining focusable)/iu);
  assert.match(tooltipAccessibility.testingCost, /aria-disabled=true.*data-disabled/iu);
  assert.match(tooltipAccessibility.testingCost, /forwarding custom triggers.*non-forwarding custom components.*no DOM wrapper.*native disabled is never changed/iu);
  assert.match(tooltipAccessibility.proofRequirements.join(' '), /at most one false request.*ignored while disabled.*controlled parent.*masked/iu);
  const tooltipPositioning = r14Capability('Tooltip', 'advancedCapabilities', /finite placement/u);
  assert.equal(tooltipPositioning.disposition, 'adapt');
  assert.match(tooltipPositioning.proposedMuxSemantics, /placement\?:.*default "top".*offset\?: finite number default 0.*crossOffset\?: finite number default 0.*shouldFlip\?: boolean default true.*containerPadding\?: nonnegative finite number default 12/u);
  assert.match(tooltipPositioning.rationale, /adapter-owned.*not a donor-parity promise/iu);
  assert.match(tooltipPositioning.proposedMuxSemantics, /shouldFlip only enables opposing-side fallback.*boundary shifting\/collision adjustment may still occur/iu);
  assert.match(tooltipPositioning.portability, /Base side\/align.*advisory portability evidence only/iu);
  assert.match(tooltipPositioning.testingCost, /shouldFlip=false.*opposing-side fallback.*boundary shifting\/collision/iu);
  assert.match(tooltipPositioning.testingCost, /RTL start\/end/iu);
  const r14RacSources = {
    DropZone: 'packages/react-aria-components/src/DropZone.tsx:1-177',
    FileTrigger: 'packages/react-aria-components/src/FileTrigger.tsx:1-96',
    Modal: 'packages/react-aria-components/src/Modal.tsx:1-331',
    Popover: 'packages/react-aria-components/src/Popover.tsx:1-397',
    PreviewTrigger: 'packages/react-aria-components/src/PreviewTrigger.tsx:1-91',
    Toast: 'packages/react-aria-components/src/Toast.tsx:1-320',
    Tooltip: 'packages/react-aria-components/src/Tooltip.tsx:1-251',
  };
  for (const [family, source] of Object.entries(r14RacSources)) {
    assert.equal(assessed[family].evidenceRefs.rac.some((ref) => ref.startsWith(source)), true, `${family} direct RAC evidence`);
  }
  const r14SupportingRacSources = {
    DropZone: [
      'packages/react-aria/src/dnd/useDrop.ts:1-509',
      'packages/react-aria/src/dnd/utils.ts:1-428',
    ],
    Modal: ['packages/react-aria/src/overlays/Overlay.tsx:1-102'],
    Popover: ['packages/react-aria/src/overlays/Overlay.tsx:1-102'],
    PreviewTrigger: [
      'packages/react-aria/src/tooltip/usePreviewTrigger.ts:1-261',
      'packages/react-aria/src/overlays/Overlay.tsx:1-102',
    ],
    Toast: [
      'packages/react-stately/src/toast/useToastState.ts:1-217',
      'packages/react-aria/src/toast/useToast.ts:1-103',
      'packages/react-aria/src/toast/useToastRegion.ts:1-226',
    ],
    Tooltip: [
      'packages/react-aria/src/tooltip/useTooltipTrigger.ts:1-161',
      'packages/react-aria/src/overlays/Overlay.tsx:1-102',
    ],
  };
  for (const [family, sources] of Object.entries(r14SupportingRacSources)) {
    for (const source of sources) {
      assert.equal(assessed[family].evidenceRefs.rac.some((ref) => ref.startsWith(source)), true, `${family} supporting RAC evidence ${source}`);
    }
  }
  const r14SupportingBaseSources = {
    Popover: 'packages/react/src/internals/useAnchorPositioning.ts:1-800',
    PreviewTrigger: 'packages/react/src/internals/useAnchorPositioning.ts:1-800',
    Toast: 'packages/react/src/toast/store.ts:1-507',
    Tooltip: 'packages/react/src/internals/useAnchorPositioning.ts:1-800',
  };
  for (const [family, source] of Object.entries(r14SupportingBaseSources)) {
    assert.equal(assessed[family].evidenceRefs.base.some((ref) => ref.startsWith(source)), true, `${family} supporting Base evidence`);
  }
});

test('advisory capability-enrichment files are not exported or packed', async () => {
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.dependencies['@base-ui/react'], undefined);
  assert.equal(manifest.exports['./advisory/capability-enrichment'], undefined);
  assert.equal(manifest.files.some((entry) => entry.includes('advisory')), false);

  const packRoot = await mkdtemp(join(tmpdir(), 'muxui-react-capability-enrichment-pack-'));
  try {
    const packed = spawnSync('pnpm', ['pack', '--pack-destination', packRoot], {
      cwd: packageRoot,
      encoding: 'utf8',
      env: { ...process.env, npm_config_engine_strict: 'false' },
    });
    assert.equal(packed.status, 0, packed.stderr);
    const archiveName = (await readdir(packRoot)).find((name) => name.endsWith('.tgz'));
    assert.ok(archiveName);
    const listing = spawnSync('tar', ['-tzf', join(packRoot, archiveName)], { encoding: 'utf8' });
    assert.equal(listing.status, 0, listing.stderr);
    assert.doesNotMatch(listing.stdout, /package\/advisory(?:\/|$)/u);
  } finally {
    await rm(packRoot, { recursive: true, force: true });
  }
});
