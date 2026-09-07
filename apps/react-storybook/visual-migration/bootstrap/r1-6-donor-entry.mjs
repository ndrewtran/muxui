import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import * as InternationalizedDate from '@internationalized/date';
import '@tale-ui/react-styles';
import * as AlertDialogPackage from '@tale-ui/react/alert-dialog';
import * as ButtonGroupPackage from '@tale-ui/react/button-group';
import * as ButtonPackage from '@tale-ui/react/button';
import * as CardPackage from '@tale-ui/react/card';
import * as CheckboxFieldPackage from '@tale-ui/react/checkbox-field';
import * as ColorModeTogglePackage from '@tale-ui/react/color-mode-toggle';
import * as CommandPalettePackage from '@tale-ui/react/command-palette';
import * as HeaderNavPackage from '@tale-ui/react/header-nav';
import * as InputTagsPackage from '@tale-ui/react/input-tags';
import * as InputPackage from '@tale-ui/react/input';
import * as LightboxPackage from '@tale-ui/react/lightbox';
import * as MarkdownPackage from '@tale-ui/react/markdown';
import * as MultiSelectPackage from '@tale-ui/react/multi-select';
import * as PaymentInputPackage from '@tale-ui/react/payment-input';
import * as ProgressCirclePackage from '@tale-ui/react/progress-circle';
import * as RadioFieldPackage from '@tale-ui/react/radio-field';
import * as RadioGroupPackage from '@tale-ui/react/radio-group';
import * as ResizablePackage from '@tale-ui/react/resizable';
import * as SidebarPackage from '@tale-ui/react/sidebar';
import * as SwitchFieldPackage from '@tale-ui/react/switch-field';
import * as TagSelectPackage from '@tale-ui/react/tag-select';
import * as TextAreaPackage from '@tale-ui/react/text-area';
import * as TextEditorPackage from '@tale-ui/react/text-editor';
import { migrationFrame } from '../../src/visual-migration-contract.mjs';
import { renderR16FamilyPlan } from './r1-6-donor-render-plan.mjs';
import { currentEntryForLocation, currentSceneFor, currentStyleFactsFor, initialOverlayReadyForCurrentEntry, lifecycleForCurrentEntry, stateReachedForCurrent } from './r1-6-current-scene.mjs';

const h = React.createElement;
const createRoot = ReactDOMClient.createRoot ?? ReactDOMClient.default?.createRoot;
if (!createRoot) throw new Error('R1.6 donor bootstrap could not resolve ReactDOM.createRoot');

function bindReducedMotionPreference() {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const apply = () => document.documentElement.toggleAttribute('data-reduced-motion', preference.matches);
  apply();
  preference.addEventListener?.('change', apply);
}

const parseDate = InternationalizedDate.parseDate ?? InternationalizedDate.default?.parseDate;
const parseTime = InternationalizedDate.parseTime ?? InternationalizedDate.default?.parseTime;
if (!parseDate || !parseTime) throw new Error('R1.6 donor bootstrap could not resolve date helpers');

// The names in this map are the adapter contract.  In particular, helper
// packages used to compose a donor component are kept inside the namespace
// value instead of becoming additional package keys.
const packages = {
  AlertDialog: AlertDialogPackage.AlertDialog,
  ButtonGroup: { ButtonGroup: ButtonGroupPackage.ButtonGroup },
  Button: ButtonPackage.Button,
  Card: CardPackage.Card,
  CheckboxField: CheckboxFieldPackage.CheckboxField,
  ColorModeToggle: { ColorModeToggle: ColorModeTogglePackage.ColorModeToggle },
  CommandPalette: CommandPalettePackage.CommandPalette,
  HeaderNav: HeaderNavPackage.HeaderNav,
  InputTags: InputTagsPackage.InputTags,
  Input: InputPackage.Input,
  Lightbox: LightboxPackage.Lightbox,
  Markdown: { Markdown: MarkdownPackage.Markdown },
  MultiSelect: MultiSelectPackage.MultiSelect,
  PaymentInput: PaymentInputPackage.PaymentInput,
  ProgressCircle: ProgressCirclePackage.ProgressCircle,
  RadioField: { ...RadioFieldPackage.RadioField, Group: RadioGroupPackage.RadioGroup },
  Resizable: ResizablePackage.Resizable,
  Sidebar: SidebarPackage.Sidebar,
  SwitchField: SwitchFieldPackage.SwitchField,
  TagSelect: TagSelectPackage.TagSelect,
  TextArea: TextAreaPackage.TextArea,
  TextEditor: { TextEditor: TextEditorPackage.TextEditor },
};

const packageNames = [
  'AlertDialog', 'ButtonGroup', 'Card', 'CheckboxField', 'ColorModeToggle',
  'CommandPalette', 'HeaderNav', 'InputTags', 'Input', 'Lightbox', 'Markdown',
  'MultiSelect', 'PaymentInput', 'ProgressCircle', 'RadioField', 'Resizable',
  'Sidebar', 'SwitchField', 'TagSelect', 'TextArea', 'TextEditor',
];

function textItem(item, key) {
  const text = item && typeof item === 'object'
    ? item.label ?? item.name ?? item.value ?? item.id
    : item;
  return h(React.Fragment, { key }, String(text));
}

function colorValue(value, packageNamespace) {
  return packageNamespace?.parseColor ? packageNamespace.parseColor(value) : value;
}

function applyAction(entry, retry = 0) {
  const root = document.querySelector(`[data-muxui-paired-case="${CSS.escape(entry.id)}"]`);
  if (!root) return;
  const hasItemAction = typeof entry.action === 'object' && /__item\[data-key=/u.test(entry.action.selector ?? '');
  if (entry.component === 'MultiSelect' && (['open', 'filtered', 'empty', 'closing'].includes(entry.state) || hasItemAction)) {
    const trigger = root.querySelector('button');
    if (!trigger && hasItemAction && retry < 120) {
      requestAnimationFrame(() => applyAction(entry, retry + 1));
      return;
    }
    trigger?.click();
  }
  if (entry.component === 'TagSelect' && (['open', 'filtered', 'empty', 'closing'].includes(entry.state) || hasItemAction)) {
    const input = root.querySelector('input');
    if (!input && hasItemAction && retry < 120) {
      requestAnimationFrame(() => applyAction(entry, retry + 1));
      return;
    }
    if (input && hasItemAction) input.click();
    input?.focus();
  }
  if (entry.component === 'HeaderNav' && entry.state === 'mobile') root.querySelector('.tale-header-nav__mobile-trigger')?.click();
  if (entry.component === 'Sidebar' && entry.state === 'mobile') root.querySelector('.tale-sidebar__mobile-menu-btn')?.click();
}

function styleFacts(root, family, state, entry) {
  return currentStyleFactsFor(root, family, state, 'donor', entry);
}

function App() {
  const params = new URLSearchParams(window.location.search);
  const entry = currentEntryForLocation(params);
  if (!packageNames.every((name) => Object.prototype.hasOwnProperty.call(packages, name))) {
    throw new Error('R1.6 donor package map is incomplete');
  }
  const mode = params.get('mode') === 'dark' ? 'dark' : 'light';
  if (entry.component === 'ColorModeToggle') {
    const preference = entry.props?.mode === 'dark' || entry.props?.mode === 'light'
      ? entry.props.mode
      : entry.state === 'dark' ? 'dark' : entry.state === 'light' ? 'light' : mode;
    localStorage.setItem('color-mode', preference);
  }
  document.documentElement.dataset.colorMode = mode;
  bindReducedMotionPreference();
  document.body.style.margin = '0';
  document.body.style.padding = '0';
  document.body.style.background = migrationFrame.background[mode];

  const fixture = currentSceneFor(entry);
  const content = renderR16FamilyPlan(entry, fixture, {
    h,
    packages,
    icons: {},
    parseDate,
    parseTime,
    textItem,
    colorValue,
  });
  const root = document.getElementById('root');
  if (!root) throw new Error('R1.6 donor bootstrap is missing #root');
  root.style.width = `${migrationFrame.viewport.width}px`;
  root.style.boxSizing = 'content-box';
  root.style.padding = '0';
  createRoot(root).render(content);

  const selector = `[data-muxui-paired-case="${CSS.escape(entry.id)}"]`;
  window.__muxuiR16 = {
    entry,
    ready: () => Boolean(document.querySelector(selector)) && initialOverlayReadyForCurrentEntry(entry, 'donor'),
    state: () => stateReachedForCurrent(document.querySelector(selector), entry.state, entry, 'donor'),
    lifecycle: () => lifecycleForCurrentEntry(entry, 'donor'),
    styleFacts: () => styleFacts(document.querySelector(selector), entry.component, entry.state, entry),
    interactiveTarget: () => document.querySelector(`${selector} button, ${selector} a[href], ${selector} input, ${selector} textarea, ${selector} [tabindex]:not([tabindex="-1"])`),
  };
  window.__coreMigration = window.__muxuiR16;

  requestAnimationFrame(() => requestAnimationFrame(() => applyAction(entry)));
}

App();

export { packages, renderR16FamilyPlan };
