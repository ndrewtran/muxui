import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalJson } from '@muxui/schema';
import { compileWebTheme } from '@muxui/tokens';
import {
  assertReactR10SourceContracts,
  assertReactR11GeneratedContracts,
  assertReactR12GeneratedContracts,
  assertReactR13GeneratedContracts,
  assertReactR14GeneratedContracts,
  assertReactR15GeneratedContracts,
} from './r1-contracts.mjs';
import { EXPECTED_R12_COMPONENT_SLUGS, EXPECTED_R12_DONOR_CONTRACT } from './r1-2-donor-contract.mjs';
import { EXPECTED_R13_COMPONENT_SLUGS, EXPECTED_R13_DONOR_CONTRACT } from './r1-3-donor-contract.mjs';
import { EXPECTED_R14_COMPONENT_SLUGS, EXPECTED_R14_DONOR_CONTRACT } from './r1-4-donor-contract.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageRoot, '../..');
const generatedRoot = resolve(packageRoot, 'generated');
const migrationMode = process.argv.includes('--r1-6-migration');
const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
const tokenPath = resolve(repositoryRoot, 'catalog/tokens/default-theme.json');
const tokenRaw = await readFile(tokenPath);
const tokenSha256 = createHash('sha256').update(tokenRaw).digest('hex');
const expectedTokenSha256 = 'c42821d052398b61d393a8cc464924224063e63a5723f3872f838d431199cd75';
if (tokenSha256 !== expectedTokenSha256) throw new Error('MUXUI_REACT_TOKEN_SOURCE_DRIFT');
const tokenSource = JSON.parse(tokenRaw);
const snapshot = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-0/upstream-snapshot.json'), 'utf8'));
const familySnapshot = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json'), 'utf8'));
const upstreamExportsRaw = await readFile(resolve(repositoryRoot, 'catalog/react-r1-0/upstream-exports.json'));
const upstreamExports = JSON.parse(upstreamExportsRaw);
const crosswalk = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-0/donor-crosswalk.json'), 'utf8'));
const r12Crosswalk = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-2/donor-crosswalk.json'), 'utf8'));
const r13Crosswalk = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-3/donor-crosswalk.json'), 'utf8'));
const r14Crosswalk = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-4/donor-crosswalk.json'), 'utf8'));
const r15ClosureSource = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-5/closure.json'), 'utf8'));
const r16Crosswalk = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-6/donor-crosswalk.json'), 'utf8'));
const r16FiniteFixtures = migrationMode
  ? JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-6/finite-fixtures.json'), 'utf8'))
  : undefined;
const license = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-0/license.json'), 'utf8'));
const r11Slugs = ['button', 'breadcrumbs', 'checkbox', 'disclosure', 'disclosure-group', 'group', 'link', 'meter', 'progress-bar', 'separator', 'toggle-button'];
const r12Slugs = [...EXPECTED_R12_COMPONENT_SLUGS];
const r13Slugs = [...EXPECTED_R13_COMPONENT_SLUGS];
const r14Slugs = [...EXPECTED_R14_COMPONENT_SLUGS];
const buttonSource = await readFile(resolve(packageRoot, 'src/button.mjs'), 'utf8');
const componentSource = await readFile(resolve(packageRoot, 'src/components.mjs'), 'utf8');
const toggleButtonContextSource = await readFile(resolve(packageRoot, 'src/toggle-button-context.mjs'), 'utf8');
const choiceContextSource = await readFile(resolve(packageRoot, 'src/choice-context.mjs'), 'utf8');
const fieldsSource = await readFile(resolve(packageRoot, 'src/fields.mjs'), 'utf8');
const collectionsSource = await readFile(resolve(packageRoot, 'src/collections.mjs'), 'utf8');
const overlaysSource = await readFile(resolve(packageRoot, 'src/overlays.mjs'), 'utf8');
const authoredStyleSources = await Promise.all([
  'base.css',
  'components.css',
  'fields.css',
  'collections.css',
  'overlays.css',
].map((fileName) => readFile(resolve(packageRoot, 'src/styles', fileName), 'utf8')));
const authoredCss = authoredStyleSources.map((source) => source.trim()).join('\n\n');
const runtimeSources = {
  'packages/react/src/button.mjs': buttonSource,
  'packages/react/src/components.mjs': componentSource,
  'packages/react/src/fields.mjs': fieldsSource,
  'packages/react/src/collections.mjs': collectionsSource,
  'packages/react/src/overlays.mjs': overlaysSource,
};
const buttonArtifact = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/components/button/artifact.json'), 'utf8'));
const toggleButtonArtifact = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/components/toggle-button/artifact.json'), 'utf8'));
const toggleButtonGroupArtifact = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/components/toggle-button-group/artifact.json'), 'utf8'));
const checkboxArtifact = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/components/checkbox/artifact.json'), 'utf8'));
const checkboxGroupArtifact = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/components/checkbox-group/artifact.json'), 'utf8'));
const radioGroupArtifact = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/components/radio-group/artifact.json'), 'utf8'));
const autocompleteArtifact = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/components/autocomplete/artifact.json'), 'utf8'));
const buttonBinding = buttonArtifact.bindings['web.react'];
const toggleButtonBinding = toggleButtonArtifact.bindings['web.react'];
const toggleButtonGroupBinding = toggleButtonGroupArtifact.bindings['web.react'];
const checkboxBinding = checkboxArtifact.bindings['web.react'];
const checkboxGroupBinding = checkboxGroupArtifact.bindings['web.react'];
const radioGroupBinding = radioGroupArtifact.bindings['web.react'];
const autocompleteBinding = autocompleteArtifact.bindings['web.react'];
const expectedButtonProps = ['disabled', 'pending', 'showTextWhileLoading', 'variant', 'tone', 'size'];
const expectedButtonDefaults = {
  disabled: false,
  pending: false,
  showTextWhileLoading: false,
  variant: 'primary',
  tone: 'default',
  size: 'md',
};
const expectedButtonFiniteApi = {
  variant: ['primary', 'neutral', 'ghost', 'danger', 'danger-neutral', 'danger-ghost', 'inverse', 'secondary'],
  tone: ['default', 'destructive'],
  size: ['sm', 'md', 'lg'],
};
const expectedButtonFiniteDeclarations = [
  ['BUTTON_VARIANTS', expectedButtonFiniteApi.variant],
  ['BUTTON_TONES', expectedButtonFiniteApi.tone],
  ['BUTTON_SIZES', expectedButtonFiniteApi.size],
].map(([name, values]) => `const ${name} = new Set([${values.map((value) => `'${value}'`).join(', ')}]);`);
if (!buttonBinding
  || JSON.stringify(buttonBinding.api.props) !== JSON.stringify(expectedButtonProps)
  || JSON.stringify(buttonBinding.api.defaults) !== JSON.stringify(expectedButtonDefaults)
  || expectedButtonFiniteDeclarations.some((declaration) => !buttonSource.includes(declaration))) {
  throw new Error('MUXUI_REACT_BUTTON_CANONICAL_API_DRIFT');
}
const expectedToggleButtonProps = ['selected', 'defaultSelected', 'disabled', 'size'];
const expectedToggleButtonDefaults = {
  selected: false,
  defaultSelected: false,
  disabled: false,
  size: 'md',
};
const expectedToggleButtonGroupProps = ['aria-label', 'aria-labelledby', 'selectedIds', 'defaultSelectedIds', 'selectionMode', 'disabled', 'orientation', 'disallowEmptySelection', 'size'];
const expectedToggleButtonGroupDefaults = {
  disabled: false,
  orientation: 'horizontal',
  selectionMode: 'single',
  disallowEmptySelection: false,
};
const toggleButtonSizeDeclaration = `export const TOGGLE_BUTTON_SIZES = Object.freeze([${['sm', 'md', 'lg'].map((value) => `'${value}'`).join(', ')}]);`;
if (!toggleButtonBinding
  || JSON.stringify(toggleButtonBinding.api.props) !== JSON.stringify(expectedToggleButtonProps)
  || JSON.stringify(toggleButtonBinding.api.defaults) !== JSON.stringify(expectedToggleButtonDefaults)
  || !toggleButtonContextSource.includes(toggleButtonSizeDeclaration)) {
  throw new Error('MUXUI_REACT_TOGGLE_BUTTON_CANONICAL_API_DRIFT');
}
if (!toggleButtonGroupBinding
  || JSON.stringify(toggleButtonGroupBinding.api.props) !== JSON.stringify(expectedToggleButtonGroupProps)
  || JSON.stringify(toggleButtonGroupBinding.api.defaults) !== JSON.stringify(expectedToggleButtonGroupDefaults)
  || !collectionsSource.includes('disallowEmptySelection')) {
  throw new Error('MUXUI_REACT_TOGGLE_BUTTON_GROUP_CANONICAL_API_DRIFT');
}
const expectedCheckboxProps = ['checked', 'defaultChecked', 'disabled', 'size', 'indeterminate', 'name', 'required', 'value', 'invalid'];
const expectedCheckboxDefaults = {
  checked: false,
  defaultChecked: false,
  disabled: false,
  size: 'md',
  indeterminate: false,
  invalid: false,
};
const expectedCheckboxGroupProps = ['label', 'description', 'errorMessage', 'aria-label', 'aria-labelledby', 'value', 'defaultValue', 'disabled', 'readOnly', 'required', 'invalid', 'name', 'orientation', 'size'];
const expectedCheckboxGroupDefaults = {
  disabled: false,
  readOnly: false,
  required: false,
  invalid: false,
  orientation: 'vertical',
  size: 'md',
};
const expectedRadioGroupProps = ['label', 'aria-label', 'aria-labelledby', 'options', 'children', 'value', 'defaultValue', 'disabled', 'readOnly', 'required', 'invalid', 'orientation', 'size'];
const expectedRadioGroupDefaults = {
  disabled: false,
  readOnly: false,
  required: false,
  invalid: false,
  orientation: 'vertical',
  size: 'md',
};
const choiceSizeDeclaration = `export const CHOICE_CONTROL_SIZES = Object.freeze([${['sm', 'md'].map((value) => `'${value}'`).join(', ')}]);`;
if (!checkboxBinding
  || JSON.stringify(checkboxBinding.api.props) !== JSON.stringify(expectedCheckboxProps)
  || JSON.stringify(checkboxBinding.api.defaults) !== JSON.stringify(expectedCheckboxDefaults)
  || !componentSource.includes('normalizeChoiceControlSize')) {
  throw new Error('MUXUI_REACT_CHECKBOX_CANONICAL_API_DRIFT');
}
if (!checkboxGroupBinding
  || JSON.stringify(checkboxGroupBinding.api.props) !== JSON.stringify(expectedCheckboxGroupProps)
  || JSON.stringify(checkboxGroupBinding.api.defaults) !== JSON.stringify(expectedCheckboxGroupDefaults)
  || !fieldsSource.includes('ChoiceControlSizeContext')) {
  throw new Error('MUXUI_REACT_CHECKBOX_GROUP_CANONICAL_API_DRIFT');
}
if (!radioGroupBinding
  || JSON.stringify(radioGroupBinding.api.props) !== JSON.stringify(expectedRadioGroupProps)
  || JSON.stringify(radioGroupBinding.api.defaults) !== JSON.stringify(expectedRadioGroupDefaults)
  || !collectionsSource.includes('normalizeChoiceControlSize')
  || !choiceContextSource.includes(choiceSizeDeclaration)) {
  throw new Error('MUXUI_REACT_RADIO_GROUP_CANONICAL_API_DRIFT');
}
const expectedAutocompleteProps = ['label', 'description', 'errorMessage', 'aria-label', 'aria-labelledby', 'value', 'defaultValue', 'disabled', 'size', 'readOnly', 'required', 'invalid', 'name', 'items', 'placeholder'];
const expectedAutocompleteDefaults = {
  value: '',
  defaultValue: '',
  disabled: false,
  readOnly: false,
  required: false,
  invalid: false,
  size: 'md',
};
if (!autocompleteBinding
  || JSON.stringify(autocompleteBinding.api.props) !== JSON.stringify(expectedAutocompleteProps)
  || JSON.stringify(autocompleteBinding.api.defaults) !== JSON.stringify(expectedAutocompleteDefaults)
  || !fieldsSource.includes("const AUTOCOMPLETE_SIZES = new Set(['sm', 'md']);")
  || !fieldsSource.includes('normalizeAutocompleteSize')) {
  throw new Error('MUXUI_REACT_AUTOCOMPLETE_CANONICAL_API_DRIFT');
}
assertReactR10SourceContracts({ snapshot, upstreamExports, upstreamExportsBytes: upstreamExportsRaw, crosswalk, license });
const componentArtifacts = [
  buttonArtifact,
  ...await Promise.all([
    'breadcrumbs', 'checkbox', 'disclosure', 'disclosure-group', 'group', 'link', 'meter', 'progress-bar', 'separator', 'toggle-button',
    'autocomplete', 'checkbox-group', 'date-field', 'date-picker', 'date-range-picker', 'form', 'number-field', 'search-field', 'switch', 'text-field', 'time-field',
    ...r13Slugs, ...r14Slugs,
  ].map(async (slug) => JSON.parse(await readFile(resolve(repositoryRoot, `catalog/components/${slug}/artifact.json`), 'utf8')))),
];
if (componentArtifacts.length !== 53 || new Set(componentArtifacts.map(({ id }) => id)).size !== 53) {
  throw new Error('MUXUI_REACT_R1_COMPONENT_ALLOCATION_DRIFT');
}
const allCatalogArtifacts = (await Promise.all(
  (await readdir(resolve(repositoryRoot, 'catalog/components'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map(async ({ name }) => {
      try {
        return JSON.parse(await readFile(resolve(repositoryRoot, `catalog/components/${name}/artifact.json`), 'utf8'));
      } catch {
        return undefined;
      }
    }),
)).filter(Boolean);
const allCatalogArtifactsBySlug = new Map(allCatalogArtifacts.map((artifact) => [artifact.id.slice('muxui:component:'.length), artifact]));
const mappedR16Slugs = new Set(r16Crosswalk.supplemental.map(({ slug }) => slug));
const historicalCatalogSlugs = new Set(familySnapshot.families.map(({ family }) => (family === 'Modal' ? 'dialog' : family.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase())));
const unexpectedCurrentSlugs = [...allCatalogArtifactsBySlug.keys()].filter((slug) => !historicalCatalogSlugs.has(slug) && !mappedR16Slugs.has(slug));
if (!Array.isArray(r16Crosswalk.supplemental) || unexpectedCurrentSlugs.length > 0) {
  throw new Error('MUXUI_REACT_R16_CANONICAL_MAPPING_DRIFT');
}
if (migrationMode && (r16FiniteFixtures.schema !== 'muxui-react-r1-6-finite-fixtures-v2'
  || r16FiniteFixtures.current.familyCount !== 74
  || r16FiniteFixtures.current.historicalCount !== 53
  || r16FiniteFixtures.current.supplementalCount !== 21
  || r16FiniteFixtures.components.length !== 74)) {
  throw new Error('MUXUI_REACT_R16_MIGRATION_FIXTURE_DRIFT');
}
const finiteFixtureBySlug = migrationMode
  ? new Map(r16FiniteFixtures.components.map((fixture) => [fixture.slug, fixture]))
  : undefined;
for (const entry of r16Crosswalk.supplemental) {
  const artifact = allCatalogArtifactsBySlug.get(entry.slug);
  const module = entry.export?.module;
  if (!artifact || artifact.id !== `muxui:component:${entry.slug}`
    || artifact.name !== entry.export?.name
    || !entry.binding || entry.binding !== `${artifact.id}#web.react`
    || !entry.apiOwner || !entry.stateOwner || !entry.anatomyOwner
    || !entry.runtimeSource || !entry.styleSource
    || (module === './text-editor' && entry.slug !== 'text-editor')
    || (module === './markdown' && entry.slug !== 'markdown')
    || (module === '.' && entry.export.isolation !== 'root')
    || (module !== '.' && entry.export.isolation !== 'subpath-only')) {
    throw new Error(`MUXUI_REACT_R16_MAPPING_ENTRY_DRIFT: ${entry.slug}`);
  }
  for (const relativePath of [entry.artifact, entry.runtimeSource, entry.styleSource]) {
    if (!await readFile(resolve(repositoryRoot, relativePath), 'utf8').catch(() => null)) {
      throw new Error(`MUXUI_REACT_R16_MAPPING_INPUT_MISSING: ${entry.slug}:${relativePath}`);
    }
  }
}
if (new Set(r16Crosswalk.supplemental.map(({ export: componentExport }) => componentExport.name)).size !== r16Crosswalk.supplemental.length
  || new Set(r16Crosswalk.supplemental.map(({ binding }) => binding)).size !== r16Crosswalk.supplemental.length) {
  throw new Error('MUXUI_REACT_R16_MAPPING_IDENTITY_DRIFT');
}
for (const artifact of componentArtifacts) {
  const binding = artifact.bindings['web.react'];
  if (!binding || binding.api.props.some((prop) => /^is[A-Z]/u.test(prop))) {
    throw new Error(`MUXUI_REACT_${artifact.name.toUpperCase()}_CANONICAL_API_DRIFT`);
  }
  if (artifact.name !== 'Button' && r11Slugs.includes(artifact.id.slice('muxui:component:'.length))) {
    const slug = artifact.id.slice('muxui:component:'.length);
    const componentCrosswalk = crosswalk.components?.[slug];
    if (!componentCrosswalk
      || canonicalJson(componentCrosswalk.consumedRules) !== canonicalJson(componentCrosswalk.rules.map(({ input }) => input))) {
      throw new Error(`MUXUI_REACT_${artifact.name.toUpperCase()}_DONOR_CROSSWALK_DRIFT`);
    }
  } else if (r12Slugs.includes(artifact.id.slice('muxui:component:'.length))) {
    const slug = artifact.id.slice('muxui:component:'.length);
    const componentCrosswalk = r12Crosswalk.components?.[slug];
    if (!componentCrosswalk
      || canonicalJson(componentCrosswalk.consumedRules) !== canonicalJson(componentCrosswalk.rules.map(({ input }) => input))) {
      throw new Error(`MUXUI_REACT_${artifact.name.toUpperCase()}_DONOR_CROSSWALK_DRIFT`);
    }
  } else if (r13Slugs.includes(artifact.id.slice('muxui:component:'.length))) {
    const slug = artifact.id.slice('muxui:component:'.length);
    const componentCrosswalk = r13Crosswalk.components?.[slug];
    if (!componentCrosswalk
      || canonicalJson(componentCrosswalk.consumedRules) !== canonicalJson(componentCrosswalk.rules.map(({ input }) => input))) {
      throw new Error(`MUXUI_REACT_${artifact.name.toUpperCase()}_DONOR_CROSSWALK_DRIFT`);
    }
  } else if (r14Slugs.includes(artifact.id.slice('muxui:component:'.length))) {
    const slug = artifact.id.slice('muxui:component:'.length);
    const componentCrosswalk = r14Crosswalk.components?.[slug];
    if (!componentCrosswalk
      || canonicalJson(componentCrosswalk.consumedRules) !== canonicalJson(componentCrosswalk.rules.map(({ input }) => input))) {
      throw new Error(`MUXUI_REACT_${artifact.name.toUpperCase()}_DONOR_CROSSWALK_DRIFT`);
    }
  }
}

const consumedRules = [
  '--color-60', '--color-60-fg', '--radius-m', '--space-xs', '2.25rem minimum height',
  'focus-ring color/rule', 'feedback transition duration', 'inherited typography',
  'donor shadow and opacity details', 'donor primary/default → Mux primary recipe',
  'donor secondary/default (neutral) → Mux secondary recipe', 'donor ghost/default → Mux ghost recipe',
  'donor primary/destructive (danger) → Mux primary destructive recipe',
  'donor secondary/destructive (danger-neutral) → Mux secondary destructive recipe',
  'donor ghost/destructive (danger-ghost) → Mux ghost destructive recipe',
  'donor sm/md/lg sizes → Mux sm/md/lg sizes',
];
if (canonicalJson(crosswalk.button.consumedRules) !== canonicalJson(consumedRules)) {
  throw new Error('MUXUI_REACT_DONOR_CROSSWALK_DRIFT');
}
if (canonicalJson(crosswalk.button.rules.map(({ input }) => input)) !== canonicalJson(consumedRules)) {
  throw new Error('MUXUI_REACT_DONOR_RULE_UNMAPPED');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function generatedText(source, body, open = '//', close = '') {
  return `${open} @generated-from: ${source}${close}\n${open} @generated-content-sha256: sha256:${sha256(body)}${close}\n${body}`;
}

function generatedCss(source, body) {
  const digestBody = ` */\n${body}`;
  return `/* @generated-from: ${source}\n * @generated-content-sha256: sha256:${sha256(digestBody)}\n${digestBody}`;
}

function declarations(css) {
  return new Map([...css.matchAll(/^  (--[^:]+): (.+);$/gm)].map((match) => [match[1], match[2]]));
}

const axes = [['colorScheme', 'dark'], ['contrast', 'more'], ['motion', 'reduced'], ['density', 'compact']];
const baseTheme = compileWebTheme(tokenSource);
const baseDeclarations = declarations(baseTheme.css);
const responsiveTheme = compileWebTheme(tokenSource, { responsive: true });
const responsiveDeclarations = declarations(responsiveTheme.css);
const responsiveChanges = [...responsiveDeclarations]
  .filter(([name, tokenValue]) => baseDeclarations.get(name) !== tokenValue);
const responsiveBlock = `[data-muxui-responsive] {\n${responsiveChanges.length === 0
  ? '  /* canonical theme has no responsive token delta */'
  : responsiveChanges.map(([name, tokenValue]) => `  ${name}: ${tokenValue};`).join('\n')}\n}`;
const modeBlocks = axes.map(([axis, value]) => {
  const variant = declarations(compileWebTheme(tokenSource, { modes: { [axis]: value } }).css);
  const changed = [...variant].filter(([name, tokenValue]) => baseDeclarations.get(name) !== tokenValue);
  const dataAxis = axis.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  const values = changed.length === 0 ? '  /* canonical mode has no token delta */' : changed.map(([name, tokenValue]) => `  ${name}: ${tokenValue};`).join('\n');
  return `[data-muxui-${dataAxis}='${value}'] {\n${values}\n}`;
});

const cssBody = `${baseTheme.css.trim()}\n\n${responsiveBlock}\n\n${modeBlocks.join('\n\n')}\n\n[data-muxui-direction='rtl'] { direction: rtl; }`;
const fullCssBody = `${cssBody}\n\n${authoredCss}`;

const compatibility = {
  schema: 'muxui-react-compatibility-v1',
  package: manifest.name,
  version: manifest.version,
  upstream: { package: 'react-aria-components', version: '1.20.0', gitHead: '5ecb3333001313e83898cd07644227897e3bae1f' },
  tokenSource: { path: 'catalog/tokens/default-theme.json', sha256: expectedTokenSha256 },
  compatibilityProfile: {
    runtimeProfile: r15ClosureSource.compatibility.runtimeProfile,
    status: r15ClosureSource.compatibility.status,
    tested: {
      node: r15ClosureSource.compatibility.node,
      react: r15ClosureSource.compatibility.react,
      reactDom: r15ClosureSource.compatibility.reactDom,
      browserMatrix: r15ClosureSource.compatibility.browserMatrix,
    },
    notClaimed: ['assistive technology', 'zoom', 'locale', 'browsers outside Google Chrome 151'],
  },
  performance: r15ClosureSource.performance,
  publication: r15ClosureSource.publication,
  support: 'unproved; R1.5 React exports only',
};
const compatibilityBody = `function deepFreeze(value) {\n  if (value && typeof value === 'object' && !Object.isFrozen(value)) {\n    Object.freeze(value);\n    for (const child of Object.values(value)) deepFreeze(child);\n  }\n  return value;\n}\nexport const reactCompatibility = deepFreeze(${canonicalJson(compatibility)});\n`;
const indexBody = "export { reactCompatibility } from './compatibility.mjs';\nexport { Button } from './button.mjs';\nexport { Breadcrumbs, Checkbox, Disclosure, DisclosureGroup, Group, Link, Meter, ProgressBar, Separator, ToggleButton, Autocomplete, CheckboxGroup, DateField, DatePicker, DateRangePicker, Form, NumberField, SearchField, Switch, TextField, TimeField } from './components.mjs';\nexport { Calendar, ColorArea, ColorField, ColorPicker, ColorSlider, ColorSwatch, ColorSwatchPicker, ColorWheel, ComboBox, GridList, ListBox, Menu, RadioGroup, RangeCalendar, Select, Slider, Table, Tabs, TagGroup, ToggleButtonGroup, TokenField, Toolbar, Tree, Virtualizer } from './collections.mjs';\nexport { DropZone, FileTrigger, Dialog, Popover, PreviewTrigger, Toast, ToastProvider, useToast, Tooltip } from './overlays.mjs';\n";
const typesBody = `import type * as React from 'react';

export type ButtonPointerType = 'mouse' | 'pen' | 'touch' | 'keyboard' | 'virtual' | undefined;
export type ComponentPointerType = ButtonPointerType;
export interface ButtonActivationEvent {
  readonly type: 'activate';
  readonly pointerType: ButtonPointerType;
  readonly target: HTMLButtonElement;
}
export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className' | 'disabled' | 'onClick' | 'style'> {
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  pending?: boolean;
  showTextWhileLoading?: boolean;
  variant?: 'primary' | 'neutral' | 'ghost' | 'danger' | 'danger-neutral' | 'danger-ghost' | 'inverse' | 'secondary';
  tone?: 'default' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  style?: React.CSSProperties;
  onActivate?: (event: ButtonActivationEvent) => void;
}
export declare const Button: React.ForwardRefExoticComponent<ButtonProps & React.RefAttributes<HTMLButtonElement>>;
export interface BreadcrumbItem { id?: string; label: React.ReactNode; href?: string; disabled?: boolean; }
export interface BreadcrumbsProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children' | 'className' | 'aria-label'> { items?: BreadcrumbItem[]; className?: string; 'aria-label': string; onNavigate?: (item: BreadcrumbItem) => void; }
export declare const Breadcrumbs: React.ForwardRefExoticComponent<BreadcrumbsProps & React.RefAttributes<HTMLElement>>;
export interface CheckboxProps extends Omit<React.LabelHTMLAttributes<HTMLLabelElement>, 'children' | 'className' | 'onChange'> { children?: React.ReactNode; className?: string; checked?: boolean; defaultChecked?: boolean; disabled?: boolean; size?: 'sm' | 'md'; indeterminate?: boolean; invalid?: boolean; name?: string; required?: boolean; value?: string; onChange?: (checked: boolean) => void; }
export declare const Checkbox: React.ForwardRefExoticComponent<CheckboxProps & React.RefAttributes<HTMLLabelElement>>;
export interface DisclosureProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'id' | 'title'> { title: React.ReactNode; children?: React.ReactNode; id?: string; expanded?: boolean; defaultExpanded?: boolean; disabled?: boolean; className?: string; onExpandedChange?: (expanded: boolean) => void; }
export declare const Disclosure: React.ForwardRefExoticComponent<DisclosureProps & React.RefAttributes<HTMLDivElement>>;
export interface DisclosureGroupProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className'> { children?: React.ReactNode; expandedIds?: string[]; defaultExpandedIds?: string[]; multiple?: boolean; disabled?: boolean; className?: string; onExpandedChange?: (expandedIds: string[]) => void; }
export declare const DisclosureGroup: React.ForwardRefExoticComponent<DisclosureGroupProps & React.RefAttributes<HTMLDivElement>>;
export interface GroupProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'role'> { children?: React.ReactNode; className?: string; disabled?: boolean; invalid?: boolean; readOnly?: boolean; role?: 'group' | 'region' | 'presentation'; }
export declare const Group: React.ForwardRefExoticComponent<GroupProps & React.RefAttributes<HTMLDivElement>>;
export interface LinkActivationEvent { readonly type: 'activate'; readonly pointerType: ComponentPointerType; readonly target: HTMLAnchorElement; }
export interface LinkProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children' | 'className' | 'onClick'> { children?: React.ReactNode; className?: string; href?: string; disabled?: boolean; current?: boolean; target?: string; rel?: string; onActivate?: (event: LinkActivationEvent) => void; }
export declare const Link: React.ForwardRefExoticComponent<LinkProps & React.RefAttributes<HTMLElement>>;
export interface MeterProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className'> { label: React.ReactNode; value?: number; minValue?: number; maxValue?: number; formatOptions?: Intl.NumberFormatOptions; className?: string; }
export declare const Meter: React.ForwardRefExoticComponent<MeterProps & React.RefAttributes<HTMLDivElement>>;
export interface ProgressBarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className'> { label: React.ReactNode; value?: number; minValue?: number; maxValue?: number; className?: string; }
export declare const ProgressBar: React.ForwardRefExoticComponent<ProgressBarProps & React.RefAttributes<HTMLDivElement>>;
export interface SeparatorProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children' | 'className'> { orientation?: 'horizontal' | 'vertical'; className?: string; }
export declare const Separator: React.ForwardRefExoticComponent<SeparatorProps & React.RefAttributes<HTMLElement>>;
export interface ToggleButtonActivationEvent { readonly type: 'activate'; readonly pointerType: ComponentPointerType; readonly target: HTMLButtonElement; }
export interface ToggleButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className' | 'onChange' | 'onClick'> { children?: React.ReactNode; className?: string; selected?: boolean; defaultSelected?: boolean; disabled?: boolean; size?: 'sm' | 'md' | 'lg'; onChange?: (selected: boolean) => void; onActivate?: (event: ToggleButtonActivationEvent) => void; }
export declare const ToggleButton: React.ForwardRefExoticComponent<ToggleButtonProps & React.RefAttributes<HTMLButtonElement>>;
export const reactCompatibility: Readonly<Record<string, unknown>>;
`;
const fieldsTypes = `
export type MuxUIDateValue = string;
export type MuxUITimeValue = string;
export interface MuxUIDateRange { start: MuxUIDateValue; end: MuxUIDateValue; }
export interface FieldValidationProps { description?: React.ReactNode; errorMessage?: React.ReactNode; disabled?: boolean; readOnly?: boolean; required?: boolean; invalid?: boolean; className?: string; }
export type MuxUIAccessibleName =
  | { label: Exclude<React.ReactNode, null | undefined | boolean>; 'aria-label'?: never; 'aria-labelledby'?: never }
  | { label?: never; 'aria-label': string; 'aria-labelledby'?: never }
  | { label?: never; 'aria-label'?: never; 'aria-labelledby': string };
export type MuxUIAriaAccessibleName =
  | { 'aria-label': string; 'aria-labelledby'?: never }
  | { 'aria-label'?: never; 'aria-labelledby': string };
export type MuxUIAriaLabel = { 'aria-label': string };
export type NamedFieldProps = FieldValidationProps & MuxUIAccessibleName;
export type TextFieldProps = NamedFieldProps & { value?: string; defaultValue?: string; onChange?: (value: string) => void; name?: string; placeholder?: string; type?: 'text' | 'email' | 'password' | 'url' | 'tel'; autoComplete?: React.InputHTMLAttributes<HTMLInputElement>['autoComplete']; autoFocus?: React.InputHTMLAttributes<HTMLInputElement>['autoFocus']; inputMode?: React.InputHTMLAttributes<HTMLInputElement>['inputMode']; maxLength?: React.InputHTMLAttributes<HTMLInputElement>['maxLength']; minLength?: React.InputHTMLAttributes<HTMLInputElement>['minLength']; pattern?: React.InputHTMLAttributes<HTMLInputElement>['pattern']; spellCheck?: React.InputHTMLAttributes<HTMLInputElement>['spellCheck']; };
export declare const TextField: React.ForwardRefExoticComponent<TextFieldProps & React.RefAttributes<HTMLDivElement>>;
export type SearchFieldProps = NamedFieldProps & { value?: string; defaultValue?: string; onChange?: (value: string) => void; onSubmit?: (value: string) => void; onClear?: () => void; name?: string; placeholder?: string; };
export declare const SearchField: React.ForwardRefExoticComponent<SearchFieldProps & React.RefAttributes<HTMLDivElement>>;
export type NumberFieldProps = NamedFieldProps & { value?: number; defaultValue?: number; onChange?: (value: number) => void; name?: string; minValue?: number; maxValue?: number; step?: number; formatOptions?: Intl.NumberFormatOptions; };
export declare const NumberField: React.ForwardRefExoticComponent<NumberFieldProps & React.RefAttributes<HTMLDivElement>>;
export type CheckboxGroupProps = NamedFieldProps & { value?: string[]; defaultValue?: string[]; onChange?: (value: string[]) => void; name?: string; orientation?: 'vertical' | 'horizontal'; size?: 'sm' | 'md'; children?: React.ReactNode; };
export declare const CheckboxGroup: React.ForwardRefExoticComponent<CheckboxGroupProps & React.RefAttributes<HTMLDivElement>>;
export type SwitchProps = MuxUIAccessibleName & { description?: React.ReactNode; errorMessage?: React.ReactNode; disabled?: boolean; readOnly?: boolean; required?: boolean; invalid?: boolean; className?: string; children?: React.ReactNode; selected?: boolean; defaultSelected?: boolean; onChange?: (selected: boolean) => void; name?: string; value?: string; };
export declare const Switch: React.ForwardRefExoticComponent<SwitchProps & React.RefAttributes<HTMLDivElement>>;
export type MuxUIValidationErrors = Readonly<Record<string, string | string[]>>;
export interface FormProps extends Omit<React.FormHTMLAttributes<HTMLFormElement>, 'children' | 'className' | 'onSubmit' | 'onReset'> { children?: React.ReactNode; className?: string; validationBehavior?: 'aria' | 'native'; validationErrors?: MuxUIValidationErrors; onSubmit?: React.FormEventHandler<HTMLFormElement>; onReset?: React.FormEventHandler<HTMLFormElement>; }
export declare const Form: React.ForwardRefExoticComponent<FormProps & React.RefAttributes<HTMLFormElement>>;
export type DateFieldProps = NamedFieldProps & { value?: MuxUIDateValue; defaultValue?: MuxUIDateValue; minValue?: MuxUIDateValue; maxValue?: MuxUIDateValue; unavailableDateMatcher?: (date: MuxUIDateValue) => boolean; onChange?: (value?: MuxUIDateValue) => void; name?: string; };
export declare const DateField: React.ForwardRefExoticComponent<DateFieldProps & React.RefAttributes<HTMLDivElement>>;
export type TimeFieldProps = NamedFieldProps & { value?: MuxUITimeValue; defaultValue?: MuxUITimeValue; minValue?: MuxUITimeValue; maxValue?: MuxUITimeValue; onChange?: (value?: MuxUITimeValue) => void; name?: string; };
export declare const TimeField: React.ForwardRefExoticComponent<TimeFieldProps & React.RefAttributes<HTMLDivElement>>;
export type DatePickerProps = DateFieldProps & { open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; };
export declare const DatePicker: React.ForwardRefExoticComponent<DatePickerProps & React.RefAttributes<HTMLDivElement>>;
export type DateRangePickerProps = NamedFieldProps & { value?: MuxUIDateRange; defaultValue?: MuxUIDateRange; minValue?: MuxUIDateValue; maxValue?: MuxUIDateValue; unavailableDateMatcher?: (date: MuxUIDateValue, anchorDate: MuxUIDateValue | null) => boolean; open?: boolean; defaultOpen?: boolean; onChange?: (value?: MuxUIDateRange) => void; startName?: string; endName?: string; onOpenChange?: (open: boolean) => void; };
export declare const DateRangePicker: React.ForwardRefExoticComponent<DateRangePickerProps & React.RefAttributes<HTMLDivElement>>;
export interface AutocompleteItem { id?: string; label?: React.ReactNode; value?: string; disabled?: boolean; }
export interface AutocompleteSelectionItem { id: string; label: React.ReactNode; value: string; }
export type AutocompleteProps = NamedFieldProps & { items?: Array<AutocompleteItem | string>; value?: string; defaultValue?: string; onChange?: (value: string) => void; onSelect?: (item?: AutocompleteSelectionItem) => void; name?: string; placeholder?: string; size?: 'sm' | 'md'; };
export declare const Autocomplete: React.ForwardRefExoticComponent<AutocompleteProps & React.RefAttributes<HTMLDivElement>>;
`;
const collectionsTypes = `
export type MuxUIColorValue = string;
export interface MuxUICollectionItem { id?: string; key?: string; label?: React.ReactNode; value?: string; textValue?: string; disabled?: boolean; [key: string]: unknown; }
export type MuxUISelection = string[] | 'all';
export type MuxUIItems = Array<MuxUICollectionItem | string>;
export type CalendarProps = MuxUIAccessibleName & { value?: MuxUIDateValue; defaultValue?: MuxUIDateValue; focusedValue?: MuxUIDateValue; minValue?: MuxUIDateValue; maxValue?: MuxUIDateValue; unavailableDateMatcher?: (date: MuxUIDateValue) => boolean; onChange?: (value?: MuxUIDateValue) => void; onFocusChange?: (value?: MuxUIDateValue) => void; disabled?: boolean; readOnly?: boolean; required?: boolean; invalid?: boolean; className?: string; };
export declare const Calendar: React.ForwardRefExoticComponent<CalendarProps & React.RefAttributes<HTMLDivElement>>;
export type RangeCalendarProps = MuxUIAccessibleName & { value?: MuxUIDateRange; defaultValue?: MuxUIDateRange; focusedValue?: MuxUIDateValue; minValue?: MuxUIDateValue; maxValue?: MuxUIDateValue; unavailableDateMatcher?: (date: MuxUIDateValue) => boolean; onChange?: (value?: MuxUIDateRange) => void; onFocusChange?: (value?: MuxUIDateValue) => void; disabled?: boolean; readOnly?: boolean; required?: boolean; invalid?: boolean; className?: string; };
export declare const RangeCalendar: React.ForwardRefExoticComponent<RangeCalendarProps & React.RefAttributes<HTMLDivElement>>;
export type ColorAreaProps = MuxUIAccessibleName & { value?: MuxUIColorValue; defaultValue?: MuxUIColorValue; disabled?: boolean; readOnly?: boolean; onChange?: (value: MuxUIColorValue) => void; className?: string; };
export declare const ColorArea: React.ForwardRefExoticComponent<ColorAreaProps & React.RefAttributes<HTMLDivElement>>;
export type ColorFieldProps = NamedFieldProps & { value?: MuxUIColorValue; defaultValue?: MuxUIColorValue; onChange?: (value: MuxUIColorValue) => void; name?: string; };
export declare const ColorField: React.ForwardRefExoticComponent<ColorFieldProps & React.RefAttributes<HTMLDivElement>>;
export type ColorPickerProps = { value?: MuxUIColorValue; defaultValue?: MuxUIColorValue; disabled?: boolean; readOnly?: boolean; onChange?: (value: MuxUIColorValue) => void; children?: React.ReactNode; className?: string; };
export declare const ColorPicker: React.ForwardRefExoticComponent<ColorPickerProps & React.RefAttributes<HTMLDivElement>>;
export type ColorSliderProps = MuxUIAccessibleName & { value?: MuxUIColorValue; defaultValue?: MuxUIColorValue; channel?: string; colorSpace?: string; disabled?: boolean; readOnly?: boolean; orientation?: 'horizontal' | 'vertical'; onChange?: (value: MuxUIColorValue) => void; className?: string; };
export declare const ColorSlider: React.ForwardRefExoticComponent<ColorSliderProps & React.RefAttributes<HTMLDivElement>>;
export type ColorSwatchProps = { color: MuxUIColorValue; disabled?: boolean; className?: string; };
export declare const ColorSwatch: React.ForwardRefExoticComponent<ColorSwatchProps & React.RefAttributes<HTMLDivElement>>;
export type ColorSwatchPickerProps = MuxUIAriaAccessibleName & { items?: MuxUIItems; value?: MuxUIColorValue; defaultValue?: MuxUIColorValue; disabled?: boolean; readOnly?: boolean; onChange?: (value: MuxUIColorValue) => void; className?: string; };
export declare const ColorSwatchPicker: React.ForwardRefExoticComponent<ColorSwatchPickerProps & React.RefAttributes<HTMLDivElement>>;
export type ColorWheelProps = MuxUIAriaAccessibleName & { value?: MuxUIColorValue; defaultValue?: MuxUIColorValue; outerRadius?: number; innerRadius?: number; disabled?: boolean; readOnly?: boolean; onChange?: (value: MuxUIColorValue) => void; className?: string; };
export declare const ColorWheel: React.ForwardRefExoticComponent<ColorWheelProps & React.RefAttributes<HTMLDivElement>>;
export type CollectionProps = MuxUIAriaAccessibleName & { items?: MuxUIItems; selectedIds?: MuxUISelection; defaultSelectedIds?: MuxUISelection; disabled?: boolean; selectionMode?: 'none' | 'single' | 'multiple'; onSelectionChange?: (ids: MuxUISelection) => void; onAction?: (item?: MuxUICollectionItem) => void; className?: string; };
export type GridListProps = CollectionProps;
export declare const GridList: React.ForwardRefExoticComponent<GridListProps & React.RefAttributes<HTMLDivElement>>;
export type ListBoxProps = CollectionProps;
export declare const ListBox: React.ForwardRefExoticComponent<ListBoxProps & React.RefAttributes<HTMLDivElement>>;
export type MenuProps = MuxUIAriaAccessibleName & { items?: MuxUIItems; disabled?: boolean; shouldCloseOnSelect?: boolean; onAction?: (item?: MuxUICollectionItem) => void; onSelect?: (item?: MuxUICollectionItem) => void; className?: string; };
export declare const Menu: React.ForwardRefExoticComponent<MenuProps & React.RefAttributes<HTMLDivElement>>;
export type RadioOption = { id?: string; value: string; label?: React.ReactNode; disabled?: boolean; };
export type RadioGroupProps = MuxUIAccessibleName & { options?: RadioOption[]; children?: React.ReactNode; value?: string; defaultValue?: string; disabled?: boolean; readOnly?: boolean; required?: boolean; invalid?: boolean; orientation?: 'vertical' | 'horizontal'; size?: 'sm' | 'md'; onChange?: (value: string) => void; className?: string; };
export declare const RadioGroup: React.ForwardRefExoticComponent<RadioGroupProps & React.RefAttributes<HTMLDivElement>>;
export type SelectProps = NamedFieldProps & { items?: MuxUIItems; value?: string; defaultValue?: string; open?: boolean; defaultOpen?: boolean; disabled?: boolean; readOnly?: boolean; required?: boolean; invalid?: boolean; name?: string; placeholder?: string; onChange?: (value?: string) => void; onOpenChange?: (open: boolean) => void; };
export declare const Select: React.ForwardRefExoticComponent<SelectProps & React.RefAttributes<HTMLDivElement>>;
export type ComboBoxProps = NamedFieldProps & { items?: MuxUIItems; value?: string; defaultValue?: string; selectedId?: string; defaultSelectedId?: string; disabled?: boolean; readOnly?: boolean; required?: boolean; invalid?: boolean; name?: string; placeholder?: string; onChange?: (value: string) => void; onSelect?: (item?: MuxUICollectionItem) => void; };
export declare const ComboBox: React.ForwardRefExoticComponent<ComboBoxProps & React.RefAttributes<HTMLDivElement>>;
export type SliderProps = MuxUIAccessibleName & { value?: number; defaultValue?: number; min?: number; max?: number; step?: number; disabled?: boolean; readOnly?: boolean; orientation?: 'horizontal' | 'vertical'; onChange?: (value: number) => void; onChangeEnd?: (value: number) => void; className?: string; };
export declare const Slider: React.ForwardRefExoticComponent<SliderProps & React.RefAttributes<HTMLDivElement>>;
export interface MuxUITableColumn extends MuxUICollectionItem { isRowHeader?: boolean; sortable?: boolean; }
export interface MuxUITableRow extends MuxUICollectionItem { values?: Record<string, React.ReactNode>; }
export type MuxUITableSortDescriptor = { column: string; direction: 'ascending' | 'descending'; };
export type TableProps = MuxUIAriaLabel & { columns?: MuxUITableColumn[]; rows?: MuxUITableRow[]; selectedIds?: MuxUISelection; defaultSelectedIds?: MuxUISelection; sortDescriptor?: MuxUITableSortDescriptor; disabled?: boolean; selectionMode?: 'none' | 'single' | 'multiple'; onSelectionChange?: (ids: MuxUISelection) => void; onRowAction?: (row?: MuxUITableRow) => void; onSortChange?: (next: MuxUITableSortDescriptor) => void; className?: string; };
export declare const Table: React.ForwardRefExoticComponent<TableProps & React.RefAttributes<HTMLTableElement>>;
export type TabsProps = MuxUIAriaAccessibleName & { items?: MuxUIItems; value?: string; defaultValue?: string; disabled?: boolean; orientation?: 'horizontal' | 'vertical'; keyboardActivation?: 'automatic' | 'manual'; onChange?: (value: string) => void; className?: string; };
export declare const Tabs: React.ForwardRefExoticComponent<TabsProps & React.RefAttributes<HTMLDivElement>>;
export type TagGroupProps = MuxUIAccessibleName & { items?: MuxUIItems; disabled?: boolean; onRemove?: (items: MuxUICollectionItem[]) => void; onAction?: (item?: MuxUICollectionItem) => void; className?: string; };
export declare const TagGroup: React.ForwardRefExoticComponent<TagGroupProps & React.RefAttributes<HTMLDivElement>>;
export type ToggleButtonGroupProps = MuxUIAriaAccessibleName & { selectedIds?: readonly string[]; defaultSelectedIds?: readonly string[]; selectionMode?: 'single' | 'multiple'; disabled?: boolean; orientation?: 'horizontal' | 'vertical'; disallowEmptySelection?: boolean; size?: 'sm' | 'md' | 'lg'; onSelectionChange?: (ids: readonly string[]) => void; children?: React.ReactNode; className?: string; };
export declare const ToggleButtonGroup: React.ForwardRefExoticComponent<ToggleButtonGroupProps & React.RefAttributes<HTMLDivElement>>;
export type TokenFieldProps = MuxUIAccessibleName & { value?: string[]; defaultValue?: string[]; disabled?: boolean; readOnly?: boolean; name?: string; placeholder?: string; onChange?: (value: string[]) => void; className?: string; };
export declare const TokenField: React.ForwardRefExoticComponent<TokenFieldProps & React.RefAttributes<HTMLDivElement>>;
export type ToolbarProps = MuxUIAriaAccessibleName & { orientation?: 'horizontal' | 'vertical'; children?: React.ReactNode; className?: string; };
export declare const Toolbar: React.ForwardRefExoticComponent<ToolbarProps & React.RefAttributes<HTMLDivElement>>;
export interface MuxUITreeItem extends MuxUICollectionItem { children?: MuxUITreeItem[]; items?: MuxUITreeItem[]; }
export type TreeProps = MuxUIAriaAccessibleName & { items?: MuxUITreeItem[]; selectedIds?: MuxUISelection; defaultSelectedIds?: MuxUISelection; expandedIds?: MuxUISelection; defaultExpandedIds?: MuxUISelection; disabled?: boolean; selectionMode?: 'none' | 'single' | 'multiple'; onSelectionChange?: (ids: MuxUISelection) => void; onExpandedChange?: (ids: MuxUISelection) => void; onAction?: (item?: MuxUITreeItem) => void; className?: string; };
export declare const Tree: React.ForwardRefExoticComponent<TreeProps & React.RefAttributes<HTMLDivElement>>;
export type VirtualizerProps = MuxUIAriaLabel & { items?: MuxUIItems; height?: number; itemHeight?: number; overscan?: number; disabled?: boolean; onScroll?: React.UIEventHandler<HTMLDivElement>; className?: string; style?: React.CSSProperties; };
export declare const Virtualizer: React.ForwardRefExoticComponent<VirtualizerProps & React.RefAttributes<HTMLDivElement>>;
`;
const overlaysTypes = `
export type MuxUIDropOperation = 'copy' | 'link' | 'move' | 'cancel';
export interface MuxUIFileDropItem { readonly kind: 'file'; readonly type: string; readonly name: string; readonly getFile: () => Promise<File>; readonly getText: () => Promise<string>; }
export interface MuxUIDirectoryDropItem { readonly kind: 'directory'; readonly name: string; readonly getEntries: () => AsyncIterable<MuxUIDropItem>; }
export interface MuxUITextDropItem { readonly kind: 'text'; readonly types: ReadonlySet<string>; readonly getText: (type: string) => Promise<string>; }
export type MuxUIDropItem = MuxUIFileDropItem | MuxUIDirectoryDropItem | MuxUITextDropItem;
export interface MuxUIDropEvent { readonly type: 'drop'; readonly x: number; readonly y: number; readonly dropOperation: MuxUIDropOperation; readonly items: MuxUIDropItem[]; }
export interface MuxUIDropActivateEvent { readonly type: 'activate'; readonly x: number; readonly y: number; }
export interface DropZoneProps { children?: React.ReactNode; disabled?: boolean; className?: string; 'aria-label'?: string; 'aria-labelledby'?: string; onDrop?: (event: MuxUIDropEvent) => void; onActivate?: (event: MuxUIDropActivateEvent) => void; }
export declare const DropZone: React.ForwardRefExoticComponent<DropZoneProps & React.RefAttributes<HTMLDivElement>>;
export interface FileTriggerProps { children?: React.ReactNode; acceptedFileTypes?: readonly string[]; allowsMultiple?: boolean; acceptDirectory?: boolean; defaultCamera?: 'user' | 'environment'; disabled?: boolean; className?: string; onSelect?: (files: File[]) => void; }
export declare const FileTrigger: React.ForwardRefExoticComponent<FileTriggerProps & React.RefAttributes<HTMLInputElement>>;
export type OverlayAccessibleName = { 'aria-label': string; 'aria-labelledby'?: never } | { 'aria-label'?: never; 'aria-labelledby': string };
export type DialogProps = { children?: React.ReactNode; open?: boolean; defaultOpen?: boolean; dismissable?: boolean; trigger?: React.ReactElement; onOpenChange?: (open: boolean) => void; className?: string; } & ({ title: Exclude<React.ReactNode, null | undefined | boolean>; 'aria-label'?: string; 'aria-labelledby'?: string } | ({ title?: never } & OverlayAccessibleName));
export declare const Dialog: React.ForwardRefExoticComponent<DialogProps & React.RefAttributes<HTMLElement>>;
export type PopoverProps = { children: React.ReactNode; trigger: React.ReactElement; open?: boolean; defaultOpen?: boolean; dismissable?: boolean; placement?: 'top' | 'bottom' | 'start' | 'end'; offset?: number; crossOffset?: number; shouldFlip?: boolean; containerPadding?: number; onOpenChange?: (open: boolean) => void; className?: string; } & OverlayAccessibleName;
export declare const Popover: React.ForwardRefExoticComponent<PopoverProps & React.RefAttributes<HTMLDivElement>>;
export type PreviewTriggerProps = { children: React.ReactNode; trigger: React.ReactElement; delay?: number; closeDelay?: number; open?: boolean; defaultOpen?: boolean; disabled?: boolean; placement?: 'top' | 'bottom' | 'start' | 'end'; offset?: number; crossOffset?: number; shouldFlip?: boolean; containerPadding?: number; onOpenChange?: (open: boolean) => void; className?: string; } & OverlayAccessibleName;
export declare const PreviewTrigger: React.ForwardRefExoticComponent<PreviewTriggerProps & React.RefAttributes<HTMLDivElement>>;
export interface ToastProps { message: Exclude<React.ReactNode, null | undefined | boolean>; title?: React.ReactNode; variant?: 'neutral' | 'success' | 'warning' | 'danger'; duration?: number; onDismiss?: () => void; className?: string; }
export declare const Toast: React.FC<ToastProps>;
export interface ToastOptions { title?: React.ReactNode; variant?: 'neutral' | 'success' | 'warning' | 'danger'; duration?: number; onDismiss?: () => void; className?: string; }
export interface ToastManager { add: (message: Exclude<React.ReactNode, null | undefined | boolean>, options?: ToastOptions) => string; remove: (key: string) => void; }
export interface ToastProviderProps { children?: React.ReactNode; maxVisible?: number; placement?: 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end'; className?: string; }
export declare const ToastProvider: React.FC<ToastProviderProps>;
export declare function useToast(): ToastManager;
export type TooltipProps = { content: Exclude<React.ReactNode, null | undefined | boolean>; trigger: React.ReactElement; delay?: number; closeDelay?: number; placement?: 'top' | 'bottom' | 'start' | 'end'; offset?: number; crossOffset?: number; shouldFlip?: boolean; containerPadding?: number; open?: boolean; defaultOpen?: boolean; disabled?: boolean; onOpenChange?: (open: boolean) => void; className?: string; };
export declare const Tooltip: React.ForwardRefExoticComponent<TooltipProps & React.RefAttributes<HTMLDivElement>>;
`;
const reactTypesBody = typesBody.replace("export const reactCompatibility: Readonly<Record<string, unknown>>;\n", `export const reactCompatibility: Readonly<Record<string, unknown>>;\n${fieldsTypes}${collectionsTypes}${overlaysTypes}`);
const testingBody = "export const reactPlatformSafetyFixture = Object.freeze({ componentSupportClaim: 'none', fixture: 'r1.5-react-breadth', discovery: 'informational' });\n";
const readmeBody = `# @muxui/react\n\nR1.6 current React union for the standalone Mux UI renderer.\n\n- The current union contains Mux UI-owned family exports, including root exports and isolated subpaths.\n- React Aria Components 1.20.0 is an internal replaceable substrate.\n- MuxUI owns the public APIs, tokens, selectors, styling, accessibility behavior, lifecycle, and prop names.\n- Tale UI is a pinned one-time styling donor; generated styling results are Mux UI-owned and Tale UI is not a dependency.\n- The historical R1.5 closure retains its fixed family membership and evidence separately from this current union.\n`;
const markdownCell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const readmeMappingBySlug = new Map(r16Crosswalk.supplemental.map((entry) => [entry.slug, entry]));
const readmeComponentRows = allCatalogArtifacts.sort((left, right) => left.name.localeCompare(right.name)).map((artifact) => {
  const slug = artifact.id.slice('muxui:component:'.length);
  const binding = artifact.bindings['web.react'];
  const module = readmeMappingBySlug.get(slug)?.export.module ?? '.';
  return `| ${markdownCell(artifact.name)} | ${markdownCell(artifact.lifecycle)} | ${module} | .muxui-${slug} | ${markdownCell(binding.api.props.join(', ') || 'none')} |`;
}).join('\n');
const readmeGuidance = `
## R1 exit publication candidate

The exact R1 exit candidate is \`@muxui/react@0.1.0-rc.1\`, for the \`next\`
dist-tag on the npm registry. The candidate contains only the standalone
\`web.react\` renderer and its internal runtime dependencies. All current
Mux UI-owned component exports remain experimental; no stable, secondary-renderer,
or cross-platform support claim is made. Publication, dist-tag mutation, and
post-publication verification are separate authorized operations.

## Local tarball usage

Install the versioned local candidate from the package directory:

\`\`\`sh
pnpm add ./muxui-react-${manifest.version}.tgz
\`\`\`

Import the generated MuxUI styles once, then use the React exports:

\`\`\`tsx
import '@muxui/react/styles.css';
import { Button } from '@muxui/react';

export function Example() {
  return <Button onActivate={() => {}}>Save</Button>;
}
\`\`\`

The renderer owns the MuxUI selectors, tokens, accessibility behavior, lifecycle, and public prop names. React Aria Components is an internal implementation substrate; this package does not transfer its APIs or styling boundary.

Responsive dimension recipes are opt-in. Add \`data-muxui-responsive\` to a theme scope after importing \`styles.css\` to activate the canonical viewport-based values for that scope; the default \`:root\` values remain static.

Supporting runtime exports: \`ToastProvider\` and \`useToast\` are available alongside \`Toast\` for managed notifications.

| Export | Lifecycle | Module | Selector | Public props |
| --- | --- | --- | --- | --- |
${readmeComponentRows}
`;
const descriptorRecord = {
  schema: 'muxui-renderer-descriptor-v1', generatedFrom: 'packages/react/src/generate.mjs',
  package: manifest.name, version: manifest.version, support: 'unproved; R1.5 React exports only',
  bindings: componentArtifacts.map((artifact) => ({
    binding: `${artifact.id}#web.react`, export: artifact.name, module: '.',
    lifecycle: 'experimental', strategy: 'direct', runtimeProfile: 'web.react',
    selector: `.muxui-${artifact.id.slice('muxui:component:'.length)}`, states: artifact.states, api: artifact.bindings['web.react'].api,
  })),
  exports: componentArtifacts.map((artifact) => ({ name: artifact.name, kind: 'component', binding: `${artifact.id}#web.react`, module: '.' })),
};
const releaseRecord = {
  schema: 'muxui-react-release-candidate-v1', generatedFrom: 'packages/react/src/generate.mjs',
  package: manifest.name, version: manifest.version, lifecycle: 'experimental',
  componentExports: componentArtifacts.map((artifact) => ({ name: artifact.name, export: artifact.name, binding: `${artifact.id}#web.react`, module: '.' })),
  bindings: componentArtifacts.map((artifact) => ({ binding: `${artifact.id}#web.react`, package: manifest.name, export: artifact.name, lifecycle: 'experimental', strategy: 'direct', runtimeProfile: 'web.react' })),
  runtimeProfiles: ['web.react'],
  packagePrivate: manifest.private,
  catalog: { status: 'bound', components: componentArtifacts.map((artifact) => ({ component: artifact.id, binding: `${artifact.id}#web.react`, states: artifact.states })) },
  tokenSource: { path: 'catalog/tokens/default-theme.json', sha256: expectedTokenSha256 },
  evidence: { status: 'pending', ids: ['E-R1.5-01', 'E-R1.5-02', 'E-R1.5-03', 'E-R1.5-04', 'E-R1.5-05', 'E-R1.5-06'] },
  advisories: [], exceptions: [],
  publication: { status: 'disabled', requires: ['explicit external publish authorization'] },
  rollback: { status: 'candidate-branch-only-before-merge' },
  packageDependencies: manifest.dependencies,
  peerDependencies: manifest.peerDependencies,
  packageExports: manifest.exports,
  packageFiles: manifest.files,
  publicationPreparation: {
    schema: 'muxui-r1-exit-publication-preparation-v1',
    candidateVersion: '0.1.0-rc.1',
    registry: 'https://registry.npmjs.org',
    distTag: 'next',
    preparationTool: 'tooling/audits/repository-policy/src/release-prepare.mjs',
    publishCommand: 'npm publish <candidate-tarball> --tag next --access public --provenance --registry=https://registry.npmjs.org',
    provenance: 'required-at-publication',
    source: {
      package: manifest.name,
      version: manifest.version,
      private: manifest.private,
      generatedFrom: ['packages/react/src/generate.mjs', 'catalog/react-r1-5/closure.json'],
    },
    preflight: {
      status: 'required-before-publication',
      checks: [
        'namespace ownership',
        'version collision',
        'next dist-tag collision',
        'publish authorization drift',
      ],
    },
    evidence: {
      'E-R1-EXIT-01': 'candidate-preparation',
      'E-R1-EXIT-02': 'candidate-integrity-prepared-registry-provenance-pending',
      'E-R1-EXIT-03': 'pending-post-publication',
      'E-R1-EXIT-04': 'pending-post-publication',
    },
    rollback: 'restore the previously verified next pointer through a separately authorized dist-tag mutation; retain the immutable rc.1 version and its manifest',
  },
};
for (const rule of crosswalk.button.rules) {
  if (rule.core.includes('.') && !fullCssBody.includes(`--muxui-${rule.core.replaceAll('.', '-')}`)) throw new Error(`MUXUI_REACT_DONOR_RESULT_MISSING: ${rule.input}`);
}
if (!authoredCss.includes('font: inherit') || !authoredCss.includes('box-shadow:') || !authoredCss.includes('[data-disabled]')) {
  throw new Error('MUXUI_REACT_DONOR_NON_TOKEN_RESULT_MISSING');
}
const donorComparisonRecord = {
  schema: 'muxui-react-button-donor-comparison-v1', generatedFrom: 'packages/react/src/generate.mjs',
  donor: { commit: crosswalk.donor.commit, tree: crosswalk.donor.tree, buttonBlobs: crosswalk.buttonBlobs },
  disposition: crosswalk.button.disposition, consumedRules: crosswalk.button.rules,
  result: { cssSha256: `sha256:${sha256(fullCssBody)}`, selector: '.muxui-button', status: 'adapted-for-r1.1-button' },
};
const componentDonorComparisonRecord = {
  schema: 'muxui-react-component-donor-comparison-v1', generatedFrom: 'packages/react/src/generate.mjs',
  donor: { name: crosswalk.donor.name, commit: crosswalk.donor.commit, tree: crosswalk.donor.tree },
  components: componentArtifacts.map((artifact) => {
    const slug = artifact.id.slice('muxui:component:'.length);
    const source = artifact.name === 'Button' ? crosswalk.button : crosswalk.components[slug] ?? r12Crosswalk.components[slug] ?? r13Crosswalk.components[slug] ?? r14Crosswalk.components[slug];
    return { ...(source?.donorInputs ? { donorInputs: source.donorInputs } : {}), component: artifact.name, binding: `${artifact.id}#web.react`, disposition: source.disposition, selector: `.muxui-${slug}`, rules: source.rules };
  }),
};
const r11Artifacts = componentArtifacts.filter((artifact) => {
  const slug = artifact.id.slice('muxui:component:'.length);
  return !r12Slugs.includes(slug) && !r13Slugs.includes(slug) && !r14Slugs.includes(slug);
});
const r11DescriptorRecord = {
  ...descriptorRecord,
  support: 'unproved; R1.1 React exports only',
  bindings: descriptorRecord.bindings.filter(({ binding }) => !r12Slugs.some((slug) => binding === `muxui:component:${slug}#web.react`) && !r13Slugs.some((slug) => binding === `muxui:component:${slug}#web.react`) && !r14Slugs.some((slug) => binding === `muxui:component:${slug}#web.react`)),
  exports: descriptorRecord.exports.filter(({ binding }) => !r12Slugs.some((slug) => binding === `muxui:component:${slug}#web.react`) && !r13Slugs.some((slug) => binding === `muxui:component:${slug}#web.react`) && !r14Slugs.some((slug) => binding === `muxui:component:${slug}#web.react`)),
};
const r11ReleaseRecord = {
  ...releaseRecord,
  componentExports: releaseRecord.componentExports.filter(({ binding }) => !r12Slugs.some((slug) => binding === `muxui:component:${slug}#web.react`) && !r13Slugs.some((slug) => binding === `muxui:component:${slug}#web.react`) && !r14Slugs.some((slug) => binding === `muxui:component:${slug}#web.react`)),
  bindings: releaseRecord.bindings.filter(({ binding }) => !r12Slugs.some((slug) => binding === `muxui:component:${slug}#web.react`) && !r13Slugs.some((slug) => binding === `muxui:component:${slug}#web.react`) && !r14Slugs.some((slug) => binding === `muxui:component:${slug}#web.react`)),
  catalog: { ...releaseRecord.catalog, components: releaseRecord.catalog.components.filter(({ component }) => !r12Slugs.includes(component.slice('muxui:component:'.length)) && !r13Slugs.includes(component.slice('muxui:component:'.length)) && !r14Slugs.includes(component.slice('muxui:component:'.length))) },
  evidence: { status: 'pending', ids: ['E-R1.1-01', 'E-R1.1-02', 'E-R1.1-03', 'E-R1.1-04'] },
};
const r11ComponentDonorComparisonRecord = {
  ...componentDonorComparisonRecord,
  components: componentDonorComparisonRecord.components.filter(({ component }) => r11Artifacts.some(({ name }) => name === component)),
};
assertReactR11GeneratedContracts({ descriptor: r11DescriptorRecord, release: r11ReleaseRecord, donorComparison: donorComparisonRecord, componentDonorComparison: r11ComponentDonorComparisonRecord, manifest, crosswalk });
const r12DonorComparisonRecord = {
  schema: 'muxui-react-r1-2-donor-comparison-v1',
  generatedFrom: 'packages/react/src/generate.mjs',
  donor: r12Crosswalk.donor,
  components: r12Slugs.map((slug) => {
  const source = EXPECTED_R12_DONOR_CONTRACT.components[slug];
    return { component: componentArtifacts.find(({ id }) => id === `muxui:component:${slug}`).name, binding: `muxui:component:${slug}#web.react`, disposition: source.disposition, selector: `.muxui-${slug}`, donorInputs: source.donorInputs, tokenHooks: source.tokenHooks, rules: source.rules, result: { cssSelector: `.muxui-${slug}`, status: 'adapted-for-r1.2' } };
  }),
};
for (const slug of r12Slugs) {
  for (const hook of EXPECTED_R12_DONOR_CONTRACT.components[slug].tokenHooks) {
    if (!fullCssBody.includes(`--muxui-${hook.replaceAll('.', '-')}`)) throw new Error(`MUXUI_REACT_R12_TOKEN_HOOK_UNCONSUMED: ${slug}:${hook}`);
  }
}
const r12DescriptorRecord = {
  ...descriptorRecord,
  support: 'unproved; R1.2 React exports only',
  bindings: descriptorRecord.bindings.filter(({ binding }) => r12Slugs.some((slug) => binding === `muxui:component:${slug}#web.react`)),
  exports: descriptorRecord.exports.filter(({ binding }) => r12Slugs.some((slug) => binding === `muxui:component:${slug}#web.react`)),
};
const r12ReleaseRecord = {
  ...releaseRecord,
  componentExports: releaseRecord.componentExports.filter(({ binding }) => r12Slugs.some((slug) => binding === `muxui:component:${slug}#web.react`)),
  bindings: releaseRecord.bindings.filter(({ binding }) => r12Slugs.some((slug) => binding === `muxui:component:${slug}#web.react`)),
  catalog: { ...releaseRecord.catalog, components: releaseRecord.catalog.components.filter(({ component }) => r12Slugs.includes(component.slice('muxui:component:'.length))) },
  evidence: { status: 'pending', ids: ['E-R1.2-01', 'E-R1.2-02', 'E-R1.2-03', 'E-R1.2-04'] },
};
assertReactR12GeneratedContracts({ descriptor: r12DescriptorRecord, release: r12ReleaseRecord, donorComparison: r12DonorComparisonRecord, manifest, componentNames: r12Slugs.map((slug) => componentArtifacts.find(({ id }) => id === `muxui:component:${slug}`).name), crosswalk: r12Crosswalk });
const r13DonorComparisonRecord = {
  schema: 'muxui-react-r1-3-donor-comparison-v1',
  generatedFrom: 'packages/react/src/generate.mjs',
  donor: r13Crosswalk.donor,
  components: r13Slugs.map((slug) => {
    const source = EXPECTED_R13_DONOR_CONTRACT.components[slug];
    const artifact = componentArtifacts.find(({ id }) => id === `muxui:component:${slug}`);
    return {
      component: artifact.name,
      binding: `${artifact.id}#web.react`,
      disposition: source.disposition,
      selector: `.muxui-${slug}`,
      donorInputs: source.donorInputs,
      tokenHooks: source.tokenHooks,
      rules: source.rules,
      result: { cssSelector: `.muxui-${slug}`, status: source.disposition === 'no-applicable-donor' ? 'no-applicable-donor' : 'adapted-for-r1.3' },
    };
  }),
};
for (const slug of r13Slugs) {
  const source = EXPECTED_R13_DONOR_CONTRACT.components[slug];
  for (const hook of source.tokenHooks) {
    if (!fullCssBody.includes(`--muxui-${hook.replaceAll('.', '-')}`)) throw new Error(`MUXUI_REACT_R13_TOKEN_HOOK_UNCONSUMED: ${slug}:${hook}`);
  }
}
const r13DescriptorRecord = {
  ...descriptorRecord,
  support: 'unproved; R1.3 React exports only',
  bindings: descriptorRecord.bindings.filter(({ binding }) => !r14Slugs.some((slug) => binding === `muxui:component:${slug}#web.react`)),
  exports: descriptorRecord.exports.filter(({ binding }) => !r14Slugs.some((slug) => binding === `muxui:component:${slug}#web.react`)),
};
const r13ReleaseRecord = {
  ...releaseRecord,
  componentExports: releaseRecord.componentExports.filter(({ binding }) => !r14Slugs.some((slug) => binding === `muxui:component:${slug}#web.react`)),
  bindings: releaseRecord.bindings.filter(({ binding }) => !r14Slugs.some((slug) => binding === `muxui:component:${slug}#web.react`)),
  catalog: { ...releaseRecord.catalog, components: releaseRecord.catalog.components.filter(({ component }) => !r14Slugs.includes(component.slice('muxui:component:'.length))) },
  evidence: { status: 'pending', ids: ['E-R1.3-01', 'E-R1.3-02', 'E-R1.3-03', 'E-R1.3-04', 'E-R1.3-05'] },
};
assertReactR13GeneratedContracts({ descriptor: r13DescriptorRecord, release: r13ReleaseRecord, donorComparison: r13DonorComparisonRecord, manifest, componentNames: r13DescriptorRecord.exports.map(({ name }) => name), crosswalk: r13Crosswalk, collectionsSource });
const r14DonorComparisonRecord = {
  schema: 'muxui-react-r1-4-donor-comparison-v1',
  generatedFrom: 'packages/react/src/generate.mjs',
  donor: r14Crosswalk.donor,
  components: r14Slugs.map((slug) => {
    const source = EXPECTED_R14_DONOR_CONTRACT.components[slug];
    const artifact = componentArtifacts.find(({ id }) => id === `muxui:component:${slug}`);
    return {
      component: artifact.name,
      binding: `${artifact.id}#web.react`,
      disposition: source.disposition,
      selector: `.muxui-${slug}`,
      donorInputs: source.donorInputs,
      tokenHooks: source.tokenHooks,
      rules: source.rules,
      result: { cssSelector: `.muxui-${slug}`, status: 'adapted-for-r1.4' },
    };
  }),
};
for (const slug of r14Slugs) {
  for (const hook of EXPECTED_R14_DONOR_CONTRACT.components[slug].tokenHooks) {
    if (!fullCssBody.includes(`--muxui-${hook.replaceAll('.', '-')}`)) throw new Error(`MUXUI_REACT_R14_TOKEN_HOOK_UNCONSUMED: ${slug}:${hook}`);
  }
}
const r14DescriptorRecord = { ...descriptorRecord, support: 'unproved; R1.4 React exports only' };
const r14ReleaseRecord = { ...releaseRecord, evidence: { status: 'pending', ids: ['E-R1.4-01', 'E-R1.4-02', 'E-R1.4-03', 'E-R1.4-04', 'E-R1.4-05', 'E-R1.4-06'] } };
assertReactR14GeneratedContracts({ descriptor: r14DescriptorRecord, release: r14ReleaseRecord, donorComparison: r14DonorComparisonRecord, manifest, componentNames: r14Slugs.map((slug) => componentArtifacts.find(({ id }) => id === `muxui:component:${slug}`).name), crosswalk: r14Crosswalk, overlaysSource });

const crosswalkSources = [crosswalk, r12Crosswalk, r13Crosswalk, r14Crosswalk];
const crosswalkBySlug = new Map(crosswalkSources.flatMap((source) => Object.entries(source.components ?? {})));
const snapshotByFamily = new Map(familySnapshot.families.map((family) => [family.family, family]));
const artifactBySlug = new Map(componentArtifacts.map((artifact) => [artifact.id.slice('muxui:component:'.length), artifact]));
const R15_EVIDENCE_IDS = Object.freeze(['E-R1.5-01', 'E-R1.5-02', 'E-R1.5-03', 'E-R1.5-04', 'E-R1.5-05', 'E-R1.5-06']);
const r15TrancheEvidence = (tranche) => Array.from({ length: tranche === 'R1.3' ? 5 : tranche === 'R1.4' ? 6 : 4 }, (_, index) => `E-${tranche}-${String(index + 1).padStart(2, '0')}`);
const familySlug = (family) => family === 'Modal'
  ? 'dialog'
  : family.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
const runtimeSourceFor = (exportName) => Object.entries(runtimeSources)
  .find(([, source]) => new RegExp(`export\\s+const\\s+${exportName}\\b`, 'u').test(source))?.[0];
const r15Families = familySnapshot.families.map((upstreamFamily) => {
  const slug = familySlug(upstreamFamily.family);
  const artifact = artifactBySlug.get(slug);
  const runtimeSource = runtimeSourceFor(artifact?.name);
  if (!artifact || !runtimeSource) throw new Error(`MUXUI_REACT_R15_FAMILY_OWNER_MISSING: ${upstreamFamily.family}`);
  return {
    family: upstreamFamily.family,
    slug,
    rootExport: upstreamFamily.rootExport,
    rootKind: upstreamFamily.rootKind,
    exportName: artifact.name,
    tranche: upstreamFamily.tranche,
    runtimeSource,
    artifactPath: `catalog/components/${slug}/artifact.json`,
  };
});
const r15ClosureRecord = {
  schema: 'muxui-react-r1-5-closure-v1',
  generatedFrom: 'catalog/react-r1-5/closure.json',
  package: manifest.name,
  version: manifest.version,
  upstream: {
    package: familySnapshot.upstream.package,
    version: familySnapshot.upstream.version,
    commit: familySnapshot.upstream.commit,
    tree: familySnapshot.upstream.tree,
    snapshot: 'catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json',
    rawExports: familySnapshot.counts.rawExports,
    documentedFamilies: familySnapshot.counts.documentedFamilies,
    rawDispositionCounts: familySnapshot.counts.rawDispositionCounts,
  },
  donor: {
    name: crosswalk.donor.name,
    commit: crosswalk.donor.commit,
    tree: crosswalk.donor.tree,
    dependency: false,
    ownership: 'Mux UI-owned token/style results',
    sourceCrosswalks: ['catalog/react-r1-0/donor-crosswalk.json', 'catalog/react-r1-2/donor-crosswalk.json', 'catalog/react-r1-3/donor-crosswalk.json', 'catalog/react-r1-4/donor-crosswalk.json'],
  },
  families: r15Families.map((source) => {
    const artifact = artifactBySlug.get(source.slug);
    const binding = artifact.bindings['web.react'];
    const upstreamFamily = snapshotByFamily.get(source.family);
    const donor = source.slug === 'button' ? crosswalk.button : crosswalkBySlug.get(source.slug);
    const donorInputs = source.slug === 'button'
      ? Object.entries(crosswalk.buttonBlobs).map(([kind, blob]) => ({ kind, blob }))
      : donor.donorInputs;
    const tokenHooks = donor.tokenHooks ?? [...new Set(donor.rules.map(({ core }) => core).filter((core) => core.includes('.')))];
    return {
      family: source.family,
      slug: source.slug,
      root: { export: source.rootExport, kind: upstreamFamily.rootKind },
      tranche: source.tranche,
      contract: {
        artifact: source.artifactPath,
        binding: `${artifact.id}#web.react`,
        lifecycle: artifact.lifecycle,
        states: artifact.states,
        api: binding.api,
        parts: artifact.anatomy,
        runtimeSource: source.runtimeSource,
      },
      export: { name: source.exportName, module: '.', kind: 'component' },
      lifecycle: { artifact: artifact.lifecycle, binding: binding.lifecycle, strategy: binding.strategy },
      evidence: { tranche: r15TrancheEvidence(source.tranche), final: R15_EVIDENCE_IDS, status: 'pending', support: 'unproved; R1.5 React exports only' },
      packed: { package: manifest.name, version: manifest.version, private: manifest.private, entry: 'generated/index.mjs', types: 'generated/index.d.ts', styles: 'generated/styles.css', binding: `${artifact.id}#web.react`, export: source.exportName, runtimeProfile: 'web.react', selector: `.muxui-${source.slug}` },
      donor: { disposition: donor.disposition, donorInputs, rules: donor.rules, tokenHooks, ownership: 'Mux UI-owned token/style results' },
    };
  }),
  evidence: { status: 'pending', ids: R15_EVIDENCE_IDS, support: 'unproved; R1.5 React exports only' },
  compatibility: r15ClosureSource.compatibility,
  performance: r15ClosureSource.performance,
  agentDiscovery: r15ClosureSource.agentDiscovery,
  evidenceCapture: r15ClosureSource.evidenceCapture,
  exceptions: r15ClosureSource.exceptions,
  advisories: r15ClosureSource.advisories,
  publication: r15ClosureSource.publication,
};
const r15DonorComparisonRecord = {
  schema: 'muxui-react-r1-5-donor-comparison-v1',
  generatedFrom: 'packages/react/src/generate.mjs',
  tranche: 'R1.5',
  donor: r15ClosureRecord.donor,
  components: r15ClosureRecord.families.map(({ slug, export: componentExport, donor }) => ({
    component: componentExport.name,
    family: r15ClosureRecord.families.find(({ slug: value }) => value === slug).family,
    binding: `muxui:component:${slug}#web.react`,
    disposition: donor.disposition,
    selector: `.muxui-${slug}`,
    donorInputs: donor.donorInputs,
    tokenHooks: donor.tokenHooks,
    rules: donor.rules,
    ownership: donor.ownership,
    result: { cssSelector: `.muxui-${slug}`, status: donor.disposition === 'no-applicable-donor' ? 'no-applicable-donor' : 'adapted-for-r1.5' },
  })),
};
assertReactR15GeneratedContracts({
  closure: r15ClosureSource,
  snapshot: familySnapshot,
  componentArtifacts,
  crosswalks: crosswalkSources,
  descriptor: descriptorRecord,
  release: releaseRecord,
  donorComparison: r15DonorComparisonRecord,
  closureRecord: r15ClosureRecord,
  manifest,
  runtimeSources,
  styles: fullCssBody,
});
const fixed53Slugs = new Set(r15Families.map(({ slug }) => slug));
const supplementalSource = await readFile(resolve(packageRoot, 'src/supplemental/index.mjs'), 'utf8').catch(() => '');
const supplementalTypesSource = await readFile(resolve(packageRoot, 'src/supplemental/index.d.ts'), 'utf8').catch(() => '');
const supplementalStylesSource = await readFile(resolve(packageRoot, 'src/supplemental/styles.css'), 'utf8').catch(() => '');
const generatedSupplementalSource = supplementalSource
  .replaceAll("from '../choice-context.mjs'", "from './choice-context.mjs'")
  .replaceAll("from '../button.mjs'", "from './button.mjs'");
const currentMappedRecords = (await Promise.all(r16Crosswalk.supplemental.map(async (entry) => {
  const sourceText = await readFile(resolve(repositoryRoot, entry.runtimeSource), 'utf8');
  const style = await readFile(resolve(repositoryRoot, entry.styleSource), 'utf8');
  const artifact = allCatalogArtifactsBySlug.get(entry.slug);
  return {
    family: entry.family,
    slug: entry.slug,
    exportName: entry.export.name,
    source: entry.runtimeSource,
    module: entry.export.module,
    styleSource: entry.styleSource,
    artifact,
    sourceText: sourceText
      .replaceAll("from '../button.mjs'", "from './button.mjs'")
      .replaceAll("from '../choice-context.mjs'", "from './choice-context.mjs'"),
    style,
    subpath: entry.export.module !== '.',
    ...(migrationMode ? {
      mapping: entry,
      donor: {
        disposition: 'pending-proof',
        donorInputs: entry.donor.inputs,
        rules: entry.differenceRecords.map((input) => ({ input, disposition: 'documented-adaptation' })),
        tokenHooks: [],
        ownership: 'Mux UI-owned token/style results',
      },
    } : {}),
  };
}))).sort((left, right) => left.slug.localeCompare(right.slug));
const currentSubpathRecords = currentMappedRecords.filter(({ subpath }) => subpath);
const currentEagerRecords = currentMappedRecords.filter(({ subpath, source }) => !subpath && source !== 'packages/react/src/supplemental/index.mjs');
const currentFamilyRecords = [
  ...r15Families.map((source) => {
    const artifact = artifactBySlug.get(source.slug);
    return {
      family: source.family,
      slug: source.slug,
      exportName: source.exportName,
      tranche: source.tranche,
      module: '.',
      source: source.runtimeSource,
      artifact,
      subpath: false,
      donor: source.slug === 'button' ? crosswalk.button : crosswalkBySlug.get(source.slug),
    };
  }),
  ...currentMappedRecords.map((source) => ({
    family: source.family,
    slug: source.slug,
    exportName: source.exportName,
    tranche: 'R1.6',
    module: source.module === '.' ? '.' : source.module,
    source: source.source,
    artifact: source.artifact,
    subpath: source.subpath,
    ...(source.donor ? { donor: source.donor } : {}),
    ...(source.mapping ? { mapping: source.mapping } : {}),
  })),
];
const currentBindings = currentFamilyRecords.map((source) => ({
  binding: `muxui:component:${source.slug}#web.react`,
  export: source.exportName,
  module: source.module,
  tranche: source.tranche,
  lifecycle: source.artifact.lifecycle,
  strategy: source.artifact.bindings['web.react'].strategy,
  runtimeProfile: 'web.react',
  selector: `.muxui-${source.slug}`,
  states: source.artifact.states,
  api: source.artifact.bindings['web.react'].api,
  ...(source.subpath ? { subpath: source.module } : {}),
}));
const currentExports = currentFamilyRecords.map((source) => ({
  name: source.exportName,
  kind: 'component',
  binding: `muxui:component:${source.slug}#web.react`,
  module: source.module,
  ...(source.subpath ? { subpath: source.module } : {}),
}));
const currentDescriptorRecord = {
  ...descriptorRecord,
  support: 'unproved; R1.6 React current union projection',
  tranche: 'R1.6',
  bindings: currentBindings,
  exports: currentExports,
  historical: {
    tranche: 'R1.5',
    source: 'catalog/react-r1-5/closure.json',
    familyCount: r15Families.length,
    bindings: descriptorRecord.bindings,
    exports: descriptorRecord.exports,
  },
};
const currentReleaseRecord = {
  ...releaseRecord,
  tranche: 'R1.6',
  componentExports: currentFamilyRecords.map((source) => ({ name: source.exportName, export: source.exportName, binding: `muxui:component:${source.slug}#web.react`, module: source.module, ...(source.subpath ? { subpath: source.module } : {}) })),
  bindings: currentBindings.map(({ binding, export: exportName, module, lifecycle, strategy, runtimeProfile, subpath }) => ({ binding, package: manifest.name, export: exportName, module, lifecycle, strategy, runtimeProfile, ...(subpath ? { subpath } : {}) })),
  catalog: { status: 'bound', components: currentFamilyRecords.map((source) => ({ component: source.artifact.id, binding: `muxui:component:${source.slug}#web.react`, states: source.artifact.states, ...(source.subpath ? { subpath: source.module } : {}) })) },
  evidence: { status: 'pending', ids: [] },
  publication: { status: 'disabled', requires: ['explicit external publish authorization'] },
  historical: {
    tranche: 'R1.5',
    source: 'catalog/react-r1-5/closure.json',
    familyCount: r15Families.length,
    componentExports: releaseRecord.componentExports,
    bindings: releaseRecord.bindings,
    catalog: releaseRecord.catalog,
    evidence: releaseRecord.evidence,
  },
};
const currentContractRecord = migrationMode ? {
  schema: 'muxui-react-r1-6-contract-v1',
  generatedFrom: 'packages/react/src/generate.mjs',
  package: manifest.name,
  version: manifest.version,
  tranche: 'R1.6',
  donor: { name: 'Tale UI', repository: r16Crosswalk.donor.repository, commit: r16Crosswalk.donor.commit, tree: r16Crosswalk.donor.tree, styleTree: r16Crosswalk.donor.styleTree, dependency: false },
  historical: { tranche: 'R1.5', source: 'catalog/react-r1-5/closure.json', familyCount: r15Families.length },
  current: {
    familyCount: currentFamilyRecords.length,
    fixed53Count: r15Families.length,
    supplementalCount: currentMappedRecords.length,
    subpathCount: currentSubpathRecords.length,
    rootExports: currentFamilyRecords.filter(({ subpath }) => !subpath).map(({ exportName }) => exportName),
    subpaths: currentSubpathRecords.map(({ exportName, module }) => ({ export: exportName, module })),
  },
  components: currentFamilyRecords.map((source) => ({
    family: source.family,
    slug: source.slug,
    tranche: source.tranche,
    binding: `muxui:component:${source.slug}#web.react`,
    module: source.module,
    ...(source.source ? { source: source.source } : {}),
    lifecycle: source.artifact.lifecycle,
    states: source.artifact.states,
    api: source.artifact.bindings['web.react'].api,
    parts: source.artifact.anatomy,
    donor: source.donor,
    fixture: finiteFixtureBySlug.get(source.slug),
  })),
  evidence: { status: 'pending', ids: r16Crosswalk.proof.assertions },
} : undefined;
const currentDonorComparisonRecord = migrationMode ? {
  schema: 'muxui-react-r1-6-donor-comparison-v1',
  generatedFrom: 'packages/react/src/generate.mjs',
  tranche: 'R1.6',
  donor: currentContractRecord.donor,
  historical: { source: 'packages/react/generated/r1-5-donor-comparison.json', componentCount: r15Families.length },
  components: currentFamilyRecords.map((source) => ({
    component: source.exportName,
    family: source.family,
    binding: `muxui:component:${source.slug}#web.react`,
    disposition: source.donor.disposition,
    selector: `.muxui-${source.slug}`,
    donorInputs: source.donor.donorInputs ?? [],
    tokenHooks: source.donor.tokenHooks ?? [],
    rules: source.donor.rules ?? [],
    ownership: source.donor.ownership ?? 'Mux UI-owned token/style results',
    result: { cssSelector: `.muxui-${source.slug}`, status: source.donor.disposition === 'pending-proof' ? 'pending-proof' : 'adapted-for-r1.6' },
  })),
} : undefined;
const currentIndexBody = `${indexBody}export * from './supplemental.mjs';\n${currentEagerRecords.map(({ slug }) => `export * from './${slug}.mjs';\n`).join('')}`;
const currentTypesBody = `${reactTypesBody}\nexport * from './supplemental.js';\n${currentEagerRecords.map(({ slug }) => `export * from './${slug}.js';\n`).join('')}`;
const currentStylesBody = `${fullCssBody}${supplementalStylesSource ? `\n\n${supplementalStylesSource.trim()}` : ''}${[...currentSubpathRecords, ...currentEagerRecords].map(({ style }) => style ? `\n\n${style.trim()}` : '').join('')}`;
const descriptor = `${canonicalJson(currentDescriptorRecord)}\n`;
const release = `${canonicalJson(currentReleaseRecord)}\n`;
const donorComparison = `${canonicalJson(donorComparisonRecord)}\n`;
const componentDonorComparison = generatedText(
  'packages/react/src/generate.mjs',
  `${canonicalJson(componentDonorComparisonRecord)}\n`,
);
const r12DonorComparison = generatedText(
  'packages/react/src/generate.mjs',
  `${canonicalJson(r12DonorComparisonRecord)}\n`,
);
const r13DonorComparison = generatedText(
  'packages/react/src/generate.mjs',
  `${canonicalJson(r13DonorComparisonRecord)}\n`,
);
const r14DonorComparison = generatedText(
  'packages/react/src/generate.mjs',
  `${canonicalJson(r14DonorComparisonRecord)}\n`,
);
const r15DonorComparison = generatedText(
  'packages/react/src/generate.mjs',
  `${canonicalJson(r15DonorComparisonRecord)}\n`,
);
const r15Closure = generatedText(
  'catalog/react-r1-5/closure.json',
  `${canonicalJson(r15ClosureRecord)}\n`,
);
const r16Contract = migrationMode ? generatedText(
  'packages/react/src/generate.mjs',
  `${canonicalJson(currentContractRecord)}\n`,
) : undefined;
const r16DonorComparison = migrationMode ? generatedText(
  'packages/react/src/generate.mjs',
  `${canonicalJson(currentDonorComparisonRecord)}\n`,
) : undefined;
function provenance(path, bytes) {
  const body = `${canonicalJson({ path: `packages/react/generated/${path}`, sha256: `sha256:${sha256(bytes)}` })}\n`;
  return generatedText('packages/react/src/generate.mjs', body);
}

const outputs = new Map([
  ['compatibility.mjs', generatedText('packages/react/src/generate.mjs', compatibilityBody)],
  ['index.mjs', generatedText('packages/react/src/generate.mjs', currentIndexBody)],
  ['index.d.ts', generatedText('packages/react/src/generate.mjs', currentTypesBody)],
  ['button.mjs', generatedText('packages/react/src/button.mjs', buttonSource)],
  ['testing.mjs', generatedText('packages/react/src/generate.mjs', testingBody)],
  ['styles.css', generatedCss('packages/react/src/generate.mjs', currentStylesBody)],
  ['descriptor.json', descriptor],
  ['descriptor.json.provenance', provenance('descriptor.json', descriptor)],
  ['release.json', release],
  ['release.json.provenance', provenance('release.json', release)],
  ['button-donor-comparison.json', donorComparison],
  ['button-donor-comparison.json.provenance', provenance('button-donor-comparison.json', donorComparison)],
  ['r1-2-donor-comparison.json', r12DonorComparison],
  ['r1-2-donor-comparison.json.provenance', provenance('r1-2-donor-comparison.json', r12DonorComparison)],
  ['r1-3-donor-comparison.json', r13DonorComparison],
  ['r1-3-donor-comparison.json.provenance', provenance('r1-3-donor-comparison.json', r13DonorComparison)],
  ['r1-4-donor-comparison.json', r14DonorComparison],
  ['r1-4-donor-comparison.json.provenance', provenance('r1-4-donor-comparison.json', r14DonorComparison)],
  ['r1-5-donor-comparison.json', r15DonorComparison],
  ['r1-5-donor-comparison.json.provenance', provenance('r1-5-donor-comparison.json', r15DonorComparison)],
  ['r1-5-closure.json', r15Closure],
  ['r1-5-closure.json.provenance', provenance('r1-5-closure.json', r15Closure)],
  ['supplemental.mjs', generatedText('packages/react/src/supplemental/index.mjs', `${generatedSupplementalSource}`)],
  ['supplemental.d.ts', generatedText('packages/react/src/supplemental/index.d.ts', `${supplementalTypesSource}`)],
  ['supplemental.css', generatedCss('packages/react/src/supplemental/styles.css', supplementalStylesSource)],
  ['component-donor-comparison.json', componentDonorComparison],
  ['component-donor-comparison.json.provenance', provenance('component-donor-comparison.json', componentDonorComparison)],
  ['choice-context.mjs', generatedText('packages/react/src/choice-context.mjs', choiceContextSource)],
  ['toggle-button-context.mjs', generatedText('packages/react/src/toggle-button-context.mjs', toggleButtonContextSource)],
  ['components.mjs', generatedText('packages/react/src/components.mjs', componentSource)],
  ['fields.mjs', generatedText('packages/react/src/fields.mjs', fieldsSource)],
  ['collections.mjs', generatedText('packages/react/src/collections.mjs', collectionsSource)],
  ['overlays.mjs', generatedText('packages/react/src/overlays.mjs', overlaysSource)],
]);
if (migrationMode) {
  outputs.set('r1-6-contract.json', r16Contract);
  outputs.set('r1-6-contract.json.provenance', provenance('r1-6-contract.json', r16Contract));
  outputs.set('r1-6-donor-comparison.json', r16DonorComparison);
  outputs.set('r1-6-donor-comparison.json.provenance', provenance('r1-6-donor-comparison.json', r16DonorComparison));
}
for (const source of [...currentSubpathRecords, ...currentEagerRecords]) {
  outputs.set(`${source.slug}.mjs`, generatedText(source.source, source.sourceText));
  const typesPath = source.source.replace(/\.mjs$/u, '.d.ts');
  const typesSource = await readFile(resolve(repositoryRoot, typesPath), 'utf8').catch(() => null);
  if (typesSource) outputs.set(`${source.slug}.d.ts`, generatedText(typesPath, typesSource));
}
const readme = generatedText('packages/react/src/generate.mjs', `${readmeBody}${readmeGuidance}`, '<!--', ' -->');

if (process.argv.includes('--check')) {
  for (const [name, expected] of outputs) {
    if (await readFile(resolve(generatedRoot, name), 'utf8').catch(() => null) !== expected) {
      throw new Error(`MUXUI_REACT_GENERATED_DRIFT: generated/${name}`);
    }
  }
  if (await readFile(resolve(packageRoot, 'README.md'), 'utf8').catch(() => null) !== readme) {
    throw new Error('MUXUI_REACT_GENERATED_DRIFT: README.md');
  }
} else {
  await mkdir(generatedRoot, { recursive: true });
  for (const [name, expected] of outputs) await writeFile(resolve(generatedRoot, name), expected);
  await writeFile(resolve(packageRoot, 'README.md'), readme);
}

console.log('[react] generated current R1.6 union projection with historical R1.5 closure records');
