import descriptor from '../../../packages/react/generated/descriptor.json' with { type: 'json' };
import familySnapshot from '../../../catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json' with { type: 'json' };
import r10Crosswalk from '../../../catalog/react-r1-0/donor-crosswalk.json' with { type: 'json' };
import r12Crosswalk from '../../../catalog/react-r1-2/donor-crosswalk.json' with { type: 'json' };
import r13Crosswalk from '../../../catalog/react-r1-3/donor-crosswalk.json' with { type: 'json' };
import r14Crosswalk from '../../../catalog/react-r1-4/donor-crosswalk.json' with { type: 'json' };

/** Shared browser/Node contract for the one-time donor comparison fixture. */
export const migrationStoryId = 'muxui-react-r1-1-button--default';
export const migrationQuery = Object.freeze({ 'muxui-migration': '1' });
export const migrationFrame = Object.freeze({
  viewport: Object.freeze({ width: 1000, height: 700 }),
  // The Virtualizer's layout measures its host during mount. Keep that host
  // fixed in both renderers so the donor capture cannot depend on grid or
  // child-content sizing (or produce NaN layout widths).
  virtualizer: Object.freeze({ width: 340, height: 180 }),
  deviceScaleFactor: 1,
  background: Object.freeze({ light: '#ffffff', dark: '#000000' }),
  fontFamily: 'system-ui',
  reducedMotion: true,
});
// A non-enumerable symbol lets the private fixture pass the canonical contract
// through the existing Storybook adapters without forwarding migration-only
// fields to a public component or DOM node.
export const migrationFixtureSymbol = Symbol.for('muxui.visual-migration.fixture');

const crosswalks = [r10Crosswalk, r12Crosswalk, r13Crosswalk, r14Crosswalk];
const donorDisposition = new Map(crosswalks.flatMap(({ components, button }) => [
  ...Object.entries(components),
  ...(button ? [['button', button]] : []),
]));
const snapshotFamilies = new Map(familySnapshot.families.map((family) => [family.muxuiPublicFamily, family]));

function slug(name) {
  return name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

const allRecords = descriptor.bindings.map((binding) => ({
  family: binding.export,
  slug: slug(binding.export),
  tranche: snapshotFamilies.get(binding.export)?.tranche,
  binding,
  disposition: donorDisposition.get(slug(binding.export))?.disposition,
}));

if (allRecords.length !== 53) throw new Error(`visual migration requires the canonical 53-family descriptor, found ${allRecords.length}`);

export const noApplicableDonorFamilies = Object.freeze(allRecords
  .filter(({ disposition }) => disposition === 'no-applicable-donor')
  .map(({ family }) => family));
export const applicableMigrationRecords = Object.freeze(allRecords.filter(({ disposition }) => disposition === 'adapt'));
if (applicableMigrationRecords.length !== 51 || noApplicableDonorFamilies.join(',') !== 'Group,TokenField') {
  throw new Error('visual migration donor dispositions must derive exactly 51 applicable families and Group/TokenField as no-applicable-donor');
}

const commonData = Object.freeze({
  label: 'Name',
  placeholder: 'Enter a name',
  items: Object.freeze(['Melbourne', 'Sydney']),
  options: Object.freeze([{ value: 's', label: 'Small' }, { value: 'l', label: 'Large' }]),
  choices: Object.freeze([{ value: 'email', label: 'Email' }, { value: 'sms', label: 'SMS' }]),
  children: Object.freeze({
    disclosureGroup: Object.freeze([
      Object.freeze({ id: 'one', title: 'One', content: 'First panel' }),
      Object.freeze({ id: 'two', title: 'Two', content: 'Second panel' }),
    ]),
    toggleButtonGroup: Object.freeze([
      Object.freeze({ id: 'bold', label: 'Bold' }),
      Object.freeze({ id: 'italic', label: 'Italic' }),
    ]),
    toolbar: Object.freeze(['Bold', 'Italic']),
    form: Object.freeze({ fieldLabel: 'Name', submit: 'Save' }),
  }),
  columns: Object.freeze([{ id: 'name', label: 'Name', isRowHeader: true }, { id: 'role', label: 'Role' }]),
  rows: Object.freeze([{ id: 'ada', values: Object.freeze({ name: 'Ada', role: 'Engineer' }) }, { id: 'grace', values: Object.freeze({ name: 'Grace', role: 'Designer' }) }]),
  date: '2026-08-26',
  dateRange: Object.freeze({ start: '2026-08-26', end: '2026-09-01' }),
  time: '09:30',
  color: '#ff0000',
  values: Object.freeze({ meter: 72, progress: 64, number: 2, slider: 60 }),
});

const familyCopy = Object.freeze({
  Autocomplete: 'Choose a city', Breadcrumbs: 'Breadcrumb', Button: 'Save', Calendar: 'Date', Checkbox: 'Enable notifications',
  CheckboxGroup: 'Notifications', ColorArea: 'Color', ColorField: 'Color', ColorPicker: 'Color', ColorSlider: 'Red', ColorSwatch: 'Red',
  ColorSwatchPicker: 'Palette', ColorWheel: 'Hue', ComboBox: 'Choose a city', DateField: 'Birthday', DatePicker: 'Due date',
  DateRangePicker: 'Trip dates', Disclosure: 'Details', DisclosureGroup: 'One', DropZone: 'Upload files', FileTrigger: 'Choose files',
  Form: 'Name', GridList: 'Grid', Link: 'Settings', ListBox: 'List', Menu: 'Actions', Meter: 'Storage', Dialog: 'Delete draft',
  NumberField: 'Quantity', Popover: 'More actions', PreviewTrigger: 'Document preview', ProgressBar: 'Upload', RadioGroup: 'Size',
  RangeCalendar: 'Trip', SearchField: 'Search', Select: 'Choose a city', Separator: '', Slider: 'Volume', Switch: 'Notifications',
  Table: 'People', Tabs: 'Sections', TagGroup: 'Tags', ToggleButton: 'Pin', ToggleButtonGroup: 'Formatting', Toolbar: 'Formatting',
  Tooltip: 'Keyboard shortcut: ⌘K', Tree: 'Files', Virtualizer: 'Results', TimeField: 'Start time', TextField: 'Name', Toast: 'Saved',
});

/** The semantic copy/data contract is shared by the MuxUI and donor adapters. */
export function fixtureContractFor(record, state = 'idle') {
  const { family } = record;
  const breadcrumbItems = state === 'disabled'
    ? [{ id: 'home', label: 'Home', href: '#', disabled: true }, { id: 'docs', label: 'Docs', href: '#' }]
    : undefined;
  return {
    copy: familyCopy[family] ?? family,
    data: {
      ...commonData,
      ...(family === 'Breadcrumbs' && breadcrumbItems ? { items: breadcrumbItems } : {}),
      ...(family === 'TagGroup' ? { items: Object.freeze(['Design', 'Engineering']) } : {}),
      ...(family === 'ColorSwatchPicker' ? { items: Object.freeze([{ id: 'red', color: '#ff0000' }, { id: 'blue', color: '#0000ff' }]) } : {}),
      ...(family === 'Tree' ? { items: Object.freeze([{ id: 'src', label: 'src', children: [{ id: 'main', label: 'main.jsx' }] }]) } : {}),
      ...(family === 'Tabs' ? { items: Object.freeze([{ id: 'overview', label: 'Overview', panel: 'Overview content' }, { id: 'details', label: 'Details', panel: 'Details content' }]) } : {}),
    },
    frame: migrationFrame,
  };
}

const portalFamilies = new Set(['Dialog', 'Popover', 'PreviewTrigger', 'Toast', 'Tooltip']);
const openPortalFamilies = new Set(['DatePicker', 'DateRangePicker', 'ComboBox', 'Select']);
const behaviorOnlyStates = new Set(['pressed', 'dismissed', 'submitting', 'opening', 'closing', 'entering', 'exiting']);

// These states are intentionally not rasterized: they are transient or have
// no public MuxUI state prop. Keep the proof target explicit so a future state
// cannot silently fall back to a generic unsupported claim.
const behaviorStateEvidence = Object.freeze({
  'Link/pressed': { selector: '.muxui-link', interaction: 'press', assertion: 'The focused Link is pressed through the existing Storybook interaction harness.' },
  'ToggleButton/pressed': { selector: '.muxui-toggle-button', interaction: 'press', assertion: 'The focused ToggleButton is pressed through the existing Storybook interaction harness.' },
  'Form/submitting': { selector: '.muxui-form', interaction: 'submit', assertion: 'The Form submit event is exercised by the existing Storybook interaction harness.' },
  'Dialog/dismissed': { selector: '.muxui-dialog', interaction: 'dismiss', assertion: 'The open Dialog is dismissed through its close button or Escape interaction in the existing Storybook harness.' },
  'Popover/dismissed': { selector: '.muxui-popover', interaction: 'dismiss', assertion: 'The open Popover is dismissed through outside or Escape interaction in the existing Storybook harness.' },
  'PreviewTrigger/opening': { selector: '.muxui-preview-trigger', interaction: 'lifecycle', assertion: 'PreviewTrigger opening is observed by the existing lifecycle harness.' },
  'PreviewTrigger/closing': { selector: '.muxui-preview-trigger', interaction: 'lifecycle', assertion: 'PreviewTrigger closing is observed by the existing lifecycle harness.' },
  'Toast/dismissed': { selector: '.muxui-toast-dismiss', interaction: 'dismiss', assertion: 'The Toast dismiss control and timeout lifecycle are exercised by the existing Storybook harness.' },
  'Tooltip/opening': { selector: '.muxui-tooltip', interaction: 'lifecycle', assertion: 'Tooltip opening is observed by the existing lifecycle harness.' },
  'Tooltip/closing': { selector: '.muxui-tooltip', interaction: 'lifecycle', assertion: 'Tooltip closing is observed by the existing lifecycle harness.' },
});

const unsupportedStateRationales = Object.freeze({
  'Form/invalid': 'The public Form API exposes validationBehavior but no invalid prop; field-level invalid state is covered by the field families.',
  'Menu/open': 'The public Menu API is the already-mounted collection surface and has no open prop; overlay ownership is covered by Select, ComboBox, and the overlay families.',
  'Slider/selected': 'The public Slider API has no selected prop; its value state is represented by the canonical idle/focused visual cases.',
});

function normalizedState(state) {
  return state.toLowerCase().replaceAll('-', '').replaceAll(' ', '');
}

export function semanticRegionFor(family, state) {
  if (!portalFamilies.has(family) && !(state === 'open' && openPortalFamilies.has(family))) {
    return {
      capture: 'component',
      selector: '.migration-component',
      requiredSelectors: ['.migration-component'],
    };
  }
  const requiredSelectors = {
    Dialog: state === 'open' ? ['.muxui-dialog-backdrop', '.muxui-dialog', '.muxui-button'] : ['.muxui-button'],
    Popover: state === 'open' ? ['.muxui-popover-positioner', '.muxui-popover', '.muxui-button'] : ['.muxui-button'],
    PreviewTrigger: state === 'open' ? ['.muxui-preview-trigger', '.muxui-button'] : ['.muxui-button'],
    Toast: ['.muxui-toast-region', '.muxui-toast'],
    Tooltip: state === 'open' ? ['.muxui-tooltip', '.muxui-button'] : ['.muxui-button'],
    DatePicker: ['.muxui-date-trigger', '.muxui-date-popover', '.muxui-date-dialog', '.muxui-calendar'],
    DateRangePicker: ['.muxui-date-trigger', '.muxui-date-popover', '.muxui-date-dialog', '.muxui-calendar'],
    ComboBox: ['.muxui-combo-box-trigger', '.muxui-combo-box-popover', '.muxui-combo-box-option'],
    Select: ['.muxui-select-trigger', '.muxui-select-popover', '.muxui-select-option'],
  }[family];
  return {
    capture: 'viewport',
    selector: 'body',
    requiredSelectors,
  };
}

function hasState(record, state) {
  const { binding, family } = record;
  const props = new Set(binding.api.props);
  const normalized = normalizedState(state);
  if (['idle', 'visible', 'closed', 'collapsed'].includes(normalized)) return true;
  if (normalized === 'focused') return true;
  if (normalized === 'drop target' || normalized === 'droptarget' || normalized === 'dragging') return family === 'DropZone';
  if (normalized === 'vertical' || normalized === 'horizontal') return props.has('orientation');
  if (normalized === 'selected') return props.has('checked') || props.has('selected') || props.has('selectedIds') || props.has('selectedId') || props.has('value') && ['Calendar', 'RangeCalendar', 'Select', 'Tabs', 'ColorSwatchPicker', 'CheckboxGroup', 'RadioGroup'].includes(family);
  if (normalized === 'invalid') return props.has('invalid');
  if (normalized === 'open' || normalized === 'opening' || normalized === 'closing') return props.has('open') || ['DatePicker', 'DateRangePicker', 'ComboBox', 'Select', 'Dialog', 'Popover', 'PreviewTrigger', 'Tooltip'].includes(family);
  if (normalized === 'expanded') return props.has('expanded') || props.has('expandedIds');
  if (normalized === 'indeterminate') return props.has('indeterminate') || family === 'ProgressBar';
  if (normalized === 'disabled') return family === 'Breadcrumbs' || props.has('disabled');
  if (normalized === 'readonly') return props.has('readOnly');
  if (normalized === 'required') return props.has('required');
  if (normalized === 'pending') return props.has('pending');
  if (normalized === 'low' || normalized === 'high') return family === 'Meter' && props.has('value');
  if (normalized === 'progress' || normalized === 'complete') return family === 'ProgressBar' && props.has('value');
  if (normalized === 'filled') return family === 'SearchField' && props.has('value');
  if (normalized === 'empty') return family === 'SearchField' && props.has('value') || props.has('items') || props.has('rows');
  if (normalized === 'placement') return props.has('placement');
  if (normalized === 'timed') return family === 'Toast' && props.has('duration');
  if (normalized === 'current') return family === 'Breadcrumbs' || props.has('current');
  return false;
}

function actionFor(family, state) {
  if (state === 'open') {
    const selector = {
      DatePicker: '.muxui-date-trigger', DateRangePicker: '.muxui-date-trigger',
      ComboBox: '.muxui-combo-box-trigger', Select: '.muxui-select-trigger',
    }[family];
    return selector ? { type: 'open', selector } : undefined;
  }
  if (state === 'drop-target') return { type: 'drop-target', selector: '.migration-component' };
  if (state === 'focused' || state === 'focus') return { type: 'focus', selector: '.migration-component' };
  if (state === 'pressed') return { type: 'pressed', selector: '.migration-component' };
  return undefined;
}

function stateDisposition(record, state) {
  if (record.disposition === 'no-applicable-donor') return 'no-applicable-donor';
  if (record.family === 'TagGroup' && state === 'removable') return 'muxui-only';
  if (behaviorOnlyStates.has(normalizedState(state))) return 'behavior-only';
  return hasState(record, state) ? 'visual' : 'unsupported';
}

function stateCheck(record, state, disposition) {
  if (disposition === 'visual') return { type: 'visual', assertion: 'paired Tale/Mux UI semantic-region PNG comparison' };
  if (disposition === 'no-applicable-donor') return { type: 'evidence', assertion: 'Mux UI-owned behavior is covered by the canonical Storybook state and has no pinned Tale family donor.' };
  if (disposition === 'muxui-only') return { type: 'dom', selector: '.muxui-tag-remove', assertion: 'Mux UI removable TagGroup anatomy is checked in the Mux UI DOM; pinned Tale TagGroup exposes no remove part.' };
  if (disposition === 'behavior-only') {
    const evidence = behaviorStateEvidence[`${record.family}/${state}`];
    if (!evidence) throw new Error(`missing focused behavior evidence for ${record.family}/${state}`);
    return { type: 'behavior', ...evidence };
  }
  const rationale = unsupportedStateRationales[`${record.family}/${state}`];
  if (!rationale) throw new Error(`missing public-API rationale for unsupported ${record.family}/${state}`);
  return { type: 'dom', rationale, assertion: `The ${record.family} ${state} state has no supported Mux UI prop or deterministic interaction in this contract.` };
}

const canonicalCoverageRecords = Object.freeze(allRecords.flatMap((record) => record.binding.states.map((state) => {
  const disposition = stateDisposition(record, state);
  return {
    family: record.family,
    slug: record.slug,
    state,
    disposition,
    check: stateCheck(record, state, disposition),
  };
})));
const compatibilityCoverageRecords = Object.freeze(allRecords
  .filter(({ disposition }) => disposition === 'adapt')
  .flatMap((record) => {
    const states = [];
    if (!record.binding.states.includes('idle') && ['Dialog', 'Popover', 'PreviewTrigger', 'Toast', 'Tooltip'].includes(record.family)) states.push('idle');
    if (['ComboBox', 'CheckboxGroup'].includes(record.family)) states.push('selected');
    return states.map((state) => ({
      family: record.family,
      slug: record.slug,
      state,
      disposition: 'visual',
      source: 'compatibility-case',
      check: { type: 'visual', assertion: 'retained compatibility comparison for the pre-expansion high-signal fixture' },
    }));
  }));
const extraCoverageRecords = Object.freeze([{ family: 'TagGroup', slug: 'tag-group', state: 'removable', disposition: 'muxui-only', check: stateCheck({ family: 'TagGroup' }, 'removable', 'muxui-only') }]);
export const canonicalStateCoverage = canonicalCoverageRecords;
export const compatibilityStateCoverage = compatibilityCoverageRecords;
export const supplementalStateCoverage = extraCoverageRecords;
export const stateCoverage = Object.freeze([...canonicalCoverageRecords, ...compatibilityCoverageRecords, ...extraCoverageRecords]);
export const visualCoverage = Object.freeze(stateCoverage.filter(({ disposition }) => disposition === 'visual'));

export const migrationCases = Object.freeze(applicableMigrationRecords.flatMap((record) => {
  const states = visualCoverage.filter(({ family }) => family === record.family).map(({ state }) => state);
  return states.map((state) => ({
    id: `${record.slug}-${state}`,
    component: record.family,
    slug: record.slug,
    tranche: record.tranche,
    state,
    selector: `[data-muxui-migration-case="${record.slug}-${state}"]`,
    action: actionFor(record.family, state),
    fixture: fixtureContractFor(record, state),
    region: semanticRegionFor(record.family, state),
  }));
}));

/**
 * Return the only fixture object that may cross the MuxUI/Tale adapter boundary.
 * Both adapters call this function at runtime; neither adapter may substitute
 * copy, data, state, or frame values from its own renderer defaults.
 */
export function sharedFixtureInput(entry) {
  const canonical = migrationCases.find(({ id }) => id === entry?.id);
  if (!canonical || canonical.component !== entry.component || canonical.state !== entry.state) {
    throw new Error(`unknown canonical migration fixture: ${entry?.id ?? 'unknown case'}`);
  }
  return structuredClone({
    id: canonical.id,
    family: canonical.component,
    state: canonical.state,
    copy: canonical.fixture.copy,
    data: canonical.fixture.data,
    frame: canonical.fixture.frame,
    action: canonical.action,
    region: canonical.region,
  });
}

const rootPartSelectors = Object.freeze({
  Button: ['.muxui-button', '.tale-button'],
  Breadcrumbs: ['.muxui-breadcrumbs', '.tale-breadcrumbs'],
  Checkbox: ['.muxui-checkbox', '.tale-checkbox'],
  Disclosure: ['.muxui-disclosure', '.tale-disclosure'],
  DisclosureGroup: ['.muxui-disclosure-group', '.tale-disclosure'],
  Link: ['.muxui-link', '.tale-link'],
  Meter: ['.muxui-meter', '.tale-meter'],
  ProgressBar: ['.muxui-progress-bar', '.tale-progress-bar'],
  Separator: ['.muxui-separator', '.tale-separator'],
  ToggleButton: ['.muxui-toggle-button', '.tale-toggle-button'],
  Autocomplete: ['.muxui-autocomplete-search', '.tale-autocomplete__search-field'],
  CheckboxGroup: ['.muxui-checkbox-group', '.tale-checkbox-group'],
  DateField: ['.muxui-date-field', '.tale-date-field'],
  DatePicker: ['.muxui-date-picker', '.tale-date-picker'],
  DateRangePicker: ['.muxui-date-range-picker', '.tale-date-range-picker'],
  Form: ['.muxui-form', '.tale-form'],
  NumberField: ['.muxui-number-field', '.tale-number-field'],
  SearchField: ['.muxui-search-field', '.tale-search-field'],
  Switch: ['.muxui-switch', '.tale-switch'],
  TextField: ['.muxui-text-field', '.tale-text-field'],
  TimeField: ['.muxui-time-field', '.tale-time-field'],
  Calendar: ['.muxui-calendar', '.tale-calendar'],
  ColorArea: ['.muxui-color-area', '.tale-color-area'],
  ColorField: ['.muxui-color-field', '.tale-color-field'],
  ColorPicker: ['.muxui-color-picker', '.tale-color-area'],
  ColorSlider: ['.muxui-color-slider', '.tale-color-slider'],
  ColorSwatch: ['.muxui-color-swatch', '.tale-color-swatch'],
  ColorSwatchPicker: ['.muxui-color-swatch-picker-item', '.tale-color-swatch-picker__item'],
  ColorWheel: ['.muxui-color-wheel', '.tale-color-wheel'],
  ComboBox: ['.muxui-combo-box', '.tale-combobox'],
  GridList: ['.muxui-grid-list', '.tale-grid-list'],
  ListBox: ['.muxui-list-box', '.tale-list-box'],
  Menu: ['.muxui-menu-item', '.tale-menu__item'],
  RadioGroup: ['.muxui-radio-group', '.tale-radio-group'],
  RangeCalendar: ['.muxui-range-calendar', '.tale-range-calendar'],
  Select: ['.muxui-select', '.tale-select'],
  Slider: ['.muxui-slider', '.tale-slider'],
  Table: ['.muxui-table', '.tale-table'],
  Tabs: ['.muxui-tabs', '.tale-tabs'],
  TagGroup: ['.muxui-tag-group', '.tale-tag-group'],
  ToggleButtonGroup: ['.muxui-toggle-button-group', '.tale-toggle-button-group'],
  Toolbar: ['.muxui-toolbar', '.tale-toolbar'],
  Tree: ['.muxui-tree', '.tale-tree'],
  Virtualizer: ['.muxui-virtualizer', '.tale-virtualizer'],
  DropZone: ['.muxui-drop-zone', '.tale-drop-zone'],
  FileTrigger: ['.muxui-button', '.tale-button'],
  Dialog: ['.muxui-dialog', '.tale-dialog__popup'],
  Popover: ['.muxui-popover', '.tale-popover__popup'],
  PreviewTrigger: ['.muxui-preview-trigger', '.tale-preview-card__trigger'],
  Toast: ['.muxui-toast', '.tale-toast'],
  Tooltip: ['.muxui-tooltip', '.tale-tooltip__popup'],
});

/** Selectors identify mapped renderer parts, not the artificial fixture frame. */
export function equivalentPartSelectorsFor(family, state = 'idle') {
  const selectors = rootPartSelectors[family];
  if (!selectors) throw new Error(`missing equivalent-part selector mapping for ${family}`);
  const triggerFamilies = new Set(['DatePicker', 'DateRangePicker', 'ComboBox', 'Select', 'PreviewTrigger', 'Tooltip']);
  if (state !== 'open' && (triggerFamilies.has(family) || ['Dialog', 'Popover'].includes(family))) {
    return family === 'PreviewTrigger'
      ? ['.muxui-button', '.tale-preview-card__trigger']
      : family === 'Tooltip'
        ? ['.muxui-button', '.tale-tooltip__trigger']
        : family === 'Dialog'
          ? ['.muxui-button', '.tale-button']
        : family === 'Popover' ? ['.muxui-button', '.tale-button']
      : family === 'ComboBox' ? ['.muxui-combo-box-trigger', '.tale-combobox__trigger']
        : family === 'Select' ? ['.muxui-select-trigger', '.tale-select__trigger']
          : ['.muxui-date-trigger', `.tale-${family === 'DatePicker' ? 'date-picker' : 'date-range-picker'}__trigger`];
  }
  return selectors;
}

export const migrationFamilyNames = Object.freeze(applicableMigrationRecords.map(({ family }) => family));
export const migrationStateNames = Object.freeze([...new Set(migrationCases.map(({ state }) => state))]);

export function isMigrationFixtureRequest(storyId, search) {
  if (storyId !== migrationStoryId) return false;
  const values = new URLSearchParams(search).getAll('muxui-migration');
  return values.length === 1 && values[0] === migrationQuery['muxui-migration'];
}
