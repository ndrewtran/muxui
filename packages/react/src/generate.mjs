import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalJson } from '@muxui/schema';
import { compileTokenGraph, compileWebTheme } from '@muxui/tokens';
import { cssName } from '@muxui/tokens/core';
import { assertReactR10SourceContracts, assertReactR15GeneratedContracts } from './r1-contracts.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageRoot, '../..');
const generatedRoot = resolve(packageRoot, 'generated');
const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
const tokenPath = resolve(repositoryRoot, 'catalog/tokens/default-theme.json');
const tokenRaw = await readFile(tokenPath);
const tokenSha256 = createHash('sha256').update(tokenRaw).digest('hex');
const tokenSource = JSON.parse(tokenRaw);
const upstreamSnapshot = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-0/upstream-snapshot.json'), 'utf8'));
const upstreamExportsRaw = await readFile(resolve(repositoryRoot, 'catalog/react-r1-0/upstream-exports.json'));
const upstreamExports = JSON.parse(upstreamExportsRaw);
assertReactR10SourceContracts({ snapshot: upstreamSnapshot, upstreamExports, upstreamExportsBytes: upstreamExportsRaw });
const familySnapshot = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json'), 'utf8'));
const r15ClosureSource = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-5/closure.json'), 'utf8'));
const r16Supplemental = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-6/supplemental-components.json'), 'utf8'));
const r11Slugs = ['button', 'breadcrumbs', 'checkbox', 'disclosure', 'disclosure-group', 'group', 'link', 'meter', 'progress-bar', 'separator', 'toggle-button'];
const r12Slugs = ['autocomplete', 'checkbox-group', 'date-field', 'date-picker', 'date-range-picker', 'form', 'number-field', 'search-field', 'switch', 'text-field', 'time-field'];
const r13Slugs = ['calendar', 'color-area', 'color-field', 'color-picker', 'color-slider', 'color-swatch', 'color-swatch-picker', 'color-wheel', 'combo-box', 'grid-list', 'list-box', 'menu', 'radio-group', 'range-calendar', 'select', 'slider', 'table', 'tabs', 'tag-group', 'toggle-button-group', 'token-field', 'toolbar', 'tree', 'virtualizer'];
const r14Slugs = ['drop-zone', 'file-trigger', 'dialog', 'popover', 'preview-trigger', 'toast', 'tooltip'];
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
  size: 'md',
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
const choiceSizeDeclaration = `export const CHOICE_CONTROL_SIZES = Object.freeze([${['sm', 'md', 'lg'].map((value) => `'${value}'`).join(', ')}]);`;
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
  || !fieldsSource.includes("const AUTOCOMPLETE_SIZES = new Set(['sm', 'md', 'lg']);")
  || !fieldsSource.includes('normalizeAutocompleteSize')) {
  throw new Error('MUXUI_REACT_AUTOCOMPLETE_CANONICAL_API_DRIFT');
}
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
const mappedR16Slugs = new Set(r16Supplemental.components.map(({ slug }) => slug));
const historicalCatalogSlugs = new Set(familySnapshot.families.map(({ family }) => (family === 'Modal' ? 'dialog' : family.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase())));
const unexpectedCurrentSlugs = [...allCatalogArtifactsBySlug.keys()].filter((slug) => !historicalCatalogSlugs.has(slug) && !mappedR16Slugs.has(slug));
if (!Array.isArray(r16Supplemental.components) || unexpectedCurrentSlugs.length > 0) {
  throw new Error('MUXUI_REACT_R16_CANONICAL_MAPPING_DRIFT');
}
for (const entry of r16Supplemental.components) {
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
if (new Set(r16Supplemental.components.map(({ export: componentExport }) => componentExport.name)).size !== r16Supplemental.components.length
  || new Set(r16Supplemental.components.map(({ binding }) => binding)).size !== r16Supplemental.components.length) {
  throw new Error('MUXUI_REACT_R16_MAPPING_IDENTITY_DRIFT');
}
for (const artifact of componentArtifacts) {
  const binding = artifact.bindings['web.react'];
  if (!binding || binding.api.props.some((prop) => /^is[A-Z]/u.test(prop))) {
    throw new Error(`MUXUI_REACT_${artifact.name.toUpperCase()}_CANONICAL_API_DRIFT`);
  }
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

function themeBundle(options = {}) {
  const theme = compileWebTheme(tokenSource, options);
  const graph = compileTokenGraph(tokenSource, options);
  const cssDeclarations = declarations(theme.css);
  const values = new Map(Object.keys(graph.tokens).map((id) => [id, cssDeclarations.get(cssName(id))]));
  return { theme, graph, values };
}

function changedTokenIds(base, variant) {
  return new Set([...variant.values].filter(([id, value]) => base.values.get(id) !== value).map(([id]) => id));
}

function dependentClosure(seedIds, ...graphs) {
  const dependents = new Map();
  for (const graph of graphs) {
    for (const [id, dependencies] of Object.entries(graph.dependencies)) {
      for (const dependency of dependencies) {
        const ids = dependents.get(dependency) ?? [];
        ids.push(id);
        dependents.set(dependency, ids);
      }
    }
  }
  const closure = new Set(seedIds);
  const pending = [...closure];
  while (pending.length > 0) {
    const id = pending.pop();
    for (const dependent of dependents.get(id) ?? []) {
      if (closure.has(dependent)) continue;
      closure.add(dependent);
      pending.push(dependent);
    }
  }
  return closure;
}

function serializeDeclarations(bundle, tokenIds) {
  return [...tokenIds].sort((left, right) => left.localeCompare(right))
    .map((id) => `  ${cssName(id)}: ${bundle.values.get(id)};`)
    .join('\n');
}

function deltaBlock(selector, bundle, tokenIds, emptyComment) {
  const values = tokenIds.size === 0 ? `  /* ${emptyComment} */` : serializeDeclarations(bundle, tokenIds);
  return `${selector} {\n${values}\n}`;
}

const axes = [
  ['colorScheme', ['light', 'dark']],
  ['contrast', ['standard', 'more']],
  ['motion', ['full', 'reduced']],
  ['density', ['comfortable', 'compact']],
];
const baseTheme = themeBundle();
const responsiveTheme = themeBundle({ responsive: true });
const responsiveChanges = dependentClosure(
  changedTokenIds(baseTheme, responsiveTheme),
  baseTheme.graph,
  responsiveTheme.graph,
);
const responsiveBlock = deltaBlock(
  '[data-muxui-responsive]',
  responsiveTheme,
  responsiveChanges,
  'canonical theme has no responsive token delta',
);
const modeBlocks = axes.flatMap(([axis, values]) => {
  const variants = values.map((value) => [value, themeBundle({ modes: { [axis]: value } })]);
  const variantGraphs = variants.map(([, bundle]) => bundle.graph);
  const axisChanges = new Set();
  const changesByValue = new Map();
  for (const [value, bundle] of variants) {
    const changes = changedTokenIds(baseTheme, bundle);
    changesByValue.set(value, changes);
    if (value !== values[0]) for (const id of changes) axisChanges.add(id);
  }
  const dataAxis = axis.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return variants.map(([value, bundle]) => {
    const seedIds = value === values[0] ? axisChanges : changesByValue.get(value);
    const tokenIds = dependentClosure(seedIds, baseTheme.graph, ...variantGraphs);
    return deltaBlock(
      `[data-muxui-${dataAxis}='${value}']`,
      bundle,
      tokenIds,
      'canonical mode has no token delta',
    );
  });
});

const cssBody = `${baseTheme.theme.css.trim()}\n\n${responsiveBlock}\n\n${modeBlocks.join('\n\n')}\n\n[data-muxui-direction='ltr'] { direction: ltr; }\n[data-muxui-direction='rtl'] { direction: rtl; }`;
const fullCssBody = `${cssBody}\n\n${authoredCss}`;

const compatibility = {
  schema: 'muxui-react-compatibility-v1',
  package: manifest.name,
  version: manifest.version,
  upstream: { package: 'react-aria-components', version: '1.20.0', gitHead: '5ecb3333001313e83898cd07644227897e3bae1f' },
  tokenSource: { path: 'catalog/tokens/default-theme.json', sha256: tokenSha256 },
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
export interface CheckboxProps extends Omit<React.LabelHTMLAttributes<HTMLLabelElement>, 'children' | 'className' | 'onChange'> { children?: React.ReactNode; className?: string; checked?: boolean; defaultChecked?: boolean; disabled?: boolean; size?: 'sm' | 'md' | 'lg'; indeterminate?: boolean; invalid?: boolean; name?: string; required?: boolean; value?: string; onChange?: (checked: boolean) => void; }
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
export type ControlSize = 'sm' | 'md' | 'lg';
export interface FieldValidationProps { description?: React.ReactNode; errorMessage?: React.ReactNode; disabled?: boolean; readOnly?: boolean; required?: boolean; invalid?: boolean; size?: ControlSize; className?: string; }
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
export type CheckboxGroupProps = NamedFieldProps & { value?: string[]; defaultValue?: string[]; onChange?: (value: string[]) => void; name?: string; orientation?: 'vertical' | 'horizontal'; size?: 'sm' | 'md' | 'lg'; children?: React.ReactNode; };
export declare const CheckboxGroup: React.ForwardRefExoticComponent<CheckboxGroupProps & React.RefAttributes<HTMLDivElement>>;
export type SwitchProps = MuxUIAccessibleName & { description?: React.ReactNode; errorMessage?: React.ReactNode; disabled?: boolean; readOnly?: boolean; required?: boolean; invalid?: boolean; size?: ControlSize; className?: string; children?: React.ReactNode; selected?: boolean; defaultSelected?: boolean; onChange?: (selected: boolean) => void; name?: string; value?: string; };
export declare const Switch: React.ForwardRefExoticComponent<SwitchProps & React.RefAttributes<HTMLDivElement>>;
export type MuxUIValidationErrors = Readonly<Record<string, string | string[]>>;
export interface FormProps extends Omit<React.FormHTMLAttributes<HTMLFormElement>, 'children' | 'className' | 'onSubmit' | 'onReset'> { children?: React.ReactNode; className?: string; validationBehavior?: 'aria' | 'native'; validationErrors?: MuxUIValidationErrors; onSubmit?: React.FormEventHandler<HTMLFormElement>; onReset?: React.FormEventHandler<HTMLFormElement>; }
export declare const Form: React.ForwardRefExoticComponent<FormProps & React.RefAttributes<HTMLFormElement>>;
export type DateFieldProps = NamedFieldProps & { value?: MuxUIDateValue; defaultValue?: MuxUIDateValue; minValue?: MuxUIDateValue; maxValue?: MuxUIDateValue; unavailableDateMatcher?: (date: MuxUIDateValue) => boolean; onChange?: (value?: MuxUIDateValue) => void; name?: string; };
export declare const DateField: React.ForwardRefExoticComponent<DateFieldProps & React.RefAttributes<HTMLDivElement>>;
export type TimeFieldProps = NamedFieldProps & { value?: MuxUITimeValue; defaultValue?: MuxUITimeValue; minValue?: MuxUITimeValue; maxValue?: MuxUITimeValue; onChange?: (value?: MuxUITimeValue) => void; name?: string; size?: ControlSize; };
export declare const TimeField: React.ForwardRefExoticComponent<TimeFieldProps & React.RefAttributes<HTMLDivElement>>;
export type DatePickerProps = DateFieldProps & { open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; };
export declare const DatePicker: React.ForwardRefExoticComponent<DatePickerProps & React.RefAttributes<HTMLDivElement>>;
export type DateRangePickerProps = NamedFieldProps & { value?: MuxUIDateRange; defaultValue?: MuxUIDateRange; minValue?: MuxUIDateValue; maxValue?: MuxUIDateValue; unavailableDateMatcher?: (date: MuxUIDateValue, anchorDate: MuxUIDateValue | null) => boolean; open?: boolean; defaultOpen?: boolean; onChange?: (value?: MuxUIDateRange) => void; startName?: string; endName?: string; onOpenChange?: (open: boolean) => void; };
export declare const DateRangePicker: React.ForwardRefExoticComponent<DateRangePickerProps & React.RefAttributes<HTMLDivElement>>;
export interface AutocompleteItem { id?: string; label?: React.ReactNode; value?: string; disabled?: boolean; }
export interface AutocompleteSelectionItem { id: string; label: React.ReactNode; value: string; }
export type AutocompleteProps = NamedFieldProps & { items?: Array<AutocompleteItem | string>; value?: string; defaultValue?: string; onChange?: (value: string) => void; onSelect?: (item?: AutocompleteSelectionItem) => void; name?: string; placeholder?: string; size?: 'sm' | 'md' | 'lg'; };
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
export type ColorFieldProps = NamedFieldProps & { value?: MuxUIColorValue; defaultValue?: MuxUIColorValue; onChange?: (value: MuxUIColorValue) => void; name?: string; size?: ControlSize; };
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
export type RadioGroupProps = MuxUIAccessibleName & { options?: RadioOption[]; children?: React.ReactNode; value?: string; defaultValue?: string; disabled?: boolean; readOnly?: boolean; required?: boolean; invalid?: boolean; orientation?: 'vertical' | 'horizontal'; size?: 'sm' | 'md' | 'lg'; onChange?: (value: string) => void; className?: string; };
export declare const RadioGroup: React.ForwardRefExoticComponent<RadioGroupProps & React.RefAttributes<HTMLDivElement>>;
export type SelectProps = NamedFieldProps & { items?: MuxUIItems; value?: string; defaultValue?: string; open?: boolean; defaultOpen?: boolean; disabled?: boolean; readOnly?: boolean; required?: boolean; invalid?: boolean; size?: ControlSize; name?: string; placeholder?: string; onChange?: (value?: string) => void; onOpenChange?: (open: boolean) => void; };
export declare const Select: React.ForwardRefExoticComponent<SelectProps & React.RefAttributes<HTMLDivElement>>;
export type ComboBoxProps = NamedFieldProps & { items?: MuxUIItems; value?: string; defaultValue?: string; selectedId?: string; defaultSelectedId?: string; disabled?: boolean; readOnly?: boolean; required?: boolean; invalid?: boolean; size?: ControlSize; name?: string; placeholder?: string; onChange?: (value: string) => void; onSelect?: (item?: MuxUICollectionItem) => void; };
export declare const ComboBox: React.ForwardRefExoticComponent<ComboBoxProps & React.RefAttributes<HTMLDivElement>>;
export type SliderProps = MuxUIAccessibleName & { value?: number; defaultValue?: number; min?: number; max?: number; step?: number; disabled?: boolean; readOnly?: boolean; orientation?: 'horizontal' | 'vertical'; onChange?: (value: number) => void; onChangeEnd?: (value: number) => void; className?: string; };
export declare const Slider: React.ForwardRefExoticComponent<SliderProps & React.RefAttributes<HTMLDivElement>>;
export interface MuxUITableColumn extends MuxUICollectionItem { isRowHeader?: boolean; sortable?: boolean; }
export interface MuxUITableRow extends MuxUICollectionItem { values?: Record<string, React.ReactNode>; }
export type MuxUITableSortDescriptor = { column: string; direction: 'ascending' | 'descending'; };
export type TableProps = MuxUIAriaLabel & { columns?: MuxUITableColumn[]; rows?: MuxUITableRow[]; selectedIds?: MuxUISelection; defaultSelectedIds?: MuxUISelection; sortDescriptor?: MuxUITableSortDescriptor; disabled?: boolean; selectionMode?: 'none' | 'single' | 'multiple'; onSelectionChange?: (ids: MuxUISelection) => void; onRowAction?: (row?: MuxUITableRow) => void; onSortChange?: (next: MuxUITableSortDescriptor) => void; className?: string; };
export declare const Table: React.ForwardRefExoticComponent<TableProps & React.RefAttributes<HTMLTableElement>>;
export type TabsProps = MuxUIAriaAccessibleName & { items?: MuxUIItems; value?: string; defaultValue?: string; disabled?: boolean; orientation?: 'horizontal' | 'vertical'; keyboardActivation?: 'automatic' | 'manual'; size?: ControlSize; onChange?: (value: string) => void; className?: string; };
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
const readmeBody = `# @muxui/react\n\nR1.6 current React union for the standalone Mux UI renderer.\n\n- The current union contains Mux UI-owned family exports, including root exports and isolated subpaths.\n- React Aria Components 1.20.0 is an internal replaceable substrate.\n- MuxUI owns the public APIs, tokens, selectors, styling, accessibility behavior, lifecycle, and prop names.\n- The R1.5 closure retains its fixed family membership separately from this current union.\n`;
const markdownCell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const readmeMappingBySlug = new Map(r16Supplemental.components.map((entry) => [entry.slug, entry]));
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

Component styles consume semantic roles from \`catalog/tokens/default-theme.json\`: gaps, content insets, outer spacing, viewport clearance, surfaces, borders, typography, shapes, and motion are independently themeable. Explicit per-mode palette painting uses non-inverting semantic palette aliases so dark styles are not inverted twice. Choose tokens by their documented meaning, not because their default values happen to match.

Structural CSS remains literal where it expresses geometry rather than a theme choice: zero/reset values, percentages and intrinsic sizing, border overlaps, visually hidden accessibility patterns, calendar grids, and text-segment alignment. The styling-token tests cover all authored component stylesheets; the browser check verifies gap/inset override isolation.

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
  tokenSource: { path: 'catalog/tokens/default-theme.json', sha256: tokenSha256 },
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
  families: r15Families.map((source) => {
    const artifact = artifactBySlug.get(source.slug);
    const binding = artifact.bindings['web.react'];
    const upstreamFamily = snapshotByFamily.get(source.family);
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
    };
  }),
  evidence: { status: 'pending', ids: R15_EVIDENCE_IDS, support: 'unproved; R1.5 React exports only' },
  compatibility: r15ClosureSource.compatibility,
  performance: r15ClosureSource.performance,
  publication: r15ClosureSource.publication,
};
const supplementalSource = await readFile(resolve(packageRoot, 'src/supplemental/index.mjs'), 'utf8').catch(() => '');
const supplementalTypesSource = await readFile(resolve(packageRoot, 'src/supplemental/index.d.ts'), 'utf8').catch(() => '');
const supplementalStylesSource = await readFile(resolve(packageRoot, 'src/supplemental/styles.css'), 'utf8').catch(() => '');
const generatedSupplementalSource = supplementalSource
  .replaceAll("from '../choice-context.mjs'", "from './choice-context.mjs'")
  .replaceAll("from '../button.mjs'", "from './button.mjs'");
const currentMappedRecords = (await Promise.all(r16Supplemental.components.map(async (entry) => {
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
const currentContractRecord = {
  schema: 'muxui-react-r1-6-contract-v1',
  generatedFrom: 'packages/react/src/generate.mjs',
  package: manifest.name,
  version: manifest.version,
  tranche: 'R1.6',
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
    source: source.source,
    lifecycle: source.artifact.lifecycle,
    states: source.artifact.states,
    api: source.artifact.bindings['web.react'].api,
    parts: source.artifact.anatomy,
  })),
  evidence: { status: 'pending', ids: [] },
};
const currentIndexBody = `${indexBody}export * from './supplemental.mjs';\n${currentEagerRecords.map(({ slug }) => `export * from './${slug}.mjs';\n`).join('')}`;
const currentTypesBody = `${reactTypesBody}\nexport * from './supplemental.js';\n${currentEagerRecords.map(({ slug }) => `export * from './${slug}.js';\n`).join('')}`;
const currentStylesBody = `${fullCssBody}${supplementalStylesSource ? `\n\n${supplementalStylesSource.trim()}` : ''}${[...currentSubpathRecords, ...currentEagerRecords].map(({ style }) => style ? `\n\n${style.trim()}` : '').join('')}`;
assertReactR15GeneratedContracts({
  closure: r15ClosureSource,
  snapshot: familySnapshot,
  componentArtifacts,
  descriptor: currentDescriptorRecord,
  release: currentReleaseRecord,
  closureRecord: r15ClosureRecord,
  currentContract: currentContractRecord,
  manifest,
  runtimeSources,
  styles: currentStylesBody,
});
const descriptor = `${canonicalJson(currentDescriptorRecord)}\n`;
const release = `${canonicalJson(currentReleaseRecord)}\n`;
const r15Closure = generatedText(
  'catalog/react-r1-5/closure.json',
  `${canonicalJson(r15ClosureRecord)}\n`,
);
const r16Contract = generatedText(
  'packages/react/src/generate.mjs',
  `${canonicalJson(currentContractRecord)}\n`,
);
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
  ['r1-5-closure.json', r15Closure],
  ['r1-5-closure.json.provenance', provenance('r1-5-closure.json', r15Closure)],
  ['supplemental.mjs', generatedText('packages/react/src/supplemental/index.mjs', `${generatedSupplementalSource}`)],
  ['supplemental.d.ts', generatedText('packages/react/src/supplemental/index.d.ts', `${supplementalTypesSource}`)],
  ['supplemental.css', generatedCss('packages/react/src/supplemental/styles.css', supplementalStylesSource)],
  ['r1-6-contract.json', r16Contract],
  ['r1-6-contract.json.provenance', provenance('r1-6-contract.json', r16Contract)],
  ['choice-context.mjs', generatedText('packages/react/src/choice-context.mjs', choiceContextSource)],
  ['toggle-button-context.mjs', generatedText('packages/react/src/toggle-button-context.mjs', toggleButtonContextSource)],
  ['components.mjs', generatedText('packages/react/src/components.mjs', componentSource)],
  ['fields.mjs', generatedText('packages/react/src/fields.mjs', fieldsSource)],
  ['collections.mjs', generatedText('packages/react/src/collections.mjs', collectionsSource)],
  ['overlays.mjs', generatedText('packages/react/src/overlays.mjs', overlaysSource)],
]);
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

console.log('[react] generated current R1.6 union projection with the retained R1.5 family closure');
