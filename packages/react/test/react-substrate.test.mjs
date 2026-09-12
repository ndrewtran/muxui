import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { reactCompatibility } from '../generated/index.mjs';
import { compileTokenGraph, compileTokenRequirementSet, validateThemeForRequirementSet } from '@muxui/tokens';
import {
  assertReactR12GeneratedContracts,
  assertReactR10SourceContracts,
} from '../src/r1-contracts.mjs';

test('R1.1 package has an exact standalone substrate identity', async () => {
  assert.equal(reactCompatibility.package, '@muxui/react');
  assert.equal(reactCompatibility.upstream.version, '1.20.0');
  assert.equal(reactCompatibility.upstream.gitHead, '5ecb3333001313e83898cd07644227897e3bae1f');
  const manifest = JSON.parse(await readFile(resolve(import.meta.dirname, '../package.json'), 'utf8'));
  assert.match(manifest.version, /^(?:0\.1\.0-alpha\.(?:0|[1-9]\d*)|0\.1\.0-rc\.1)$/u);
  assert.equal(reactCompatibility.version, manifest.version);
  assert.equal(reactCompatibility.support, 'unproved; R1.5 React exports only');
  assert.equal(manifest.private, true);
  assert.equal(manifest.scripts.prepublishOnly, 'node src/publish-guard.mjs');
  assert.equal(manifest.dependencies['react-aria-components'], '1.20.0');
  assert.equal(manifest.dependencies['@internationalized/date'], '3.12.3');
  assert.equal(manifest.dependencies['lucide-react'], '1.37.0');
  assert.equal(manifest.dependencies['@muxui/web'], undefined);
});

test('R1.4 is packable but direct publication fails closed', () => {
  const packageRoot = resolve(import.meta.dirname, '..');
  const result = spawnSync(process.execPath, ['src/publish-guard.mjs'], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MUXUI_REACT_R15_PUBLISH_FORBIDDEN/u);
});

test('packed package exposes a clean MuxUI component surface including IconButton', async () => {
  const packageRoot = resolve(import.meta.dirname, '..');
  const packRoot = await mkdtemp(join(tmpdir(), 'muxui-react-pack-'));
  const consumerRoot = await mkdtemp(join(tmpdir(), 'muxui-react-consumer-'));
  try {
    const packed = spawnSync('pnpm', ['pack', '--pack-destination', packRoot], {
      cwd: packageRoot,
      encoding: 'utf8',
      env: { ...process.env, npm_config_engine_strict: 'false' },
    });
    assert.equal(packed.status, 0, packed.stderr);
    const archiveName = (await readdir(packRoot)).find((name) => name.endsWith('.tgz'));
    assert.ok(archiveName);
    const archive = join(packRoot, archiveName);
    const listing = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
    assert.equal(listing.status, 0, listing.stderr);
    for (const entry of ['package/generated/icon-button.mjs', 'package/generated/icon-button.d.ts', 'package/generated/button.mjs', 'package/generated/components.mjs', 'package/generated/fields.mjs', 'package/generated/collections.mjs', 'package/generated/overlays.mjs', 'package/generated/index.d.ts', 'package/generated/styles.css', 'package/generated/r1-2-donor-comparison.json', 'package/generated/r1-2-donor-comparison.json.provenance', 'package/generated/r1-3-donor-comparison.json', 'package/generated/r1-3-donor-comparison.json.provenance', 'package/generated/r1-4-donor-comparison.json', 'package/generated/r1-4-donor-comparison.json.provenance', 'package/generated/r1-5-closure.json', 'package/generated/r1-5-closure.json.provenance', 'package/generated/r1-5-donor-comparison.json', 'package/generated/r1-5-donor-comparison.json.provenance', 'package/NOTICE']) {
      assert.match(listing.stdout, new RegExp(`^${entry.replaceAll('.', '\\.')}$`, 'mu'));
    }

    const packageParent = join(consumerRoot, 'node_modules', '@muxui');
    await mkdir(packageParent, { recursive: true });
    const extracted = spawnSync('tar', ['-xzf', archive, '-C', packageParent], { encoding: 'utf8' });
    assert.equal(extracted.status, 0, extracted.stderr);
    const extractedPackage = join(packageParent, 'package');
    const consumerPackage = join(packageParent, 'react');
    await rename(extractedPackage, consumerPackage);
    await symlink(resolve(packageRoot, 'node_modules'), join(consumerPackage, 'node_modules'), 'dir');

    const imported = spawnSync(process.execPath, [
      '--input-type=module',
      '-e',
      "import('@muxui/react').then((entry) => { if (entry.reactCompatibility.support !== 'unproved; R1.5 React exports only') throw new Error('compatibility support'); for (const name of ['Button', 'IconButton', 'Breadcrumbs', 'Checkbox', 'Disclosure', 'DisclosureGroup', 'Group', 'Link', 'Meter', 'ProgressBar', 'Separator', 'ToggleButton', 'Autocomplete', 'CheckboxGroup', 'DateField', 'DatePicker', 'DateRangePicker', 'Form', 'NumberField', 'SearchField', 'Switch', 'TextField', 'TimeField', 'Calendar', 'ColorArea', 'ColorField', 'ColorPicker', 'ColorSlider', 'ColorSwatch', 'ColorSwatchPicker', 'ColorWheel', 'ComboBox', 'GridList', 'ListBox', 'Menu', 'RadioGroup', 'RangeCalendar', 'Select', 'Slider', 'Table', 'Tabs', 'TagGroup', 'ToggleButtonGroup', 'TokenField', 'Toolbar', 'Tree', 'Virtualizer', 'DropZone', 'FileTrigger', 'Dialog', 'Popover', 'PreviewTrigger', 'Toast', 'ToastProvider', 'useToast', 'Tooltip']) if (!entry[name]) throw new Error(`${name} export missing`); })",
    ], { cwd: consumerRoot, encoding: 'utf8' });
    assert.equal(imported.status, 0, imported.stderr);
    const publicTypes = await readFile(join(consumerPackage, 'generated/index.d.ts'), 'utf8');
    assert.doesNotMatch(publicTypes, /react-aria-components|react-stately|@internationalized\/date|isPending|isDisabled|isSelected|isExpanded|onPress/u);
  assert.match(publicTypes, /export (?:interface|type) (?:ButtonProps|BreadcrumbsProps|CheckboxProps|DisclosureProps|DisclosureGroupProps|GroupProps|LinkProps|MeterProps|ProgressBarProps|SeparatorProps|ToggleButtonProps|AutocompleteProps|CheckboxGroupProps|DateFieldProps|DatePickerProps|DateRangePickerProps|FormProps|NumberFieldProps|SearchFieldProps|SwitchProps|TextFieldProps|TimeFieldProps|CalendarProps|ColorAreaProps|ColorFieldProps|ColorPickerProps|ColorSliderProps|ColorSwatchProps|ColorSwatchPickerProps|ColorWheelProps|ComboBoxProps|GridListProps|ListBoxProps|MenuProps|RadioGroupProps|RangeCalendarProps|SelectProps|SliderProps|TableProps|TabsProps|TagGroupProps|ToggleButtonGroupProps|TokenFieldProps|ToolbarProps|TreeProps|VirtualizerProps)/u);
    assert.match(await readFile(join(consumerPackage, 'generated/styles.css'), 'utf8'), /\.muxui-(?:breadcrumbs|checkbox|disclosure|disclosure-group|group|link|meter|progress-bar|separator|toggle-button|autocomplete|checkbox-group|date-field|date-picker|date-range-picker|form|number-field|search-field|switch|text-field|time-field)/u);
    const consumerNotice = await readFile(join(consumerPackage, 'NOTICE'), 'utf8');
    assert.match(consumerNotice, /Tale UI/u);
    assert.match(consumerNotice, /Lucide ISC License/u);
    assert.match(consumerNotice, /Copyright \(c\) 2013-present Cole Bemis/u);
  } finally {
    await Promise.all([
      rm(packRoot, { recursive: true, force: true }),
      rm(consumerRoot, { recursive: true, force: true }),
    ]);
  }
});

test('R1.2 public surface exports the MuxUI component slice without upstream types', async () => {
  const packageRoot = resolve(import.meta.dirname, '..');
  const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.exports).sort(), ['.', './compatibility', './markdown', './styles.css', './testing', './text-editor']);
  const entry = await import('../generated/index.mjs');
  assert.equal(entry.reactCompatibility.support, 'unproved; R1.5 React exports only');
  const componentNames = ['Button', 'Breadcrumbs', 'Checkbox', 'Disclosure', 'DisclosureGroup', 'Group', 'Link', 'Meter', 'ProgressBar', 'Separator', 'ToggleButton', 'Autocomplete', 'CheckboxGroup', 'DateField', 'DatePicker', 'DateRangePicker', 'Form', 'NumberField', 'SearchField', 'Switch', 'TextField', 'TimeField', 'Calendar', 'ColorArea', 'ColorField', 'ColorPicker', 'ColorSlider', 'ColorSwatch', 'ColorSwatchPicker', 'ColorWheel', 'ComboBox', 'GridList', 'ListBox', 'Menu', 'RadioGroup', 'RangeCalendar', 'Select', 'Slider', 'Table', 'Tabs', 'TagGroup', 'ToggleButtonGroup', 'TokenField', 'Toolbar', 'Tree', 'Virtualizer', 'DropZone', 'FileTrigger', 'Dialog', 'Popover', 'PreviewTrigger', 'Toast', 'Tooltip'];
  for (const name of componentNames) assert.equal(name in entry, true);
  assert.equal('ButtonProps' in entry, false);
  const release = JSON.parse(await readFile(resolve(packageRoot, 'generated/release.json'), 'utf8'));
  assert.deepEqual(release.historical.componentExports.map(({ name }) => name), componentNames);
  assert.deepEqual(release.historical.bindings.map(({ binding }) => binding), componentNames.map((name) => `muxui:component:${name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}#web.react`));
  assert.deepEqual(release.runtimeProfiles, ['web.react']);
  assert.equal(release.historical.catalog.status, 'bound');
  assert.equal(release.evidence.status, 'pending');
  assert.deepEqual(release.historical.evidence.ids, ['E-R1.5-01', 'E-R1.5-02', 'E-R1.5-03', 'E-R1.5-04', 'E-R1.5-05', 'E-R1.5-06']);
  assert.equal(release.publication.status, 'disabled');
  assert.deepEqual(release.publication.requires, ['explicit external publish authorization']);
  assert.doesNotMatch(JSON.stringify(release), /digest-specific human evidence acceptance/u);
  assert.equal(release.packagePrivate, true);
  assert.deepEqual(release.advisories, []);
  assert.deepEqual(release.exceptions, []);
  assert.match(await readFile(resolve(packageRoot, 'NOTICE'), 'utf8'), /Tale UI/);
  assert.match(await readFile(resolve(packageRoot, 'NOTICE'), 'utf8'), /Lucide ISC License/);
  const componentDonorSource = await readFile(resolve(packageRoot, 'generated/component-donor-comparison.json'), 'utf8');
  const componentDonor = JSON.parse(componentDonorSource.replace(/^\/\/ @generated-from:.*\n\/\/ @generated-content-sha256:.*\n/u, ''));
  assert.deepEqual(componentDonor.components.map(({ component }) => component), componentNames);
  assert.equal(componentDonor.components.find(({ component }) => component === 'Group').disposition, 'no-applicable-donor');
  assert.ok(componentDonor.components.filter(({ disposition }) => disposition === 'adapt').length >= 9);
});

test('R1.0 upstream inventory is complete, typed, and classified', async () => {
  const repositoryRoot = resolve(import.meta.dirname, '../../..');
  const snapshot = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-0/upstream-snapshot.json'), 'utf8'));
  const upstreamExportsBytes = await readFile(resolve(repositoryRoot, 'catalog/react-r1-0/upstream-exports.json'));
  const upstreamExports = JSON.parse(upstreamExportsBytes);
  const crosswalk = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-0/donor-crosswalk.json'), 'utf8'));
  const license = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-0/license.json'), 'utf8'));
  assertReactR10SourceContracts({ snapshot, upstreamExports, upstreamExportsBytes, crosswalk, license });
  assert.equal(snapshot.items.length, 613);
  assert.deepEqual(snapshot.inputs, [
    { path: 'packages/react-aria-components/package.json', blob: '34aff3e05c02dfed56cc4e416d893331d48d3cc3', bytes: 2770 },
    { path: 'packages/react-aria-components/exports/index.ts', blob: 'e72133c7b1d1d0fe2d65031f100e3f92d61add9a', bytes: 20184 },
  ]);
  const tupleDigest = createHash('sha256').update(JSON.stringify(snapshot.items.map(({ name, value, source }) => ({ name, source, value })))).digest('hex');
  assert.equal(tupleDigest, snapshot.exportTupleSha256);
  const keys = snapshot.items.map((item) => `${item.value ? 'value' : 'type'}:${item.name}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(snapshot.items.filter(({ name }) => ['UNSTABLE_ToastQueue', 'ListDataOptions', 'TreeDataOptions'].includes(name)).map(({ name }) => name), ['UNSTABLE_ToastQueue', 'ListDataOptions', 'TreeDataOptions']);
  for (const [name, disposition, tranche] of [['Button', 'candidate', 'R1.1'], ['Autocomplete', 'candidate', 'R1.2'], ['TextField', 'candidate', 'R1.2'], ['Select', 'candidate', 'R1.3'], ['Dialog', 'candidate', 'R1.4'], ['UNSTABLE_Toast', 'candidate', 'R1.4']]) {
    const item = snapshot.items.find((entry) => entry.name === name && entry.value);
    assert.deepEqual({ disposition: item?.disposition, tranche: item?.tranche }, { disposition, tranche });
  }
  for (const name of ['ButtonContext', 'useDrag', 'ButtonProps']) {
    const item = snapshot.items.find((entry) => entry.name === name);
    assert.equal(item?.disposition, 'not-a-component');
    assert.ok(item?.reason);
  }
});

test('R1.0 upstream and catalog contracts reject complete-surface and shape drift', async () => {
  const repositoryRoot = resolve(import.meta.dirname, '../../..');
  const snapshot = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-0/upstream-snapshot.json'), 'utf8'));
  const upstreamExportsBytes = await readFile(resolve(repositoryRoot, 'catalog/react-r1-0/upstream-exports.json'));
  const upstreamExports = JSON.parse(upstreamExportsBytes);
  const crosswalk = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-0/donor-crosswalk.json'), 'utf8'));
  const license = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-0/license.json'), 'utf8'));
  const assertSource = (overrides = {}) => assertReactR10SourceContracts({ snapshot, upstreamExports, upstreamExportsBytes, crosswalk, license, ...overrides });
  const changedItem = structuredClone(snapshot);
  changedItem.items[412].source = '../src/Drift';
  assert.throws(() => assertSource({ snapshot: changedItem }), /MUXUI_REACT_UPSTREAM_EXPORT_DERIVATION_DRIFT/u);
  const synchronizedExports = structuredClone(upstreamExports);
  const synchronizedSnapshot = structuredClone(snapshot);
  synchronizedExports.items[412].source = '../src/SynchronizedDrift';
  synchronizedSnapshot.items[412].source = '../src/SynchronizedDrift';
  const synchronizedBytes = Buffer.from(JSON.stringify(synchronizedExports));
  synchronizedSnapshot.exportTupleSha256 = createHash('sha256').update(JSON.stringify(synchronizedExports.items)).digest('hex');
  synchronizedSnapshot.normalizedExports.sha256 = `sha256:${createHash('sha256').update(synchronizedBytes).digest('hex')}`;
  assert.throws(() => assertSource({
    snapshot: synchronizedSnapshot,
    upstreamExports: synchronizedExports,
    upstreamExportsBytes: synchronizedBytes,
  }), /MUXUI_REACT_UPSTREAM_EXPORT_TUPLE_DRIFT/u);
  const changedClassification = structuredClone(snapshot);
  const candidateIndex = changedClassification.items.findIndex(({ disposition, tranche }) => disposition === 'candidate' && tranche === 'R1.3');
  changedClassification.items[candidateIndex].tranche = 'R1.4';
  assert.throws(() => assertSource({ snapshot: changedClassification }), /MUXUI_REACT_UPSTREAM_CLASSIFICATION_DRIFT/u);
  const changedBlob = structuredClone(snapshot);
  changedBlob.inputs[1].blob = '0'.repeat(40);
  assert.throws(() => assertSource({ snapshot: changedBlob }), /MUXUI_REACT_UPSTREAM_IDENTITY_DRIFT/u);
  const changedRevision = structuredClone(upstreamExports);
  changedRevision.commit = '0'.repeat(40);
  assert.throws(() => assertSource({ upstreamExports: changedRevision }), /MUXUI_REACT_UPSTREAM_IDENTITY_DRIFT/u);
  const unknownCrosswalk = structuredClone(crosswalk);
  unknownCrosswalk.unknown = true;
  assert.throws(() => assertSource({ crosswalk: unknownCrosswalk }), /MUXUI_SCHEMA_INVALID/u);
  const missingLicense = structuredClone(license);
  delete missingLicense.notice;
  assert.throws(() => assertSource({ license: missingLicense }), /MUXUI_SCHEMA_INVALID/u);
});

test('R1.2 generated contracts reject missing, unknown, and publication drift', async () => {
  const packageRoot = resolve(import.meta.dirname, '..');
  const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
  const descriptorSource = JSON.parse(await readFile(resolve(packageRoot, 'generated/descriptor.json'), 'utf8'));
  const releaseSource = JSON.parse(await readFile(resolve(packageRoot, 'generated/release.json'), 'utf8'));
  const donorSource = await readFile(resolve(packageRoot, 'generated/r1-2-donor-comparison.json'), 'utf8');
  const donorComparison = JSON.parse(donorSource.replace(/^\/\/ @generated-from:.*\n\/\/ @generated-content-sha256:.*\n/u, ''));
  const crosswalk = JSON.parse(await readFile(resolve(packageRoot, '../../catalog/react-r1-2/donor-crosswalk.json'), 'utf8'));
  const componentNames = ['Autocomplete', 'CheckboxGroup', 'DateField', 'DatePicker', 'DateRangePicker', 'Form', 'NumberField', 'SearchField', 'Switch', 'TextField', 'TimeField'];
  const descriptor = { ...descriptorSource, support: 'unproved; R1.2 React exports only', bindings: descriptorSource.bindings.filter(({ binding }) => componentNames.some((name) => binding === `muxui:component:${name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}#web.react`)), exports: descriptorSource.exports.filter(({ binding }) => componentNames.some((name) => binding === `muxui:component:${name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}#web.react`)) };
  const release = { ...releaseSource, componentExports: releaseSource.componentExports.filter(({ name }) => componentNames.includes(name)), bindings: releaseSource.bindings.filter(({ export: name }) => componentNames.includes(name)), catalog: { ...releaseSource.catalog, components: releaseSource.catalog.components.filter(({ component }) => componentNames.some((name) => component === `muxui:component:${name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`)) }, evidence: { status: 'pending', ids: ['E-R1.2-01', 'E-R1.2-02', 'E-R1.2-03', 'E-R1.2-04'] } };
  const assertGenerated = (overrides = {}) => assertReactR12GeneratedContracts({ descriptor, release, donorComparison, manifest, componentNames, crosswalk, ...overrides });
  assertGenerated();
  const unknownDescriptor = structuredClone(descriptor);
  unknownDescriptor.support = 'drifted support claim';
  assert.throws(() => assertGenerated({ descriptor: unknownDescriptor }), /MUXUI_REACT_R12_DESCRIPTOR_INVALID/u);
  const missingRelease = structuredClone(release);
  delete missingRelease.publication;
  assert.throws(() => assertGenerated({ release: missingRelease }), /MUXUI_REACT_R12_RELEASE_INVALID/u);
  const publishableManifest = structuredClone(manifest);
  publishableManifest.private = false;
  assert.throws(() => assertGenerated({ manifest: publishableManifest }), /MUXUI_REACT_R12_PUBLICATION_GUARD_MISSING/u);
  const changedComparison = structuredClone(donorComparison);
  changedComparison.donor.commit = '0'.repeat(40);
  assert.throws(() => assertGenerated({ donorComparison: changedComparison }), /MUXUI_REACT_R12_DONOR_COMPARISON_(?:INVALID|DRIFT)/u);
  const changedCrosswalk = structuredClone(crosswalk);
  changedCrosswalk.components['date-field'].rules[0].core = 'semantic.action.background';
  assert.throws(() => assertGenerated({ crosswalk: changedCrosswalk }), /MUXUI_REACT_R12_(?:DONOR_PROVENANCE|DONOR_COMPARISON)_DRIFT/u);
});

test('R1.0 donor inputs are exact, fully crosswalked, licensed, and dependency-free', async () => {
  const repositoryRoot = resolve(import.meta.dirname, '../../..');
  const crosswalk = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-0/donor-crosswalk.json'), 'utf8'));
  assert.equal(crosswalk.donor.commit, '94bf62a26c02605c8928dfeb24f0ddc4be1c92fd');
  assert.equal(crosswalk.donor.tree, 'e36c96f683772eedf4652d6adbe7dbcbd1d41f94');
  assert.equal(crosswalk.button.rules.length, crosswalk.button.consumedRules.length);
  assert.deepEqual(crosswalk.button.rules.map(({ input }) => input), crosswalk.button.consumedRules);
  const componentSlugs = ['breadcrumbs', 'checkbox', 'disclosure', 'disclosure-group', 'group', 'link', 'meter', 'progress-bar', 'separator', 'toggle-button'];
  assert.deepEqual(Object.keys(crosswalk.components).sort(), componentSlugs.sort());
  for (const slug of componentSlugs) {
    const entry = crosswalk.components[slug];
    assert.deepEqual(entry.rules.map(({ input }) => input), entry.consumedRules);
    assert.ok(entry.donorInputs.every(({ path, blob }) => path && /^[0-9a-f]{40}$/u.test(blob)));
    assert.equal(entry.disposition, slug === 'group' ? 'no-applicable-donor' : 'adapt');
  }
  assert.equal(new Set(crosswalk.sharedPrimitives.map(({ path }) => path)).size, crosswalk.sharedPrimitives.length);
  assert.ok(crosswalk.sharedPrimitives.every(({ blob }) => /^[0-9a-f]{40}$/u.test(blob)));
  const notice = await readFile(resolve(repositoryRoot, 'packages/react/NOTICE'), 'utf8');
  assert.match(notice, /Copyright \(c\) 2025 Tale UI contributors/);
  assert.match(notice, /Portions Copyright \(c\) 2019 Material-UI SAS/);
  const manifests = [];
  for (const parent of ['apps', 'packages']) {
    for (const entry of await readdir(resolve(repositoryRoot, parent), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = resolve(repositoryRoot, parent, entry.name, 'package.json');
      const raw = await readFile(path, 'utf8').catch(() => null);
      if (raw) manifests.push(raw);
    }
  }
  assert.doesNotMatch(`${manifests.join('\n')}\n${await readFile(resolve(repositoryRoot, 'pnpm-lock.yaml'), 'utf8')}`, /(?:@|\/)tale-ui|tale-ui@/iu);
});

test('R1.0 lockfile binds the accepted React Aria package integrity', async () => {
  const lockfile = await readFile(resolve(import.meta.dirname, '../../../pnpm-lock.yaml'), 'utf8');
  assert.match(lockfile, /react-aria-components@1\.20\.0:\n\s+resolution: \{integrity: sha512-BMbpIgoV9aELeBrB0Y120NgoigHb5OdcJwc\+4e7uSnbTbamea6lo\+gqcc4LAxzMaK3Jf\+7LI1oCDE6yANsmxIQ==\}/u);
  assert.match(lockfile, /lucide-react@1\.37\.0:\n\s+resolution: \{integrity: sha512-LPsB4rD1TD6wZu1djKOf9vUnS1jTNaHbolXebXDgiTdb6jeA1agIJhJsIybCmjKmQClcOaal1o1OaiYahEftyQ==\}/u);
});

test('R1.0 binds current reusable token facts and keeps historical proof provenance-only', async () => {
  const repositoryRoot = resolve(import.meta.dirname, '../../..');
  const source = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/tokens/default-theme.json'), 'utf8'));
  assert.equal(source.schemaVersion, '2.1.0');
  assert.equal(source.tokenContractVersion, '2.1.0');
  assert.equal(Object.keys(source.tokens).length, 813);
  assert.deepEqual(Object.values(source.tokens).reduce((counts, token) => ({ ...counts, [token.layer]: (counts[token.layer] ?? 0) + 1 }), {}), { reference: 551, semantic: 257, component: 5 });
  assert.deepEqual(source.theme.modeAxes, {
    colorScheme: ['light', 'dark'], contrast: ['standard', 'more'], motion: ['full', 'reduced'], density: ['comfortable', 'compact'], direction: ['ltr', 'rtl'],
  });
  assert.equal(source.theme.runtimeSwitching, 'unavailable');
  const requiredTokens = ['component.button.background', 'component.button.foreground', 'component.button.min-height', 'component.button.padding-inline', 'component.button.radius', 'semantic.focus.ring', 'semantic.motion.feedback'];
  const recipe = { source: source.id, requirements: requiredTokens.map((token) => ({ token, requirement: 'required' })) };
  const requirementSet = compileTokenRequirementSet({ source, recipe, bindingId: 'r1.0-button-comparison', profile: 'web.react' });
  assert.deepEqual(requirementSet.requirements.map(({ token }) => token), [...requiredTokens].sort());
  assert.throws(() => validateThemeForRequirementSet({ requirementSet, values: {} }), (error) => error?.code === 'MUXUI_TOKEN_REQUIRED_MISSING');
  assert.throws(() => compileTokenGraph(source, { overrides: { 'semantic.focus.ring': { type: 'color', unit: 'hex', value: '#000000' } } }), (error) => error?.code === 'MUXUI_TOKEN_OVERRIDE_UNAUTHORIZED');
  assert.equal(compileTokenGraph(source, { overrides: { 'semantic.motion.feedback': { type: 'duration', unit: 'ms', value: 80 } } }).tokens['semantic.motion.feedback'].value, 80);
  const historicalIndex = await readFile(resolve(repositoryRoot, 'tests/evidence/default-theme-g1.0-v2/index.json'));
  assert.equal(createHash('sha256').update(historicalIndex).digest('hex'), '38ff3a1e20bc3215737b9e6e4043d394cac0f2a2dbf324b6faae371b832aceba');
});
