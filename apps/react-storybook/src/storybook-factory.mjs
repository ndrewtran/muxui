import React from 'react';
import { StorybookThemeContext } from './storybook-theme.mjs';
import * as MuxUI from '@muxui/react';
import { Markdown } from '../../../packages/react/generated/markdown.mjs';
import { TextEditor } from '../../../packages/react/generated/text-editor.mjs';

// Keep the theme control and Storybook toolbar on the same mode.
function ColorModeTogglePreview(args) {
  const theme = React.useContext(StorybookThemeContext);
  return React.createElement(MuxUI.ColorModeToggle, {
    ...args,
    mode: args.mode ?? theme?.scheme,
    'aria-label': 'Toggle color mode',
    onModeChange: (mode) => {
      args.onModeChange?.(mode);
      theme?.setScheme(mode);
    },
  });
}

const MUXUI_SEARCH_FIELD_VALUE = 'MuxUI';

const BOOLEAN_PROPS = new Set([
  'acceptDirectory', 'allowsMultiple', 'checked', 'current', 'defaultChecked',
  'defaultExpanded', 'defaultOpen', 'defaultSelected', 'disabled', 'dismissable',
  'expanded', 'invalid', 'indeterminate', 'open', 'pending', 'readOnly', 'required',
  'showTextWhileLoading', 'lineNumbers', 'copyable', 'wrap', 'streaming', 'sourcesExpanded', 'defaultSourcesExpanded', 'multiple',
  'shouldCloseOnSelect',
]);

const ARRAY_PROPS = new Set([
  'columns', 'defaultExpandedIds', 'defaultSelectedIds', 'expandedIds', 'items',
  'options', 'rows', 'selectedIds', 'value', 'actions', 'sources', 'commands', 'followUps', 'attachments', 'models',
]);

const STRING_PROPS = new Set([
  'action', 'aria-label', 'aria-labelledby', 'children', 'className', 'color', 'content',
  'description', 'endName', 'errorMessage', 'href', 'label', 'message', 'name',
  'source', 'before', 'after', 'language', 'filename', 'inputLabel', 'author', 'streamingLabel', 'applyLabel', 'emptyMessage', 'selectedModel', 'defaultSelectedModel',
  'placeholder', 'rel', 'src', 'srcSet', 'alt', 'fallbackSrc', 'fallbackSrcSet', 'fit', 'radius', 'startName', 'target', 'title',
]);

const TEXT_VALUE_CONTEXT_PROPS = new Set(['placeholder', 'type']);
const NUMBER_PROPS = new Set([
  'closeDelay', 'delay', 'duration', 'height', 'itemHeight', 'maxLength', 'maxValue',
  'minLength', 'minValue', 'overscan', 'step', 'width',
]);

const NUMBER_VALUE_CONTEXT_PROPS = new Set(['max', 'min', 'step']);

const CONTROLLED_DEFAULT_PAIRS = Object.freeze([
  ['checked', 'defaultChecked'],
  ['collapsed', 'defaultCollapsed'],
  ['expanded', 'defaultExpanded'],
  ['expandedIds', 'defaultExpandedIds'],
  ['open', 'defaultOpen'],
  ['selected', 'defaultSelected'],
  ['selectedId', 'defaultSelectedId'],
  ['selectedIds', 'defaultSelectedIds'],
  ['value', 'defaultValue'],
  ['sourcesExpanded', 'defaultSourcesExpanded'],
  ['selectedModel', 'defaultSelectedModel'],
]);

const UNCONTROLLED_PROPS = new Map(CONTROLLED_DEFAULT_PAIRS);

export function controlledDefaultPairsForBinding(binding) {
  const props = new Set(binding.api.props);
  return CONTROLLED_DEFAULT_PAIRS
    .filter(([controlled, uncontrolled]) => props.has(controlled) && props.has(uncontrolled))
    .map(([controlled, uncontrolled]) => ({ controlled, uncontrolled }));
}

/** Descriptor event channels use the public callback casing owned by the React types. */
export function eventCallbackPropForChannel(channel) {
  if (typeof channel !== 'string' || channel.length === 0) throw new TypeError('event channel must be a non-empty string');
  return `on${channel[0].toUpperCase()}${channel.slice(1)}`;
}

export function eventBindingsForBinding(binding) {
  return binding.api.events.map((channel) => ({ channel, prop: eventCallbackPropForChannel(channel) }));
}

const SELECT_PROPS = Object.freeze({
  channel: ['red', 'green', 'blue', 'hue', 'saturation', 'lightness', 'brightness', 'alpha'],
  colorSpace: ['rgb', 'hsl', 'hsb'],
  defaultCamera: ['user', 'environment'],
  method: ['get', 'post'],
  orientation: ['horizontal', 'vertical'],
  placement: ['top', 'bottom', 'start', 'end'],
  role: ['group', 'region', 'presentation'],
  expansionTrigger: ['chevron', 'row'],
  selectionMode: ['none', 'single', 'multiple'],
  fit: ['cover', 'contain', 'fill', 'none'],
  radius: ['none', 'sm', 'md', 'lg', 'full'],
  size: ['sm', 'md', 'lg'],
  type: ['text', 'email', 'password', 'url', 'tel'],
  validationBehavior: ['aria', 'native'],
  variant: ['neutral', 'success', 'warning', 'danger'],
});

const BUTTON_SELECT_PROPS = Object.freeze({
  variant: ['primary', 'neutral', 'ghost', 'danger', 'danger-neutral', 'danger-ghost', 'inverse'],
  size: ['sm', 'md', 'lg'],
});

const TEXT_SELECT_PROPS = Object.freeze({
  variant: ['display', 'heading', 'title', 'label', 'body', 'expressive', 'mono'],
  // xs exists only for label, body, expressive, and mono; the Text story maps it to sm otherwise.
  size: ['xs', 'sm', 'md', 'lg'],
  color: ['default', 'muted'],
  as: ['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'label'],
});

const callbackType = { summary: 'MuxUI callback' };

function inferControl(name, defaults, props, family) {
  if (name.startsWith('on')) return { control: false, table: { type: callbackType } };
  if (name === 'trigger') return { control: false, table: { type: { summary: 'React element' } } };
  if (family === 'Button' && BUTTON_SELECT_PROPS[name]) {
    return { control: { type: 'select' }, options: BUTTON_SELECT_PROPS[name] };
  }
  if (family === 'Text' && TEXT_SELECT_PROPS[name]) {
    return { control: { type: 'select' }, options: TEXT_SELECT_PROPS[name] };
  }
  if (family === 'Tabs' && name === 'variant') {
    return { control: { type: 'select' }, options: ['underline', 'pill', 'overflow', 'segment'] };
  }
  if (SELECT_PROPS[name]) return { control: { type: 'select' }, options: SELECT_PROPS[name] };
  if (BOOLEAN_PROPS.has(name) || typeof defaults[name] === 'boolean') return { control: 'boolean' };
  if ((name === 'value' || name === 'defaultValue')
    && props.some((prop) => TEXT_VALUE_CONTEXT_PROPS.has(prop))) {
    return { control: 'text' };
  }
  if ((name === 'value' || name === 'defaultValue')
    && props.some((prop) => NUMBER_VALUE_CONTEXT_PROPS.has(prop))) {
    return { control: { type: 'number' } };
  }
  if (ARRAY_PROPS.has(name) || Array.isArray(defaults[name])) return { control: 'object' };
  if (NUMBER_PROPS.has(name)) return { control: { type: 'number' } };
  if (typeof defaults[name] === 'number') return { control: { type: 'number' } };
  if (typeof defaults[name] === 'string') return { control: 'text' };
  if (STRING_PROPS.has(name)) return { control: 'text' };
  if (name === 'formatOptions' || name === 'acceptedFileTypes') return { control: 'object' };
  return { control: 'object' };
}

export function argTypesForBinding(binding) {
  const defaults = binding.api.defaults ?? {};
  const family = binding.export;
  return Object.fromEntries(binding.api.props.map((name) => [
    name,
    {
      ...inferControl(name, defaults, binding.api.props, family),
      description: `Mux UI-owned ${name} property`,
      table: {
        ...(inferControl(name, defaults, binding.api.props, family).table ?? {}),
        defaultValue: defaults[name] === undefined ? undefined : { summary: defaults[name] },
      },
    },
  ]));
}

function normalizeDefaultArgs(binding) {
  const args = { ...(binding.api.defaults ?? {}) };
  const props = new Set(binding.api.props);
  for (const [controlled, uncontrolled] of CONTROLLED_DEFAULT_PAIRS) {
    if (!props.has(controlled) || !props.has(uncontrolled)) continue;
    if (args[uncontrolled] === undefined && args[controlled] !== undefined) {
      args[uncontrolled] = args[controlled];
    }
    delete args[controlled];
  }
  if (binding.export === 'Breadcrumbs' && Array.isArray(args.items) && args.items.length === 0) {
    delete args.items;
  }
  return args;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined);
}

function familySlug(family) {
  return family.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function kebabCase(value) {
  return value.replace(/([a-z])([A-Z])/g, '$1-$2').replaceAll('_', '-').toLowerCase();
}

function sampleControlledValue(binding, family, controlled, uncontrolled, sourceArgs) {
  const defaults = binding.api.defaults ?? {};
  const sourceValue = firstDefined(sourceArgs[controlled], sourceArgs[uncontrolled], defaults[controlled], defaults[uncontrolled]);
  if (sourceValue !== undefined) return sourceValue;
  if (controlled === 'open' || controlled === 'checked' || controlled === 'collapsed' || controlled === 'expanded' || controlled === 'selected') return false;
  if (controlled === 'selectedId') return 'Melbourne';
  if (controlled.endsWith('Ids')) return [];
  if (controlled !== 'value') return undefined;
  if (family === 'InputTags') return ['Mux', 'UI'];
  if (family === 'CheckboxGroup' || family === 'TokenField') return [];
  if (family === 'DateRangePicker' || family === 'RangeCalendar') return { start: '2026-08-26', end: '2026-09-01' };
  if (family === 'TimeField') return '09:30';
  if (family === 'DateField' || family === 'DatePicker' || family === 'Calendar') return '2026-08-26';
  if (family.startsWith('Color')) return '#ff0000';
  if (family === 'NumberField') return 2;
  if (family === 'Slider') return 60;
  return '';
}

function pairArgs(binding, family, sourceArgs, mode) {
  const args = { ...sourceArgs };
  for (const { controlled, uncontrolled } of controlledDefaultPairsForBinding(binding)) {
    const value = sampleControlledValue(binding, family, controlled, uncontrolled, sourceArgs);
    if (mode === 'controlled') {
      if (value !== undefined) args[controlled] = value;
      delete args[uncontrolled];
    } else {
      delete args[controlled];
      if (args[uncontrolled] === undefined && value !== undefined) args[uncontrolled] = value;
    }
  }
  return args;
}

export function controlledStoryArgsForBinding(binding, family, sourceArgs = normalizeDefaultArgs(binding)) {
  return pairArgs(binding, family, sourceArgs, 'controlled');
}

export function uncontrolledStoryArgsForBinding(binding, family, sourceArgs = normalizeDefaultArgs(binding)) {
  return pairArgs(binding, family, sourceArgs, 'uncontrolled');
}

function setControlledArg(args, props, name, value) {
  args[name] = value;
  const uncontrolled = UNCONTROLLED_PROPS.get(name);
  if (uncontrolled && props.has(uncontrolled)) delete args[uncontrolled];
}

const STATE_BOOLEAN_PROPS = Object.freeze([
  'checked', 'current', 'disabled', 'expanded', 'indeterminate', 'invalid',
  'open', 'pending', 'readOnly', 'required', 'selected',
]);

const OVERLAY_FAMILIES = new Set(['Dialog', 'Popover', 'PreviewTrigger', 'Tooltip', 'Toast']);
const INTERACTION_OPEN_FAMILIES = new Set(['DatePicker', 'DateRangePicker', 'ComboBox', 'Select']);
const INTERACTION_OPEN_SELECTORS = Object.freeze({
  DatePicker: '.muxui-date-trigger',
  DateRangePicker: '.muxui-date-trigger',
  ComboBox: '.muxui-combo-box-trigger',
  Select: '.muxui-select-trigger',
});
const LIFECYCLE_ATTRIBUTES = Object.freeze({
  entering: 'data-entering',
  opening: 'data-entering',
  exiting: 'data-exiting',
  closing: 'data-exiting',
});

function stateVariantNames(binding, family) {
  const names = [...binding.states];
  const props = new Set(binding.api.props);
  if (props.has('placement')) names.push('placement');
  if (family === 'DropZone') names.push('dragging');
  if (family === 'TagGroup') names.push('removable');
  if (OVERLAY_FAMILIES.has(family)) names.push('entering', 'exiting');
  return [...new Set(names)];
}

function resetStateArgs(binding, sourceArgs, preserveExplicit = false) {
  if (preserveExplicit) return { ...sourceArgs };
  const props = new Set(binding.api.props);
  const args = { ...sourceArgs };
  for (const name of STATE_BOOLEAN_PROPS) {
    if (props.has(name) && (!preserveExplicit || !Object.hasOwn(args, name))) args[name] = false;
  }
  for (const [controlled, uncontrolled] of CONTROLLED_DEFAULT_PAIRS) {
    if (!props.has(controlled) || !props.has(uncontrolled)) continue;
    if (preserveExplicit && (Object.hasOwn(args, controlled) || Object.hasOwn(args, uncontrolled))) continue;
    delete args[controlled];
    if (args[uncontrolled] === undefined) {
      const defaults = binding.api.defaults ?? {};
      const value = defaults[uncontrolled] ?? defaults[controlled];
      if (value !== undefined) args[uncontrolled] = value;
    }
  }
  return args;
}

function canSupplyStateValue(args, props, name, preserveExplicit) {
  if (!preserveExplicit) return true;
  const fallback = UNCONTROLLED_PROPS.get(name);
  return !Object.hasOwn(args, name) && !(fallback && props.has(fallback) && Object.hasOwn(args, fallback));
}

function setSelectedState(args, props, family, preserveExplicit) {
  if (props.has('checked') && canSupplyStateValue(args, props, 'checked', preserveExplicit)) return setControlledArg(args, props, 'checked', true);
  if (props.has('selected') && canSupplyStateValue(args, props, 'selected', preserveExplicit)) return setControlledArg(args, props, 'selected', true);
  if (props.has('selectedIds')) {
    if (props.has('selectionMode')) args.selectionMode = 'single';
    const selectedId = family === 'Tree'
      ? 'src'
      : family === 'Table'
        ? 'ada'
        : family === 'ToggleButtonGroup'
          ? 'bold'
          : 'Melbourne';
    if (canSupplyStateValue(args, props, 'selectedIds', preserveExplicit)) return setControlledArg(args, props, 'selectedIds', [selectedId]);
    return undefined;
  }
  if (props.has('selectedId') && canSupplyStateValue(args, props, 'selectedId', preserveExplicit)) return setControlledArg(args, props, 'selectedId', 'Melbourne');
  if (!props.has('value')) return undefined;
  if (!canSupplyStateValue(args, props, 'value', preserveExplicit)) return undefined;
  if (family === 'CheckboxGroup') return setControlledArg(args, props, 'value', ['email']);
  if (family === 'RadioGroup') return setControlledArg(args, props, 'value', 's');
  if (family === 'Tabs') return setControlledArg(args, props, 'value', 'overview');
  if (family === 'Select') return setControlledArg(args, props, 'value', 'Melbourne');
  if (family === 'Calendar') return setControlledArg(args, props, 'value', '2026-08-26');
  if (family === 'RangeCalendar') return setControlledArg(args, props, 'value', { start: '2026-08-26', end: '2026-09-01' });
  if (family === 'ColorSwatchPicker') return setControlledArg(args, props, 'value', '#ff0000');
  if (typeof args.value === 'number') return setControlledArg(args, props, 'value', args.max ?? args.maxValue ?? 72);
  return undefined;
}

function stateIsSupported(binding, state, family) {
  const props = new Set(binding.api.props);
  const normalizedState = state.toLowerCase().replaceAll('-', '');
  switch (normalizedState) {
    case 'default':
      return true;
    case 'running':
    case 'failed':
      return family === 'Activity';
    case 'streaming':
      return family === 'Message';
    case 'error':
      return family === 'PromptComposer';
    case 'mixed':
      return family === 'DataDiff';
    case 'diff':
    case 'wrap':
      return family === 'CodeBlock';
    case 'idle':
    case 'visible':
      return true;
    case 'disabled':
      return props.has('disabled');
    case 'invalid':
      return props.has('invalid');
    case 'readonly':
      return props.has('readOnly');
    case 'required':
      return props.has('required');
    case 'selected':
      return props.has('checked')
        || props.has('selected')
        || props.has('selectedIds')
        || props.has('selectedId')
        || ['CheckboxGroup', 'RadioGroup', 'Tabs', 'Select', 'Calendar', 'RangeCalendar', 'ColorSwatchPicker'].includes(family) && props.has('value');
    case 'checked':
    case 'unchecked':
      return props.has('checked');
    case 'indeterminate':
      return props.has('indeterminate') || family === 'ProgressBar';
    case 'expanded':
      return props.has('expanded') || props.has('expandedIds');
    case 'collapsed':
      return props.has('expanded') || props.has('expandedIds') || props.has('collapsed');
    case 'pending':
      return props.has('pending');
    case 'open':
      return props.has('open') || INTERACTION_OPEN_FAMILIES.has(family);
    case 'opening':
    case 'entering':
    case 'closed':
    case 'closing':
    case 'exiting':
      return props.has('open')
        || family === 'Toast' && (normalizedState === 'entering' || normalizedState === 'exiting');
    case 'focused':
      // StateVariant focuses the first public interactive target after mount.
      return true;
    case 'drop target':
    case 'droptarget':
    case 'dragging':
      return family === 'DropZone';
    case 'low':
    case 'high':
      return family === 'Meter' && props.has('value');
    case 'progress':
    case 'complete':
      return family === 'ProgressBar' && props.has('value');
    case 'filled':
      return family === 'SearchField' && props.has('value');
    case 'empty':
      return props.has('items') || props.has('rows') || family === 'SearchField' && props.has('value');
    case 'placement':
      return props.has('placement');
    case 'vertical':
      return props.has('orientation');
    case 'horizontal':
      return props.has('orientation');
    case 'timed':
      return props.has('duration');
    case 'current':
      return props.has('current');
    case 'removable':
      return family === 'TagGroup';
    // Pressed and dismissed are transient lifecycle results without a MuxUI
    // prop or reliable public interaction that can hold the state in a story.
    case 'pressed':
    case 'dismissed':
    case 'submitting':
      return false;
    default:
      return false;
  }
}

function applyStateArgs(args, binding, state, family, preserveExplicit = false) {
  const props = new Set(binding.api.props);
  const normalizedState = state.toLowerCase().replaceAll('-', '');
  switch (normalizedState) {
    case 'disabled':
      if (props.has('disabled') && canSupplyStateValue(args, props, 'disabled', preserveExplicit)) args.disabled = true;
      if (family === 'Breadcrumbs' && props.has('items')) {
        args.items = [
          { id: 'home', label: 'Home', href: '#', disabled: true },
          { id: 'docs', label: 'Docs', href: '#' },
        ];
      }
      break;
    case 'invalid':
      if (props.has('invalid') && canSupplyStateValue(args, props, 'invalid', preserveExplicit)) args.invalid = true;
      break;
    case 'readonly':
      if (props.has('readOnly') && canSupplyStateValue(args, props, 'readOnly', preserveExplicit)) args.readOnly = true;
      break;
    case 'required':
      if (props.has('required') && canSupplyStateValue(args, props, 'required', preserveExplicit)) args.required = true;
      break;
    case 'selected':
      setSelectedState(args, props, family, preserveExplicit);
      break;
    case 'checked':
      if (props.has('checked') && canSupplyStateValue(args, props, 'checked', preserveExplicit)) setControlledArg(args, props, 'checked', true);
      break;
    case 'unchecked':
      if (props.has('checked') && canSupplyStateValue(args, props, 'checked', preserveExplicit)) setControlledArg(args, props, 'checked', false);
      break;
    case 'running':
    case 'failed':
      if (family === 'Activity') args.status = state;
      break;
    case 'streaming':
      if (family === 'Message') args.streaming = true;
      break;
    case 'error':
      if (family === 'PromptComposer') args.error = 'Unable to send. Try again.';
      break;
    case 'mixed':
      if (family === 'DataDiff') args.defaultSelectedIds = ['added'];
      break;
    case 'diff':
      if (family === 'CodeBlock') args.mode = 'diff';
      break;
    case 'wrap':
      if (family === 'CodeBlock') args.wrap = true;
      break;
    case 'indeterminate':
      if (props.has('indeterminate')) args.indeterminate = true;
      else if (family === 'ProgressBar' && props.has('value')) args.value = undefined;
      break;
    case 'expanded':
      if (props.has('expanded')) setControlledArg(args, props, 'expanded', true);
      else if (props.has('expandedIds')) setControlledArg(args, props, 'expandedIds', [family === 'Tree' ? 'src' : 'one']);
      break;
    case 'collapsed':
      if (props.has('expanded')) setControlledArg(args, props, 'expanded', false);
      else if (props.has('expandedIds')) setControlledArg(args, props, 'expandedIds', []);
      else if (props.has('collapsed')) setControlledArg(args, props, 'collapsed', true);
      break;
    case 'pending':
      if (props.has('pending')) args.pending = true;
      break;
    case 'open':
    case 'opening':
    case 'entering':
      if (props.has('open')) setControlledArg(args, props, 'open', true);
      break;
    case 'closed':
    case 'closing':
    case 'exiting':
    case 'dismissed':
      if (props.has('open')) setControlledArg(args, props, 'open', false);
      break;
    case 'focused':
      // Focus is applied by the private StateVariant wrapper after mount.
      break;
    case 'drop target':
    case 'droptarget':
    case 'dragging':
      // The private StateVariant wrapper dispatches a real dragenter event.
      break;
    case 'low':
      if (family === 'Meter' && props.has('value')) setControlledArg(args, props, 'value', 24);
      break;
    case 'high':
      if (family === 'Meter' && props.has('value')) setControlledArg(args, props, 'value', 88);
      break;
    case 'progress':
      if (family === 'ProgressBar' && props.has('value')) setControlledArg(args, props, 'value', 64);
      break;
    case 'complete':
      if (family === 'ProgressBar' && props.has('value')) setControlledArg(args, props, 'value', args.maxValue ?? 100);
      break;
    case 'filled':
      if (props.has('value') && (typeof args.value === 'string' || args.value === undefined)) {
        setControlledArg(args, props, 'value', MUXUI_SEARCH_FIELD_VALUE);
      }
      break;
    case 'empty':
      if (family === 'SearchField' && props.has('value')) setControlledArg(args, props, 'value', '');
      if (props.has('items')) args.items = [];
      if (props.has('rows')) args.rows = [];
      break;
    case 'placement':
      if (props.has('placement')) args.placement = 'top';
      break;
    case 'current':
      if (props.has('current')) args.current = true;
      break;
    case 'vertical':
      if (props.has('orientation')) args.orientation = 'vertical';
      break;
    case 'timed':
      if (props.has('duration')) args.duration = 1_000;
      break;
    case 'removable':
      if (family === 'TagGroup') args.onRemove = () => {};
      break;
    default:
      break;
  }
  return args;
}

export function storyArgsForBinding(binding, variant, family) {
  if (variant === 'default' || variant === 'states') return normalizeDefaultArgs(binding);
  return stateArgsForBinding(binding, variant, family);
}

export function stateArgsForBinding(binding, state, family, sourceArgs) {
  const explicitArgs = sourceArgs !== undefined;
  const args = sourceArgs ?? normalizeDefaultArgs(binding);
  const projected = applyStateArgs(resetStateArgs(binding, args, explicitArgs), binding, state, family, explicitArgs);
  if (!explicitArgs) return projected;
  // A state supplies missing demonstration values. Explicit controls retain
  // precedence, including false, empty values, and uncontrolled defaults.
  for (const [controlled, uncontrolled] of CONTROLLED_DEFAULT_PAIRS) {
    if (Object.hasOwn(sourceArgs, uncontrolled) && !Object.hasOwn(sourceArgs, controlled)) delete projected[controlled];
  }
  return { ...projected, ...sourceArgs };
}

export function stateCoverageForBinding(binding, family) {
  return stateVariantNames(binding, family).map((state) => ({
    name: state,
    args: stateArgsForBinding(binding, state, family),
  }));
}

const e = (type, props, ...children) => React.createElement(type, props, ...children);

function fallback(value, defaultValue) {
  return value === undefined || value === null || value === '' ? defaultValue : value;
}

// An own arg wins even when it is undefined; otherwise use the default.
function ownArg(args, name, defaultValue) {
  return Object.hasOwn(args, name) ? args[name] : defaultValue;
}

function ownChildArg(args, name, defaultValue) {
  return ownArg(args, 'children', {})?.[name] ?? defaultValue;
}

const CODE_BLOCK_BEFORE = 'export async function loadPanel() {\n  const panel = await workspace.read("inbox");\n  return panel.title;\n}';
const CODE_BLOCK_AFTER = 'export async function loadPanel() {\n  const panel = await workspace.read("research");\n  if (!panel.visible) return null;\n  return panel.title;\n}';

function PromptComposerPreview(args) {
  const [attachments, setAttachments] = React.useState([]);
  const [result, setResult] = React.useState('');
  return e('div', null, e(MuxUI.PromptComposer, {
    ...args, inputLabel: args.inputLabel ?? 'Message',
    inputProps: { placeholder: 'Write a message, @ source, / command…', name: 'message', required: true, ...args.inputProps },
    sources: args.sources ?? [{ id: 'notes', label: 'Workspace notes', description: 'Selected local notes', insertText: '@notes ' }, { id: 'records', label: 'Supplier records', description: 'Selected workspace records', insertText: '@records ' }],
    commands: args.commands ?? [{ id: 'summarize', label: 'Summarize', description: 'Insert a summary prompt', insertText: 'Summarize these notes: ' }],
    attachments: args.attachments ?? attachments,
    onFilesSelected: (files) => { args.onFilesSelected?.(files); setAttachments((previous) => [...previous, ...files.map((file, index) => ({ id: `${previous.length + index}-${file.name}`, label: file.name }))]); },
    onRemoveAttachment: (id) => { args.onRemoveAttachment?.(id); setAttachments((previous) => previous.filter((item) => item.id !== id)); },
    models: args.models ?? [{ id: 'standard', label: 'Standard' }, { id: 'detailed', label: 'Detailed' }],
    onModelChange: (id) => { args.onModelChange?.(id); },
    onSend: (value) => { args.onSend?.(value); setResult(`Saved locally: ${value}`); },
    onStop: () => { args.onStop?.(); setResult('Stop requested locally.'); },
  }), result && e('p', { role: 'status' }, result));
}

function MessagePreview(args) {
  const [helpful, setHelpful] = React.useState(false);
  const [result, setResult] = React.useState('');
  return e('div', null, e(MuxUI.Message, {
    ...args, author: args.author ?? 'Assistant',
    sources: args.sources ?? [{ id: 'react', label: 'React documentation', href: 'https://react.dev/', description: 'react.dev' }, { id: 'aria', label: 'Accessible patterns', href: 'https://www.w3.org/WAI/ARIA/apg/', description: 'w3.org' }],
    actions: args.actions ?? [{ id: 'helpful', label: 'Helpful', pressed: helpful, onAction: () => setHelpful(!helpful) }],
    followUps: args.followUps ?? [{ id: 'explain', label: 'Explain the comparison' }, { id: 'checks', label: 'Review the remaining checks' }],
    onFollowUp: (item) => { args.onFollowUp?.(item); setResult(`Selected: ${item.label}`); },
  }, args.children ?? e('p', null, 'Review the selected records before applying changes. The proposed update preserves existing data and makes each change explicit.')), result && e('p', { role: 'status' }, result));
}

const ACTIVITY_ITEMS = [
  { id: 'records', label: 'Verified vendor records', status: 'completed', meta: '12 suppliers', time: '4s', details: 'Matched tax and contact IDs: 12/12. No stale records.' },
  { id: 'read', label: 'Read selected export', status: 'running', meta: '3 files', details: 'Status supplied by the host application. No task executes in this preview.' },
  { id: 'draft', label: 'Prepare reorder notes', status: 'queued', meta: '7 items', details: 'Waiting for the host application.' },
];
function ActivityPreview(args) {
  return e(MuxUI.Activity, { ...args, label: args.label ?? 'Workspace activity', items: args.items ?? ACTIVITY_ITEMS });
}

const DATA_DIFF_COLUMNS = [{ id: 'flavor', label: 'Flavor' }, { id: 'category', label: 'Category' }, { id: 'supplier', label: 'Supplier' }];
const DATA_DIFF_ROWS = [
  { id: 'unchanged', label: 'Vanilla', kind: 'unchanged', values: { flavor: 'Vanilla', category: 'Classic', supplier: 'Local dairy' } },
  { id: 'removed', label: 'Bubblegum', kind: 'removed', values: { flavor: 'Bubblegum', category: 'Retro', supplier: 'City creamery' } },
  { id: 'updated', label: 'Mint chip', kind: 'updated', before: { flavor: 'Mint chip', category: 'Classic', supplier: 'Local dairy' }, after: { flavor: 'Mint chip', category: 'Seasonal', supplier: 'Local dairy' } },
  { id: 'added', label: 'Pistachio', kind: 'added', values: { flavor: 'Pistachio', category: 'Seasonal', supplier: 'Valley creamery' } },
];
function DataDiffPreview(args) {
  const [result, setResult] = React.useState('');
  return e('div', null, e(MuxUI.DataDiff, { ...args, label: args.label ?? 'Proposed menu cleanup', columns: args.columns ?? DATA_DIFF_COLUMNS, rows: args.rows ?? DATA_DIFF_ROWS,
    onApply: (ids) => { args.onApply?.(ids); setResult(`Requested locally: ${ids.join(', ')}`); },
  }), result && e('p', { role: 'status' }, result));
}

const ADAPTERS = {
  PromptComposer: (args) => e(PromptComposerPreview, args),
  Message: (args) => e(MessagePreview, args),
  Activity: (args) => e(ActivityPreview, args),
  DataDiff: (args) => e(DataDiffPreview, args),
  CodeBlock: (args) => {
    const { source, before, after, mode, ...shared } = args;
    return e(MuxUI.CodeBlock, {
      ...shared, filename: args.filename ?? 'panel.ts', language: args.language ?? 'typescript',
      ...(mode === 'diff'
        ? { mode, before: before ?? CODE_BLOCK_BEFORE, after: after ?? CODE_BLOCK_AFTER }
        : { mode: 'code', source: source ?? CODE_BLOCK_AFTER }),
    });
  },
  IconButton: (args) => e(MuxUI.IconButton, { ...args, 'aria-label': fallback(args['aria-label'], 'Search') }, e('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, e('circle', { cx: 10.5, cy: 10.5, r: 6.5 }), e('path', { d: 'm16 16 4 4' }))),
  Button: (args) => e(MuxUI.Button, args, 'Save'),
  Breadcrumbs: (args) => e(MuxUI.Breadcrumbs, {
    ...args,
    // Mux UI's public Breadcrumbs contract uses item records; the default
    // story data intentionally keeps these as renderer-neutral labels.
    items: ownArg(args, 'items', fallback(args.items, ['Home', 'Docs'])).map((item, index) => typeof item === 'object'
      ? item
      : { id: String(index), label: String(item), href: '#' }),
    'aria-label': fallback(args['aria-label'], 'Breadcrumb'),
  }),
  Checkbox: (args) => e(MuxUI.Checkbox, args, 'Enable notifications'),
  Disclosure: (args) => e(MuxUI.Disclosure, { ...args, title: 'Details' }, 'Details content'),
  DisclosureGroup: (args) => e(MuxUI.DisclosureGroup, args, ...ownChildArg(args, 'disclosureGroup', [{ id: 'one', title: 'One', content: 'First panel' }, { id: 'two', title: 'Two', content: 'Second panel' }]).map(({ id, title, content }) => e(MuxUI.Disclosure, { key: id, id, title }, content))),
  Group: (args) => e(
    MuxUI.Group,
    { ...args, 'aria-label': fallback(args['aria-label'], 'Document actions') },
    e(MuxUI.Button, null, 'Save'),
    e(MuxUI.Button, null, 'Duplicate'),
    e(MuxUI.Button, null, 'Archive'),
  ),
  Link: (args) => e(MuxUI.Link, { ...args, href: fallback(args.href, '/settings') }, 'Settings'),
  Meter: (args) => e(MuxUI.Meter, { ...args, label: fallback(args.label, 'Storage'), value: Object.hasOwn(args, 'value') ? args.value : ownArg(args, 'values', {}).meter ?? 72 }),
  ProgressBar: (args) => e(MuxUI.ProgressBar, { ...args, label: fallback(args.label, 'Upload'), value: args.indeterminate || Object.hasOwn(args, 'value') && args.value == null ? undefined : Object.hasOwn(args, 'value') ? args.value : (ownArg(args, 'values', {}).progress ?? 64) }),
  Separator: (args) => e(MuxUI.Separator, args),
  ToggleButton: (args) => e(MuxUI.ToggleButton, args, 'Pin'),
  Autocomplete: (args) => e(MuxUI.Autocomplete, { ...args, label: fallback(args.label, 'Choose a city'), placeholder: fallback(args.placeholder, 'Choose a city'), items: ownArg(args, 'items', fallback(args.items, ['Melbourne', 'Sydney'])) }),
  CheckboxGroup: (args) => e(MuxUI.CheckboxGroup, { ...args, label: fallback(args.label, 'Notifications') }, ...ownArg(args, 'choices', [{ value: 'email', label: 'Email' }, { value: 'sms', label: 'SMS' }]).map(({ value, label }) => e(MuxUI.Checkbox, { key: value, value }, label))),
  DateField: (args) => e(MuxUI.DateField, { ...args, label: fallback(args.label, 'Birthday'), defaultValue: args.value === undefined ? ownArg(args, 'date', fallback(args.defaultValue, '2026-08-26')) : args.defaultValue }),
  DatePicker: (args) => e(MuxUI.DatePicker, { ...args, label: fallback(args.label, 'Due date'), defaultValue: args.value === undefined ? ownArg(args, 'date', fallback(args.defaultValue, '2026-08-26')) : args.defaultValue }),
  DateRangePicker: (args) => e(MuxUI.DateRangePicker, { ...args, label: fallback(args.label, 'Trip dates'), defaultValue: args.value === undefined ? ownArg(args, 'dateRange', fallback(args.defaultValue, { start: '2026-08-26', end: '2026-09-01' })) : args.defaultValue }),
  Form: (args) => e(MuxUI.Form, args, e(MuxUI.TextField, { label: ownChildArg(args, 'form', { fieldLabel: 'Name' }).fieldLabel, name: 'name' }), e(MuxUI.Button, { type: 'submit' }, ownChildArg(args, 'form', { submit: 'Save' }).submit)),
  NumberField: (args) => e(MuxUI.NumberField, { ...args, label: fallback(args.label, 'Quantity'), defaultValue: args.value === undefined ? (ownArg(args, 'values', {}).number ?? args.defaultValue ?? 2) : args.defaultValue, minValue: args.minValue ?? 0 }),
  SearchField: (args) => e(MuxUI.SearchField, {
    ...args,
    label: fallback(args.label, 'Search'),
    placeholder: fallback(args.placeholder, 'Search'),
    onClear: args.onClear,
  }),
  Switch: (args) => e(MuxUI.Switch, { ...args, label: fallback(args.label, 'Notifications') }),
  TextField: (args) => e(MuxUI.TextField, { ...args, label: ownArg(args, 'label', fallback(args.label, 'Name')), placeholder: ownArg(args, 'placeholder', fallback(args.placeholder, 'Enter a name')) }),
  TimeField: (args) => e(MuxUI.TimeField, { ...args, label: fallback(args.label, 'Start time'), defaultValue: args.value === undefined ? ownArg(args, 'time', fallback(args.defaultValue, '09:30')) : args.defaultValue }),
  Calendar: (args) => e(MuxUI.Calendar, {
    ...args,
    // Default to an accessible-only name unless a visible label is supplied.
    label: args.label,
    'aria-label': args.label !== undefined ? args['aria-label'] : fallback(args['aria-label'], 'Choose a date'),
    defaultValue: args.value === undefined ? ownArg(args, 'date', fallback(args.defaultValue, '2026-08-26')) : args.defaultValue,
  }),
  ColorArea: (args) => e(MuxUI.ColorArea, {
    ...args,
    'aria-label': fallback(args['aria-label'], 'Color'),
    defaultValue: args.value === undefined ? ownArg(args, 'color', fallback(args.defaultValue, '#ff0000')) : args.defaultValue,
  }),
  ColorField: (args) => e(MuxUI.ColorField, { ...args, label: fallback(args.label, 'Color'), defaultValue: args.value === undefined ? ownArg(args, 'color', fallback(args.defaultValue, '#ff0000')) : args.defaultValue }),
  ColorPicker: (args) => e(MuxUI.ColorPicker, { ...args, defaultValue: args.value === undefined ? ownArg(args, 'color', fallback(args.defaultValue, '#ff0000')) : args.defaultValue },
    e(MuxUI.ColorArea, { 'aria-label': 'Color', defaultValue: args.value === undefined ? ownArg(args, 'color', fallback(args.defaultValue, '#ff0000')) : args.defaultValue }),
    e(MuxUI.ColorField, { label: 'Color', defaultValue: args.value === undefined ? ownArg(args, 'color', fallback(args.defaultValue, '#ff0000')) : args.defaultValue })),
  ColorSlider: (args) => e(MuxUI.ColorSlider, { ...args, label: fallback(args.label, 'Red'), channel: fallback(args.channel, 'red'), defaultValue: args.value === undefined ? ownArg(args, 'color', fallback(args.defaultValue, '#ff0000')) : args.defaultValue }),
  ColorSwatch: (args) => e(MuxUI.ColorSwatch, { ...args, color: ownArg(args, 'color', fallback(args.color, '#ff0000')) }),
  ColorSwatchPicker: (args) => e(MuxUI.ColorSwatchPicker, { ...args, 'aria-label': fallback(args['aria-label'], 'Palette'), items: ownArg(args, 'items', fallback(args.items, [{ id: 'red', color: '#ff0000' }, { id: 'blue', color: '#0000ff' }])) }),
  ColorWheel: (args) => e(MuxUI.ColorWheel, { ...args, 'aria-label': fallback(args['aria-label'], 'Hue'), outerRadius: args.outerRadius ?? 96, innerRadius: args.innerRadius ?? 64, defaultValue: args.value === undefined ? ownArg(args, 'color', fallback(args.defaultValue, '#ff0000')) : args.defaultValue }),
  ComboBox: (args) => e(MuxUI.ComboBox, { ...args, label: fallback(args.label, 'Choose a city'), placeholder: fallback(args.placeholder, 'Choose a city'), items: ownArg(args, 'items', fallback(args.items, ['Melbourne', 'Sydney'])) }),
  GridList: (args) => e(MuxUI.GridList, { ...args, 'aria-label': fallback(args['aria-label'], 'Grid'), items: ownArg(args, 'items', fallback(args.items, ['One', 'Two'])) }),
  ListBox: (args) => e(MuxUI.ListBox, { ...args, 'aria-label': fallback(args['aria-label'], 'List'), items: ownArg(args, 'items', fallback(args.items, ['One', 'Two'])) }),
  Menu: (args) => e(MuxUI.Menu, { ...args, 'aria-label': fallback(args['aria-label'], 'Actions'), items: ownArg(args, 'items', fallback(args.items, ['Save', 'Delete'])) }),
  RadioGroup: (args) => e(MuxUI.RadioGroup, { ...args, label: fallback(args.label, 'Size'), options: ownArg(args, 'options', fallback(args.options, [{ value: 's', label: 'Small' }, { value: 'l', label: 'Large' }])) }),
  RangeCalendar: (args) => e(MuxUI.RangeCalendar, {
    ...args,
    label: fallback(args.label, 'Trip'),
    'aria-label': args['aria-label'],
    defaultValue: args.value === undefined ? ownArg(args, 'dateRange', fallback(args.defaultValue, { start: '2026-08-26', end: '2026-09-01' })) : args.defaultValue,
  }),
  Select: (args) => e(MuxUI.Select, { ...args, label: fallback(args.label, 'Choose a city'), placeholder: fallback(args.placeholder, 'Choose a city'), items: ownArg(args, 'items', fallback(args.items, ['Melbourne', 'Sydney'])) }),
  Slider: (args) => e(MuxUI.Slider, { ...args, label: fallback(args.label, 'Volume'), defaultValue: args.value === undefined ? (ownArg(args, 'values', {}).slider ?? args.defaultValue ?? 60) : args.defaultValue }),
  Table: (args) => e(MuxUI.Table, { ...args, 'aria-label': fallback(args['aria-label'], 'People'), columns: ownArg(args, 'columns', fallback(args.columns, [{ id: 'name', label: 'Name', isRowHeader: true }, { id: 'role', label: 'Role' }])), rows: ownArg(args, 'rows', fallback(args.rows, [{ id: 'ada', values: { name: 'Ada', role: 'Engineer' } }, { id: 'grace', values: { name: 'Grace', role: 'Designer' } }])) }),
  Tabs: (args) => e(MuxUI.Tabs, { ...args, 'aria-label': fallback(args['aria-label'], 'Sections'), items: ownArg(args, 'items', fallback(args.items, [{ id: 'overview', label: 'Overview', panel: 'Overview content' }, { id: 'details', label: 'Details', panel: 'Details content' }])) }),
  TagGroup: (args) => e(MuxUI.TagGroup, { ...args, label: fallback(args.label, 'Tags'), items: ownArg(args, 'items', fallback(args.items, ['Design', 'Engineering'])), onRemove: args.onRemove }),
  ToggleButtonGroup: (args) => e(MuxUI.ToggleButtonGroup, { ...args, 'aria-label': fallback(args['aria-label'], 'Formatting') }, ...ownChildArg(args, 'toggleButtonGroup', [{ id: 'bold', label: 'Bold' }, { id: 'italic', label: 'Italic' }]).map(({ id, label }) => e(MuxUI.ToggleButton, { key: id, id }, label))),
  TokenField: (args) => e(MuxUI.TokenField, { ...args, label: fallback(args.label, 'Recipients'), defaultValue: args.value === undefined ? (args.defaultValue ?? ['Andrew', 'Mux UI']) : args.defaultValue, placeholder: fallback(args.placeholder, 'Add recipient') }),
  Toolbar: (args) => e(MuxUI.Toolbar, { ...args, 'aria-label': fallback(args['aria-label'], 'Formatting') }, ...ownChildArg(args, 'toolbar', ['Bold', 'Italic']).map((label) => e(MuxUI.Button, { key: label }, label))),
  Tree: (args) => e(MuxUI.Tree, { ...args, 'aria-label': fallback(args['aria-label'], 'Files'), items: ownArg(args, 'items', fallback(args.items, [{ id: 'src', label: 'src', children: [{ id: 'main', label: 'main.jsx' }] }])), defaultExpandedIds: args.expandedIds === undefined ? (args.defaultExpandedIds ?? ['src']) : args.defaultExpandedIds }),
  Virtualizer: (args) => {
    const height = args.height ?? 180;
    if (!Number.isFinite(height) || height <= 0) throw new Error('MuxUI Storybook Virtualizer requires a finite positive height');
    const items = ownArg(args, 'items', fallback(args.items, ['Result 1', 'Result 2', 'Result 3']));
    return e(MuxUI.Virtualizer, {
      ...args,
      'aria-label': fallback(args['aria-label'], 'Results'),
      items,
      height,
      itemHeight: args.itemHeight ?? 32,
      style: args.style,
    });
  },
  DropZone: (args) => e(MuxUI.DropZone, { ...args, 'aria-label': fallback(args['aria-label'], 'Upload files') }, fallback(args.children, 'Drop files here')),
  FileTrigger: (args) => e(MuxUI.FileTrigger, { ...args }, fallback(args.children, e(MuxUI.Button, null, 'Choose files'))),
  Dialog: (args) => e(MuxUI.Dialog, {
    ...args,
    title: fallback(args.title, 'Delete draft'),
    trigger: fallback(args.trigger, e(MuxUI.Button, null, 'Open dialog')),
  }, fallback(args.children, e('p', null, 'Delete draft content.'))),
  Popover: (args) => e(MuxUI.Popover, {
    ...args,
    'aria-label': fallback(args['aria-label'], 'More actions'),
    trigger: fallback(args.trigger, e(MuxUI.Button, null, 'More actions')),
  }, fallback(args.children, e('p', null, 'More actions content.'))),
  PreviewTrigger: (args) => e(MuxUI.PreviewTrigger, {
    ...args,
    'aria-label': fallback(args['aria-label'], 'Document preview'),
    delay: args.delay ?? 0,
    closeDelay: args.closeDelay ?? 0,
    placement: args.placement,
    trigger: fallback(args.trigger, e(MuxUI.Button, null, 'Preview document')),
  }, fallback(args.children, e('p', null, 'Document preview content.'))),
  Toast: (args) => e(MuxUI.Toast, {
    ...args,
    variant: args.variant === 'info' ? 'neutral' : args.variant,
    message: fallback(args.message, 'Saved'),
    title: fallback(args.title, 'Saved'),
  }),
  Tooltip: (args) => e(MuxUI.Tooltip, {
    ...args,
    content: fallback(args.content, 'Keyboard shortcut: ⌘K'),
    delay: args.delay ?? 0,
    closeDelay: args.closeDelay ?? 0,
    trigger: fallback(args.trigger, e(MuxUI.Button, null, 'Keyboard help')),
  }),
};

// R1.6 families use their authored compound anatomy in the private showcase.
// These adapters deliberately keep the example data small while exercising
// the public root or dedicated subpath export and every catalogued part.
// The folded Sidebar rail shows icons only, so each specimen item carries one.
function SidebarSpecimenIcon({ className }) {
  return e('svg', { className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, 'aria-hidden': true }, e('rect', { x: 4, y: 4, width: 16, height: 16, rx: 3 }));
}

Object.assign(ADAPTERS, {
  AlertDialog: (args) => e(MuxUI.AlertDialog.Root, { defaultOpen: args.open ?? false, className: args.className },
    e(MuxUI.AlertDialog.Trigger, { disabled: args.disabled }, 'Open alert'),
    e(MuxUI.AlertDialog.Backdrop),
    e(MuxUI.AlertDialog.Popup, null,
      e(MuxUI.AlertDialog.Content, null,
        e(MuxUI.AlertDialog.Title, null, 'Delete draft'),
        e(MuxUI.AlertDialog.Description, null, 'This action cannot be undone.'),
        e(MuxUI.AlertDialog.Actions, null,
          e(MuxUI.AlertDialog.Close, { disabled: args.disabled }, 'Cancel'),
        ),
      ),
    ),
  ),
  Avatar: (args) => e(MuxUI.Avatar.Root, { ...args, 'aria-label': args['aria-label'] ?? 'Workspace avatar' },
    e(MuxUI.Avatar.Image, { src: args.src ?? 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=', alt: 'Workspace avatar' }),
    e(MuxUI.Avatar.Fallback, null, 'WS'),
  ),
  ButtonGroup: (args) => e(MuxUI.ButtonGroup, { ...args },
    e(MuxUI.Button, { disabled: args.disabled }, 'Primary'),
    e(MuxUI.Button, { disabled: args.disabled, variant: 'neutral' }, 'Secondary'),
  ),
  Card: (args) => e(MuxUI.Card.Root, { className: args.className },
    e(MuxUI.Card.Header, null, 'Card title'),
    e(MuxUI.Card.Body, null, 'Card content'),
    e(MuxUI.Card.Footer, null, e(MuxUI.Button, { disabled: args.disabled }, 'Action')),
  ),
  CheckboxField: (args) => e(MuxUI.CheckboxField.Root, { ...args },
    e(MuxUI.CheckboxField.Button, { disabled: args.disabled }, 'Enable notifications', e(MuxUI.CheckboxField.Indicator)),
    e(MuxUI.CheckboxField.Description, null, 'Optional setting'),
    e(MuxUI.CheckboxField.Error, null, args.invalid ? 'Invalid value' : null),
  ),
  ColorModeToggle: (args) => e(ColorModeTogglePreview, args),
  CommandPalette: (args) => {
    const rootProps = { ...args };
    if (args.open === undefined) {
      delete rootProps.open;
      rootProps.defaultOpen = args.defaultOpen ?? false;
    }
    return e(MuxUI.CommandPalette.Root, rootProps,
      e(MuxUI.CommandPalette.Trigger, { disabled: args.disabled }, 'Open command palette'),
      e(MuxUI.CommandPalette.Backdrop, null,
        e(MuxUI.CommandPalette.Popup, null,
          e(MuxUI.CommandPalette.Title, null, 'Commands'),
          e(MuxUI.CommandPalette.Description, null, 'Choose an action'),
          e(MuxUI.CommandPalette.Content, null,
            e(MuxUI.CommandPalette.SearchField, null, e(MuxUI.CommandPalette.Input, { placeholder: 'Search commands' })),
            e(MuxUI.CommandPalette.ListBox, null,
              e(MuxUI.CommandPalette.Item, { id: 'save', title: 'Save' }, 'Save'),
            ),
          ),
          e(MuxUI.CommandPalette.Close, null, 'Close'),
        ),
      ),
    );
  },
  HeaderNav: (args) => e(MuxUI.HeaderNav.Root, { ...args },
    e(MuxUI.HeaderNav.Logo, null, 'Mux UI'),
    e(MuxUI.HeaderNav.Secondary, { 'aria-label': `${args['aria-label'] ?? 'Header navigation'} secondary` }, 'Docs'),
    e(MuxUI.HeaderNav.NavButton, { href: '#components' }, 'Components'),
    e(MuxUI.HeaderNav.Actions, null, e(MuxUI.Button, { disabled: args.disabled }, 'Sign in')),
    e(MuxUI.HeaderNav.MobileTrigger, null, 'Menu'),
  ),
  Image: (args) => e(MuxUI.Image, {
    ...args,
    src: args.src ?? 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
    alt: args.alt ?? 'Workspace preview',
    width: args.width ?? 160,
    height: args.height ?? 96,
  }),
  InputTags: (args) => e(MuxUI.InputTags.Root, { ...args, defaultValue: ['Mux', 'UI'], label: 'Tags', 'aria-label': 'Tags', placeholder: 'Add a tag' }),
  Input: (args) => e(MuxUI.Input.Root, { ...args },
    e(MuxUI.Input.Label, null, 'Name'),
    e(MuxUI.Input.Input, { placeholder: 'Enter a name', disabled: args.disabled }),
    e(MuxUI.Input.Description, null, 'Your display name'),
    e(MuxUI.Input.Error, null, args.invalid ? 'Name is invalid' : null),
  ),
  MultiSelect: (args) => e(MuxUI.MultiSelect.Root, { ...args, label: 'Notifications', items: [{ id: 'email', label: 'Email' }, { id: 'sms', label: 'SMS' }] },
    e(MuxUI.MultiSelect.Item, { id: 'email' }, 'Email'),
    e(MuxUI.MultiSelect.Item, { id: 'sms' }, 'SMS'),
    e(MuxUI.MultiSelect.Footer, null, '2 options'),
    e(MuxUI.MultiSelect.EmptyState, null, 'No options'),
  ),
  PaymentInput: (args) => e(MuxUI.PaymentInput.Root, args,
    e(MuxUI.PaymentInput.Label, null, 'Card number'),
    e(MuxUI.PaymentInput.Group, null,
      e(MuxUI.PaymentInput.Input, { placeholder: '4242 4242 4242 4242', disabled: args.disabled }),
      e(MuxUI.PaymentInput.CardIcon, null, 'VISA'),
    ),
    e(MuxUI.PaymentInput.Description, null, 'Secure payment'),
    e(MuxUI.PaymentInput.Error, null, args.invalid ? 'Invalid card' : null),
  ),
  ProgressCircle: (args) => e(MuxUI.ProgressCircle.Root, { ...args, value: args.value ?? 64, label: 'Upload progress' },
    e(MuxUI.ProgressCircle.Track),
    e(MuxUI.ProgressCircle.Label, null, 'Upload'),
    e(MuxUI.ProgressCircle.Value),
  ),
  // RadioField is a compound control whose context is supplied by RadioGroup.
  // The Storybook workspace consumes the public Mux package only, so use its
  // options API here instead of reaching through to RAC's private context.
  RadioField: (args) => e('div', { className: 'muxui-radio-field', 'data-invalid': args.invalid || undefined, 'data-disabled': args.disabled || undefined },
    e(MuxUI.RadioGroup, {
      'aria-label': 'Preferred',
      value: args.value,
      defaultValue: args.defaultValue ?? 'preferred',
      disabled: args.disabled,
      readOnly: args.readOnly,
      required: args.required,
      invalid: args.invalid,
      options: [
        { value: 'preferred', label: 'Preferred' },
        { value: 'alternative', label: 'Alternative' },
      ],
      className: 'muxui-radio-field__group',
    }),
    e('span', { className: 'muxui-radio-field__description' }, 'Choose one option'),
    args.invalid ? e('span', { className: 'muxui-radio-field__error' }, 'Invalid choice') : null,
  ),
  Sidebar: ({ collapsed, defaultCollapsed, onCollapsedChange, shortcut, ...args }) => {
    return e(MuxUI.Sidebar.Provider, { collapsed, defaultCollapsed, onCollapsedChange, shortcut },
      e(MuxUI.Sidebar.Toggle),
      e(MuxUI.Sidebar.Root, { ...args },
        e(MuxUI.Sidebar.Header, null, 'Workspace'),
        e(MuxUI.Sidebar.Search, { placeholder: 'Search' }),
        e(MuxUI.Sidebar.Divider),
        e(MuxUI.Sidebar.NavList, null,
          e(MuxUI.Sidebar.NavItem, { href: '#home', icon: SidebarSpecimenIcon, current: true }, 'Home'),
          e(MuxUI.Sidebar.Section, { label: 'Projects' },
            e(MuxUI.Sidebar.NavItem, { href: '#settings', icon: SidebarSpecimenIcon }, 'Settings'),
          ),
        ),
        e(MuxUI.Sidebar.AccountCard, { name: 'Andrew', email: 'andrew@example.com' }),
        e(MuxUI.Sidebar.AccountMenu, null, 'Account'),
        e(MuxUI.Sidebar.MobileTrigger, null, 'Menu'),
        e(MuxUI.Sidebar.FeatureCard, { title: 'Try Scale', description: 'Explore tokens' }),
      ),
    );
  },
  SwitchField: (args) => e(MuxUI.SwitchField.Root, { ...args },
    e(MuxUI.SwitchField.Button, { disabled: args.disabled }, 'Enabled', e(MuxUI.SwitchField.Thumb)),
    e(MuxUI.SwitchField.Description, null, 'Enable updates'),
    e(MuxUI.SwitchField.Error, null, args.invalid ? 'Invalid value' : null),
  ),
  TagSelect: (args) => e(MuxUI.TagSelect.Root, { ...args, label: 'Topics', items: [{ id: 'design', label: 'Design' }, { id: 'code', label: 'Code' }] },
    e(MuxUI.TagSelect.Item, { id: 'design' }, 'Design'),
    e(MuxUI.TagSelect.Item, { id: 'code' }, 'Code'),
  ),
  TextArea: (args) => e(MuxUI.TextArea.Root, { ...args },
    e(MuxUI.TextArea.Label, null, 'Notes'),
    e(MuxUI.TextArea.TextArea, { placeholder: 'Add notes', disabled: args.disabled }),
    e(MuxUI.TextArea.Description, null, 'Optional'),
    e(MuxUI.TextArea.Error, null, args.invalid ? 'Invalid notes' : null),
  ),
  // Controls cannot filter options by another arg, so xs falls back to sm for
  // the roles that do not define it instead of throwing.
  Text: (args) => e(MuxUI.Text, {
    ...args,
    size: args.size === 'xs' && ['display', 'heading', 'title'].includes(args.variant) ? 'sm' : args.size,
  }, 'Manage your profile details.'),
  Resizable: (args) => e(MuxUI.Resizable, { ...args, defaultSizes: args.defaultSizes ?? { main: 60, side: 40 } },
    e(MuxUI.ResizablePanel, { id: 'main' }, 'Main'),
    e(MuxUI.ResizableHandle, { id: 'main-side', before: 'main', after: 'side', 'aria-label': 'Resize panels' }),
    e(MuxUI.ResizablePanel, { id: 'side' }, 'Side'),
  ),
  SelectNative: (args) => e(MuxUI.SelectNative, {
    ...args,
    label: args.label ?? 'Choose a saved panel',
    defaultValue: args.value === undefined ? (args.defaultValue ?? '') : undefined,
    errorMessage: args.invalid ? (args.errorMessage ?? 'Choose a panel') : args.errorMessage,
  },
  e('option', { value: '' }, 'Choose a panel'),
  e('option', { value: 'inbox' }, 'Inbox'),
  e('option', { value: 'research' }, 'Research')),
  Lightbox: (args) => e(MuxUI.Lightbox, { ...args, items: args.items ?? [{ key: 'one', label: 'One' }, { key: 'two', label: 'Two' }] },
    e(MuxUI.LightboxTrigger, { itemKey: 'one', disabled: args.disabled }, 'Open gallery'),
    e(MuxUI.LightboxBackdrop, null,
      e(MuxUI.LightboxPopup, null,
        e(MuxUI.LightboxContent, null, e(MuxUI.LightboxCaption, null, 'Gallery item')),
        e(MuxUI.LightboxPrevious, null),
        e(MuxUI.LightboxNext, null),
        e(MuxUI.LightboxClose, null),
      ),
    ),
  ),
  Markdown: (args) => e(Markdown, { ...args, source: args.source ?? '## Mux UI\n\nA **bounded** example.' }),
  TextEditor: (args) => e(TextEditor, { ...args, label: fallback(args.label, 'Note'), defaultValue: args.defaultValue ?? { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mux UI' }] }] } }),
});

export const adapterNames = Object.freeze(Object.keys(ADAPTERS));

function focusStateTarget(element) {
  if (!element) return;
  const target = element.matches('button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])')
    ? element
    : element.querySelector('button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])');
  target?.focus();
}

function dispatchDragEnter(element) {
  const target = element?.querySelector('.muxui-drop-zone') ?? element;
  if (!target || typeof target.dispatchEvent !== 'function') return;
  let dataTransfer;
  try {
    dataTransfer = typeof DataTransfer === 'function' ? new DataTransfer() : undefined;
    if (dataTransfer) dataTransfer.effectAllowed = 'all';
  } catch {
    dataTransfer = undefined;
  }
  dataTransfer ??= {
    effectAllowed: 'all',
    dropEffect: 'none',
    files: [],
    items: [],
    types: ['Files'],
  };
  const event = typeof DragEvent === 'function'
    ? new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer })
    : new Event('dragenter', { bubbles: true, cancelable: true });
  if (!event.dataTransfer) Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  target.dispatchEvent(event);
}

function scheduleOpenInteraction(element, family) {
  const target = element?.querySelector(INTERACTION_OPEN_SELECTORS[family]);
  if (!target) return undefined;
  const handle = scheduleFrame(() => {
    if (target.isConnected && target.getAttribute('aria-expanded') !== 'true') target.click();
  });
  return () => cancelFrame(handle);
}

function lifecycleMarker(family, state) {
  return `muxui-storybook-lifecycle-${family}-${state}`.replaceAll(/[^a-z0-9-]/gi, '-').toLowerCase();
}

function findOverlayHost(target) {
  if (typeof document === 'undefined' || !target) return undefined;
  return [...document.body.children].find((child) => child.contains(target));
}

/** Keep the private overlay portals distinguishable to the Storybook a11y host. */
function OverlayHost({ marker, children }) {
  React.useEffect(() => {
    if (!marker || typeof document === 'undefined') return undefined;
    let managedHost;
    let originalRole;
    let originalLabel;
    const annotateHost = () => {
      const host = findOverlayHost(document.querySelector(`.${marker}`));
      if (!host || host === managedHost) return;
      managedHost = host;
      originalRole = host.getAttribute('role');
      originalLabel = host.getAttribute('aria-label');
      if (!originalRole) host.setAttribute('role', 'region');
      host.setAttribute('aria-label', `Mux UI overlay ${marker}`);
    };
    const observer = typeof MutationObserver === 'function'
      ? new MutationObserver(annotateHost)
      : undefined;
    observer?.observe(document.body, { childList: true, subtree: true });
    annotateHost();
    return () => {
      observer?.disconnect();
      if (!managedHost) return;
      if (originalRole === null) managedHost.removeAttribute('role');
      else managedHost.setAttribute('role', originalRole);
      if (originalLabel === null) managedHost.removeAttribute('aria-label');
      else managedHost.setAttribute('aria-label', originalLabel);
    };
  }, [marker]);
  return children;
}

function scheduleFrame(callback) {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
  return setTimeout(callback, 0);
}

function cancelFrame(handle) {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
  else clearTimeout(handle);
}

const LifecycleSelectionContext = React.createContext(null);

function LifecycleSelection({ family, states, children }) {
  const [activeState, setActiveState] = React.useState(states[0]);
  const selectId = `muxui-storybook-lifecycle-select-${family.toLowerCase()}`;
  return e(React.Fragment, null,
    e('label', { htmlFor: selectId }, 'Lifecycle state'),
    e('select', {
      id: selectId,
      value: activeState,
      'aria-label': `${family} lifecycle state`,
      'data-muxui-storybook-lifecycle-select': family,
      onChange: (event) => setActiveState(event.target.value),
    }, states.map((state) => e('option', { key: state, value: state }, state))),
    e(LifecycleSelectionContext.Provider, { value: activeState }, children),
  );
}

function LifecycleTransition({ family, state, args }) {
  const isClosing = state === 'closing' || state === 'exiting';
  const isToast = family === 'Toast';
  const [open, setOpen] = React.useState(!isToast && isClosing);
  const [toastMounted, setToastMounted] = React.useState(isClosing);
  const [toastRevision, setToastRevision] = React.useState(0);
  const [phase, setPhase] = React.useState(isClosing ? 'open' : 'closed');
  const userInteracted = React.useRef(false);

  React.useEffect(() => {
    userInteracted.current = false;
    const frame = scheduleFrame(() => {
      if (userInteracted.current) return;
      setPhase(isClosing ? 'exiting' : 'entering');
      if (isToast) setToastMounted(!isClosing);
      else setOpen(!isClosing);
    });
    const reopen = isClosing
      ? setTimeout(() => {
        if (userInteracted.current) return;
        setPhase('entering');
        if (isToast) {
          setToastRevision(1);
          setToastMounted(true);
        }
        else setOpen(true);
      }, 300)
      : undefined;
    const settle = setTimeout(() => {
      if (userInteracted.current) return;
      setPhase('open');
    }, isClosing ? 600 : 300);
    return () => {
      cancelFrame(frame);
      if (reopen !== undefined) clearTimeout(reopen);
      clearTimeout(settle);
    };
  }, [isClosing, isToast]);

  const transitionArgs = { ...args };
  let rendered;
  if (isToast) {
    transitionArgs.duration = isClosing && toastRevision === 0 ? 50 : (args.duration ?? 5_000);
    rendered = toastMounted
      ? React.cloneElement(renderFamily(family, transitionArgs), { key: toastRevision })
      : null;
  } else {
    transitionArgs.open = open;
    transitionArgs.onOpenChange = (nextOpen) => {
      args.onOpenChange?.(nextOpen);
      userInteracted.current = true;
      setOpen(nextOpen);
      setPhase(nextOpen ? 'open' : 'closed');
    };
    rendered = renderFamily(family, transitionArgs);
  }
  return e(React.Fragment, null,
    rendered,
    e('div', {
      className: 'muxui-storybook-transition-status',
      'data-muxui-storybook-transition': phase,
      'aria-hidden': 'true',
    }, `${state}: ${phase}`),
  );
}

function StateVariant({ family, state, args, available }) {
  const stateRef = React.useRef(null);
  const [hiddenByOverlay, setHiddenByOverlay] = React.useState(false);
  React.useEffect(() => {
    const section = stateRef.current;
    if (!section || typeof MutationObserver !== 'function') return undefined;
    const syncHiddenState = () => setHiddenByOverlay(section.getAttribute('aria-hidden') === 'true');
    syncHiddenState();
    const observer = new MutationObserver(syncHiddenState);
    observer.observe(section, { attributes: true, attributeFilter: ['aria-hidden'] });
    return () => observer.disconnect();
  }, []);
  React.useEffect(() => {
    if (state === 'focused') focusStateTarget(stateRef.current);
    if (state === 'drop-target' || state === 'dragging') dispatchDragEnter(stateRef.current);
    if (state !== 'open' || !INTERACTION_OPEN_FAMILIES.has(family)) return undefined;
    return scheduleOpenInteraction(stateRef.current, family);
  }, [family, state]);

  const variantArgs = { ...args };
  if (family === 'DataDiff') variantArgs.label = `${args.label ?? 'Proposed menu cleanup'} ${state}`;
  if (family === 'Activity') {
    if (state === 'running' || state === 'failed') variantArgs.status = state;
  }
  if (family === 'Message' && state === 'streaming') variantArgs.streaming = true;
  if (family === 'PromptComposer' && state === 'error') variantArgs.error = 'Unable to send. Try again.';
  if (family === 'DataDiff' && state === 'mixed') variantArgs.defaultSelectedIds = ['added'];
  if (family === 'CodeBlock') {
    if (state === 'diff') variantArgs.mode = 'diff';
    if (state === 'wrap') variantArgs.wrap = true;
  }
  const lifecycleAttribute = LIFECYCLE_ATTRIBUTES[state];
  const activeLifecycleState = React.useContext(LifecycleSelectionContext);
  const marker = OVERLAY_FAMILIES.has(family) ? lifecycleMarker(family, state) : undefined;
  if (marker) {
    variantArgs.className = [variantArgs.className, marker].filter(Boolean).join(' ');
  }
  // The matrix intentionally mounts several landmark instances at once. Give
  // Mux UI's nav/group adapters unique accessible names without adding a prop
  // to the public API or changing the controls contract.
  if (family === 'Breadcrumbs' || family === 'Group' || family === 'HeaderNav') {
    variantArgs['aria-label'] = `${family} ${state}`;
  }
  const labelId = `muxui-storybook-state-${family}-${state.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  const rendered = !available
    ? e('p', {
      className: 'muxui-storybook-state-unavailable',
      'data-muxui-storybook-state': 'unavailable',
    }, `Unavailable: MuxUI ${family} has no public prop or supported interaction for the ${state} state.`)
    : lifecycleAttribute
    ? activeLifecycleState === state
      ? e(LifecycleTransition, { family, state, args: variantArgs })
      : e('p', { className: 'muxui-storybook-lifecycle-inactive' }, `Select ${state} to inspect this lifecycle state.`)
    : renderFamily(family, variantArgs);
  const stateContent = e('section', {
    ref: stateRef,
    className: 'muxui-storybook-state',
    'aria-labelledby': labelId,
    // React Aria hides sibling state fixtures while a collection popover is
    // open. Keep those intentionally inactive fixtures out of the tab order
    // as well so the Storybook state matrix remains axe-clean.
    inert: hiddenByOverlay ? true : undefined,
    'data-muxui-storybook-lifecycle': lifecycleAttribute ? state : undefined,
  }, e('h3', { id: labelId }, state), rendered);
  return marker ? e(OverlayHost, { marker }, stateContent) : stateContent;
}

export function renderStateCoverage(record, args = storyArgsForBinding(record.binding, 'states', record.family)) {
  const variants = stateCoverageForBinding(record.binding, record.family);
  const stateMatrix = e('div', { className: 'muxui-storybook-states' }, variants.map(({ name }) => e(StateVariant, {
    key: name,
    family: record.family,
    state: name,
    available: stateIsSupported(record.binding, name, record.family),
    args: stateArgsForBinding(record.binding, name, record.family, args),
  })));
  const lifecycleStates = variants.map(({ name }) => name).filter((name) => LIFECYCLE_ATTRIBUTES[name]);
  return lifecycleStates.length > 0
    ? e('div', { className: 'muxui-storybook-lifecycle-showcase' }, e(LifecycleSelection, {
      family: record.family,
      states: lifecycleStates,
      children: stateMatrix,
    }))
    : stateMatrix;
}

export function renderFamily(family, args) {
  const adapter = ADAPTERS[family];
  if (!adapter) throw new Error(`Unknown Mux UI React story family: ${family}`);
  return adapter(args);
}

function serializableEventValue(value) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (value instanceof Event) return `{type:${value.type}}`;
  if (typeof File !== 'undefined' && value instanceof File) return `{file:${value.name}}`;
  if (value instanceof Set) return JSON.stringify([...value]);
  if (typeof value === 'function') return '[function]';
  try {
    const serialized = JSON.stringify(value, (_key, nested) => nested instanceof Set ? [...nested] : nested);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value);
  }
}

function eventMessage(channel, payload) {
  return `${channel}: ${payload.map(serializableEventValue).join(', ')}`;
}

function HarnessStatus({ label, note, children }) {
  return e('div', {
    className: 'muxui-storybook-status',
    role: 'group',
    'aria-label': `${label} status`,
  },
  e('span', { className: 'muxui-storybook-status-label' }, label),
  children,
  e('span', { className: 'muxui-storybook-status-note' }, note));
}

function EventHarness({ record, args, heading = 'Live event log', children }) {
  const [messages, setMessages] = React.useState([]);
  const eventArgs = { ...args };
  for (const { channel, prop } of eventBindingsForBinding(record.binding)) {
    const supplied = args[prop];
    eventArgs[prop] = (...payload) => {
      supplied?.(...payload);
      setMessages((previous) => [...previous, eventMessage(channel, payload)].slice(-12));
    };
  }
  const channels = eventBindingsForBinding(record.binding).map(({ channel }) => channel);
  return e('div', {
    className: 'muxui-storybook-proof',
    role: 'group',
    'aria-label': heading,
    'data-muxui-storybook-proof': 'events',
  },
    children(eventArgs),
    e(HarnessStatus, {
      label: 'Event log',
      note: channels.length === 0 ? 'No canonical event channels for this family.' : 'Interact with the live component to record events.',
      children: e('ol', { 'aria-live': 'polite', 'data-muxui-storybook-event-log': record.family },
        messages.length === 0
          ? e('li', { 'data-muxui-storybook-event-status': 'waiting' }, channels.length ? `Waiting for: ${channels.join(', ')}` : 'No events')
          : messages.map((message, index) => e('li', { key: `${message}-${index}` }, message))),
    }),
  );
}

function eventForControlledProp(controlled, family) {
  if (family === 'PromptComposer' && controlled === 'value') return 'valueChange';
  if (family === 'PromptComposer' && controlled === 'selectedModel') return 'modelChange';
  if (family === 'Message' && controlled === 'sourcesExpanded') return 'sourcesExpandedChange';
  if (controlled === 'open') return 'openChange';
  if (controlled === 'collapsed') return 'collapsedChange';
  if (controlled === 'expanded' || controlled === 'expandedIds') return 'expandedChange';
  if (controlled === 'selectedIds') return 'selectionChange';
  if (controlled === 'selectedId') return 'select';
  return 'change';
}

function controlledValueFromEvent(controlled, payload) {
  const value = payload[0];
  if (controlled === 'selectedId') {
    if (value && typeof value === 'object') return value.id ?? value.value;
  }
  return value;
}

function ControlledHarness({ record, args }) {
  const [values, setValues] = React.useState(() => controlledStoryArgsForBinding(record.binding, record.family, args));
  const controlledPairs = controlledDefaultPairsForBinding(record.binding);
  const eventArgs = { ...values };
  for (const { controlled } of controlledPairs) {
    const channel = eventForControlledProp(controlled, record.family);
    const prop = eventCallbackPropForChannel(channel);
    const supplied = args[prop];
    eventArgs[prop] = (...payload) => {
      supplied?.(...payload);
      const next = controlledValueFromEvent(controlled, payload);
      if (next !== undefined) setValues((previous) => ({ ...previous, [controlled]: next }));
    };
  }
  const valuesToShow = Object.fromEntries(controlledPairs.map(({ controlled }) => [controlled, values[controlled]]));
  return e('div', {
    className: 'muxui-storybook-proof',
    role: 'group',
    'aria-label': 'Controlled mode',
    'data-muxui-storybook-proof': 'controlled',
  },
    renderFamily(record.family, eventArgs),
    e(HarnessStatus, {
      label: 'Value',
      note: controlledPairs.length ? 'Updated from the component callback.' : 'This family has no controlled/default pair.',
      children: e('output', { 'aria-label': `${record.family} controlled values`, 'data-muxui-controlled-values': record.family }, JSON.stringify(valuesToShow)),
    }),
  );
}

function UncontrolledHarness({ record, args }) {
  const uncontrolledPairs = controlledDefaultPairsForBinding(record.binding);
  const valuesToShow = Object.fromEntries(uncontrolledPairs.map(({ controlled, uncontrolled }) => [uncontrolled, args[uncontrolled]]));
  return e('div', {
    className: 'muxui-storybook-proof',
    role: 'group',
    'aria-label': 'Uncontrolled mode',
    'data-muxui-storybook-proof': 'uncontrolled',
  },
    renderFamily(record.family, args),
    e(HarnessStatus, {
      label: 'Default',
      note: uncontrolledPairs.length ? 'Initial default. The component manages subsequent changes.' : 'This family has no controlled/default pair.',
      children: e('output', { 'aria-label': `${record.family} uncontrolled defaults`, 'data-muxui-uncontrolled-values': record.family }, JSON.stringify(valuesToShow)),
    }),
  );
}

const CANONICAL_PART_SELECTORS = Object.freeze({
  Avatar: { image: ['.muxui-avatar__image'], fallback: ['.muxui-avatar__fallback'] },
  Button: { label: ['.muxui-button-content'] },
  IconButton: { icon: ['.muxui-icon-button-icon'] },
  Group: { label: ['.muxui-group[aria-label]'], content: ['.muxui-group > button', '.muxui-group > [role="button"]'] },
  Link: { label: ['.muxui-link'] },
  ListBox: { header: ['.muxui-list-box-section-header'] },
  Menu: { header: ['.muxui-menu-section-header'] },
  Image: { root: ['.muxui-image'] },
  CodeBlock: { status: ['.muxui-code-block [role="status"]'] },
  PromptComposer: { status: ['.muxui-prompt-composer [role="status"]'] },
  Message: { status: ['.muxui-message [role="status"]'] },
  Activity: { status: ['.muxui-activity [role="status"]'] },
  Select: { popup: ['.muxui-select-popover'] },
  SelectNative: { select: ['.muxui-select-native'], label: ['.muxui-select-native__label'], description: ['.muxui-select-native__description'], error: ['.muxui-select-native__error'] },
  Meter: { label: ['.muxui-value-label'] },
  ProgressBar: { label: ['.muxui-value-label'] },
  ToggleButton: { label: ['.muxui-toggle-button'] },
  CheckboxGroup: { options: ['.muxui-checkbox-group .muxui-checkbox'], description: ['.muxui-field-description'], error: ['.muxui-field-error'] },
  DateField: { segment: ['.muxui-date-segment'], description: ['.muxui-field-description'], error: ['.muxui-field-error'] },
  DatePicker: { segment: ['.muxui-date-segment'], description: ['.muxui-field-description'], error: ['.muxui-field-error'] },
  DateRangePicker: {
    start: ['.muxui-date-range-picker .muxui-date-input[slot="start"]', '.muxui-date-range-picker .muxui-date-input:first-of-type', '.muxui-date-range-picker .muxui-date-input'],
    end: ['.muxui-date-range-picker .muxui-date-input[slot="end"]', '.muxui-date-range-picker .muxui-date-input:last-of-type', '.muxui-date-range-picker .muxui-date-input'],
    description: ['.muxui-field-description'],
    error: ['.muxui-field-error'],
  },
  Form: { content: ['.muxui-form > *'] },
  NumberField: { decrement: ['.muxui-number-stepper-decrement'], increment: ['.muxui-number-stepper-increment'], description: ['.muxui-field-description'], error: ['.muxui-field-error'] },
  SearchField: { clear: ['.muxui-search-clear'], description: ['.muxui-field-description'], error: ['.muxui-field-error'] },
  Switch: { description: ['.muxui-field-description'], error: ['.muxui-field-error'] },
  TextField: { description: ['.muxui-field-description'], error: ['.muxui-field-error'] },
  TimeField: { segment: ['.muxui-time-field .muxui-date-segment'], description: ['.muxui-field-description'], error: ['.muxui-field-error'] },
  Autocomplete: { popover: ['.muxui-autocomplete-popover'], list: ['.muxui-autocomplete-list'] },
  Calendar: { label: ['.muxui-calendar-heading'] },
  ColorArea: { area: ['.muxui-color-area'] },
  ColorField: { description: ['.muxui-field-description'], error: ['.muxui-field-error'] },
  ColorPicker: { field: ['.muxui-color-picker .muxui-color-field'], area: ['.muxui-color-picker .muxui-color-area'], slider: ['.muxui-color-picker .muxui-color-slider'], swatch: ['.muxui-color-picker .muxui-color-swatch'] },
  ColorSwatchPicker: { swatch: ['.muxui-color-swatch-picker .muxui-color-swatch'], selection: ['.muxui-color-swatch-picker [aria-selected="true"]', '.muxui-color-swatch-picker .muxui-color-swatch-picker-item'] },
  RangeCalendar: { grid: ['.muxui-range-calendar .muxui-calendar-grid'] },
  Tabs: { list: ['.muxui-tab-list'], panels: ['.muxui-tab-panels'], panel: ['.muxui-tab-panel'] },
  TagGroup: { list: ['.muxui-tag-list'], remove: ['.muxui-tag-remove'] },
  ToggleButtonGroup: { button: ['.muxui-toggle-button-group .muxui-toggle-button'] },
  Toolbar: { control: ['.muxui-toolbar button', '.muxui-toolbar [role="button"]'] },
  Tree: { children: ['.muxui-tree .muxui-tree-item'] },
  Virtualizer: { viewport: ['.muxui-virtualizer'], item: ['.muxui-virtualizer .muxui-virtualizer-item', '.muxui-virtualizer-item'] },
  DropZone: { content: ['.muxui-drop-zone'] },
  FileTrigger: { input: ['.muxui-file-trigger input[type="file"]', 'input[type="file"]'] },
  Popover: { trigger: ['.muxui-overlay-pop-trigger', '.muxui-popover-positioner ~ button'], content: ['.muxui-popover > *'] },
  PreviewTrigger: { content: ['.muxui-preview-content'] },
  Tooltip: { trigger: ['.muxui-tooltip-trigger', '.muxui-tooltip ~ button', 'button'] },
});

const EXECUTABLE_ANATOMY_PARTS = Object.freeze({
  Autocomplete: new Set(['popover', 'list']),
  Virtualizer: new Set(['item']),
});

function executableAnatomyPart(family, part) {
  return EXECUTABLE_ANATOMY_PARTS[family]?.has(part) ?? false;
}

function partSelectors(binding, part) {
  const root = binding.selector;
  if (part === 'root') return [root];
  const familySelectors = CANONICAL_PART_SELECTORS[binding.export]?.[part] ?? [];
  const rootClass = root.replace(/^\./u, '');
  const suffix = kebabCase(part);
  const selectors = [
    ...familySelectors,
    `${root}-${suffix}`,
    `.${rootClass}-${suffix}`,
    `.muxui-${suffix}`,
    `.muxui-field-${suffix}`,
  ];
  if (part === 'input') selectors.push(`${root} input`, `${root} textarea`);
  if (part === 'label') selectors.push(`${root} label`, `${root} .muxui-field-label`, `${root} .muxui-value-label`);
  if (part === 'trigger') selectors.push(`${root} button`, `${root} [role="button"]`);
  if (part === 'item' || part === 'option' || part === 'cell' || part === 'row' || part === 'tab') {
    selectors.push(`${root} [role="${part === 'item' ? 'option' : part}"]`);
  }
  return [...new Set(selectors)];
}

function anatomyArgsForBinding(record, sourceArgs) {
  const args = { ...sourceArgs };
  const props = new Set(record.binding.api.props);
  if (props.has('description')) args.description = 'Additional context';
  if (props.has('errorMessage')) args.errorMessage = 'A value is required';
  // errorMessage renders only while invalid, so the anatomy shows the error part through invalid.
  if (props.has('errorMessage') && props.has('invalid')) args.invalid = true;
  if (record.family === 'ColorSwatchPicker') args.defaultValue = '#ff0000';
  if (record.family === 'ListBox') {
    args.children = e(MuxUI.ListBox.Section, { title: 'Options' },
      e(MuxUI.ListBox.Item, { id: 'one' }, 'One'),
      e(MuxUI.ListBox.Item, { id: 'two' }, 'Two'));
  }
  if (record.family === 'CodeBlock') args.mode = 'diff';
  if (record.family === 'PromptComposer') args.error = 'Unable to send. Try again.';
  if (record.family === 'Message') args.defaultSourcesExpanded = true;
  if (record.family === 'Dialog') args.actions = e(MuxUI.Button, null, 'Confirm');
  return args;
}

function AnatomyHarness({ record, args }) {
  const hostRef = React.useRef(null);
  const [matches, setMatches] = React.useState(() => Object.fromEntries(record.binding.api.parts.map((part) => [part, 0])));
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const collect = () => {
      const nextMatches = {};
      for (const part of record.binding.api.parts) {
        const nodes = partSelectors(record.binding, part).flatMap((selector) => [...host.querySelectorAll(selector), ...document.querySelectorAll(selector)]);
        const uniqueNodes = [...new Set(nodes)];
        nextMatches[part] = uniqueNodes.length;
        uniqueNodes.forEach((node) => node.setAttribute('data-muxui-storybook-api-part', `${record.family}.${part}`));
      }
      setMatches(nextMatches);
    };
    // Overlay-backed families (notably Toast) mount their actual parts in a
    // portal after the first render. Observe additions so the generated proof
    // resolves those real hooks instead of freezing at the initial snapshot.
    collect();
    const observer = typeof MutationObserver === 'function' && document.body
      ? new MutationObserver(collect)
      : undefined;
    observer?.observe(document.body, { childList: true, subtree: true });
    return () => observer?.disconnect();
  }, [record]);
  const anatomyArgs = anatomyArgsForBinding(record, args);
  // Compound-only parts need live specimens alongside the flat state matrix.
  const anatomySupport = record.family === 'ColorPicker'
    ? e(MuxUI.ColorPicker, { defaultValue: '#ff0000' },
      e(MuxUI.ColorSlider, { label: 'Red', channel: 'red', defaultValue: '#ff0000' }),
      e(MuxUI.ColorSwatch, { color: '#ff0000' }))
    : record.family === 'Menu'
      ? e(MuxUI.Menu.Root, { defaultOpen: true },
        e(MuxUI.Menu.Trigger, null, 'Actions'),
        e(MuxUI.Menu.Popup, null,
          e(MuxUI.Menu.List, { 'aria-label': 'Actions' },
            e(MuxUI.Menu.Section, { title: 'Editing' }, e(MuxUI.Menu.Item, { id: 'save' }, 'Save')),
            e(MuxUI.Menu.Separator),
            e(MuxUI.Menu.Item, { id: 'delete' }, 'Delete'))))
      : null;
  const anatomyStatus = e('div', { className: 'muxui-storybook-anatomy-status' },
    e('p', null, 'The state matrix renders the live component parts. Each row resolves its real DOM hook after mount.'),
    e('ul', { 'data-muxui-storybook-api-parts': record.family }, record.binding.api.parts.map((part) => e('li', {
      key: part,
      'data-muxui-storybook-api-part-status': matches[part] > 0 ? 'found' : executableAnatomyPart(record.family, part) ? 'executable' : 'unresolved',
      'data-muxui-storybook-api-part-proof': executableAnatomyPart(record.family, part) ? 'browser' : undefined,
      'data-muxui-storybook-api-part-route': partSelectors(record.binding, part).join(' | '),
    }, e('code', null, `${partSelectors(record.binding, part)[0]} (${part})`), `: ${matches[part] > 0 ? `${matches[part]} live node(s)` : executableAnatomyPart(record.family, part) ? 'executable Browser Proof route' : 'unresolved route'}`))),
  );
  const content = e('div', {
    ref: hostRef,
    className: 'muxui-storybook-proof',
    role: 'group',
    'aria-label': 'Anatomy and composition',
    'data-muxui-storybook-proof': 'anatomy',
  },
    renderStateCoverage(record, anatomyArgs),
    anatomySupport,
    anatomyStatus,
  );
  return record.family === 'Toast' ? e(MuxUI.ToastProvider, null, content) : content;
}

function waitForBrowserElement(selector, root = document, timeout = 2_000) {
  const deadline = Date.now() + timeout;
  return new Promise((resolvePromise, reject) => {
    const check = () => {
      const element = root.querySelector(selector) ?? document.querySelector(selector);
      if (element) return resolvePromise(element);
      if (Date.now() >= deadline) return reject(new Error(`Browser proof target did not appear: ${selector}`));
      return setTimeout(check, 20);
    };
    check();
  });
}

function waitForBrowserElementGone(selector, root = document, timeout = 2_000) {
  const deadline = Date.now() + timeout;
  return new Promise((resolvePromise, reject) => {
    const check = () => {
      const element = root.querySelector(selector) ?? document.querySelector(selector);
      if (!element || element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') return resolvePromise();
      if (Date.now() >= deadline) return reject(new Error(`Browser proof target remained present: ${selector}`));
      return setTimeout(check, 20);
    };
    check();
  });
}

function waitForBrowserFocus(element, timeout = 2_000) {
  const deadline = Date.now() + timeout;
  return new Promise((resolvePromise, reject) => {
    const check = () => {
      if (document.activeElement === element) return resolvePromise();
      if (Date.now() >= deadline) return reject(new Error('Browser proof did not restore focus to the expected control'));
      return setTimeout(check, 20);
    };
    check();
  });
}

function waitForBrowserFocusWithin(element, timeout = 2_000) {
  const deadline = Date.now() + timeout;
  return new Promise((resolvePromise, reject) => {
    const check = () => {
      if (document.activeElement === element || element.contains(document.activeElement)) return resolvePromise();
      if (Date.now() >= deadline) return reject(new Error('Browser proof did not move focus into the expected element'));
      return setTimeout(check, 20);
    };
    check();
  });
}

function browserProofElement(canvasElement, selectors, family) {
  const candidates = Array.isArray(selectors) ? selectors : [selectors];
  for (const selector of candidates) {
    const element = canvasElement.querySelector(selector) ?? document.querySelector(selector);
    if (element) return element;
  }
  throw new Error(`${family} Browser Proof target is missing (${candidates.join(' | ')})`);
}

function browserElementVisible(element) {
  if (!element || element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') return false;
  const style = getComputedStyle(element);
  const bounds = element.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
    && bounds.width > 0 && bounds.height > 0;
}

function waitForVisibleBrowserElement(selector, family, timeout = 2_000) {
  const deadline = Date.now() + timeout;
  return new Promise((resolvePromise, reject) => {
    const check = () => {
      const element = document.querySelector(selector);
      if (browserElementVisible(element)) return resolvePromise(element);
      if (Date.now() >= deadline) return reject(new Error(`${family} Browser Proof target is not visible: ${selector}`));
      return setTimeout(check, 20);
    };
    check();
  });
}

function waitForBrowserEvent(canvasElement, channel, family, timeout = 2_000) {
  const deadline = Date.now() + timeout;
  const selector = '[data-muxui-storybook-event-log] li:not([data-muxui-storybook-event-status])';
  return new Promise((resolvePromise, reject) => {
    const check = () => {
      const eventLog = document.querySelector(`[data-muxui-storybook-event-log="${family}"]`) ?? canvasElement;
      const entries = [...eventLog.querySelectorAll(selector)];
      const event = entries.find((entry) => entry.textContent?.startsWith(`${channel}:`));
      if (event) return resolvePromise(event);
      if (Date.now() >= deadline) {
        const received = entries.map((entry) => entry.textContent).join(' | ') || 'none';
        return reject(new Error(`${family} Browser Proof expected ${channel} event; received ${received}`));
      }
      return setTimeout(check, 20);
    };
    check();
  });
}

async function repeatBrowserInteractionUntilEvent(canvasElement, channel, family, interaction, timeout = 2_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    await interaction();
    try {
      return await waitForBrowserEvent(canvasElement, channel, family, 150);
    } catch (error) {
      lastError = error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    }
  }
  throw lastError ?? new Error(`${family} Browser Proof expected ${channel} event`);
}

function assertBrowser(condition, message) {
  if (!condition) throw new Error(`Browser Proof assertion failed: ${message}`);
}

function setBrowserInputValue(input, value) {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) throw new Error('Browser Proof could not set the public input value');
  setter.call(input, value);
  const event = typeof InputEvent === 'function'
    ? new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value })
    : new Event('input', { bubbles: true });
  input.dispatchEvent(event);
}

function nudgeBrowserRangeControl(control, key = 'ArrowRight') {
  control.focus();
  control.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true }));
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

function nudgeBrowserColorField(input) {
  input.focus();
  const event = { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, which: 38, bubbles: true, cancelable: true };
  input.dispatchEvent(new KeyboardEvent('keydown', event));
  input.dispatchEvent(new KeyboardEvent('keyup', event));
}

function activateBrowserColorTarget(target) {
  const bounds = target.getBoundingClientRect();
  const x = bounds.left + Math.max(1, bounds.width * 0.25);
  const y = bounds.top + Math.max(1, bounds.height * 0.25);
  if (typeof PointerEvent === 'function') {
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, buttons: 1, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse' }));
    target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse' }));
  } else {
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  }
}

function activationPlan(family, selector, channel = 'activate') {
  return async ({ canvasElement }) => {
    const target = browserProofElement(canvasElement, selector, family);
    if (family === 'Link') target.addEventListener('click', (event) => event.preventDefault(), { once: true, capture: true });
    target.focus();
    target.click();
    await waitForBrowserEvent(canvasElement, channel, family);
  };
}

function inputChangePlan(family, selector, value = 'proof') {
  return async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, `.muxui-${familySlug(family)}`, family);
    const input = root.querySelector(selector);
    assertBrowser(input, `${selector} public input is missing`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    input.focus();
    setBrowserInputValue(input, value);
    await waitForBrowserEvent(canvasElement, 'change', family);
  };
}

function rangeChangePlan(family, selector) {
  return async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, `.muxui-${familySlug(family)}`, family);
    const control = root.querySelector(selector);
    assertBrowser(control, `${selector} public range control is missing`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    nudgeBrowserRangeControl(control);
    await waitForBrowserEvent(canvasElement, 'change', family);
  };
}

function waitForBrowserSelected(item, family, timeout = 2_000) {
  const deadline = Date.now() + timeout;
  return new Promise((resolvePromise, reject) => {
    const check = () => {
      if (item.getAttribute('aria-selected') === 'true') return resolvePromise();
      if (Date.now() >= deadline) return reject(new Error(`${family} selection state did not update`));
      return setTimeout(check, 20);
    };
    check();
  });
}

// The proof harness wires onAction, so React Aria treats Enter or a press on an
// empty selection as the item action. Space then starts the selection, and a
// press with a selection present replaces or extends it. Enter, unlike a Tree
// row click, leaves expansion alone.
function collectionSelectionPlan(family, selector) {
  const pressKey = (item, key, code) => {
    for (const type of ['keydown', 'keyup']) item.dispatchEvent(new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true }));
  };
  return async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, `.muxui-${familySlug(family)}`, family);
    const [first, second] = root.querySelectorAll(selector);
    assertBrowser(first && second, `${selector} collection needs two items`);
    first.focus();
    pressKey(first, 'Enter', 'Enter');
    await waitForBrowserEvent(canvasElement, 'action', family);
    assertBrowser(first.getAttribute('aria-selected') !== 'true', `${family} action must not select`);
    pressKey(first, ' ', 'Space');
    await waitForBrowserEvent(canvasElement, 'selectionChange', family);
    await waitForBrowserSelected(first, family);
    second.click();
    await waitForBrowserSelected(second, family);
  };
}

async function dialogBrowserProof({ canvasElement }) {
  const family = 'Dialog';
  const trigger = browserProofElement(canvasElement, '.muxui-dialog-trigger, .muxui-button', family);
  trigger.focus();
  trigger.click();
  await waitForBrowserEvent(canvasElement, 'openChange', family);
  const dialog = await waitForBrowserElement('.muxui-dialog', document, 2_000);
  assertBrowser(browserElementVisible(dialog), 'dialog portal is visible after activation');
  await waitForBrowserFocusWithin(dialog);
  const close = dialog.querySelector('.muxui-dialog-close');
  assertBrowser(close, 'dialog close control is missing');
  close.click();
  await waitForBrowserElementGone('.muxui-dialog-backdrop');
  await waitForBrowserFocus(trigger);
}

async function popoverBrowserProof({ canvasElement }) {
  const family = 'Popover';
  const trigger = browserProofElement(canvasElement, '.muxui-overlay-pop-trigger, .muxui-button', family);
  trigger.click();
  await waitForBrowserEvent(canvasElement, 'openChange', family);
  const popover = await waitForVisibleBrowserElement('.muxui-popover', family);
  const bounds = popover.getBoundingClientRect();
  assertBrowser(bounds.width > 0 && bounds.height > 0, 'popover has measurable geometry');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

async function timedOverlayBrowserProof({ canvasElement, family }) {
  const trigger = browserProofElement(canvasElement, 'button, [role="button"]', family);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true }));
  trigger.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse', isPrimary: true }));
  trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  trigger.focus();
  await waitForVisibleBrowserElement(family === 'Tooltip' ? '.muxui-tooltip' : '.muxui-preview-trigger', family);
  await waitForBrowserEvent(canvasElement, 'openChange', family);
  trigger.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true, pointerType: 'mouse' }));
}

async function toastBrowserProof({ canvasElement }) {
  const family = 'Toast';
  const toast = await waitForVisibleBrowserElement('.muxui-toast', family);
  const dismiss = toast.querySelector('.muxui-toast-dismiss');
  assertBrowser(dismiss, 'toast dismiss control is missing');
  dismiss.click();
  await waitForBrowserEvent(canvasElement, 'dismiss', family);
}

const BROWSER_PROOF_PLANS = {
  Button: activationPlan('Button', '.muxui-button'),
  Breadcrumbs: activationPlan('Breadcrumbs', '.muxui-breadcrumbs-link', 'navigate'),
  Checkbox: activationPlan('Checkbox', '.muxui-checkbox input', 'change'),
  Disclosure: activationPlan('Disclosure', '.muxui-disclosure-trigger', 'expandedChange'),
  DisclosureGroup: activationPlan('DisclosureGroup', '.muxui-disclosure-trigger', 'expandedChange'),
  Group: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-group', 'Group');
    assertBrowser(root.getAttribute('role') === 'group', 'group exposes its declared role');
    assertBrowser(root.getAttribute('aria-label')?.trim(), 'group exposes an accessible name');
    const controls = root.querySelectorAll('button, [role="button"]');
    assertBrowser(controls.length === 3, 'group content includes three related actionable controls');
    assertBrowser(
      [...controls].map((control) => control.textContent?.trim()).join('|') === 'Save|Duplicate|Archive',
      'group content preserves the document action labels',
    );
  },
  Link: activationPlan('Link', '.muxui-link', 'activate'),
  Meter: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-meter', 'Meter');
    assertBrowser(root.getAttribute('role') === 'meter', 'meter role');
    assertBrowser(Number(root.getAttribute('aria-valuenow')) >= 0, 'meter exposes a numeric value');
    assertBrowser(root.querySelector('.muxui-meter-fill')?.style.inlineSize?.endsWith('%'), 'meter fill exposes a proportional geometry');
  },
  ProgressBar: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-progress-bar', 'ProgressBar');
    assertBrowser(root.getAttribute('role') === 'progressbar', 'progress bar role');
    assertBrowser(root.querySelector('.muxui-progress-bar-track'), 'progress bar track');
    assertBrowser(root.querySelector('.muxui-progress-bar-fill'), 'progress bar fill');
    assertBrowser(root.getAttribute('aria-valuenow') !== null, 'progress bar exposes its current value');
  },
  Separator: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-separator', 'Separator');
    assertBrowser(root.getAttribute('role') === 'separator', 'separator role');
    assertBrowser(root.getAttribute('aria-orientation') === 'horizontal' || root.classList.contains('muxui-separator-horizontal'), 'separator orientation');
  },
  ToggleButton: activationPlan('ToggleButton', '.muxui-toggle-button', 'change'),
  Autocomplete: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-autocomplete', 'Autocomplete');
    const input = root.querySelector('input');
    assertBrowser(input, 'autocomplete input');
    input.focus();
    const list = await waitForVisibleBrowserElement('.muxui-autocomplete-list', 'Autocomplete');
    const option = list.querySelector('.muxui-autocomplete-option');
    assertBrowser(option, 'autocomplete option');
    option.click();
    await waitForBrowserEvent(canvasElement, 'change', 'Autocomplete');
    assertBrowser(input.value.length > 0, 'autocomplete selection populates the input');
  },
  CheckboxGroup: activationPlan('CheckboxGroup', '.muxui-checkbox input', 'change'),
  DateField: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-date-field', 'DateField');
    const segment = root.querySelector('[data-type="day"], .muxui-date-segment');
    assertBrowser(segment, 'date segment');
    segment.focus();
    segment.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', bubbles: true }));
    await waitForBrowserEvent(canvasElement, 'change', 'DateField');
  },
  DatePicker: async ({ canvasElement }) => {
    const trigger = browserProofElement(canvasElement, '.muxui-date-trigger', 'DatePicker');
    trigger.click();
    await waitForBrowserEvent(canvasElement, 'openChange', 'DatePicker');
    const popover = await waitForVisibleBrowserElement('.muxui-date-popover', 'DatePicker');
    assertBrowser(popover.querySelector('.muxui-calendar-cell'), 'date picker calendar cells');
  },
  DateRangePicker: async ({ canvasElement }) => {
    const trigger = browserProofElement(canvasElement, '.muxui-date-trigger', 'DateRangePicker');
    trigger.click();
    await waitForBrowserEvent(canvasElement, 'openChange', 'DateRangePicker');
    const popover = await waitForVisibleBrowserElement('.muxui-date-popover', 'DateRangePicker');
    assertBrowser(popover.querySelector('.muxui-range-calendar-cell'), 'date range calendar cells');
  },
  Form: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-form', 'Form');
    const submit = root.querySelector('button[type="submit"]');
    assertBrowser(submit, 'form submit control');
    root.addEventListener('submit', (event) => event.preventDefault(), { once: true, capture: true });
    submit.click();
    await waitForBrowserEvent(canvasElement, 'submit', 'Form');
  },
  NumberField: activationPlan('NumberField', '.muxui-number-stepper-increment', 'change'),
  SearchField: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-search-field', 'SearchField');
    const input = root.querySelector('input');
    assertBrowser(input, 'search input');
    setBrowserInputValue(input, 'proof');
    await waitForBrowserEvent(canvasElement, 'change', 'SearchField');
    const clear = root.querySelector('.muxui-search-clear');
    assertBrowser(clear, 'search clear control');
    clear.click();
    await waitForBrowserEvent(canvasElement, 'clear', 'SearchField');
    assertBrowser(input.value === '', 'clear interaction empties the search field');
  },
  Switch: activationPlan('Switch', '.muxui-switch input[type="checkbox"]', 'change'),
  TextField: inputChangePlan('TextField', 'input', 'proof'),
  TimeField: async ({ canvasElement }) => {
    assertBrowser(browserProofElement(canvasElement, '.muxui-time-field', 'TimeField').querySelector('[data-type="hour"]'), 'time segment');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1500));
    await repeatBrowserInteractionUntilEvent(canvasElement, 'change', 'TimeField', () => {
      return new Promise((resolvePromise) => setTimeout(() => {
        const root = browserProofElement(canvasElement, '.muxui-time-field', 'TimeField');
        const segment = root.querySelector('[data-type="hour"]');
        assertBrowser(segment, 'time segment');
        segment.focus();
        segment.textContent = '10';
        segment.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: '10' }));
        segment.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '10' }));
        segment.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
        segment.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        resolvePromise();
      }, 0));
    });
  },
  Calendar: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-calendar', 'Calendar');
    const cell = root.querySelector('[data-type="day"]:not([aria-disabled="true"]):not([data-selected="true"]), .muxui-calendar-cell:not([aria-disabled="true"])');
    assertBrowser(cell, 'calendar day cell');
    cell.click();
    await waitForBrowserEvent(canvasElement, 'change', 'Calendar');
  },
  ColorArea: async ({ canvasElement }) => {
    const target = browserProofElement(canvasElement, '.muxui-color-area', 'ColorArea');
    activateBrowserColorTarget(target);
    await waitForBrowserEvent(canvasElement, 'change', 'ColorArea');
  },
  ColorField: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-color-field', 'ColorField');
    const input = root.querySelector('input');
    assertBrowser(input, 'color field input');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1500));
    await repeatBrowserInteractionUntilEvent(canvasElement, 'change', 'ColorField', () => nudgeBrowserColorField(input));
  },
  ColorPicker: async ({ canvasElement }) => {
    const target = browserProofElement(canvasElement, '.muxui-color-picker .muxui-color-area', 'ColorPicker');
    activateBrowserColorTarget(target);
    await waitForBrowserEvent(canvasElement, 'change', 'ColorPicker');
  },
  ColorSlider: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-color-slider', 'ColorSlider');
    const track = root.querySelector('.muxui-color-slider-track');
    assertBrowser(track, 'color slider track');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    activateBrowserColorTarget(track);
    await waitForBrowserEvent(canvasElement, 'change', 'ColorSlider');
  },
  ColorSwatch: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-color-swatch', 'ColorSwatch');
    const bounds = root.getBoundingClientRect();
    assertBrowser(bounds.width > 0 && bounds.height > 0, 'color swatch has measurable geometry');
    assertBrowser(root.getAttribute('data-color') || getComputedStyle(root).backgroundColor !== '', 'color swatch exposes a color presentation');
  },
  ColorSwatchPicker: activationPlan('ColorSwatchPicker', '.muxui-color-swatch-picker-item', 'change'),
  ColorWheel: async ({ canvasElement }) => {
    const control = browserProofElement(canvasElement, '.muxui-color-wheel [role="slider"], .muxui-color-wheel input[type="range"]', 'ColorWheel');
    nudgeBrowserRangeControl(control);
    await waitForBrowserEvent(canvasElement, 'change', 'ColorWheel');
  },
  ComboBox: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-combo-box', 'ComboBox');
    const input = root.querySelector('input');
    assertBrowser(input, 'combo box input');
    const trigger = root.querySelector('.muxui-combo-box-trigger');
    assertBrowser(trigger, 'combo box options trigger');
    trigger.click();
    const option = await waitForVisibleBrowserElement('.muxui-combo-box-option', 'ComboBox');
    assertBrowser(option, 'combo box option');
    option.click();
    await waitForBrowserEvent(canvasElement, 'select', 'ComboBox');
    assertBrowser(input.value.length > 0, 'combo box selection populates the input');
  },
  GridList: collectionSelectionPlan('GridList', '.muxui-grid-list-item'),
  ListBox: collectionSelectionPlan('ListBox', '.muxui-list-box-item'),
  Menu: activationPlan('Menu', '.muxui-menu-item', 'action'),
  RadioGroup: activationPlan('RadioGroup', '.muxui-radio', 'change'),
  RangeCalendar: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-range-calendar', 'RangeCalendar');
    const cells = [...root.querySelectorAll('.muxui-range-calendar-cell:not([aria-disabled="true"]):not([data-selected="true"])')];
    assertBrowser(cells.length >= 2, 'range calendar has two unselected day cells');
    cells[0].click();
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    cells[1].click();
    await waitForBrowserEvent(canvasElement, 'change', 'RangeCalendar');
  },
  Select: async ({ canvasElement }) => {
    const trigger = browserProofElement(canvasElement, '.muxui-select-trigger', 'Select');
    trigger.click();
    await waitForBrowserEvent(canvasElement, 'openChange', 'Select');
    const popover = await waitForVisibleBrowserElement('.muxui-select-popover', 'Select');
    assertBrowser(popover.querySelector('.muxui-select-option'), 'select options');
  },
  Slider: rangeChangePlan('Slider', '[role="slider"], input[type="range"]'),
  Table: activationPlan('Table', '.muxui-table-row', 'rowAction'),
  Tabs: activationPlan('Tabs', '.muxui-tab:nth-of-type(2)', 'change'),
  TagGroup: activationPlan('TagGroup', '.muxui-tag-remove', 'remove'),
  ToggleButtonGroup: activationPlan('ToggleButtonGroup', '.muxui-toggle-button', 'selectionChange'),
  TokenField: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-token-field', 'TokenField');
    const input = root.querySelector('.muxui-token-input[contenteditable="true"]');
    assertBrowser(input, 'token field input');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    input.focus();
    const edit = (inputType, data) => {
      const range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType, data }));
    };
    edit('insertText', 'Review');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    assertBrowser(input.textContent.endsWith('Review'), 'token field keeps typed text');
    // Typed text is a draft; Enter turns it into a token and reports the change.
    edit('insertParagraph');
    await waitForBrowserEvent(canvasElement, 'change', 'TokenField');
    assertBrowser([...root.querySelectorAll('.muxui-token')].some((token) => token.textContent === 'Review'), 'Enter turns the draft into a token');
  },
  Toolbar: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-toolbar', 'Toolbar');
    assertBrowser(root.getAttribute('role') === 'toolbar', 'toolbar role');
    assertBrowser(root.querySelector('button, [role="button"]'), 'toolbar control');
  },
  Tree: collectionSelectionPlan('Tree', '.muxui-tree-item'),
  Virtualizer: async ({ canvasElement }) => {
    const virtualizer = browserProofElement(canvasElement, '.muxui-virtualizer', 'Virtualizer');
    const item = virtualizer.querySelector('.muxui-virtualizer-item');
    assertBrowser(item, 'virtualizer item');
    virtualizer.scrollTop = 64;
    virtualizer.dispatchEvent(new Event('scroll', { bubbles: true }));
    await waitForBrowserEvent(canvasElement, 'scroll', 'Virtualizer');
    item.focus();
    assertBrowser(virtualizer.scrollHeight >= virtualizer.clientHeight, 'virtualizer exposes a scrollable viewport');
  },
  DropZone: async ({ canvasElement }) => {
    const target = browserProofElement(canvasElement, '.muxui-drop-zone', 'DropZone');
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(['proof'], 'proof.txt', { type: 'text/plain' }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    await waitForBrowserEvent(canvasElement, 'drop', 'DropZone');
  },
  FileTrigger: async ({ canvasElement }) => {
    const input = browserProofElement(canvasElement, 'input[type="file"]', 'FileTrigger');
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(['proof'], 'proof.txt', { type: 'text/plain' }));
    Object.defineProperty(input, 'files', { configurable: true, value: dataTransfer.files });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForBrowserEvent(canvasElement, 'select', 'FileTrigger');
  },
  Dialog: dialogBrowserProof,
  Popover: popoverBrowserProof,
  PreviewTrigger: timedOverlayBrowserProof,
  Toast: toastBrowserProof,
  Tooltip: timedOverlayBrowserProof,
};

const HISTORICAL_BROWSER_PROOF_PLAN_NAMES = Object.freeze(Object.keys(BROWSER_PROOF_PLANS));
BROWSER_PROOF_PLANS.IconButton = activationPlan('IconButton', '.muxui-icon-button');
const R16_BROWSER_PROOF_ROOTS = Object.freeze({
  AlertDialog: '.muxui-alert-dialog__trigger',
  Avatar: '.muxui-avatar',
  ButtonGroup: '.muxui-button-group button',
  Card: '.muxui-card',
  CodeBlock: '.muxui-code-block-copy',
  PromptComposer: '.muxui-prompt-composer-input',
  Message: '.muxui-message-sources-trigger',
  Activity: '.muxui-activity-trigger',
  DataDiff: '.muxui-data-diff input[type="checkbox"]',
  CheckboxField: '.muxui-checkbox-field__button',
  ColorModeToggle: '.muxui-color-mode-toggle',
  CommandPalette: '.muxui-command-palette__trigger',
  HeaderNav: '.muxui-header-nav__mobile-trigger',
  Image: '.muxui-image',
  InputTags: '.muxui-input-tags input',
  Input: '.muxui-input',
  Lightbox: '.muxui-lightbox-trigger',
  Markdown: '.muxui-markdown',
  MultiSelect: '.muxui-multi-select__trigger',
  PaymentInput: '.muxui-payment-input__input',
  ProgressCircle: '.muxui-progress-circle',
  RadioField: '.muxui-radio-field .muxui-radio',
  Resizable: '.muxui-resizable-handle',
  SelectNative: '.muxui-select-native',
  Sidebar: '.muxui-sidebar__mobile-menu-btn',
  SwitchField: '.muxui-switch-field__button',
  TagSelect: '.muxui-tag-select__input',
  Text: '.muxui-text',
  TextArea: '.muxui-text-area__textarea',
  TextEditor: '.muxui-text-editor__btn',
});
for (const [family, selector] of Object.entries(R16_BROWSER_PROOF_ROOTS)) {
  BROWSER_PROOF_PLANS[family] = async ({ canvasElement }) => {
    const target = browserProofElement(canvasElement, selector, family);
    target.focus?.();
    if (target.matches?.('button, a, input, textarea, [role="button"]')) target.click?.();
    assertBrowser(target.isConnected, `${family} public proof target remains connected after interaction`);
  };
}

export const HISTORICAL_BROWSER_PROOF_FAMILIES = Object.freeze(HISTORICAL_BROWSER_PROOF_PLAN_NAMES);
export const BROWSER_PROOF_FAMILIES = Object.freeze(Object.keys(BROWSER_PROOF_PLANS));

async function runBrowserProof(family, canvasElement) {
  const plan = BROWSER_PROOF_PLANS[family];
  if (!plan) throw new Error(`No substantive Browser Proof plan is registered for ${family}`);
  await plan({ canvasElement, family });
  canvasElement.setAttribute('data-muxui-browser-proof-status', 'passed');
}

export function createEventsStory(record) {
  const renderEvents = (args, heading = 'Live event log') => {
    const content = e(EventHarness, { record, args, heading, children: (eventArgs) => renderFamily(record.family, eventArgs) });
    return record.family === 'Toast' ? e(MuxUI.ToastProvider, null, content) : content;
  };
  return {
    name: 'Events',
    args: storyArgsForBinding(record.binding, 'default', record.family),
    argTypes: argTypesForBinding(record.binding),
    render: (args) => renderEvents(args),
  };
}

export function createAnatomyStory(record) {
  return {
    name: 'Anatomy / Composition',
    args: storyArgsForBinding(record.binding, 'states', record.family),
    argTypes: argTypesForBinding(record.binding),
    render: (args) => e(AnatomyHarness, { record, args }),
  };
}

export function createControlledStory(record) {
  return {
    name: 'Controlled',
    args: controlledStoryArgsForBinding(record.binding, record.family),
    argTypes: argTypesForBinding(record.binding),
    render: (args) => e(ControlledHarness, { record, args }),
  };
}

export function createUncontrolledStory(record) {
  return {
    name: 'Uncontrolled',
    args: uncontrolledStoryArgsForBinding(record.binding, record.family),
    argTypes: argTypesForBinding(record.binding),
    render: (args) => e(UncontrolledHarness, { record, args }),
  };
}

export function createBrowserProofStory(record) {
  const renderProof = (args) => {
    const content = e(EventHarness, { record, args, heading: 'Browser interaction proof', children: (eventArgs) => renderFamily(record.family, eventArgs) });
    return record.family === 'Toast' ? e(MuxUI.ToastProvider, null, content) : content;
  };
  return {
    name: 'Browser proof',
    args: storyArgsForBinding(record.binding, 'default', record.family),
    argTypes: argTypesForBinding(record.binding),
    parameters: {
      muxuiProof: {
        browser: true,
        events: record.binding.api.events,
        notes: 'Playwright proof covers the family-specific DOM, focus, geometry, timing, or native input contract.',
      },
    },
    render: renderProof,
    play: async ({ canvasElement }) => {
      try {
        await runBrowserProof(record.family, canvasElement);
      } catch (error) {
        canvasElement.setAttribute('data-muxui-browser-proof-status', 'failed');
        canvasElement.setAttribute('data-muxui-browser-proof-error', error instanceof Error ? error.message : String(error));
        throw error;
      }
    },
  };
}

const BUTTON_MATRIX_VARIANTS = Object.freeze(['primary', 'neutral', 'ghost', 'danger', 'danger-neutral', 'danger-ghost', 'inverse']);
const BUTTON_MATRIX_SIZES = Object.freeze(['sm', 'md', 'lg']);

/** Render every adopted Button axis combination in one compact inspection story. */
export function createButtonMatrixStory(record) {
  if (record.family !== 'Button') throw new TypeError('Button matrix stories require the Button family');
  return {
    name: 'Variant × size',
    args: {},
    argTypes: argTypesForBinding(record.binding),
    parameters: {
      controls: { disable: true },
      muxuiButtonMatrix: { combinations: 21 },
    },
    render: (args = {}) => e(
      'div',
      {
        className: 'muxui-button-matrix',
        role: 'group',
        'aria-label': 'Button variant and size combinations',
        style: { display: 'grid', gap: '1.5rem' },
      },
      ...BUTTON_MATRIX_SIZES.map((size) => e(
        'section',
        {
          key: size,
          'aria-label': `${size} button size`,
          style: { display: 'grid', gap: '0.5rem' },
        },
        e('h3', {
          style: {
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            margin: 0,
            textTransform: 'uppercase',
          },
        }, size),
        e(
          'div',
          { style: { display: 'flex', flexWrap: 'wrap', gap: '1rem' } },
          ...BUTTON_MATRIX_VARIANTS.map((variant) => e(
            'div',
            { key: variant, style: { display: 'grid', gap: '0.25rem' } },
            e('span', { style: { fontFamily: 'monospace', fontSize: '0.75rem' } }, variant),
            e(MuxUI.Button, { ...args, variant, size }, 'Action'),
          )),
        ),
      )),
    ),
  };
}

/** `category` is the navigation group label; the generator reads it from the canonical record, which browser code cannot. */
export function createStoryMeta(record, category) {
  const component = MuxUI[record.family];
  if (!component) throw new Error(`Missing @muxui/react export for ${record.family}`);
  return {
    title: `Mux UI React/${category}/${record.family}`,
    component,
    tags: ['autodocs'],
    parameters: {
      docs: {
        description: {
          component: `Private development showcase for the Mux UI-owned ${record.family} family.`,
        },
      },
      muxuiApi: {
        props: record.binding.api.props,
        events: record.binding.api.events,
        parts: record.binding.api.parts,
        states: record.binding.states,
        controlled: controlledDefaultPairsForBinding(record.binding),
      },
    },
    argTypes: argTypesForBinding(record.binding),
  };
}

export function createStory(record, variant) {
  const render = (args) => {
    const content = variant === 'states'
      ? renderStateCoverage(record, args)
      : renderFamily(record.family, args);
    return record.family === 'Toast' ? e(MuxUI.ToastProvider, null, content) : content;
  };
  return {
    name: variant === 'states' ? 'States' : 'Default',
    args: storyArgsForBinding(record.binding, variant, record.family),
    argTypes: argTypesForBinding(record.binding),
    parameters: variant === 'states'
      ? { muxuiStateCoverage: stateCoverageForBinding(record.binding, record.family) }
      : undefined,
    render,
  };
}
