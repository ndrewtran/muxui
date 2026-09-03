import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';
import {
  applicableMigrationRecords,
  activateVisualMigrationArtifacts,
  assertCaptureEnvironment,
  assertManifestIdentity,
  assertSafeCaseId,
  assertSafeSnapshotDirectory,
  assertVisualMigrationActivationPaths,
  assertVisualMigrationSnapshotPaths,
  appRoot,
  captureEnvironmentMismatches,
  comparePngs,
  compareStyleFacts,
  buildComparisonReport,
  donorBindingSha256,
  expectedCaseInventory,
  expectedCaptureInventory,
  expectedDescriptorStateCount,
  expectedCompatibilityStateCount,
  expectedSupplementalStateCount,
  expectedStateCoverage,
  expectedStateDispositionCounts,
  expectedDonorBindingSha256,
  expectedStoryId,
  expectedStoryQuery,
  migrationCases,
  noApplicableDonorFamilies,
  readManifest,
  recoverVisualMigrationActivation,
  resultFilePath,
  sha256,
  snapshotDirectoryForHashes,
  updateManifestIdentity,
  validateSealedComparison,
  validateManifest,
  validateSnapshotFiles,
} from '../src/visual-migration.mjs';
import { isMigrationFixtureRequest, stateCoverage } from '../src/visual-migration-contract.mjs';
import { renderFamily, stateArgsForBinding, storyArgsForBinding } from '../src/storybook-factory.mjs';
import { migrationFixtureSymbol, sharedFixtureInput } from '../src/visual-migration-contract.mjs';
import { fixtureFieldPropsFor, fixtureRenderModel } from '../src/visual-migration-fixture-map.mjs';
import { renderFamilyPlan } from '../visual-migration/bootstrap/donor-render-plan.mjs';
import { visualMigrationStoryReady } from './run-visual-migration.mjs';
import * as visualMigrationModule from '../src/visual-migration.mjs';
import { taleStyleInventory, validateTaleStyleInventory } from '../src/tale-style-inventory.mjs';

const recordsByFamily = new Map(applicableMigrationRecords.map((record) => [record.family, record]));

function mutatedMigrationElement(caseId, mutate) {
  const entry = migrationCases.find(({ id }) => id === caseId);
  const record = recordsByFamily.get(entry.component);
  const fixture = sharedFixtureInput(entry);
  mutate(fixture.data, fixture);
  const baseArgs = storyArgsForBinding(record.binding, 'default', entry.component);
  Object.defineProperty(baseArgs, migrationFixtureSymbol, { value: fixture });
  const args = {
    ...stateArgsForBinding(record.binding, entry.state, entry.component, baseArgs),
  };
  Object.defineProperty(args, migrationFixtureSymbol, { value: fixture });
  return { element: renderFamily(entry.component, args), args };
}

const manifest = await readManifest();
const comparison = JSON.parse(await readFile(resolve(appRoot, 'visual-migration/results/comparison.json'), 'utf8'));

test('the canonical closure proves 51 applicable families and two exact no-donor families', async () => {
  await validateManifest(manifest);
  assert.equal(applicableMigrationRecords.length, 51);
  assert.deepEqual(noApplicableDonorFamilies, ['Group', 'TokenField']);
  assert.equal(manifest.coverage.applicableFamilyCount, 51);
  assert.deepEqual(manifest.coverage.noApplicableDonor, noApplicableDonorFamilies);
  assert.deepEqual(manifest.cases.map(({ id, component, state }) => [id, component, state]), expectedCaseInventory);
  assert.equal(manifest.coverage.caseCount, migrationCases.length);
  assert.equal(manifest.coverage.comparisonCount, expectedCaptureInventory.length);
  assert.equal(manifest.coverage.canonicalStateCount, expectedDescriptorStateCount);
  assert.equal(manifest.coverage.compatibilityStateCount, expectedCompatibilityStateCount);
  assert.equal(manifest.coverage.supplementalStateCount, expectedSupplementalStateCount);
  assert.equal(manifest.coverage.stateCoverageCount, expectedStateCoverage.length);
  assert.deepEqual(manifest.coverage.stateDispositions, expectedStateDispositionCounts);
  await validateSealedComparison(manifest);
  assert.deepEqual(manifest.capture.modes, ['light', 'dark']);
  assert.deepEqual(comparison.counts, {
    families: 51,
    noApplicableDonor: 2,
    semanticCases: migrationCases.length,
    comparisons: expectedCaptureInventory.length,
    pass: comparison.comparisons.filter(({ pass }) => pass).length,
    failed: comparison.comparisons.filter(({ pass }) => !pass).length,
  });
  assert.equal(comparison.status, 'genuine-component-region-mismatches-require-review');
  assert.equal(comparison.counts.pass, 418);
  assert.equal(comparison.counts.failed, 12);
  assert.deepEqual(comparison.mismatchInventory.filter(({ failed }) => failed > 0).map(({ component }) => component), ['DateRangePicker']);
  assert.equal(comparison.counts.pass + comparison.counts.failed, expectedCaptureInventory.length);
  assert.equal(comparison.mismatchInventory.length, 51);
  assert.equal(comparison.comparisons.filter(({ pass }) => pass).length, comparison.counts.pass);
  assert.equal(comparison.comparisons.filter(({ pass }) => !pass).length, comparison.counts.failed);
  assert.equal(comparison.comparisons.length, expectedCaptureInventory.length);
  assert.equal(snapshotDirectoryForHashes(expectedCaptureInventory.map(([, id, , , mode]) => manifest.cases.find((entry) => entry.id === id).baseline[mode].sha256)), manifest.baselineDirectory);
  assertManifestIdentity(manifest);
  assert.equal(manifest.donorBindingSha256, expectedDonorBindingSha256);
});

test('the Tale style ledger accounts for every pinned stylesheet and state coverage is explicit', () => {
  assert.equal(validateTaleStyleInventory().fileCount, 125);
  assert.equal(taleStyleInventory.donor.fileCount, 125);
  assert.equal(stateCoverage.length, expectedStateCoverage.length);
  assert.equal(expectedStateCoverage.filter(({ disposition }) => disposition === 'visual').length, migrationCases.length);
  assert.ok(expectedStateCoverage.every(({ check }) => check?.type));
  assert.equal(expectedStateCoverage.find(({ family, state }) => family === 'TagGroup' && state === 'removable')?.check?.type, 'dom');
  assert.equal(migrationCases.some(({ id }) => id === 'search-field-filled'), true);
  const behaviorRecords = expectedStateCoverage.filter(({ disposition }) => disposition === 'behavior-only');
  assert.equal(behaviorRecords.length, 10);
  assert.ok(behaviorRecords.every(({ check }) => check?.type === 'behavior' && check.selector && check.interaction && check.assertion));
  const unsupportedRecords = expectedStateCoverage.filter(({ disposition }) => disposition === 'unsupported');
  assert.equal(unsupportedRecords.length, 3);
  assert.ok(unsupportedRecords.every(({ check }) => check?.type === 'dom' && check.rationale));
});

test('DateRangePicker separator adaptation keeps the pinned donor comparison honest', () => {
  const rangeEntries = manifest.cases.filter(({ component }) => component === 'DateRangePicker');
  assert.equal(rangeEntries.length, 6);
  assert.ok(rangeEntries.every(({ adaptations }) => adaptations.some(({ part, reason }) => part === 'DateRangePicker.separator'
    && reason.includes('pinned Tale donor fixture omits this decorative separator'))));

  const separatorMismatches = comparison.comparisons.filter(({ component, pass }) => component === 'DateRangePicker' && !pass);
  assert.equal(separatorMismatches.length, 12);
  assert.ok(separatorMismatches.every(({ pixelComparison, componentRegion }) => !pixelComparison.pass && componentRegion.status === 'compared'));
  assert.equal(comparison.adaptations.filter(({ component, part }) => component === 'DateRangePicker' && part === 'DateRangePicker.separator').length, 12);
});

test('the pinned Storybook fixture requires the canonical story and private query', () => {
  assert.equal(isMigrationFixtureRequest(expectedStoryId, '?muxui-migration=1'), true);
  assert.equal(isMigrationFixtureRequest('muxui-react-r1-1-checkbox--default', '?muxui-migration=1'), false);
  assert.equal(isMigrationFixtureRequest(expectedStoryId, '?muxui-migration=0'), false);
  assert.equal(isMigrationFixtureRequest(expectedStoryId, '?muxui-migration=1&muxui-migration=0'), false);
  assert.deepEqual(manifest.storyQuery, expectedStoryQuery);
});

test('migration focus actions establish keyboard modality without donor autofocus', async () => {
  const donorEntry = await readFile(resolve(appRoot, 'visual-migration/bootstrap/donor-entry.mjs'), 'utf8');
  const donorCapture = await readFile(resolve(appRoot, 'visual-migration/bootstrap/capture.mjs'), 'utf8');
  const muxuiCapture = await readFile(resolve(appRoot, 'test/run-visual-migration.mjs'), 'utf8');
  assert.doesNotMatch(donorEntry, /case 'focused':\s*props\.autoFocus/u);
  for (const source of [donorCapture, muxuiCapture]) {
    assert.match(source, /page\.mouse\.click\(0, 0\);\s*await page\.keyboard\.press\('Tab'\);\s*await target\.focus\(\)/u);
  }
});

test('migration host resets stay private and expanded triggers are not pressed buttons', async () => {
  const buttonStyles = await readFile(resolve(appRoot, '../../packages/react/src/styles/components.css'), 'utf8');
  const previewSource = await readFile(resolve(appRoot, '.storybook/preview.mjs'), 'utf8');
  const previewStyles = await readFile(resolve(appRoot, '.storybook/preview.css'), 'utf8');
  assert.match(buttonStyles, /\.muxui-button\[data-pressed\]:not\([^}]*\[aria-expanded='true'\]\)/u);
  assert.match(buttonStyles, /\.muxui-button:active:not\(\[data-disabled\], \[data-pending\]\)/u);
  assert.match(previewSource, /document\.body\.setAttribute\('data-muxui-migration-host', 'true'\)[\s\S]*document\.body\.removeAttribute\('data-muxui-migration-host'\)/u);
  assert.match(previewStyles, /body\[data-muxui-migration-host='true'\][\s\S]*margin: 0 !important;/u);
});

test('disabled tab opacity wins over semantic recoloring and resets in forced colors', async () => {
  const collectionStyles = await readFile(resolve(appRoot, '../../packages/react/src/styles/collections.css'), 'utf8');
  assert.match(collectionStyles, /\.muxui-tab\[data-disabled\]\s*\{\s*opacity: 0\.45;/u);
  assert.doesNotMatch(collectionStyles, /\.muxui-select-trigger\[aria-disabled='true'\],\s*\.muxui-tab\[aria-disabled='true'\]/u);
  assert.match(collectionStyles, /@media \(forced-colors: active\)[\s\S]*\.muxui-tab\[data-disabled\][\s\S]*opacity: 1;/u);
});

test('donor capture accessibility normalization stays bounded to the migration fixture', async () => {
  const captureSource = await readFile(resolve(appRoot, 'visual-migration/bootstrap/capture.mjs'), 'utf8');
  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  for (const selector of [
    '.tale-date-field[data-invalid] .tale-date-field__label',
    '.tale-date-picker[data-invalid] .tale-date-picker__label',
    '.tale-date-range-picker[data-invalid] .tale-date-range-picker__label',
    '.tale-number-field[data-invalid] .tale-number-field__label',
    '.tale-search-field[data-invalid] .tale-search-field__label',
    '.tale-text-field[data-invalid] .tale-text-field__label',
    '.tale-time-field[data-invalid] .tale-time-field__label',
  ]) assert.match(captureSource, new RegExp(`html\\[data-color-mode='dark'\\] \\.migration-component ${escapeRegExp(selector)}`));
  assert.match(captureSource, /html\[data-color-mode='dark'\] \.migration-component \.tale-select__value\[data-placeholder\][\s\S]*color: #918b86;/u);
  assert.match(captureSource, /html\[data-color-mode='light'\] \.migration-component \.tale-select__value\[data-placeholder\][\s\S]*color: #5f5954;/u);
  assert.match(captureSource, /html\[data-color-mode='dark'\] \.migration-component \.tale-drop-zone:not\(\[data-drop-target\]\)[\s\S]*color: #918b86;/u);
  assert.match(captureSource, /html\[data-color-mode='light'\] \.migration-component \.tale-drop-zone:not\(\[data-drop-target\]\)[\s\S]*color: #5f5954;/u);
  assert.match(captureSource, /page\.addStyleTag\(\{ content: donorAccessibilityNormalizationCss \}\)/u);
  assert.doesNotMatch(captureSource, /!important/u);
});

test('manifest identity rejects inventory, donor, and query drift', () => {
  const removed = structuredClone(manifest);
  removed.cases.pop();
  assert.throws(() => assertManifestIdentity(removed), new RegExp(`exact ${migrationCases.length} semantic cases`));
  const substituted = structuredClone(manifest);
  substituted.cases[0] = { ...substituted.cases[0], id: 'switch-idle', component: 'Switch', state: 'idle' };
  assert.throws(() => assertManifestIdentity(substituted), /inventory drift/);
  const donorDrift = structuredClone(manifest);
  donorDrift.cases[0].donor.source = 'changed.css';
  assert.throws(() => assertManifestIdentity(donorDrift), /provenance identity/);
  const storyDrift = structuredClone(manifest);
  storyDrift.storyId = 'not-the-pinned-story';
  assert.throws(() => assertManifestIdentity(storyDrift), /pinned generated story/);
});

test('pinned donor binding rejects a coordinated donor artifact, provenance, and manifest substitution', async () => {
  const substituted = structuredClone(manifest);
  const provenance = JSON.parse(await readFile(resolve(appRoot, 'visual-migration/results/donor-capture-provenance.json'), 'utf8'));
  const donorCapture = provenance.captures.find(({ captureId }) => captureId === 'button-idle--light');
  const donorBytes = await readFile(resolve(appRoot, manifest.cases[0].donor.artifacts.light.path));
  const donorImage = PNG.sync.read(donorBytes);
  donorImage.data[0] ^= 1;
  const replacementSha256 = sha256(PNG.sync.write(donorImage));
  donorCapture.sha256 = replacementSha256;
  substituted.cases[0].donor.artifacts.light.sha256 = replacementSha256;
  substituted.bootstrap.captureProvenance.sha256 = sha256(Buffer.from(`${JSON.stringify(provenance, null, 2)}\n`, 'utf8'));
  substituted.donorBindingSha256 = donorBindingSha256(substituted);
  assert.notEqual(substituted.donorBindingSha256, expectedDonorBindingSha256);
  assert.throws(() => assertManifestIdentity(substituted), /pinned donor artifact contract/);
});

test('manifest validation rejects canonical selector and fixture-data substitution', async () => {
  const selectorSubstitution = structuredClone(manifest);
  selectorSubstitution.cases[0].selector = '[data-muxui-migration-case="switch-idle"]';
  await assert.rejects(validateManifest(selectorSubstitution), /selector must equal the canonical case selector/);
  const dataSubstitution = structuredClone(manifest);
  dataSubstitution.cases[0].fixture.data.items[0] = 'Substituted';
  await assert.rejects(validateManifest(dataSubstitution), /fixture must equal the canonical shared fixture contract/);
  const runtimeFixtureSubstitution = structuredClone(manifest);
  runtimeFixtureSubstitution.cases[0].runtimeFixtureSha256 = `sha256:${'0'.repeat(64)}`;
  await assert.rejects(validateManifest(runtimeFixtureSubstitution), /runtimeFixtureSha256/);
  const fixtureMapSubstitution = structuredClone(manifest);
  fixtureMapSubstitution.bootstrap.fixtureMapSourceSha256 = `sha256:${'0'.repeat(64)}`;
  await assert.rejects(validateManifest(fixtureMapSubstitution), /donor capture provenance/);
  const donorSourceSubstitution = structuredClone(manifest);
  donorSourceSubstitution.cases[0].donor.source = 'changed.css';
  donorSourceSubstitution.donorBindingSha256 = donorBindingSha256(donorSourceSubstitution);
  await assert.rejects(validateManifest(donorSourceSubstitution), /pinned donor artifact contract/u);
  const donorRuntimeSubstitution = structuredClone(manifest);
  donorRuntimeSubstitution.cases[0].donor.runtimeFixtureSha256 = `sha256:${'0'.repeat(64)}`;
  donorRuntimeSubstitution.donorBindingSha256 = donorBindingSha256(donorRuntimeSubstitution);
  await assert.rejects(validateManifest(donorRuntimeSubstitution), /pinned donor artifact contract/u);
  const donorSourceHashSubstitution = structuredClone(manifest);
  donorSourceHashSubstitution.cases[0].donor.sourceSha256 = `sha256:${'0'.repeat(64)}`;
  donorSourceHashSubstitution.donorBindingSha256 = donorBindingSha256(donorSourceHashSubstitution);
  await assert.rejects(validateManifest(donorSourceHashSubstitution), /pinned donor artifact contract/);
});

function fakeComponent() {}

function fakeNamespace() {
  return new Proxy({}, {
    get(_target, name) {
      if (name === 'parseColor') return (value) => value;
      return fakeComponent;
    },
  });
}

function fakeElement(type, props, ...children) {
  return { type, props: { ...(props ?? {}), ...(children.length === 1 ? { children: children[0] } : children.length > 1 ? { children } : {}) } };
}

function fakeDonorRuntime() {
  const packages = new Proxy({}, { get: () => fakeNamespace() });
  const renderFakeTreeItem = (item, _treePackage, key, itemProps = {}) => fakeElement(
    'tree-item',
    { ...itemProps, id: item.id, key },
    [item.label, (item.children ?? []).map((child) => renderFakeTreeItem(child, _treePackage, child.id, itemProps))],
  );
  return {
    h: fakeElement,
    packages,
    ButtonPackage: fakeNamespace(),
    ColorSwatchPackage: fakeNamespace(),
    ToggleButtonPackage: fakeNamespace(),
    RadioFieldPackage: fakeNamespace(),
    SearchFieldPackage: fakeNamespace(),
    FieldPackage: fakeNamespace(),
    CalendarPackage: fakeNamespace(),
    RangeCalendarPackage: fakeNamespace(),
    propsFor: () => ({ className: 'migration-tale-root' }),
    parseFixtureDate: (value) => value,
    renderCalendar: (_packageNamespace, model, props, range = false) => fakeElement('calendar', { ...props, value: range ? { start: model.data.dateRange.start, end: model.data.dateRange.end } : model.data.date }, []),
    renderField: (_packageNamespace, model, props, kind) => fakeElement('field', { ...props, defaultValue: kind === 'time' ? model.data.time : model.data.date, label: model.copy }, []),
    renderTreeItem: renderFakeTreeItem,
    ToastHarness: fakeComponent,
    textItem: (value) => fakeElement('text', {}, [typeof value === 'object' ? value.label : value]),
    colorValue: (value) => value,
  };
}

function planFor(caseId, mutate) {
  const entry = migrationCases.find(({ id }) => id === caseId);
  const fixture = sharedFixtureInput(entry);
  mutate?.(fixture.data, fixture);
  return renderFamilyPlan(entry, fixture, fakeDonorRuntime());
}

function planContains(plan, expected) {
  const seen = new Set();
  const visit = (value) => {
    if (Object.is(value, expected)) return true;
    if (!value || typeof value !== 'object' || seen.has(value)) return false;
    seen.add(value);
    return Object.values(value).some(visit);
  };
  return visit(plan);
}

test('the retained Tale render plan consumes the complete shared fixture contract', () => {
  for (const entry of migrationCases) assert.doesNotThrow(() => renderFamilyPlan(entry, sharedFixtureInput(entry), fakeDonorRuntime()), entry.id);
  assert.equal(planFor('button-idle', (_data, fixture) => { fixture.copy = 'Fixture copy'; }).props.children, 'Fixture copy');
  const text = planFor('text-field-idle', (data) => { data.label = 'Fixture label'; data.placeholder = 'Fixture placeholder'; });
  assert.equal(text.props.label, 'Fixture label');
  assert.equal(text.props.placeholder, 'Fixture placeholder');
  assert.equal(planContains(planFor('autocomplete-idle', (data) => { data.placeholder = 'Fixture placeholder'; }), 'Fixture placeholder'), true);
  const autocompleteFocused = planFor('autocomplete-focused');
  const autocompleteFocusedWrapper = autocompleteFocused.props.children;
  const autocompleteFocusedPopover = autocompleteFocusedWrapper.props.children[1];
  assert.equal(autocompleteFocusedWrapper.props.style.flexDirection, 'column');
  assert.equal(autocompleteFocusedPopover.props.className, 'tale-autocomplete__popover');
  assert.equal(autocompleteFocusedPopover.props.hidden, false);
  const autocompleteIdle = planFor('autocomplete-idle');
  assert.equal(autocompleteIdle.props.children.props.children[1].props.hidden, true);
  assert.equal(planContains(autocompleteFocused, 'tale-autocomplete__listbox'), true);
  for (const caseId of ['dialog-open', 'popover-open', 'preview-trigger-open', 'tooltip-open']) {
    const overlay = planFor(caseId);
    assert.equal(overlay.props.children[0].type, fakeComponent, `${caseId} uses the Tale Button directly as its trigger`);
  }
  const preview = planFor('preview-trigger-open');
  assert.equal(preview.props.children[0].props.className, 'tale-preview-card__trigger');
  const tooltip = planFor('tooltip-open');
  assert.equal(tooltip.props.children[0].props.className, 'tale-tooltip__trigger');
  assert.equal(planContains(planFor('breadcrumbs-idle', (data) => { data.items = ['Fixture item']; }), 'Fixture item'), true);
  assert.equal(planContains(planFor('checkbox-group-idle', (data) => { data.choices = [{ value: 'fixture', label: 'Fixture choice' }]; }), 'Fixture choice'), true);
  assert.equal(planFor('date-field-idle', (data) => { data.date = '2031-04-05'; }).props.defaultValue, '2031-04-05');
  assert.deepEqual(planFor('date-range-picker-idle', (data) => { data.dateRange = { start: '2031-04-05', end: '2031-04-12' }; }).props.defaultValue, { start: '2031-04-05', end: '2031-04-12' });
  assert.equal(planFor('time-field-idle', (data) => { data.time = '17:45'; }).props.defaultValue, '17:45');
  assert.deepEqual(planFor('range-calendar-idle', (data) => { data.dateRange = { start: '2031-04-05', end: '2031-04-12' }; }).props.value, { start: '2031-04-05', end: '2031-04-12' });
  assert.equal(planFor('color-field-idle', (data) => { data.color = '#123456'; }).props.defaultValue, '#123456');
  assert.equal(planFor('meter-idle', (data) => { data.values.meter = 13; }).props.value, 13);
  assert.equal(planFor('progress-bar-idle', (data) => { data.values.progress = 17; }).props.value, 17);
  assert.equal(planFor('number-field-idle', (data) => { data.values.number = 19; }).props.defaultValue, 19);
  assert.equal(planFor('slider-idle', (data) => { data.values.slider = 23; }).props.defaultValue, 23);
  assert.equal(planContains(planFor('radio-group-idle', (data) => { data.options = [{ value: 'fixture', label: 'Fixture option' }]; }), 'Fixture option'), true);
  assert.equal(planFor('combo-box-selected', (data) => { data.items = ['Perth', 'Hobart']; }).props.defaultSelectedKey, 'Perth');
  assert.equal(planContains(planFor('table-idle', (data) => { data.columns = [{ id: 'fixture', label: 'Fixture column' }]; data.rows = [{ id: 'row', values: { fixture: 'Fixture cell' } }]; }), 'Fixture cell'), true);
  assert.equal(planContains(planFor('disclosure-group-idle', (data) => { data.children.disclosureGroup = [{ id: 'fixture', title: 'Fixture title', content: 'Fixture content' }]; }), 'Fixture content'), true);
  assert.equal(planContains(planFor('form-idle', (data) => { data.children.form = { fieldLabel: 'Fixture field', submit: 'Fixture submit' }; }), 'Fixture submit'), true);
  assert.equal(planContains(planFor('toolbar-idle', (data) => { data.children.toolbar = ['Fixture toolbar']; }), 'Fixture toolbar'), true);
  assert.equal(planContains(planFor('toggle-button-group-idle', (data) => { data.children.toggleButtonGroup = [{ id: 'fixture', label: 'Fixture toggle' }]; }), 'Fixture toggle'), true);
  assert.equal(planFor('link-current').props['aria-current'], 'page');
  assert.equal(planFor('link-current').props['data-current'], 'true');
  assert.equal(planFor('virtualizer-empty').props.style.height, '180px');
  assert.equal(planFor('virtualizer-idle').props.style.height, '180px');
});

test('dark current Link styling covers the Mux UI and donor state markers', async () => {
  const componentStyles = await readFile(resolve(appRoot, '../../packages/react/src/styles/components.css'), 'utf8');
  assert.match(componentStyles, /\.muxui-link:not\(\.muxui-button\):is\(\[aria-current='page'\], \[data-current\]\)\s*\{[\s\S]*?color: var\(--muxui-reference-color-neutral-20\);/u);
});

test('disabled Tale donor plans forward disabled state to nested parts and items', () => {
  const assertDisabled = (element, label) => {
    assert.equal(element.props.isDisabled, true, `${label} must receive isDisabled`);
    assert.equal(element.props.disabled, true, `${label} must receive disabled`);
  };

  assertDisabled(planFor('file-trigger-disabled').props.children, 'FileTrigger button');

  const colorPickerParts = planFor('color-picker-disabled').props.children;
  for (const [index, part] of colorPickerParts.entries()) assertDisabled(part, `ColorPicker nested part ${index}`);

  const swatches = planFor('color-swatch-picker-disabled').props.children;
  for (const [index, item] of swatches.entries()) {
    assertDisabled(item, `ColorSwatchPicker item ${index}`);
    assertDisabled(item.props.children, `ColorSwatchPicker swatch ${index}`);
  }

  for (const family of ['GridList', 'ListBox']) {
    const item = planFor(`${family.replaceAll(/([a-z])([A-Z])/gu, '$1-$2').toLowerCase()}-disabled`).props.children[0];
    assertDisabled(item, `${family} item`);
  }

  const menuItem = planFor('menu-disabled').props.children.props.children[0];
  assertDisabled(menuItem, 'Menu item');

  const tableRow = planFor('table-disabled').props.children[1].props.children[0];
  assertDisabled(tableRow, 'Table row');

  const tab = planFor('tabs-disabled').props.children[0].props.children[0];
  assertDisabled(tab, 'Tabs tab');

  const treeRoot = planFor('tree-disabled').props.children.props.children;
  const treeItem = treeRoot[0];
  assertDisabled(treeItem, 'Tree root item');
  assertDisabled(treeItem.props.children[1][0], 'Tree nested item');

  const virtualizerItem = planFor('virtualizer-disabled').props.children.props.children.props.children[0];
  assertDisabled(virtualizerItem, 'Virtualizer item');

  const idleGridItem = planFor('grid-list-idle').props.children[0];
  assert.equal(idleGridItem.props.isDisabled, undefined);
  assert.equal(idleGridItem.props.disabled, undefined);
});

test('migration adapters pass mutated fixture data into Mux UI runtime props', () => {
  const date = mutatedMigrationElement('date-field-idle', (data) => { data.date = '2031-04-05'; });
  assert.equal(date.element.props.defaultValue, '2031-04-05');
  const dateRange = mutatedMigrationElement('date-range-picker-idle', (data) => { data.dateRange = { start: '2031-04-05', end: '2031-04-12' }; });
  assert.deepEqual(dateRange.element.props.defaultValue, { start: '2031-04-05', end: '2031-04-12' });
  const color = mutatedMigrationElement('color-field-idle', (data) => { data.color = '#123456'; });
  assert.equal(color.element.props.defaultValue, '#123456');
  const meter = mutatedMigrationElement('meter-idle', (data) => { data.values.meter = 31; });
  assert.equal(meter.element.props.value, 31);
  const time = mutatedMigrationElement('time-field-idle', (data) => { data.time = '17:45'; });
  assert.equal(time.element.props.defaultValue, '17:45');
  const text = mutatedMigrationElement('text-field-idle', (data) => { data.placeholder = 'Fixture placeholder'; });
  assert.equal(text.element.props.placeholder, 'Fixture placeholder');
  const rangeCalendar = mutatedMigrationElement('range-calendar-idle', (data) => { data.dateRange = { start: '2031-04-05', end: '2031-04-12' }; });
  assert.deepEqual(rangeCalendar.element.props.defaultValue, { start: '2031-04-05', end: '2031-04-12' });
  const select = mutatedMigrationElement('select-selected', (data) => { data.items = ['Perth', 'Hobart']; });
  assert.deepEqual(select.element.props.items, ['Perth', 'Hobart']);
  assert.equal(select.element.props.value, 'Perth');
  const radio = mutatedMigrationElement('radio-group-selected', (data) => { data.options = [{ value: 'xl', label: 'Extra large' }]; });
  assert.deepEqual(radio.element.props.options, [{ value: 'xl', label: 'Extra large' }]);
  assert.equal(radio.element.props.value, 'xl');
  const choices = mutatedMigrationElement('checkbox-group-selected', (data) => { data.choices = [{ value: 'push', label: 'Push' }]; });
  assert.equal(choices.element.props.children.props.value, 'push');
  assert.deepEqual(choices.element.props.children.props.children, 'Push');
  const preview = mutatedMigrationElement('preview-trigger-idle', () => {}).element;
  assert.equal(preview.props.trigger.props.children, 'Document preview');
  assert.equal(preview.props.children, 'Document preview content.');
  for (const family of ['Autocomplete', 'ComboBox', 'SearchField', 'Select']) {
    const fixture = sharedFixtureInput(migrationCases.find(({ component }) => component === family));
    fixture.copy = `Fixture ${family} label`;
    fixture.data.placeholder = `Fixture ${family} placeholder`;
    assert.deepEqual(fixtureFieldPropsFor(fixture, family), {
      label: `Fixture ${family} label`,
      placeholder: `Fixture ${family} placeholder`,
    });
  }
  const textFixture = sharedFixtureInput(migrationCases.find(({ component }) => component === 'TextField'));
  textFixture.data.label = 'Fixture field label';
  textFixture.data.placeholder = 'Fixture field placeholder';
  assert.deepEqual(fixtureFieldPropsFor(textFixture, 'TextField'), {
    label: 'Fixture field label',
    placeholder: 'Fixture field placeholder',
  });
  for (const [caseId, family] of [
    ['autocomplete-idle', 'Autocomplete'],
    ['combo-box-idle', 'ComboBox'],
    ['search-field-idle', 'SearchField'],
    ['select-idle', 'Select'],
  ]) {
    const { element } = mutatedMigrationElement(caseId, (data) => { data.placeholder = `Fixture ${family} placeholder`; });
    assert.equal(element.props.placeholder, `Fixture ${family} placeholder`, `${family} Mux UI adapter must consume fixture placeholder`);
  }
  const swatches = mutatedMigrationElement('color-swatch-picker-selected', (data) => { data.items = [{ id: 'amber', color: '#f59e0b' }]; });
  assert.deepEqual(swatches.element.props.items, [{ id: 'amber', color: '#f59e0b' }]);
  assert.equal(swatches.element.props.value, '#f59e0b');
  const table = mutatedMigrationElement('table-selected', (data) => { data.rows = [{ id: 'lin', values: { name: 'Lin', role: 'Designer' } }]; });
  assert.deepEqual(table.element.props.rows, [{ id: 'lin', values: { name: 'Lin', role: 'Designer' } }]);
  assert.deepEqual(table.args.selectedIds, ['lin']);
});

test('the shared fixture model covers every canonical rendering field and both adapters consume it', async () => {
  const fields = ['label', 'placeholder', 'items', 'options', 'choices', 'children', 'columns', 'rows', 'date', 'dateRange', 'time', 'color', 'values'];
  for (const entry of migrationCases) {
    const fixture = sharedFixtureInput(entry);
    const model = fixtureRenderModel(fixture);
    assert.equal(model.copy, fixture.copy, `${entry.id}: copy must use the shared fixture`);
    for (const field of fields) assert.deepEqual(model.data[field], fixture.data[field], `${entry.id}: ${field} must use the shared fixture`);
  }

  const button = mutatedMigrationElement('button-idle', (data, fixture) => { fixture.copy = 'Fixture copy'; });
  const label = mutatedMigrationElement('text-field-idle', (data) => { data.label = 'Fixture field label'; });
  assert.equal(label.element.props.label, 'Fixture field label');
  assert.equal(button.element.props.children, 'Fixture copy');

  const breadcrumbs = mutatedMigrationElement('breadcrumbs-idle', (data) => { data.items = ['Fixture breadcrumb']; });
  assert.deepEqual(breadcrumbs.element.props.items, [{ id: '0', label: 'Fixture breadcrumb', href: '#' }]);
  const radio = mutatedMigrationElement('radio-group-idle', (data) => { data.options = [{ value: 'fixture', label: 'Fixture option' }]; });
  assert.deepEqual(radio.element.props.options, [{ value: 'fixture', label: 'Fixture option' }]);
  const checkbox = mutatedMigrationElement('checkbox-group-idle', (data) => { data.choices = [{ value: 'fixture', label: 'Fixture choice' }]; });
  assert.equal(checkbox.element.props.children.props.value, 'fixture');
  assert.equal(checkbox.element.props.children.props.children, 'Fixture choice');

  const table = mutatedMigrationElement('table-idle', (data) => {
    data.columns = [{ id: 'fixture', label: 'Fixture column' }];
    data.rows = [{ id: 'fixture-row', values: { fixture: 'Fixture cell' } }];
  });
  assert.deepEqual(table.element.props.columns, [{ id: 'fixture', label: 'Fixture column' }]);
  assert.deepEqual(table.element.props.rows, [{ id: 'fixture-row', values: { fixture: 'Fixture cell' } }]);

  const meter = mutatedMigrationElement('meter-idle', (data) => { data.values.meter = 13; });
  const progress = mutatedMigrationElement('progress-bar-idle', (data) => { data.values.progress = 17; });
  const number = mutatedMigrationElement('number-field-idle', (data) => { data.values.number = 19; });
  const slider = mutatedMigrationElement('slider-idle', (data) => { data.values.slider = 23; });
  assert.equal(meter.element.props.value, 13);
  assert.equal(progress.element.props.value, 17);
  assert.equal(number.element.props.defaultValue, 19);
  assert.equal(slider.element.props.defaultValue, 23);

  const date = mutatedMigrationElement('date-field-idle', (data) => { data.date = '2031-04-05'; });
  const dateRange = mutatedMigrationElement('date-range-picker-idle', (data) => { data.dateRange = { start: '2031-04-05', end: '2031-04-12' }; });
  const time = mutatedMigrationElement('time-field-idle', (data) => { data.time = '17:45'; });
  const color = mutatedMigrationElement('color-field-idle', (data) => { data.color = '#123456'; });
  assert.equal(date.element.props.defaultValue, '2031-04-05');
  assert.deepEqual(dateRange.element.props.defaultValue, { start: '2031-04-05', end: '2031-04-12' });
  assert.equal(time.element.props.defaultValue, '17:45');
  assert.equal(color.element.props.defaultValue, '#123456');

  const disclosure = mutatedMigrationElement('disclosure-group-idle', (data) => {
    data.children.disclosureGroup = [{ id: 'fixture', title: 'Fixture title', content: 'Fixture content' }];
  });
  const form = mutatedMigrationElement('form-idle', (data) => {
    data.children.form = { fieldLabel: 'Fixture field', submit: 'Fixture submit' };
  });
  const toolbar = mutatedMigrationElement('toolbar-idle', (data) => { data.children.toolbar = ['Fixture toolbar']; });
  const toggle = mutatedMigrationElement('toggle-button-group-idle', (data) => {
    data.children.toggleButtonGroup = [{ id: 'fixture', label: 'Fixture toggle' }];
  });
  assert.equal(disclosure.element.props.children.props.id, 'fixture');
  assert.equal(form.element.props.children[0].props.label, 'Fixture field');
  assert.equal(form.element.props.children[1].props.children, 'Fixture submit');
  assert.equal(toolbar.element.props.children.props.children, 'Fixture toolbar');
  assert.equal(toggle.element.props.children.props.id, 'fixture');

});

test('activation recovery rejects a poisoned marker before touching an outside sentinel', async () => {
  const root = await mkdtemp('/tmp/muxui-visual-activation-poison-');
  const outsideRoot = await mkdtemp('/tmp/muxui-visual-activation-sentinel-');
  const markerPath = join(root, 'visual-migration', '.activation-v2.json');
  const sentinel = join(outsideRoot, 'sentinel.txt');
  try {
    await mkdir(join(root, 'visual-migration'), { recursive: true });
    await writeFile(sentinel, 'must remain');
    const poisoned = {
      schema: 'muxui-react-visual-migration-activation-v2',
      phase: 'activated',
      manifest: sentinel,
      report: sentinel,
      manifestBackup: sentinel,
      reportBackup: sentinel,
      muxuiCaptureProvenance: sentinel,
      muxuiCaptureProvenanceBackup: sentinel,
      previousSnapshot: sentinel,
      nextSnapshot: sentinel,
    };
    await writeFile(markerPath, `${JSON.stringify(poisoned)}\n`);
    const markerBytes = await readFile(markerPath);
    await assert.rejects(recoverVisualMigrationActivation({ root }), /canonical path|contained content-addressed|schema/u);
    assert.deepEqual(await readFile(sentinel, 'utf8'), 'must remain');
    assert.deepEqual(await readFile(markerPath), markerBytes);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test('activation recovery restores the previous canonical files after a hard interruption', async () => {
  const root = await mkdtemp('/tmp/muxui-visual-activation-valid-');
  const visualRoot = join(root, 'visual-migration');
  const oldSnapshot = join(visualRoot, 'baselines', `sha256-${'1'.repeat(64)}`);
  const nextSnapshot = join(visualRoot, 'baselines', `sha256-${'2'.repeat(64)}`);
  const manifest = join(visualRoot, 'manifest.json');
  const report = join(visualRoot, 'results', 'comparison.json');
  const muxui = join(visualRoot, 'results', 'muxui-capture-provenance.json');
  const marker = join(visualRoot, '.activation-v2.json');
  try {
    await mkdir(oldSnapshot, { recursive: true });
    await mkdir(nextSnapshot, { recursive: true });
    await mkdir(join(visualRoot, 'results'), { recursive: true });
    const files = [
      [manifest, `${manifest}.previous`, 'old manifest'],
      [report, `${report}.previous`, 'old report'],
      [muxui, `${muxui}.previous`, 'old Mux UI provenance'],
    ];
    for (const [, backup, contents] of files) await writeFile(backup, contents);
    const markerValue = {
      schema: 'muxui-react-visual-migration-activation-v2',
      phase: 'backed-up',
      manifest,
      report,
      manifestBackup: `${manifest}.previous`,
      reportBackup: `${report}.previous`,
      muxuiCaptureProvenance: muxui,
      muxuiCaptureProvenanceBackup: `${muxui}.previous`,
      previousSnapshot: oldSnapshot,
      nextSnapshot,
    };
    await writeFile(marker, `${JSON.stringify(markerValue)}\n`);
    assert.equal(await recoverVisualMigrationActivation({ root }), true);
    for (const [target, , contents] of files) assert.equal(await readFile(target, 'utf8'), contents);
    await access(oldSnapshot);
    await assert.rejects(access(nextSnapshot));
    await assert.rejects(access(marker));
    for (const [, backup] of files) await assert.rejects(access(backup));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('activation path validation rejects symlinked migration roots before touching outside sentinels', async () => {
  const root = await mkdtemp('/tmp/muxui-visual-activation-symlink-');
  const outsideRoot = await mkdtemp('/tmp/muxui-visual-activation-outside-');
  const visualRoot = join(root, 'visual-migration');
  const sentinel = join(outsideRoot, 'sentinel.txt');
  const active = 'visual-migration/baselines/sha256-1111111111111111111111111111111111111111111111111111111111111111';
  const next = 'visual-migration/baselines/sha256-2222222222222222222222222222222222222222222222222222222222222222';
  try {
    await mkdir(join(visualRoot, 'baselines'), { recursive: true });
    await mkdir(join(visualRoot, 'donors'), { recursive: true });
    await writeFile(sentinel, 'must remain');
    const outsideResults = join(outsideRoot, 'results');
    await mkdir(outsideResults, { recursive: true });
    await symlink(outsideResults, join(visualRoot, 'results'), 'dir');
    await assert.rejects(
      assertVisualMigrationActivationPaths(root, { manifest: { baselineDirectory: active }, nextManifest: { baselineDirectory: next } }),
      /symbolic link/u,
    );
    const activePath = resolve(root, active);
    await mkdir(activePath, { recursive: true });
    await symlink(sentinel, join(activePath, 'button-idle--light.png'), 'file');
    await assert.rejects(
      validateSnapshotFiles(activePath, [{ id: 'button-idle--light', baseline: 'button-idle--light.png', baselineSha256: `sha256:${'0'.repeat(64)}` }], { root }),
      /symbolic link/u,
    );
    await assert.rejects(
      activateVisualMigrationArtifacts({ baselineDirectory: active }, { nextManifest: { baselineDirectory: next }, report: {}, root }),
      /symbolic link/u,
    );
    assert.equal(await readFile(sentinel, 'utf8'), 'must remain');
    await rm(join(visualRoot, 'results'), { force: true });
    await mkdir(join(visualRoot, 'results'), { recursive: true });
    await symlink(outsideRoot, resolve(root, next), 'dir');
    await assert.rejects(
      assertVisualMigrationSnapshotPaths({ root, snapshotPath: resolve(root, next), activeSnapshotPath: resolve(root, active) }),
      /symbolic link/u,
    );
    await assert.rejects(
      assertVisualMigrationActivationPaths(root, { manifest: { baselineDirectory: active }, nextManifest: { baselineDirectory: next } }),
      /symbolic link/u,
    );
    assert.equal(await readFile(sentinel, 'utf8'), 'must remain');
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test('every semantic case has explicit fixture, action, adaptation, and light/dark provenance', () => {
  assert.equal(manifest.cases.length, migrationCases.length);
  for (const entry of manifest.cases) {
    assert.equal(entry.fixture.frame.viewport.width, 1000);
    assert.equal(entry.fixture.frame.viewport.height, 700);
    assert.match(entry.fixtureContractSha256, /^sha256:[0-9a-f]{64}$/u);
    assert.ok(entry.adaptations.length > 0);
    assert.ok(entry.adaptations.every((adaptation) => !Object.hasOwn(adaptation, 'excludedFromPixelRegion')));
    assert.match(entry.styleFacts.selector, /migration-equivalent-frame/u);
    assert.match(entry.runtimeFixtureSha256, /^sha256:[0-9a-f]{64}$/u);
    assert.ok(entry.styleFactsByMode.light);
    assert.ok(entry.styleFactsByMode.dark);
    assert.deepEqual(entry.equivalentPartFacts.muxuiByMode.light, entry.equivalentPartFacts.muxuiByMode.dark);
    for (const mode of ['light', 'dark']) {
      assert.match(entry.baseline[mode].sha256, /^sha256:[0-9a-f]{64}$/u);
      assert.match(entry.donor.artifacts[mode].sha256, /^sha256:[0-9a-f]{64}$/u);
      assert.deepEqual(entry.donor.artifacts[mode].equivalentPart, entry.equivalentPartFacts.donor);
    }
  }
  assert.equal(manifest.donorBindingSha256, donorBindingSha256(manifest));
  for (const result of comparison.comparisons) {
    assert.equal(result.componentRegion.status, 'compared');
    assert.equal(result.pixelComparison.pass, result.componentRegion.pass);
    assert.equal(result.pass, result.pixelComparison.pass && result.styleComparison.frame.pass && result.styleComparison.equivalentPart.pass);
    assert.ok(result.normalizedFrameComparison, `${result.id}/${result.mode} must retain the normalized frame probe result`);
  }
  assert.equal(comparison.adaptations.some((adaptation) => Object.hasOwn(adaptation, 'excludedFromPixelRegion')), false);
});

test('Mux UI capture provenance rejects substituted computed styles even after rebuilding the report', async () => {
  const substituted = structuredClone(manifest);
  for (const mode of ['light', 'dark']) {
    substituted.cases[0].styleFactsByMode[mode].properties.fontSize = '99px';
  }
  substituted.cases[0].styleFacts.properties.fontSize = '99px';
  for (const mode of ['light', 'dark']) {
    substituted.cases[0].equivalentPartFacts.muxuiByMode[mode].properties.fontSize = '99px';
  }
  substituted.cases[0].equivalentPartFacts.muxui.properties.fontSize = '99px';
  const rebuilt = await buildComparisonReport(substituted);
  await assert.rejects(validateSealedComparison(substituted, { report: rebuilt }), /Mux UI capture provenance/);
});

test('manifest validation rejects changed baseline identity and weakened thresholds', async () => {
  const changed = structuredClone(manifest);
  changed.cases[0].baseline.light.sha256 = `sha256:${'0'.repeat(64)}`;
  await assert.rejects(validateManifest(changed), /SHA-256 does not match/);
  const weakened = structuredClone(manifest);
  weakened.thresholds.maxDiffPixelRatio = 1;
  await assert.rejects(validateManifest(weakened), /thresholds/);
  const changedPath = structuredClone(manifest);
  changedPath.cases[0].baseline.dark.path = `${changedPath.baselineDirectory}/switch-idle--dark.png`;
  await assert.rejects(validateManifest(changedPath), /pinned capture file/);
});

test('diagnostic paths and content-addressed snapshot paths reject traversal', () => {
  assert.throws(() => assertSafeCaseId('../escape'), /lowercase kebab-case/);
  assert.throws(() => resultFilePath('../escape', 'actual.png'), /lowercase kebab-case/);
  assert.throws(() => resultFilePath('button-idle', '../manifest.json'), /suffix is not safe/);
  assert.match(resultFilePath('button-idle', 'actual.png'), /visual-migration\/results\/button-idle\.actual\.png$/u);
  assertSafeSnapshotDirectory(manifest.baselineDirectory);
  assert.throws(() => assertSafeSnapshotDirectory('visual-migration/baselines/../../tmp'), /content-addressed/);
});

test('comparison reports are pure and have no retained-tree writer', () => {
  assert.equal('writeComparisonReport' in visualMigrationModule, false);
  // A report is built in memory; retained results can only be installed by the
  // guarded activation transaction, so a results symlink cannot become a write
  // target through a standalone report helper.
});

test('diagnostic capture never writes through the retained results tree', async () => {
  const root = await mkdtemp('/tmp/muxui-visual-diagnostic-symlink-');
  const outsideRoot = await mkdtemp('/tmp/muxui-visual-diagnostic-sentinel-');
  const retainedResults = join(root, 'visual-migration', 'results');
  const diagnosticRoot = join(root, 'diagnostics');
  const sentinel = join(outsideRoot, 'sentinel.txt');
  try {
    await mkdir(join(root, 'visual-migration'), { recursive: true });
    await mkdir(diagnosticRoot, { recursive: true });
    await writeFile(sentinel, 'must remain');
    await symlink(outsideRoot, retainedResults, 'dir');
    const diagnosticPath = resultFilePath('button-idle', 'error.txt', { root: diagnosticRoot });
    await writeFile(diagnosticPath, 'diagnostic');
    assert.equal(await readFile(sentinel, 'utf8'), 'must remain');
    assert.equal(await readFile(diagnosticPath, 'utf8'), 'diagnostic');
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test('update identity preserves the expanded case inventory and all donor provenance', () => {
  const hashes = expectedCaptureInventory.map(([, id, , , mode]) => manifest.cases.find((entry) => entry.id === id).baseline[mode].sha256);
  const next = updateManifestIdentity(manifest, { baselineSha256: hashes, capture: { runtime: manifest.capture.runtime } });
  assert.deepEqual(next.cases.map(({ id, component, state }) => [id, component, state]), expectedCaseInventory);
  assert.deepEqual(next.donor, manifest.donor);
  assert.equal(next.cases[0].baseline.light.sha256, hashes[0]);
  assert.throws(() => updateManifestIdentity(manifest, { baselineSha256: hashes.slice(1) }), /one SHA-256 identity/);
});

test('Mux UI capture runner drift is update-only and update identity binds the current source', async () => {
  const hashes = expectedCaptureInventory.map(([, id, , , mode]) => manifest.cases.find((entry) => entry.id === id).baseline[mode].sha256);
  const currentRunnerSource = await readFile(resolve(appRoot, 'test/run-visual-migration.mjs'));
  const currentRunnerHash = sha256(currentRunnerSource);
  const drifted = structuredClone(manifest);
  drifted.bootstrap.muxuiCaptureRunnerSourceSha256 = `sha256:${'0'.repeat(64)}`;
  await assert.rejects(validateManifest(drifted, { allowMissingMuxuiCaptureProvenance: true }), /Mux UI capture runner source SHA-256 does not match/);
  await assert.rejects(validateManifest(drifted, { allowMuxuiCaptureRunnerSourceDrift: true }), /available only during update-only validation/);
  await assert.doesNotReject(validateManifest(drifted, {
    allowMissingMuxuiCaptureProvenance: true,
    allowMuxuiCaptureRunnerSourceDrift: true,
  }));
  const rebound = updateManifestIdentity(manifest, { baselineSha256: hashes, muxuiCaptureRunnerSourceSha256: currentRunnerHash });
  assert.equal(rebound.bootstrap.muxuiCaptureRunnerSourceSha256, currentRunnerHash);
});

test('semantic negative cases fail closed: portal omission, no-op action, fixture/report substitution, and pixel exclusion', async () => {
  const portalOmission = structuredClone(manifest);
  portalOmission.cases.find(({ id }) => id === 'dialog-open').region.requiredSelectors = ['.muxui-dialog'];
  await assert.rejects(validateManifest(portalOmission), /region must equal the canonical semantic-region contract/);

  const noOpAction = structuredClone(manifest);
  const actionCase = noOpAction.cases.find(({ action }) => action?.type === 'open');
  actionCase.action = { type: 'focus', selector: '.missing-action-target' };
  await assert.rejects(validateManifest(noOpAction), /action must equal the canonical matched state action/);

  const fixtureSubstitution = structuredClone(manifest);
  fixtureSubstitution.cases[0].fixture.copy = 'Substituted';
  await assert.rejects(validateManifest(fixtureSubstitution), /fixture must equal the canonical shared fixture contract/);

  const reportSubstitution = structuredClone(comparison);
  reportSubstitution.comparisons[0].pixelComparison.mismatchedPixels = 1;
  await assert.rejects(validateSealedComparison(manifest, { report: reportSubstitution }), /independently recomputed PNG comparison/);

  const pixelExclusion = structuredClone(manifest);
  pixelExclusion.cases[0].adaptations[0].excludedFromPixelRegion = true;
  await assert.rejects(validateManifest(pixelExclusion), /without excluding component pixels/);
});

test('interrupted activation preserves the active Mux UI manifest, report, and baseline', async () => {
  const manifestBytes = await readFile(resolve(appRoot, 'visual-migration/manifest.json'));
  const reportBytes = await readFile(resolve(appRoot, 'visual-migration/results/comparison.json'));
  const muxuiProvenanceBytes = await readFile(resolve(appRoot, manifest.bootstrap.muxuiCaptureProvenance.path));
  const baselineFiles = await readdir(resolve(appRoot, manifest.baselineDirectory));
  await assert.rejects(activateVisualMigrationArtifacts(manifest, { nextManifest: manifest, report: comparison, failureAt: 'after-report' }), /injected visual migration activation interruption/);
  assert.deepEqual(await readFile(resolve(appRoot, 'visual-migration/manifest.json')), manifestBytes);
  assert.deepEqual(await readFile(resolve(appRoot, 'visual-migration/results/comparison.json')), reportBytes);
  assert.deepEqual(await readFile(resolve(appRoot, manifest.bootstrap.muxuiCaptureProvenance.path)), muxuiProvenanceBytes);
  assert.deepEqual(await readdir(resolve(appRoot, manifest.baselineDirectory)), baselineFiles);
  await validateManifest(manifest);
});

test('PNG and computed-style comparisons fail closed', () => {
  const expected = new PNG({ width: 2, height: 2 });
  const actual = new PNG({ width: 2, height: 2 });
  expected.data.fill(255);
  actual.data.fill(255);
  actual.data[0] = 0;
  const result = comparePngs(PNG.sync.write(expected), PNG.sync.write(actual), { maxDiffPixelRatio: 0, pixelThreshold: 0 });
  assert.equal(result.pass, false);
  assert.equal(result.mismatchedPixels, 1);
  assert.deepEqual(compareStyleFacts({ display: 'contents', boxSizing: 'border-box' }, { properties: { display: 'contents', boxSizing: 'border-box' } }), []);
  assert.ok(compareStyleFacts({ display: 'block' }, { properties: { display: 'contents' } }).length > 0);
});

test('capture environment mismatches fail before routine comparison', () => {
  const actual = structuredClone(manifest.capture);
  actual.browser.version = '150.0.0.0';
  actual.platform = 'linux';
  actual.architecture = 'x64';
  const mismatches = captureEnvironmentMismatches(actual, manifest.capture);
  assert.ok(mismatches.some((value) => value.startsWith('browser.version')));
  assert.ok(mismatches.some((value) => value.startsWith('platform')));
  assert.ok(mismatches.some((value) => value.startsWith('architecture')));
  assert.throws(() => assertCaptureEnvironment(actual, manifest.capture), /capture environment mismatch/);
});

test('Mux UI capture readiness waits for the requested case and fails closed for stale or invalid DOM', () => {
  const expectedCaseSelector = '[data-muxui-migration-case="color-swatch-picker-selected"]';
  const expected = {
    expectedScheme: 'light',
    expectedToken: 'run-token',
    expectedCaseSelector,
  };
  const makeDocument = ({ caseCount = 1, errorVisible = false, preparingVisible = false } = {}) => {
    const visibleElement = (visible) => ({
      style: {
        display: visible ? 'block' : 'none',
        visibility: 'visible',
        opacity: '1',
      },
    });
    const caseMarkers = Array.from({ length: caseCount }, () => ({}));
    return {
      defaultView: { getComputedStyle: (element) => element.style },
      documentElement: { getAttribute: (name) => name === 'data-muxui-color-scheme' ? 'light' : null },
      querySelector(selector) {
        if (selector === '#storybook-root') return { firstElementChild: {} };
        if (selector === '.muxui-storybook-surface') return {};
        if (selector === '[data-muxui-migration-run-token]') return { getAttribute: () => 'run-token' };
        if (selector === '.sb-errordisplay') return errorVisible ? visibleElement(true) : null;
        if (selector === '.sb-preparing-story') return preparingVisible ? visibleElement(true) : null;
        return null;
      },
      querySelectorAll: (selector) => selector === expectedCaseSelector ? caseMarkers : [],
    };
  };

  assert.equal(visualMigrationStoryReady({ ...expected, documentRoot: makeDocument() }), true);
  assert.equal(visualMigrationStoryReady({ ...expected, documentRoot: makeDocument({ caseCount: 0 }) }), false, 'stale or absent case must not satisfy run-token readiness');
  assert.equal(visualMigrationStoryReady({ ...expected, documentRoot: makeDocument({ caseCount: 2 }) }), false, 'duplicate case markers must not satisfy readiness');
  assert.equal(visualMigrationStoryReady({ ...expected, documentRoot: makeDocument({ errorVisible: true }) }), false, 'runtime errors must not be masked by a matching case');
  assert.equal(visualMigrationStoryReady({ ...expected, documentRoot: makeDocument({ preparingVisible: true }) }), false, 'Storybook preparation must not be treated as a settled capture');
});

test('routine checker and fixture contain no Tale runtime, dependency, path, or external override', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const routineSource = await readFile(new URL('./run-visual-migration.mjs', import.meta.url), 'utf8');
  const fixture = await readFile(new URL('../src/migration-visual.fixture.mjs', import.meta.url), 'utf8');
  const contract = await readFile(new URL('../src/visual-migration-contract.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(JSON.stringify(packageJson), /tale-ui|Tale UI|tale path/iu);
  assert.doesNotMatch(routineSource, /tale-ui|\/Users\/admin\/Projects\/tale-ui/iu);
  assert.doesNotMatch(fixture, /@tale-ui\/react|tale-ui/iu);
  assert.match(routineSource, /startStorybook\(await reservePort\(\), runToken\)/u);
  assert.match(routineSource, /VITE_MUXUI_MIGRATION_RUN_TOKEN: runToken/u);
  assert.match(contract, /migrationStoryId/u);
  assert.equal(packageJson.scripts['check:visual:migration'], 'node test/run-visual-migration.mjs');
  assert.equal(packageJson.scripts['update:visual:migration'], 'node test/run-visual-migration.mjs --update');
  assert.doesNotMatch(JSON.stringify(manifest), /VITE_MUXUI_MIGRATION_RUN_TOKEN|runToken/iu);
});

test('generated Storybook projection remains exactly 53 families', async () => {
  const generatedStories = (await readdir(resolve(appRoot, '.storybook/generated'))).filter((entry) => entry.endsWith('.stories.mjs'));
  assert.equal(generatedStories.length, 53);
});
