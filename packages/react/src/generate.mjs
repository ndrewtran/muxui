import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
const tokenPath = resolve(repositoryRoot, 'catalog/tokens/default-theme.json');
const tokenRaw = await readFile(tokenPath);
const tokenSha256 = createHash('sha256').update(tokenRaw).digest('hex');
const expectedTokenSha256 = 'ce714ebe6ffd9dbd29777a7bdf6ac3894a9448c23a9a21360da95721c0fb29a7';
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
const license = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-0/license.json'), 'utf8'));
const r11Slugs = ['button', 'breadcrumbs', 'checkbox', 'disclosure', 'disclosure-group', 'group', 'link', 'meter', 'progress-bar', 'separator', 'toggle-button'];
const r12Slugs = [...EXPECTED_R12_COMPONENT_SLUGS];
const r13Slugs = [...EXPECTED_R13_COMPONENT_SLUGS];
const r14Slugs = [...EXPECTED_R14_COMPONENT_SLUGS];
const buttonSource = await readFile(resolve(packageRoot, 'src/button.mjs'), 'utf8');
const componentSource = await readFile(resolve(packageRoot, 'src/components.mjs'), 'utf8');
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
const buttonBinding = buttonArtifact.bindings['web.react'];
if (!buttonBinding || !buttonBinding.api.props.includes('pending')
  || buttonBinding.api.props.includes('isPending') || buttonBinding.api.props.includes('isDisabled')) {
  throw new Error('MUXUI_REACT_BUTTON_CANONICAL_API_DRIFT');
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
  'donor shadow and opacity details',
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

function resolveReferenceTokens(css, tokenDeclarations) {
  return css.replace(/var\((--muxui-reference-[^)]+)\)/gu, (_match, name) => {
    const value = tokenDeclarations.get(name);
    if (!value) throw new Error(`MUXUI_REACT_REFERENCE_TOKEN_MISSING: ${name}`);
    return value;
  });
}

const axes = [['colorScheme', 'dark'], ['contrast', 'more'], ['motion', 'reduced'], ['density', 'compact']];
const baseTheme = compileWebTheme(tokenSource);
const baseDeclarations = declarations(baseTheme.css);
const modeBlocks = axes.map(([axis, value]) => {
  const variant = declarations(compileWebTheme(tokenSource, { modes: { [axis]: value } }).css);
  const changed = [...variant].filter(([name, tokenValue]) => baseDeclarations.get(name) !== tokenValue);
  const dataAxis = axis.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  const values = changed.length === 0 ? '  /* canonical mode has no token delta */' : changed.map(([name, tokenValue]) => `  ${name}: ${tokenValue};`).join('\n');
  return `[data-muxui-${dataAxis}='${value}'] {\n${values}\n}`;
});

const cssBody = `${baseTheme.css.trim()}\n\n${modeBlocks.join('\n\n')}\n\n[data-muxui-direction='rtl'] { direction: rtl; }`;
const fullCssBody = `${cssBody}\n\n${resolveReferenceTokens(authoredCss, baseDeclarations)}`;

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
  style?: React.CSSProperties;
  onActivate?: (event: ButtonActivationEvent) => void;
}
export declare const Button: React.ForwardRefExoticComponent<ButtonProps & React.RefAttributes<HTMLButtonElement>>;
export interface BreadcrumbItem { id?: string; label: React.ReactNode; href?: string; disabled?: boolean; }
export interface BreadcrumbsProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children' | 'className' | 'aria-label'> { items?: BreadcrumbItem[]; className?: string; 'aria-label': string; onNavigate?: (item: BreadcrumbItem) => void; }
export declare const Breadcrumbs: React.ForwardRefExoticComponent<BreadcrumbsProps & React.RefAttributes<HTMLElement>>;
export interface CheckboxProps extends Omit<React.LabelHTMLAttributes<HTMLLabelElement>, 'children' | 'className' | 'onChange'> { children?: React.ReactNode; className?: string; checked?: boolean; defaultChecked?: boolean; disabled?: boolean; indeterminate?: boolean; invalid?: boolean; name?: string; required?: boolean; value?: string; onChange?: (checked: boolean) => void; }
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
export interface ToggleButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className' | 'onChange' | 'onClick'> { children?: React.ReactNode; className?: string; selected?: boolean; defaultSelected?: boolean; disabled?: boolean; onChange?: (selected: boolean) => void; onActivate?: (event: ToggleButtonActivationEvent) => void; }
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
export type CheckboxGroupProps = NamedFieldProps & { value?: string[]; defaultValue?: string[]; onChange?: (value: string[]) => void; name?: string; children?: React.ReactNode; };
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
export type AutocompleteProps = NamedFieldProps & { items?: Array<AutocompleteItem | string>; value?: string; defaultValue?: string; onChange?: (value: string) => void; onSelect?: (item?: AutocompleteSelectionItem) => void; name?: string; placeholder?: string; };
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
export type RadioGroupProps = MuxUIAccessibleName & { options?: RadioOption[]; value?: string; defaultValue?: string; disabled?: boolean; readOnly?: boolean; required?: boolean; invalid?: boolean; orientation?: 'vertical' | 'horizontal'; onChange?: (value: string) => void; className?: string; };
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
export type ToggleButtonGroupProps = MuxUIAriaAccessibleName & { selectedIds?: readonly string[]; defaultSelectedIds?: readonly string[]; selectionMode?: 'single' | 'multiple'; disabled?: boolean; orientation?: 'horizontal' | 'vertical'; onSelectionChange?: (ids: readonly string[]) => void; children?: React.ReactNode; className?: string; };
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
const readmeBody = `# @muxui/react\n\nR1.5 React breadth closure for the standalone Mux UI renderer.\n\n- The 53 Mux UI-owned family exports are listed below for the \`web.react\` binding.\n- React Aria Components 1.20.0 is an internal replaceable substrate.\n- MuxUI owns the public APIs, tokens, selectors, styling, accessibility behavior, lifecycle, and prop names.\n- Tale UI is a pinned styling donor; generated styling results are Mux UI-owned and Tale UI is not a dependency.\n`;
const markdownCell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const readmeComponentRows = componentArtifacts.map((artifact) => {
  const slug = artifact.id.slice('muxui:component:'.length);
  const binding = artifact.bindings['web.react'];
  return `| ${markdownCell(artifact.name)} | ${markdownCell(artifact.lifecycle)} | .muxui-${slug} | ${markdownCell(binding.api.props.join(', ') || 'none')} |`;
}).join('\n');
const readmeGuidance = `
## R1 exit publication candidate

The exact R1 exit candidate is \`@muxui/react@0.1.0-rc.1\`, for the \`next\`
dist-tag on the npm registry. The candidate contains only the standalone
\`web.react\` renderer and its three internal runtime dependencies. All 53
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

Supporting runtime exports: \`ToastProvider\` and \`useToast\` are available alongside \`Toast\` for managed notifications.

| Export | Lifecycle | Selector | Public props |
| --- | --- | --- | --- |
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
const descriptor = `${canonicalJson(descriptorRecord)}\n`;
const release = `${canonicalJson(releaseRecord)}\n`;
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
function provenance(path, bytes) {
  const body = `${canonicalJson({ path: `packages/react/generated/${path}`, sha256: `sha256:${sha256(bytes)}` })}\n`;
  return generatedText('packages/react/src/generate.mjs', body);
}

const outputs = new Map([
  ['compatibility.mjs', generatedText('packages/react/src/generate.mjs', compatibilityBody)],
  ['index.mjs', generatedText('packages/react/src/generate.mjs', indexBody)],
  ['index.d.ts', generatedText('packages/react/src/generate.mjs', reactTypesBody)],
  ['button.mjs', generatedText('packages/react/src/button.mjs', buttonSource)],
  ['testing.mjs', generatedText('packages/react/src/generate.mjs', testingBody)],
  ['styles.css', generatedCss('packages/react/src/generate.mjs', fullCssBody)],
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
  ['component-donor-comparison.json', componentDonorComparison],
  ['component-donor-comparison.json.provenance', provenance('component-donor-comparison.json', componentDonorComparison)],
  ['components.mjs', generatedText('packages/react/src/components.mjs', componentSource)],
  ['fields.mjs', generatedText('packages/react/src/fields.mjs', fieldsSource)],
  ['collections.mjs', generatedText('packages/react/src/collections.mjs', collectionsSource)],
  ['overlays.mjs', generatedText('packages/react/src/overlays.mjs', overlaysSource)],
]);
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

console.log('[react] generated standalone R1.5 breadth closure projections from canonical owners');
