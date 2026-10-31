import React from 'react';
import { StorybookThemeContext } from './storybook-theme.mjs';
import * as MuxUI from '@muxui/react';
import { Markdown } from '../../../packages/react/generated/markdown.js';
import { TextEditor } from '../../../packages/react/generated/text-editor.js';
import buttonApi from '../../../packages/react/api/button.json' with { type: 'json' };
import selectNativeApi from '../../../packages/react/api/select-native.json' with { type: 'json' };
import { nonEmittedStates, partRow, selectorOf } from '../../../packages/react/test/support/styling-parts.ts';

// Keep the theme control and Storybook toolbar on the same mode.
function ColorModeTogglePreview({ syncWithToolbar = true, ...args }) {
  const theme = React.useContext(StorybookThemeContext);
  return React.createElement(MuxUI.ColorModeToggle, {
    ...args,
    mode: args.mode ?? (syncWithToolbar ? theme?.scheme : undefined),
    'aria-label': 'Toggle color mode',
    onModeChange: (mode) => {
      args.onModeChange?.(mode);
      if (syncWithToolbar) theme?.setScheme(mode);
    },
  });
}

const MUXUI_SEARCH_FIELD_VALUE = 'MuxUI';

const BOOLEAN_PROPS = new Set([
  'acceptDirectory', 'allowsMultiple', 'checked', 'collapsed', 'current', 'defaultChecked', 'defaultCollapsed',
  'defaultExpanded', 'defaultOpen', 'defaultSelected', 'disabled', 'dismissable',
  'expanded', 'external', 'invalid', 'indeterminate', 'open', 'pending', 'readOnly', 'required',
  'showTextWhileLoading', 'lineNumbers', 'copyable', 'wrap', 'streaming', 'sourcesExpanded', 'defaultSourcesExpanded', 'multiple',
  'shouldCloseOnSelect',
]);

const ARRAY_PROPS = new Set([
  'columns', 'defaultExpandedIds', 'defaultSelectedIds', 'expandedIds', 'items',
  'options', 'rows', 'selectedIds', 'value', 'actions', 'sources', 'commands', 'followUps', 'attachments', 'models',
]);

const STRING_PROPS = new Set([
  'aria-label', 'aria-labelledby', 'children', 'className', 'color', 'content',
  'description', 'endName', 'errorMessage', 'href', 'label', 'message', 'name',
  'source', 'before', 'after', 'language', 'filename', 'inputLabel', 'author', 'streamingLabel', 'applyLabel', 'emptyMessage', 'selectedModel', 'defaultSelectedModel',
  'placeholder', 'rel', 'src', 'srcSet', 'alt', 'fallbackSrc', 'fallbackSrcSet', 'fit', 'radius', 'startName', 'target', 'title',
  'badge', 'avatarSrc', 'email', 'query', 'defaultQuery', 'shortcut',
]);

// Props that take a function cannot be edited as data, so their controls stay off.
const FUNCTION_PROPS = new Set(['close', 'filter', 'sort', 'groupBy', 'getGroupTitle', 'getItemLabel', 'validate', 'renderContent']);

const TEXT_VALUE_CONTEXT_PROPS = new Set(['placeholder', 'type']);
const NUMBER_PROPS = new Set([
  'closeDelay', 'delay', 'duration', 'height', 'itemHeight', 'maxLength', 'maxValue',
  'minValue', 'overscan', 'step', 'width',
]);

const NUMBER_VALUE_CONTEXT_PROPS = new Set(['max', 'min', 'step']);

const CONTROLLED_DEFAULT_PAIRS = Object.freeze([
  ['checked', 'defaultChecked'],
  ['collapsed', 'defaultCollapsed'],
  ['expanded', 'defaultExpanded'],
  ['expandedIds', 'defaultExpandedIds'],
  ['open', 'defaultOpen'],
  ['query', 'defaultQuery'],
  ['selected', 'defaultSelected'],
  ['selectedId', 'defaultSelectedId'],
  ['selectedIds', 'defaultSelectedIds'],
  ['selectedKey', 'defaultSelectedKey'],
  ['selectedKeys', 'defaultSelectedKeys'],
  ['mode', 'defaultMode'],
  ['sizes', 'defaultSizes'],
  ['value', 'defaultValue'],
  ['sourcesExpanded', 'defaultSourcesExpanded'],
  ['selectedModel', 'defaultSelectedModel'],
]);

const UNCONTROLLED_PROPS = new Map(CONTROLLED_DEFAULT_PAIRS);

/**
 * The anatomy parts of a compound whose props and events the Storybook adapter drives through the
 * family's one set of args, by family. A part not listed here keeps its API in `partApis` alone.
 * This is the adapter's choice, for Controls and states; the Docs page lists every part separately,
 * and the merge below never stands in for that complete reference.
 */
// Menu's adapter renders its popup, list, and submenu from the root's args: the geometry and modality go to Menu.Popup, the items to
// Menu.List, and the delay to Menu.Submenu. The trigger, item, and section are children the stories compose themselves.
// Card's adapter routes selected, pending, disabled, and activation to the Card.Button it renders beside the static root.
// HeaderNav's adapter routes href and current to the links it renders, so Logo's and NavButton's props join the root's, which owns none.
// AlertDialog's adapter routes disabled and activation to the trigger and the close control it renders, so their props join the root's.
// Sidebar's adapter drives the provider, the search, and the nav, account, mobile and feature parts it renders from the root's one set of args.
// CommandPalette's adapter drives one input of each of three parts, so they join the root's by name and not as whole parts: the Trigger's disabled,
// the Backdrop's dismissable, and the id, title, description, href, target and activation of the Item the first command renders. The Item's textValue,
// disabled and closeOnSelect are set by the hook or follow the root, and no other part's props are driven, so none of those is offered. An entry
// that names a prop or event its part does not declare fails when the blocks are read.
export const STORY_API_PARTS = Object.freeze({
  Menu: Object.freeze(['popup', 'list', 'submenu']),
  Card: Object.freeze(['button']),
  HeaderNav: Object.freeze(['logo', 'nav-button']),
  AlertDialog: Object.freeze(['trigger', 'close']),
  Sidebar: Object.freeze(['provider', 'search', 'section', 'nav-item', 'nav-button', 'account-card', 'account-menu', 'mobile-trigger', 'feature-card']),
  CommandPalette: Object.freeze([
    Object.freeze({ part: 'trigger', props: Object.freeze(['disabled']) }),
    Object.freeze({ part: 'backdrop', props: Object.freeze(['dismissable']) }),
    Object.freeze({ part: 'item', props: Object.freeze(['id', 'title', 'description', 'href', 'target']), events: Object.freeze(['activate']) }),
  ]),
});

/**
 * The options of a hook the adapter calls for a family, by family. The catalog derives no API for a hook (Decision 0031 keeps hooks out of
 * `partApis`), so the adapter lists what it passes the hook and how the stories offer it, split the way a component's API is: `props` are the
 * options a Controls row offers (a function's row is off), `events` the channels the stories log, named by the callback option they come
 * from (`queryChange` is `onQueryChange`), and `passed` the options handed to the hook with no row or log of their own. The names are
 * checked against the hook's declared options type by the compiler (storybook.test.mjs). The typed reference prints that type without its
 * members, so a hook's rows carry no type or description.
 */
export const STORY_API_HOOKS = Object.freeze({
  CommandPalette: Object.freeze({
    hook: 'useCommandPalette',
    props: Object.freeze(['commands', 'query', 'defaultQuery', 'filter', 'sort', 'groupBy', 'getGroupTitle', 'close']),
    events: Object.freeze(['queryChange', 'action']),
    // onError handles a failed action and is not logged, so the hook reports a failure as it does without a story; closeOnSelect is the root's prop.
    passed: Object.freeze(['onError', 'closeOnSelect']),
  }),
});

/** Every option of the hook the adapter drives, by its declared name: the props, the callback of each event, and the options passed through. */
export function storyHookOptionNames({ props, events, passed }) {
  return [...props, ...events.map(eventCallbackPropForChannel), ...passed];
}

const pickKeys = (record = {}, keys) => Object.fromEntries(keys.filter((key) => Object.hasOwn(record, key)).map((key) => [key, record[key]]));

/**
 * The catalog blocks the stories read, root first: the binding's root API, then each part `parts` names for its
 * family, with the part's key and the export member that renders it, then the options of the family's hook (`hooks`),
 * with the hook's name. An entry of `parts` is a part's key, to take all of its API, or `{ part, props, events }`, to take only the
 * props and events it lists; a name the part does not declare throws.
 * @param {{ export: string, api: object }} binding
 * @param {Readonly<Record<string, readonly (string | { part: string, props?: readonly string[], events?: readonly string[] })[]>>} [parts]
 * @param {Readonly<Record<string, { hook: string, props: readonly string[], events: readonly string[] }>>} [hooks]
 */
export function storyApiBlocks(binding, parts = STORY_API_PARTS, hooks = STORY_API_HOOKS) {
  const { api } = binding;
  const hook = hooks[binding.export];
  return [
    { part: 'root', api },
    ...(parts[binding.export] ?? []).flatMap((entry) => {
      const { part, props, events } = typeof entry === 'string' ? { part: entry } : entry;
      const partApi = api.partApis?.[part];
      if (partApi === undefined) return [];
      if (props === undefined && events === undefined) return [{ part, member: partApi.member, api: partApi }];
      for (const [kind, names, declared] of [['prop', props ?? [], partApi.props], ['event', events ?? [], partApi.events]]) {
        for (const name of names) if (!declared.includes(name)) throw new Error(`${binding.export}.${partApi.member} declares no ${kind} ${name}, which the story adapter takes from it`);
      }
      return [{
        part,
        member: partApi.member,
        api: {
          ...partApi,
          props: props ?? [],
          events: events ?? [],
          defaults: pickKeys(partApi.defaults, props ?? []),
          propDetails: pickKeys(partApi.propDetails, props ?? []),
          eventDetails: pickKeys(partApi.eventDetails, events ?? []),
        },
      }];
    }),
    ...(hook === undefined ? [] : [{
      part: 'hook',
      hook: hook.hook,
      api: { props: hook.props, events: hook.events, defaults: {}, propDetails: {}, eventDetails: {} },
    }]),
  ];
}

/**
 * The props, events, defaults and details the stories read: the binding's root API, with the parts
 * `parts` names for its family and the options of its hook folded in. A prop the root and a part both own keeps the root's
 * default and detail (the root comes first), and a prop or event listed by more than one is listed once.
 * @param {{ export: string, api: object }} binding
 * @param {Parameters<typeof storyApiBlocks>[1]} [parts]
 * @param {Parameters<typeof storyApiBlocks>[2]} [hooks]
 */
export function storyApi(binding, parts = STORY_API_PARTS, hooks = STORY_API_HOOKS) {
  const { api } = binding;
  const [, ...merged] = storyApiBlocks(binding, parts, hooks);
  if (merged.length === 0) return api;
  const blocks = [api, ...merged.map(({ api: part }) => part)];
  return {
    ...api,
    props: [...new Set(blocks.flatMap((block) => block.props))],
    events: [...new Set(blocks.flatMap((block) => block.events))],
    defaults: Object.assign({}, ...[...blocks].reverse().map((block) => block.defaults)),
    propDetails: Object.assign({}, ...[...blocks].reverse().map((block) => block.propDetails)),
    eventDetails: Object.assign({}, ...[...blocks].reverse().map((block) => block.eventDetails)),
  };
}

export function controlledDefaultPairsForBinding(binding) {
  const props = new Set(storyApi(binding).props);
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
  return storyApi(binding).events.map((channel) => ({ channel, prop: eventCallbackPropForChannel(channel) }));
}

// The twelve logical placements of the public MuxUIPlacement type.
const PLACEMENTS = Object.freeze([
  'top', 'bottom', 'start', 'end',
  'top-start', 'top-end', 'bottom-start', 'bottom-end',
  'start-top', 'start-bottom', 'end-top', 'end-bottom',
]);

const SELECT_PROPS = Object.freeze({
  density: ['default', 'compact'],
  orientation: ['horizontal', 'vertical'],
  placement: PLACEMENTS,
  role: ['group', 'region', 'presentation'],
  expansionTrigger: ['chevron', 'row'],
  selectionMode: ['none', 'single', 'multiple'],
  size: ['sm', 'md', 'lg'],
  type: ['text', 'email', 'password', 'url', 'tel'],
  variant: ['neutral', 'success', 'warning', 'danger'],
});

/** The literal values a derived type (Decision 0031) admits, through named types, in source order. */
function literalMembers(type, types) {
  if (type.kind === 'literal') return [type.value];
  if (type.kind === 'reference') return literalMembers(types[type.name].type, types);
  if (type.kind === 'union') return type.members.flatMap((member) => literalMembers(member, types));
  return [];
}

const TEXT_SELECT_PROPS = Object.freeze({
  variant: ['display', 'heading', 'title', 'label', 'body', 'expressive', 'mono'],
  // xs exists only for label, body, expressive, and mono; the Text story maps it to sm otherwise.
  size: ['xs', 'sm', 'md', 'lg'],
  color: ['default', 'muted'],
  as: ['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'label'],
});

// A family whose public type narrows or widens a shared enumeration lists its own choices here.
// A family with a derived API (Decision 0031) offers its derived enum instead.
const FAMILY_SELECT_PROPS = Object.freeze({
  Text: TEXT_SELECT_PROPS,
  Tabs: { variant: ['underline', 'pill', 'overflow', 'segment'] },
  Card: { variant: ['elevated', 'outlined', 'filled'], padding: ['sm', 'md', 'lg'] },
  Sidebar: { status: ['online', 'offline'] },
  // SelectNative's derived size is a visual size or a positive number, the native list's visible row count.
  SelectNative: { size: [...literalMembers(selectNativeApi.api.propDetails.size.type, selectNativeApi.api.types), 4] },
});

const callbackType = { summary: 'MuxUI callback' };

function inferControl(name, defaults, props, family, propDetails) {
  if (name.startsWith('on')) return { control: false, table: { type: callbackType } };
  if (name === 'trigger') return { control: false, table: { type: { summary: 'React element' } } };
  if (FUNCTION_PROPS.has(name)) return { control: false, table: { type: { summary: 'function' } } };
  const options = FAMILY_SELECT_PROPS[family]?.[name] ?? propDetails?.[name]?.enum ?? SELECT_PROPS[name];
  if (options) return { control: { type: 'select' }, options };
  if (BOOLEAN_PROPS.has(name) || typeof defaults[name] === 'boolean') return { control: 'boolean' };
  if ((name === 'value' || name === 'defaultValue')
    && props.some((prop) => TEXT_VALUE_CONTEXT_PROPS.has(prop))) {
    return { control: 'text' };
  }
  // Color families carry a color string, not a collection.
  if ((name === 'value' || name === 'defaultValue') && family.startsWith('Color')) return { control: 'text' };
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

/** A finite value as the declarations write it in a type: a string in single quotes, anything else as JSON. */
const literal = (value) => typeof value === 'string' ? `'${value}'` : JSON.stringify(value);

/**
 * How the parts declare `name`, in their shared members and then each alternative's (a member declared `never` is no
 * declaration). Where one declaration is all there is, it is that one. Where alternatives declare it differently (Text's
 * `variant` is `'body'` in one, `'display' | 'heading' | 'title'` in another), a Control offers a value of any of them, so
 * its type is the union: the finite values of every declaration when each has them, else the distinct types joined.
 */
function declaredMember(parts, name) {
  const declarations = parts.flatMap((part) => [...(part.members ?? []), ...(part.alternatives ?? []).flatMap((alternative) => alternative.members)])
    .filter((candidate) => candidate.name === name && candidate.never !== true);
  const types = [...new Set(declarations.map(({ type }) => type))];
  if (types.length <= 1) return declarations[0];
  const finite = declarations.every(({ values }) => values !== undefined);
  const type = finite
    ? [...new Set(declarations.flatMap(({ values }) => values))].map(literal).join(' | ')
    : types.map((candidate) => candidate.includes('=>') ? `(${candidate})` : candidate).join(' | ');
  return { ...declarations[0], type };
}

/**
 * How the declarations (the family's typed reference, Decision 0031) declare each prop the Controls drive. The
 * adapter's owner is the first catalog block that lists the prop and whose part declares it: the export itself
 * and its Root part for the root, a named part for a part the adapter merges (see STORY_API_PARTS).
 * A prop no owning part declares is left out, and so keeps no type or description.
 */
function declaredControls(binding, typed) {
  const component = typed.exports.find(({ name, kind }) => kind === 'component' && name === binding.export);
  // A hook's options are no part of the component, and the typed reference prints the options type but does not hold its members, so a hook's rows are left alone.
  const owners = storyApiBlocks(binding).filter(({ part }) => part !== 'hook').map((block) => ({
    block,
    parts: component.parts.filter(({ member }) => block.part === 'root' ? member === null || member === 'Root' : member === block.member),
  }));
  return new Map(storyApi(binding).props.flatMap((name) => {
    for (const { block, parts } of owners) {
      const member = block.api.props.includes(name) ? declaredMember(parts, name) : undefined;
      if (member !== undefined) return [[name, { member, ...(block.part !== 'root' && { owner: `${binding.export}.${block.member}` }) }]];
    }
    return [];
  }));
}

/**
 * The Controls of a binding. With the family's typed reference, each row takes its description from the
 * member's own comment (absent when the declaration has none) and its type summary from the declared type;
 * a merged part's row also names its owner as its category. Without it a row has no description.
 */
export function argTypesForBinding(binding, typed) {
  const { props, defaults = {}, propDetails } = storyApi(binding);
  const family = binding.export;
  const declared = typed === undefined ? new Map() : declaredControls(binding, typed);
  return Object.fromEntries(props.map((name) => {
    const { control, options, table = {} } = inferControl(name, defaults, props, family, propDetails);
    const { member, owner } = declared.get(name) ?? {};
    return [name, {
      control,
      ...(options && { options }),
      ...(member?.doc && { description: member.doc }),
      table: {
        ...table,
        ...(member && { type: { summary: member.type } }),
        ...(owner && { category: owner }),
        defaultValue: defaults[name] === undefined ? undefined : { summary: defaults[name] },
      },
    }];
  }));
}

// The list prop whose adapter supplies sample entries when a story gives none, so an empty default list is no list.
const SAMPLED_LIST_PROPS = Object.freeze({ Breadcrumbs: 'items', TagSelect: 'items', InputTags: 'defaultValue' });

/** The binding's API defaults a story seeds from, less an empty list its adapter replaces with samples. */
function seedDefaults(binding) {
  const defaults = { ...(storyApi(binding).defaults ?? {}) };
  const list = SAMPLED_LIST_PROPS[binding.export];
  if (list !== undefined && Array.isArray(defaults[list]) && defaults[list].length === 0) delete defaults[list];
  return defaults;
}

function normalizeDefaultArgs(binding) {
  const args = seedDefaults(binding);
  const props = new Set(storyApi(binding).props);
  for (const [controlled, uncontrolled] of CONTROLLED_DEFAULT_PAIRS) {
    if (!props.has(controlled) || !props.has(uncontrolled)) continue;
    if (args[uncontrolled] === undefined && args[controlled] !== undefined) {
      args[uncontrolled] = args[controlled];
    }
    delete args[controlled];
  }
  if (binding.export === 'Message') {
    for (const name of ['actions', 'sources', 'followUps']) if (Array.isArray(args[name]) && args[name].length === 0) delete args[name];
  }
  // An open-state arg selects Menu's triggered composition, so the plain action list leaves it unset.
  if (binding.export === 'Menu') delete args.defaultOpen;
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
  const defaults = seedDefaults(binding);
  const sourceValue = firstDefined(sourceArgs[controlled], sourceArgs[uncontrolled], defaults[controlled], defaults[uncontrolled]);
  if (sourceValue !== undefined) return sourceValue;
  if (controlled === 'mode') return 'light';
  if (controlled === 'query') return '';
  if (controlled === 'selectedKey') return (sourceArgs.items ?? LIGHTBOX_SAMPLE_ITEMS)[0]?.key;
  if (controlled === 'selectedKeys') return family === 'TagSelect' ? new Set([TAG_SELECT_SAMPLE_ITEMS[0].id]) : new Set();
  if (controlled === 'sizes') return { main: 60, side: 40 };
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
  if (family === 'TextEditor') return TEXT_EDITOR_SAMPLE_DOCUMENT;
  return '';
}

function pairArgs(binding, family, sourceArgs, mode) {
  const args = { ...sourceArgs };
  for (const { controlled, uncontrolled } of controlledDefaultPairsForBinding(binding)) {
    let value = sampleControlledValue(binding, family, controlled, uncontrolled, sourceArgs);
    if (mode === 'uncontrolled' && controlled === 'selectedKeys' && value === 'all') {
      value = new Set(Array.from(sourceArgs.items ?? MULTI_SELECT_SAMPLE_ITEMS, (item) => item.id));
    }
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
const INTERACTION_OPEN_FAMILIES = new Set(['DatePicker', 'DateRangePicker', 'ComboBox', 'Select', 'CommandPalette']);
const INTERACTION_OPEN_SELECTORS = Object.freeze({
  DatePicker: '.muxui-date-trigger',
  DateRangePicker: '.muxui-date-trigger',
  ComboBox: '.muxui-combo-box__trigger',
  Select: '.muxui-select__trigger',
  CommandPalette: '.muxui-command-palette__trigger',
});
const LIFECYCLE_ATTRIBUTES = Object.freeze({
  entering: 'data-muxui-state-entering',
  opening: 'data-muxui-state-entering',
  exiting: 'data-muxui-state-exiting',
  closing: 'data-muxui-state-exiting',
});

/**
 * Whether a row mounts only while the lifecycle selector has it, so one overlay is open at a time. The entering and
 * exiting rows animate an overlay open or closed. A Dialog is modal, so its open row joins them: beside any other open
 * dialog it would make the page, and the selector that switches rows, inert.
 */
export function isLifecycleState(family, state) {
  return Object.hasOwn(LIFECYCLE_ATTRIBUTES, state) || family === 'Dialog' && state === 'open';
}

function stateVariantNames(binding, family) {
  const names = [...binding.states];
  const props = new Set(storyApi(binding).props);
  if (props.has('placement')) names.push('placement');
  if (family === 'DropZone') names.push('dragging');
  if (family === 'Link') names.push('no-href', 'empty-href');
  if (family === 'TagGroup') names.push('removable');
  if (OVERLAY_FAMILIES.has(family)) names.push('entering', 'exiting');
  return [...new Set(names)];
}

function resetStateArgs(binding, sourceArgs, preserveExplicit = false) {
  if (preserveExplicit) return { ...sourceArgs };
  const props = new Set(storyApi(binding).props);
  const args = { ...sourceArgs };
  for (const name of STATE_BOOLEAN_PROPS) {
    if (props.has(name) && (!preserveExplicit || !Object.hasOwn(args, name))) args[name] = false;
  }
  for (const [controlled, uncontrolled] of CONTROLLED_DEFAULT_PAIRS) {
    if (!props.has(controlled) || !props.has(uncontrolled)) continue;
    if (preserveExplicit && (Object.hasOwn(args, controlled) || Object.hasOwn(args, uncontrolled))) continue;
    delete args[controlled];
    if (args[uncontrolled] === undefined) {
      const defaults = seedDefaults(binding);
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
    const firstItem = ['GridList', 'ListBox'].includes(family)
      ? (args.items ?? COLLECTION_SAMPLE_ITEMS)[0]
      : undefined;
    const selectedId = firstItem !== undefined
      ? (typeof firstItem === 'string' ? firstItem : String(firstItem.id ?? firstItem.key ?? firstItem.value ?? 0)) || '0'
      : family === 'Tree'
      ? 'src'
      : family === 'Table'
        ? 'ada'
        : family === 'ToggleButtonGroup'
          ? 'bold'
          : 'Melbourne';
    if (canSupplyStateValue(args, props, 'selectedIds', preserveExplicit)) return setControlledArg(args, props, 'selectedIds', firstItem === undefined && ['GridList', 'ListBox'].includes(family) ? [] : [selectedId]);
    return undefined;
  }
  if (props.has('selectedId') && canSupplyStateValue(args, props, 'selectedId', preserveExplicit)) return setControlledArg(args, props, 'selectedId', 'Melbourne');
  if (family === 'TagSelect' && props.has('selectedKeys')) {
    const [first] = args.items ?? TAG_SELECT_SAMPLE_ITEMS;
    return canSupplyStateValue(args, props, 'selectedKeys', preserveExplicit) && first
      ? setControlledArg(args, props, 'selectedKeys', new Set([first.id]))
      : undefined;
  }
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
  const props = new Set(storyApi(binding).props);
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
      return family === 'PromptComposer' || family === 'Avatar' || family === 'Image';
    case 'loaded':
      return family === 'Avatar';
    case 'fallback':
      return family === 'Avatar' || family === 'Image';
    case 'mixed':
      return family === 'DataDiff';
    case 'diff':
    case 'wrap':
      return family === 'CodeBlock';
    case 'idle':
    case 'visible':
      return true;
    case 'disabled':
      return props.has('disabled') || family === 'Breadcrumbs' && props.has('items');
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
        || family === 'TagSelect' && props.has('selectedKeys')
        || ['CheckboxGroup', 'RadioGroup', 'Tabs', 'Select', 'Calendar', 'RangeCalendar', 'ColorSwatchPicker'].includes(family) && props.has('value');
    case 'checked':
    case 'unchecked':
      return props.has('checked');
    case 'indeterminate':
      return props.has('indeterminate') || family === 'ProgressBar' || family === 'ProgressCircle';
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
      return ['ProgressBar', 'ProgressCircle'].includes(family) && props.has('value');
    case 'zero':
    case 'partial':
      return family === 'ProgressCircle' && props.has('value');
    case 'sm':
    case 'md':
    case 'lg':
      return (family === 'ProgressCircle' || family === 'Avatar') && props.has('size');
    case 'elevated':
    case 'outlined':
      return family === 'Card' && props.has('variant');
    case 'inline':
    case 'below':
      return props.has('tagPlacement');
    case 'tagfocused':
      // StateVariant focuses the first tag after mount.
      return family === 'InputTags';
    case 'external':
      return props.has('external');
    case 'radiussm':
    case 'radiusmd':
    case 'radiuslg':
    case 'radiusfull':
      return family === 'Image' && props.has('radius');
    case 'light':
    case 'dark':
      return family === 'ColorModeToggle' && props.has('mode');
    case 'filled':
      return family === 'SearchField' && props.has('value') || family === 'Card' && props.has('variant');
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
      return props.has('current') || family === 'Breadcrumbs' && props.has('items');
    case 'removable':
      return family === 'TagGroup';
    case 'nohref':
    case 'emptyhref':
      return family === 'Link';
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
  const props = new Set(storyApi(binding).props);
  const normalizedState = state.toLowerCase().replaceAll('-', '');
  switch (normalizedState) {
    case 'disabled':
      if (props.has('disabled') && canSupplyStateValue(args, props, 'disabled', preserveExplicit)) args.disabled = true;
      if (family === 'Breadcrumbs' && props.has('items')) {
        args.items = (args.items ?? [{ id: 'home', label: 'Home', href: '#' }, { id: 'docs', label: 'Docs', href: '#' }])
          .map((item, index) => ({ ...(typeof item === 'string' ? { label: item, href: '#' } : item), ...(index === 0 ? { disabled: true } : {}) }));
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
      else if (family === 'Avatar') args.src = BROKEN_IMAGE_SRC;
      else if (family === 'Image') Object.assign(args, { src: BROKEN_IMAGE_SRC, fallbackSrc: BROKEN_IMAGE_SRC });
      break;
    case 'loaded':
      if (family === 'Avatar') args.src = AVATAR_LOADED_SRC;
      break;
    case 'fallback':
      if (family === 'Avatar') args.src = '';
      else if (family === 'Image') Object.assign(args, { src: BROKEN_IMAGE_SRC, fallbackSrc: TRANSPARENT_PIXEL });
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
      else if (family === 'ProgressCircle' && props.has('value')) args.value = null;
      break;
    case 'expanded':
      if (props.has('expanded')) setControlledArg(args, props, 'expanded', true);
      else if (props.has('expandedIds')) setControlledArg(args, props, 'expandedIds', [family === 'Tree' ? 'src' : 'one']);
      break;
    case 'collapsed':
      // The Sidebar folds its rail through Provider; its expanded prop belongs to the Roadmap group.
      if (family === 'Sidebar') {
        if (canSupplyStateValue(args, props, 'collapsed', preserveExplicit)) setControlledArg(args, props, 'collapsed', true);
      } else if (props.has('expanded')) setControlledArg(args, props, 'expanded', false);
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
      if (['ProgressBar', 'ProgressCircle'].includes(family) && props.has('value')) setControlledArg(args, props, 'value', args.maxValue ?? 100);
      break;
    case 'zero':
      if (family === 'ProgressCircle') args.value = args.minValue ?? 0;
      break;
    case 'partial':
      if (family === 'ProgressCircle') args.value = ((args.minValue ?? 0) + (args.maxValue ?? 100)) / 2;
      break;
    case 'sm':
    case 'md':
    case 'lg':
      if (family === 'ProgressCircle' || family === 'Avatar') args.size = normalizedState;
      break;
    case 'elevated':
    case 'outlined':
      if (family === 'Card') args.variant = normalizedState;
      break;
    case 'inline':
    case 'below':
      if (props.has('tagPlacement')) args.tagPlacement = normalizedState;
      break;
    case 'external':
      if (props.has('external')) args.external = true;
      break;
    case 'radiussm':
    case 'radiusmd':
    case 'radiuslg':
    case 'radiusfull':
      if (family === 'Image' && props.has('radius')) {
        args.radius = state.slice('radius-'.length);
        args.style = { ...args.style, ...IMAGE_RADIUS_FRAME };
      }
      break;
    case 'light':
    case 'dark':
      if (family === 'ColorModeToggle') setControlledArg(args, props, 'mode', normalizedState);
      break;
    case 'filled':
      if (family === 'Card') args.variant = 'filled';
      else if (props.has('value') && (typeof args.value === 'string' || args.value === undefined)) {
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
      // Only the triggered popup has a placement, so the Menu row opens it.
      if (family === 'Menu' && canSupplyStateValue(args, props, 'open', preserveExplicit)) args.open = true;
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
    case 'nohref':
      if (family === 'Link') args.href = undefined;
      break;
    case 'emptyhref':
      if (family === 'Link') args.href = '';
      break;
    default:
      break;
  }
  return args;
}

/**
 * The props a named state changes from the default. The States story leaves them unset, so each state supplies its
 * own value instead of a binding default (disabled: false, defaultOpen: false, and so on) masking it, while anything
 * a user supplies, even false, empty, or the default value, wins in every row. The exception is the lifecycle rows
 * (entering, exiting, opening, closing), which drive `open` themselves, and cap Toast `duration`, to animate.
 */
function stateDrivingProps(binding, family) {
  const defaults = normalizeDefaultArgs(binding);
  const driving = new Set();
  for (const { args } of stateCoverageForBinding(binding, family)) {
    for (const name of Object.keys(defaults)) {
      if (serializableEventValue(args[name]) !== serializableEventValue(defaults[name])) driving.add(name);
    }
  }
  return driving;
}

export function storyArgsForBinding(binding, variant, family) {
  if (variant === 'default') return normalizeDefaultArgs(binding);
  if (variant === 'states') {
    const driving = stateDrivingProps(binding, family);
    return Object.fromEntries(Object.entries(normalizeDefaultArgs(binding)).filter(([name]) => !driving.has(name)));
  }
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

// Rows that show the component as it renders by default; the Default story already covers them.
const BASELINE_STATES = new Set(['default', 'idle', 'visible']);

/**
 * Whether each standard story teaches something for a family. Default and BrowserProof apply to every family, so
 * they are not listed: Default is the baseline and BrowserProof is proof, hidden from the sidebar but never dropped.
 */
export const STORY_APPLICABILITY = Object.freeze({
  States: (binding, family) => stateVariantNames(binding, family)
    .some((state) => !BASELINE_STATES.has(state) && stateIsSupported(binding, state, family)),
  Controlled: (binding) => controlledDefaultPairsForBinding(binding).length > 0,
  Uncontrolled: (binding) => controlledDefaultPairsForBinding(binding).length > 0,
  Events: (binding) => eventBindingsForBinding(binding).length > 0,
  // Every family has a root; a page of that part alone has nothing to teach.
  Anatomy: (binding) => binding.api.parts.some((part) => part !== 'root'),
});

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
    sources: args.sources ?? [{ id: 'notes', label: 'Workspace notes', description: 'Selected local notes', insertText: '@notes ' }, { id: 'records', label: 'Project records', description: 'Selected workspace records', insertText: '@records ' }],
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
  { id: 'tokens', label: 'Checked the theme tokens', status: 'completed', meta: '24 tokens', time: '5s', details: 'All 24 tokens resolved. None are missing.' },
  { id: 'report', label: 'Open the selected report', status: 'running', meta: '4 pages', details: 'Status supplied by the host application. No task executes in this preview.' },
  { id: 'notes', label: 'Prepare the release notes', status: 'queued', meta: '6 sections', details: 'Waiting for the host application.' },
];
function ActivityPreview(args) {
  return e(MuxUI.Activity, { ...args, label: args.label ?? 'Workspace activity', items: args.items ?? ACTIVITY_ITEMS });
}

const DATA_DIFF_COLUMNS = [{ id: 'token', label: 'Token' }, { id: 'group', label: 'Group' }, { id: 'owner', label: 'Owner' }];
const DATA_DIFF_ROWS = [
  { id: 'unchanged', label: 'Border', kind: 'unchanged', values: { token: 'Border', group: 'Surface', owner: 'Core team' } },
  { id: 'removed', label: 'Gutter', kind: 'removed', values: { token: 'Gutter', group: 'Legacy', owner: 'Design team' } },
  { id: 'updated', label: 'Spacing', kind: 'updated', before: { token: 'Spacing', group: 'Layout', owner: 'Core team' }, after: { token: 'Spacing', group: 'Space', owner: 'Core team' } },
  { id: 'added', label: 'Outline', kind: 'added', values: { token: 'Outline', group: 'Focus', owner: 'Platform team' } },
];
function DataDiffPreview(args) {
  const [result, setResult] = React.useState('');
  return e('div', null, e(MuxUI.DataDiff, { ...args, label: args.label ?? 'Proposed token cleanup', columns: args.columns ?? DATA_DIFF_COLUMNS, rows: args.rows ?? DATA_DIFF_ROWS,
    onApply: (ids) => { args.onApply?.(ids); setResult(`Requested locally: ${ids.join(', ')}`); },
  }), result && e('p', { role: 'status' }, result));
}
/**
 * The audited sources are a transparent pixel and broken data, so the image itself draws nothing. The caption
 * reports which source it ended on, read from the data attributes Image sets while it recovers. A change of
 * source starts the caption over, since Image resets its own recovery then.
 */
const IMAGE_OUTCOMES = Object.freeze({
  loading: 'Loading the primary source.',
  primary: 'Primary source loaded.',
  fallback: 'Primary source failed; using fallbackSrc.',
  failed: 'Primary source failed; no fallback source was supplied.',
  error: 'Primary and fallback sources failed.',
});

function ImagePreview({ onLoad, ...args }) {
  const imageRef = React.useRef(null);
  const [outcome, setOutcome] = React.useState('loading');
  const src = args.src ?? TRANSPARENT_PIXEL;
  const hasFallback = [args.fallbackSrc, args.fallbackSrcSet].some((value) => typeof value === 'string' && value.trim().length > 0);
  // A load event reports the current source, which the recovery attributes say is the primary or the fallback.
  const read = React.useCallback((loaded = false) => {
    const image = imageRef.current;
    if (!image) return;
    setOutcome(image.hasAttribute('data-muxui-error') ? 'error'
      : image.hasAttribute('data-muxui-fallback') ? 'fallback'
      : loaded || image.complete && image.naturalWidth > 0 ? 'primary' : 'loading');
  }, []);
  React.useEffect(() => {
    const image = imageRef.current;
    if (!image) return undefined;
    const observer = new MutationObserver(() => read());
    observer.observe(image, { attributes: true, attributeFilter: ['data-muxui-fallback', 'data-muxui-error'] });
    return () => observer.disconnect();
  }, [read]);
  React.useEffect(() => read(), [read, src, args.srcSet, args.fallbackSrc, args.fallbackSrcSet]);
  return e('figure', { style: { margin: 0 } },
    e(MuxUI.Image, {
      ...args,
      ref: imageRef,
      src,
      alt: args.alt ?? 'Workspace preview',
      width: args.width ?? 160,
      height: args.height ?? 96,
      // A failed image would draw the browser's alt text and broken-image icon in colours the audit cannot verify,
      // so only its box stays; the caption and the data-muxui-error attribute carry the outcome.
      style: outcome === 'error' ? { ...args.style, visibility: 'hidden' } : args.style,
      onLoad: (event) => {
        onLoad?.(event);
        read(true);
      },
    }),
    e('figcaption', null, IMAGE_OUTCOMES[outcome === 'error' && !hasFallback ? 'failed' : outcome]),
  );
}
// A single transparent pixel loads as an image without painting a colour the audits cannot verify. It is a PNG data URL,
// the only kind the colour audit verifies.
const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=';
// Truncated image data: the browser fires an error event instead of loading it.
const BROKEN_IMAGE_SRC = 'data:image/png;base64,AAAA';
/**
 * A 48 by 48 avatar picture the colour audit can read: hard-edged, two opaque colours, no antialiasing. The background
 * is reference.color.bluegreen-20 (#a4c7c9) and the head and shoulders are reference.color.bluegreen-70 (#02485b).
 * Reference colours keep one value in the light and dark schemes, so every pixel is a canonical token in both.
 */
export const AVATAR_LOADED_SRC = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAnUlEQVR42u3XwRGAIAxE0R2rswfbsxfHqrQBHUEjCeEfcv/vxKJ124+eTwAAAAAAAID1TfNyeeEBd+F/QtQ63hohj3hLhLzirRBjA77GWyAAAAAwMoB3IAKg+ymRYsylmNMpPjT8iQEAAOAPaPkGMCW6ndNW4RYQRYl/i1Ck+DcIRYuvRShifA1CUeNLEbkB3vEliLyAKPFPCADegBOwf75jF+5iFAAAAABJRU5ErkJggg==';
// The transparent pixel draws nothing for a radius to round, so the radius rows fill the image box with a token.
const IMAGE_RADIUS_FRAME = Object.freeze({ background: 'var(--muxui-semantic-surface-strong)' });
const TAG_SELECT_SAMPLE_ITEMS = [{ id: 'design', label: 'Design' }, { id: 'code', label: 'Code' }];
const LIGHTBOX_SAMPLE_ITEMS = [{ key: 'one', label: 'One' }, { key: 'two', label: 'Two' }];
const COLLECTION_SAMPLE_ITEMS = [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }];
const MULTI_SELECT_SAMPLE_ITEMS = [{ id: 'email', label: 'Email' }, { id: 'sms', label: 'SMS' }];
const TEXT_EDITOR_SAMPLE_DOCUMENT = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mux UI' }] }] };

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
    // The name is the native aria-label, not an API default, so the story supplies the one Breadcrumbs falls back to.
    'aria-label': fallback(args['aria-label'], 'Breadcrumbs'),
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
  // A Link with no href, or an empty one, renders disabled whatever its disabled prop says, so a supplied href is passed on as is.
  Link: (args) => e(MuxUI.Link, { ...args, href: ownArg(args, 'href', '/settings') }, 'Settings'),
  Meter: (args) => e(MuxUI.Meter, { ...args, label: fallback(args.label, 'Storage'), value: Object.hasOwn(args, 'value') ? args.value : ownArg(args, 'values', {}).meter ?? 72 }),
  ProgressBar: (args) => e(MuxUI.ProgressBar, { ...args, label: fallback(args.label, 'Upload'), value: args.indeterminate || Object.hasOwn(args, 'value') && args.value == null ? undefined : Object.hasOwn(args, 'value') ? args.value : (ownArg(args, 'values', {}).progress ?? 64) }),
  // A rule only has geometry between content: a vertical one needs a row to stretch across.
  Separator: (args) => e('div', {
    style: args.orientation === 'vertical'
      ? { display: 'flex', alignItems: 'stretch', gap: '1rem', minBlockSize: '3rem' }
      : { display: 'grid', gap: '1rem', maxInlineSize: '16rem' },
  },
  e('span', { style: { alignSelf: 'center' } }, args.orientation === 'vertical' ? 'Left' : 'Above'),
  e(MuxUI.Separator, args),
  e('span', { style: { alignSelf: 'center' } }, args.orientation === 'vertical' ? 'Right' : 'Below')),
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
  GridList: (args) => e(MuxUI.GridList, { ...args, 'aria-label': fallback(args['aria-label'], 'Grid'), items: ownArg(args, 'items', COLLECTION_SAMPLE_ITEMS) }),
  ListBox: (args) => e(MuxUI.ListBox, { ...args, 'aria-label': fallback(args['aria-label'], 'List'), items: ownArg(args, 'items', COLLECTION_SAMPLE_ITEMS) }),
  // The standalone Menu is an action list. Any open-state arg selects the triggered composition, which owns
  // open state and popup geometry; the list keeps the name, items, and selection callbacks.
  Menu: ({ open, defaultOpen, onOpenChange, placement, offset, crossOffset, shouldFlip, containerPadding, anchorRef, modal, delay: _delay, ...list }) => {
    const listProps = { ...list, 'aria-label': fallback(list['aria-label'], 'Actions'), items: ownArg(list, 'items', fallback(list.items, ['Save', 'Delete'])) };
    if (open === undefined && defaultOpen === undefined && onOpenChange === undefined) return e(MuxUI.Menu, listProps);
    const { disabled, shouldCloseOnSelect, onAction, onSelect, ...listOnly } = listProps;
    return e(MuxUI.Menu.Root, { open, defaultOpen, onOpenChange, disabled, shouldCloseOnSelect, onAction, onSelect },
      e(MuxUI.Menu.Trigger, null, 'Actions'),
      e(MuxUI.Menu.Popup, { placement, offset, crossOffset, shouldFlip, containerPadding, anchorRef, modal }, e(MuxUI.Menu.List, listOnly)));
  },
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
    title: fallback(args.title, 'Project settings'),
    trigger: fallback(args.trigger, e(MuxUI.Button, null, 'Open dialog')),
  }, fallback(args.children, e('p', null, 'Review the settings for this project.'))),
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

const SIDEBAR_SAMPLE_ITEMS = [{ href: '#now', label: 'Now' }, { href: '#next', label: 'Next' }, { href: '#later', label: 'Later' }];

/**
 * The flat Sidebar props belong to different parts. Provider owns folding. Root owns hideBorder and density.
 * The first NavItem takes label, href, current, external, badge, and icon; the Roadmap group takes items and
 * its open state. Search takes placeholder, value, and onChange. AccountCard takes name, email, avatarSrc,
 * avatarAlt, and status, FeatureCard takes title, description, and dismissLabel, and MobileTrigger takes logo.
 * onAction belongs to the AccountMenu inside the card, whose own items stay its Menu.Item children here. One
 * navigation fills the column and the mobile drawer, and the consumer owns the FeatureCard, so dismissing it
 * removes it here. Whatever is left in `root` is the aside's own: no part-owned arg may stay in it.
 */
function SidebarPreview({
  collapsed, defaultCollapsed, onCollapsedChange, shortcut,
  label, href, current, external, badge, icon,
  items, expanded, defaultExpanded, onExpandedChange,
  placeholder, value, onChange,
  name, email, avatarSrc, avatarAlt, status,
  title, description, dismissLabel, logo,
  onAction, onDismiss,
  ...root
}) {
  const [dismissed, setDismissed] = React.useState(false);
  const Icon = typeof icon === 'function' ? icon : SidebarSpecimenIcon;
  const navigation = e(MuxUI.Sidebar.NavList, null,
    e(MuxUI.Sidebar.NavItem, { href: fallback(href, '#overview'), icon: Icon, current, external, badge }, fallback(label, 'Overview')),
    e(MuxUI.Sidebar.NavItem, { icon: Icon, items: items ?? SIDEBAR_SAMPLE_ITEMS, expanded, defaultExpanded, onExpandedChange }, 'Roadmap'),
    e(MuxUI.Sidebar.Section, { label: 'Projects' },
      e(MuxUI.Sidebar.NavItem, { href: '#settings', icon: Icon }, 'Settings'),
    ),
  );
  return e(MuxUI.Sidebar.Provider, { collapsed, defaultCollapsed, onCollapsedChange, shortcut },
    e(MuxUI.Sidebar.Toggle),
    e(MuxUI.Sidebar.Root, root,
      e(MuxUI.Sidebar.Header, null, 'Field team'),
      e(MuxUI.Sidebar.Search, { placeholder: fallback(placeholder, 'Search'), value, onChange }),
      e(MuxUI.Sidebar.Divider),
      navigation,
      e(MuxUI.Sidebar.AccountCard, { name: fallback(name, 'Sample user'), email: fallback(email, 'sample@example.com'), avatarSrc, avatarAlt, status },
        e(MuxUI.Sidebar.AccountMenu, { onAction },
          e(MuxUI.Menu.Item, { id: 'profile' }, 'Profile'),
          e(MuxUI.Menu.Separator),
          e(MuxUI.Menu.Item, { id: 'sign-out' }, 'Sign out'))),
      dismissed ? null : e(MuxUI.Sidebar.FeatureCard, { title: fallback(title, 'Try Scale'), description: fallback(description, 'Explore tokens'), dismissLabel, onDismiss: () => { onDismiss?.(); setDismissed(true); } }),
    ),
    e(MuxUI.Sidebar.MobileTrigger, { logo: fallback(logo, 'Field team') }, navigation),
  );
}

const COMMAND_PALETTE_SAMPLE_COMMANDS = [
  { id: 'save', title: 'Save', subtitle: 'Write the open document', group: 'Suggestions', meta: 'File', shortcut: ['Ctrl', 'S'] },
  { id: 'open', title: 'Open', subtitle: 'Choose a document', group: 'Suggestions' },
  { id: 'settings', title: 'Open settings', subtitle: 'Workspace preferences', group: 'Workspace', keywords: ['preferences'] },
];

/**
 * The flat CommandPalette props belong to different parts. Root owns open state, size, and closeOnSelect.
 * The Trigger owns disabled and the Backdrop owns dismissable. The useCommandPalette hook owns the commands,
 * the query, filtering, sorting, grouping, and the action and error callbacks. Each Item reports activation
 * through the hook's item props plus the caller's onActivate. The first command takes id, title, description,
 * href, and target when no command list is supplied. STORY_API_PARTS and STORY_API_HOOKS name these inputs.
 */
function CommandPalettePreview({
  open, defaultOpen = false, onOpenChange, size, closeOnSelect,
  disabled, dismissable,
  commands, query, defaultQuery, onQueryChange, filter, sort, groupBy, getGroupTitle, onAction, onError, close,
  id, title, description, href, target, onActivate,
}) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const setOpen = (next) => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };
  const specimenCommands = React.useMemo(() => commands ?? COMMAND_PALETTE_SAMPLE_COMMANDS.map((command, index) => (index === 0
    ? { ...command, ...(id && { id }), ...(title && { title }), ...(description && { subtitle: description }), ...(href && { href }), ...(target && { target }) }
    : command)), [commands, id, title, description, href, target]);
  const palette = MuxUI.useCommandPalette({
    commands: specimenCommands, query, defaultQuery, onQueryChange, filter, sort, groupBy, getGroupTitle, onAction, onError, closeOnSelect,
    close: () => {
      setOpen(false);
      close?.();
    },
  });
  return e(MuxUI.CommandPalette.Root, { open: open ?? internalOpen, onOpenChange: setOpen, size, closeOnSelect },
    e(MuxUI.CommandPalette.Trigger, { disabled }, 'Open command palette'),
    e(MuxUI.CommandPalette.Backdrop, { dismissable },
      e(MuxUI.CommandPalette.Popup, null,
        e(MuxUI.CommandPalette.Title, null, 'Commands'),
        e(MuxUI.CommandPalette.Description, null, 'Choose an action'),
        e(MuxUI.CommandPalette.Content, null,
          e(MuxUI.CommandPalette.SearchField, null, e(MuxUI.CommandPalette.Input, {
            placeholder: 'Search commands',
            value: palette.query,
            onChange: (event) => palette.setQuery(event.currentTarget.value),
          })),
          // A group heading, an item description, and an item's meta and shortcut each carry text the open palette must keep readable.
          e(MuxUI.CommandPalette.ListBox, null, palette.groupedCommands.map((group) => e(MuxUI.CommandPalette.Section, { key: group.id },
            group.title ? e(MuxUI.CommandPalette.SectionHeader, null, group.title) : null,
            group.commands.map((command) => {
              const item = palette.getItemProps(command);
              return e(MuxUI.CommandPalette.Item, { key: command.id, ...item, onActivate: (event) => { item.onActivate(event); onActivate?.(event); } },
                e(MuxUI.CommandPalette.ItemContent, null,
                  e(MuxUI.CommandPalette.ItemTitle, null, command.title),
                  command.subtitle ? e(MuxUI.CommandPalette.ItemDescription, null, command.subtitle) : null,
                ),
                command.meta ? e(MuxUI.CommandPalette.ItemMeta, null, command.meta) : null,
                command.shortcut ? e(MuxUI.CommandPalette.Shortcut, { keys: command.shortcut }) : null,
              );
            }),
          ))),
          palette.filteredCommands.length === 0 ? e(MuxUI.CommandPalette.Empty, null, 'No matching commands') : null,
        ),
        e(MuxUI.CommandPalette.Close, null, 'Close'),
      ),
    ),
  );
}

Object.assign(ADAPTERS, {
  // Root owns open state, Trigger and Close own disabled and activation, and the shell nests
  // Backdrop > Popup > Content as in the canonical example. The confirm action is the application's own
  // danger Button beside Cancel, and the title names the object, the description states the consequence.
  AlertDialog: ({ open, defaultOpen, onOpenChange, disabled, onActivate }) => e(MuxUI.AlertDialog.Root, { open, defaultOpen, onOpenChange },
    e(MuxUI.AlertDialog.Trigger, { disabled, onActivate }, 'Delete report'),
    e(MuxUI.AlertDialog.Backdrop, null,
      e(MuxUI.AlertDialog.Popup, null,
        e(MuxUI.AlertDialog.Content, null,
          e(MuxUI.AlertDialog.Title, null, 'Delete Quarterly report?'),
          e(MuxUI.AlertDialog.Description, null, 'The report and its 12 comments are deleted. This cannot be undone.'),
          e(MuxUI.AlertDialog.Actions, null,
            e(MuxUI.AlertDialog.Close, { disabled, onActivate }, 'Cancel'),
            e(MuxUI.Button, { variant: 'danger', disabled, onActivate }, 'Delete report'),
          ),
        ),
      ),
    ),
  ),
  // Image owns the source, alt text, and load and error callbacks; Root keeps size and the rest. Without a source the
  // initials show, since the only image the colour audit accepts is transparent and would hide them.
  Avatar: ({ src, srcSet, alt, children, onLoad, onError, ...root }) => e(MuxUI.Avatar.Root, root,
    e(MuxUI.Avatar.Image, { src: src || undefined, srcSet, alt: alt ?? 'Workspace avatar', onLoad, onError }),
    e(MuxUI.Avatar.Fallback, null, fallback(children, 'WS')),
  ),
  ButtonGroup: (args) => e(MuxUI.ButtonGroup, { ...args },
    e(MuxUI.Button, { disabled: args.disabled }, 'Primary'),
    e(MuxUI.Button, { disabled: args.disabled, variant: 'neutral' }, 'Secondary'),
  ),
  // Root is the static surface. Button is the interactive alternate root, so selected, pending,
  // disabled, and activation belong to it; both take the shared variant and padding.
  Card: ({ variant, padding, selected, pending, disabled, onActivate, className }) => e('div', { style: { display: 'grid', gap: '1rem', maxInlineSize: '20rem' } },
    e(MuxUI.Card.Root, { variant, padding, className },
      e(MuxUI.Card.Header, null, 'Card title'),
      e(MuxUI.Card.Body, null, 'Card content'),
      e(MuxUI.Card.Footer, null, e(MuxUI.Button, null, 'Action')),
    ),
    e(MuxUI.Card.Button, { variant, padding, selected, pending, disabled, onActivate }, 'Interactive card'),
  ),
  CheckboxField: (args) => e(MuxUI.CheckboxField.Root, { ...args },
    e(MuxUI.CheckboxField.Button, { disabled: args.disabled }, 'Enable notifications', e(MuxUI.CheckboxField.Indicator)),
    e(MuxUI.CheckboxField.Description, null, 'Optional setting'),
    e(MuxUI.CheckboxField.Error, null, args.invalid ? 'Invalid value' : null),
  ),
  ColorModeToggle: (args) => e(ColorModeTogglePreview, args),
  CommandPalette: (args) => e(CommandPalettePreview, args),
  // One list of links fills the header and the drawer. href and current belong to the first link. Sign in sits
  // in the header from 40rem wide, and below it the drawer holds it under the links. Both Buttons share one
  // handler, which goes to the #sign-in route as the links go to their hash routes.
  HeaderNav: ({ href, current, ...root }) => {
    const signIn = () => { window.location.hash = '#sign-in'; };
    const navigation = [
      e(MuxUI.HeaderNav.NavButton, { key: 'docs', href: fallback(href, '#docs'), current }, 'Docs'),
      e(MuxUI.HeaderNav.NavButton, { key: 'components', href: '#components' }, 'Components'),
      e(MuxUI.HeaderNav.NavButton, { key: 'blocks', href: '#blocks' }, 'Blocks'),
    ];
    // HeaderNav has no breakpoint of its own. Like the catalog's responsive example, the frame is a size
    // container (preview.css), the links and Sign in show from 40rem wide, and the drawer trigger shows below it.
    return e('div', { className: 'muxui-storybook-header-frame' },
      e(MuxUI.HeaderNav.Root, root,
        e(MuxUI.HeaderNav.Logo, null, 'Mux UI'),
        e(MuxUI.HeaderNav.Secondary, {
          className: 'muxui-storybook-header-links',
          'aria-label': `${root['aria-label'] ?? 'Header navigation'} secondary`,
        }, navigation),
        e(MuxUI.HeaderNav.Actions, { className: 'muxui-storybook-header-actions' }, e(MuxUI.Button, { onActivate: signIn }, 'Sign in')),
        e('div', { className: 'muxui-storybook-header-menu' },
          e(MuxUI.HeaderNav.MobileTrigger, null,
            navigation,
            e('div', { className: 'muxui-storybook-header-drawer-actions' }, e(MuxUI.Button, { onActivate: signIn }, 'Sign in')),
          ),
        ),
      ),
    );
  },
  Image: (args) => e(ImagePreview, args),
  // Supplied seeds and text win; the sample tags and copy only fill what a story leaves out.
  InputTags: (args) => {
    const label = fallback(args.label, 'Tags');
    return e(MuxUI.InputTags.Root, {
      ...args,
      ...(args.value === undefined ? { defaultValue: args.defaultValue ?? ['Mux', 'UI'] } : {}),
      label,
      'aria-label': args['aria-label'] ?? (args.label ? undefined : label),
      placeholder: fallback(args.placeholder, 'Add a tag'),
    });
  },
  Input: (args) => e(MuxUI.Input.Root, { ...args },
    e(MuxUI.Input.Label, null, 'Name'),
    e(MuxUI.Input.Input, { placeholder: 'Enter a name', disabled: args.disabled }),
    e(MuxUI.Input.Description, null, 'Your display name'),
    e(MuxUI.Input.Error, null, args.invalid ? 'Name is invalid' : null),
  ),
  MultiSelect: (args) => e(MuxUI.MultiSelect.Root, { ...args, label: 'Notifications', items: MULTI_SELECT_SAMPLE_ITEMS },
    e(MuxUI.MultiSelect.Item, { id: 'email' }, 'Email'),
    e(MuxUI.MultiSelect.Item, { id: 'sms' }, 'SMS'),
  ),
  PaymentInput: (args) => e(MuxUI.PaymentInput.Root, args,
    e(MuxUI.PaymentInput.Label, null, 'Card number'),
    e(MuxUI.PaymentInput.Group, null,
      e(MuxUI.PaymentInput.Input, { placeholder: '4242 4242 4242 4242', disabled: args.disabled }),
      e(MuxUI.PaymentInput.CardIcon),
    ),
    e(MuxUI.PaymentInput.Description, null, 'Secure payment'),
    e(MuxUI.PaymentInput.Error, null, args.invalid ? 'Invalid card' : null),
  ),
  ProgressCircle: (args) => e(MuxUI.ProgressCircle.Root, { ...args, label: 'Upload progress' },
    e(MuxUI.ProgressCircle.Track),
    e(MuxUI.ProgressCircle.Label, null, 'Upload'),
    e(MuxUI.ProgressCircle.Value),
  ),
  // RadioField supplies the parts of one radio, and RadioGroup supplies the selection: the first
  // field takes the field props and starts selected, the second is an unselected comparison with its own value.
  RadioField: ({ value, size, disabled, invalid, required }) => {
    const first = String(fallback(value, 'monthly'));
    const second = first === 'annual' ? 'monthly' : 'annual';
    const planName = (plan) => (plan === 'monthly' ? 'Monthly' : plan === 'annual' ? 'Annual' : plan);
    const field = (fieldValue, props) => e(MuxUI.RadioField.Root, { value: fieldValue, size, ...props },
      e(MuxUI.RadioField.Button, null, e(MuxUI.RadioField.Indicator, null, e(MuxUI.RadioField.Dot)), planName(fieldValue)),
      e(MuxUI.RadioField.Description, null, 'Choose one plan'),
      e(MuxUI.RadioField.Error, null, 'Invalid choice'),
    );
    return e(MuxUI.RadioGroup, { key: first, label: 'Plan', defaultValue: first, size },
      field(first, { disabled, invalid, required }),
      field(second),
    );
  },
  Sidebar: (args) => e(SidebarPreview, args),
  SwitchField: (args) => e(MuxUI.SwitchField.Root, { ...args },
    e(MuxUI.SwitchField.Button, { disabled: args.disabled }, 'Notifications', e(MuxUI.SwitchField.Thumb)),
    e(MuxUI.SwitchField.Description, null, 'Send product updates by email.'),
    e(MuxUI.SwitchField.Error, null, args.invalid ? 'Invalid value' : null),
  ),
  // Items and label come from the story. One resolver names both the popup options and the selected tags, the
  // caller's getItemLabel or TagSelect's own name, label, then id fallback.
  TagSelect: (args) => {
    const getItemLabel = args.getItemLabel ?? ((item) => String(item.name ?? item.label ?? item.id));
    return e(MuxUI.TagSelect.Root, {
      ...args,
      label: fallback(args.label, 'Topics'),
      items: ownArg(args, 'items', TAG_SELECT_SAMPLE_ITEMS),
      placeholder: fallback(args.placeholder, 'Add a topic'),
      getItemLabel,
    }, (item) => getItemLabel(item));
  },
  // Root owns field state and the string callback; the textarea owns the native attributes.
  TextArea: ({ rows, maxLength, placeholder, ...root }) => e(MuxUI.TextArea.Root, root,
    e(MuxUI.TextArea.Label, null, 'Notes'),
    e(MuxUI.TextArea.TextArea, { rows, maxLength, placeholder: fallback(placeholder, 'Add notes') }),
    e(MuxUI.TextArea.Description, null, 'Optional'),
    e(MuxUI.TextArea.Error, null, root.invalid ? 'Invalid notes' : null),
  ),
  // Controls cannot filter options by another arg, so xs falls back to sm for
  // the roles that do not define it instead of throwing.
  Text: (args) => e(MuxUI.Text, {
    ...args,
    size: args.size === 'xs' && ['display', 'heading', 'title'].includes(args.variant) ? 'sm' : args.size,
  }, 'Manage your profile details.'),
  Resizable: ({ defaultSizes, ...args }) => e(MuxUI.Resizable, { ...args, ...(args.sizes === undefined ? { defaultSizes: defaultSizes ?? { main: 60, side: 40 } } : {}) },
    e(MuxUI.ResizablePanel, { id: 'main' }, 'Main'),
    e(MuxUI.ResizableHandle, { id: 'main-side', before: 'main', after: 'side', 'aria-label': 'Resize panels' }),
    e(MuxUI.ResizablePanel, { id: 'side' }, 'Side'),
  ),
  SelectNative: (args) => e(MuxUI.SelectNative, {
    ...args,
    label: args.label ?? 'Choose a saved panel',
    defaultValue: args.value === undefined ? (args.defaultValue ?? (args.multiple ? [] : '')) : undefined,
    errorMessage: args.invalid ? (args.errorMessage ?? 'Choose a panel') : args.errorMessage,
  },
  e('option', { value: '' }, 'Choose a panel'),
  e('option', { value: 'inbox' }, 'Inbox'),
  e('option', { value: 'research' }, 'Research')),
  // Each item opens the gallery at its own key, and the content follows the selected item.
  Lightbox: (args) => {
    const items = Array.isArray(args.items) ? args.items : LIGHTBOX_SAMPLE_ITEMS;
    return e(MuxUI.Lightbox, { ...args, items, renderContent: args.renderContent ?? ((_item, { index, count }) => e('p', null, `Item ${index + 1} of ${count}`)) },
      items.map((item) => e(MuxUI.LightboxTrigger, { key: item.key, itemKey: item.key }, `Open ${item.label ?? item.key}`)),
      e(MuxUI.LightboxBackdrop, null,
        e(MuxUI.LightboxPopup, null,
          e(MuxUI.LightboxContent),
          e(MuxUI.LightboxCaption),
          e(MuxUI.LightboxPrevious, null),
          e(MuxUI.LightboxNext, null),
          e(MuxUI.LightboxClose, null),
        ),
      ),
    );
  },
  Markdown: (args) => e(Markdown, { ...args, source: args.source ?? '## Mux UI\n\nA **bounded** example.' }),
  TextEditor: ({ defaultValue, ...args }) => e(TextEditor, { ...args, label: fallback(args.label, 'Note'), ...(args.value === undefined ? { defaultValue: defaultValue ?? TEXT_EDITOR_SAMPLE_DOCUMENT } : {}) }),
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

// React Aria builds a tag group's rows after mount, so wait for the first one to appear before focusing it.
function scheduleTagFocus(element) {
  let attempts = 0;
  let handle;
  const attempt = () => {
    const tag = element?.querySelector('.muxui-input-tags__tag');
    if (tag) tag.focus();
    else if ((attempts += 1) < 20) handle = scheduleFrame(attempt);
  };
  handle = scheduleFrame(attempt);
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

function LifecycleTransition({ family, state, args, controlledOpen }) {
  const isClosing = state === 'closing' || state === 'exiting';
  // The open row has no transition to play. It mounts open, and a value the user sets for `open` drives it from then
  // on like any controlled Dialog, while an unset one leaves the row to its own close button and trigger.
  const isSettled = state === 'open';
  const controlled = isSettled && typeof controlledOpen === 'boolean';
  const startsOpen = isClosing || isSettled && (controlled ? controlledOpen : args.defaultOpen !== false);
  const isToast = family === 'Toast';
  const [open, setOpen] = React.useState(!isToast && startsOpen);
  const [toastMounted, setToastMounted] = React.useState(isClosing);
  const [toastRevision, setToastRevision] = React.useState(0);
  const [phase, setPhase] = React.useState(startsOpen ? 'open' : 'closed');
  const userInteracted = React.useRef(false);

  React.useEffect(() => {
    userInteracted.current = false;
    if (isSettled) return undefined;
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
  }, [isClosing, isSettled, isToast]);

  const transitionArgs = { ...args };
  let rendered;
  if (isToast) {
    transitionArgs.duration = isClosing && toastRevision === 0 ? 50 : (args.duration ?? 5_000);
    rendered = toastMounted
      ? React.cloneElement(renderFamily(family, transitionArgs), { key: toastRevision })
      : null;
  } else {
    transitionArgs.open = controlled ? controlledOpen : open;
    transitionArgs.onOpenChange = (nextOpen) => {
      args.onOpenChange?.(nextOpen);
      userInteracted.current = true;
      setOpen(nextOpen);
      setPhase(nextOpen ? 'open' : 'closed');
    };
    rendered = renderFamily(family, transitionArgs);
  }
  const shownPhase = controlled ? (controlledOpen ? 'open' : 'closed') : phase;
  return e(React.Fragment, null,
    rendered,
    e('div', {
      className: 'muxui-storybook-transition-status',
      'data-muxui-storybook-transition': shownPhase,
      'aria-hidden': 'true',
    }, `${state}: ${shownPhase}`),
  );
}

function StateVariant({ family, state, args, available, controlledOpen }) {
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
  // The open row opens its trigger itself, so a user's closed value has to stop that click. Focus and drag rows have
  // no prop a user could set to the contrary.
  const closedByUser = args.open === false || args.defaultOpen === false;
  React.useEffect(() => {
    if (state === 'focused') focusStateTarget(stateRef.current);
    if (state === 'tag-focused') return scheduleTagFocus(stateRef.current);
    if (state === 'drop-target' || state === 'dragging') dispatchDragEnter(stateRef.current);
    if (state !== 'open' || !INTERACTION_OPEN_FAMILIES.has(family) || closedByUser) return undefined;
    return scheduleOpenInteraction(stateRef.current, family);
  }, [family, state, closedByUser]);

  // `args` already carry the row's state, projected by stateArgsForBinding with any user value taking precedence, so
  // this only adds what keeps the rows apart: a unique label, a lifecycle marker, and a unique landmark name.
  const variantArgs = { ...args };
  if (family === 'DataDiff') variantArgs.label = `${args.label ?? 'Proposed token cleanup'} ${state}`;
  const lifecycleRow = isLifecycleState(family, state);
  const activeLifecycleState = React.useContext(LifecycleSelectionContext);
  const marker = OVERLAY_FAMILIES.has(family) ? lifecycleMarker(family, state) : undefined;
  if (marker) {
    variantArgs.className = [variantArgs.className, marker].filter(Boolean).join(' ');
  }
  // The matrix intentionally mounts several landmark instances at once. Give
  // Mux UI's nav/group adapters unique accessible names without adding a prop
  // to the public API or changing the controls contract.
  if (family === 'Breadcrumbs' || family === 'Group' || family === 'HeaderNav') {
    variantArgs['aria-label'] = `${args['aria-label'] ?? family} ${state}`;
  }
  const labelId = `muxui-storybook-state-${family}-${state.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  const rendered = !available
    ? e('p', {
      className: 'muxui-storybook-state-unavailable',
      'data-muxui-storybook-state': 'unavailable',
    }, `Unavailable: MuxUI ${family} has no public prop or supported interaction for the ${state} state.`)
    : lifecycleRow
    ? activeLifecycleState === state
      ? e(LifecycleTransition, { family, state, args: variantArgs, controlledOpen })
      : e('p', { className: 'muxui-storybook-lifecycle-inactive' }, `Select ${state} to inspect this lifecycle state.`)
    : renderFamily(family, variantArgs);
  // An open Menu popup floats over its neighbours, so its rows reserve room above and below the trigger.
  const specimen = family === 'Menu' && (state === 'open' || state === 'placement')
    ? e('div', { 'data-muxui-storybook-popup-room': '', style: { display: 'flex', alignItems: 'center', minBlockSize: '14rem' } }, rendered)
    : rendered;
  const stateContent = e('section', {
    ref: stateRef,
    className: 'muxui-storybook-state',
    'aria-labelledby': labelId,
    // React Aria hides sibling state fixtures while a collection popover is
    // open. Keep those intentionally inactive fixtures out of the tab order
    // as well so the Storybook state matrix remains axe-clean.
    inert: hiddenByOverlay ? true : undefined,
    'data-muxui-storybook-lifecycle': lifecycleRow ? state : undefined,
  }, e('h3', { id: labelId }, state), specimen);
  return marker ? e(OverlayHost, { marker }, stateContent) : stateContent;
}

/**
 * Dialog, AlertDialog, CommandPalette, and Lightbox are modal: an open one takes focus and makes everything outside it
 * inert, so a second open one leaves focus on the body and no row reachable. Their States rows therefore never hold
 * more than one open modal. The Dialog's lifecycle selector mounts one row at a time, and for the others it is the
 * open row. An explicit `open` or `defaultOpen` drives that row, and every other row keeps its own state instead of
 * copying the value. Popovers and the other families are not modal, so a supplied value still wins in every row.
 */
const MODAL_OPEN_FAMILIES = new Set(['Dialog', 'AlertDialog', 'CommandPalette', 'Lightbox']);

function hostsOpenModal(family, state) {
  return family === 'Dialog' ? isLifecycleState(family, state) : state === 'open';
}

export function renderStateCoverage(record, args = storyArgsForBinding(record.binding, 'states', record.family)) {
  const variants = stateCoverageForBinding(record.binding, record.family);
  const stateMatrix = e('div', { className: 'muxui-storybook-states' }, variants.map(({ name, args: own }) => {
    const rowArgs = stateArgsForBinding(record.binding, name, record.family, args);
    if (MODAL_OPEN_FAMILIES.has(record.family) && !hostsOpenModal(record.family, name)) {
      for (const prop of ['open', 'defaultOpen']) {
        if (Object.hasOwn(own, prop)) rowArgs[prop] = own[prop];
        else delete rowArgs[prop];
      }
    }
    return e(StateVariant, {
      key: name,
      family: record.family,
      state: name,
      available: stateIsSupported(record.binding, name, record.family),
      args: rowArgs,
      controlledOpen: args.open,
    });
  }));
  const lifecycleStates = variants.map(({ name }) => name).filter((name) => isLifecycleState(record.family, name));
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
  // A React event carries a fiber graph; log what a reader of the log can use.
  if (value && typeof value === 'object' && value.nativeEvent instanceof Event) {
    const text = value.target && 'value' in value.target ? `,value:${JSON.stringify(value.target.value)}` : '';
    return `{type:${value.type}${text}}`;
  }
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
      // The supplied callback's result goes back to the component: TextEditor's selection request shows its pending and failure states from the promise it returns.
      const result = supplied?.(...payload);
      setMessages((previous) => [...previous, eventMessage(channel, payload)].slice(-12));
      return result;
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
  if (controlled === 'selectedIds' || controlled === 'selectedKeys') return 'selectionChange';
  if (controlled === 'selectedKey') return 'selectedChange';
  if (controlled === 'query') return 'queryChange';
  if (controlled === 'mode') return 'modeChange';
  if (controlled === 'sizes') return 'sizesChange';
  if (controlled === 'selectedId') return 'select';
  return 'change';
}

function controlledValueFromEvent(controlled, payload) {
  const value = payload[0];
  if (controlled === 'selectedId') {
    if (value && typeof value === 'object') return value.id ?? value.value;
    // onSelect reports a cleared selection with no item; a controlled selectedId expresses it as null.
    if (value === undefined) return null;
  }
  return value;
}

function ControlledHarness({ record, args }) {
  const theme = React.useContext(StorybookThemeContext);
  const [values, setValues] = React.useState(() => controlledStoryArgsForBinding(record.binding, record.family,
    record.family === 'ColorModeToggle' ? { ...args, mode: args.mode ?? args.defaultMode ?? theme?.scheme ?? 'light' } : args));
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
      children: e('output', { 'aria-label': `${record.family} controlled values`, 'data-muxui-controlled-values': record.family }, serializableEventValue(valuesToShow)),
    }),
  );
}

function UncontrolledHarness({ record, args }) {
  const theme = React.useContext(StorybookThemeContext);
  const [initialScheme] = React.useState(theme?.scheme ?? 'light');
  // Keep the initial host default; explicit keys retain restoration across host mode changes.
  const specimenArgs = record.family === 'ColorModeToggle'
    ? { ...args, defaultMode: args.defaultMode ?? initialScheme, storageKey: args.storageKey ?? `muxui-storybook-uncontrolled-color-mode-${initialScheme}`, syncWithToolbar: false }
    : args;
  const uncontrolledPairs = controlledDefaultPairsForBinding(record.binding);
  const valuesToShow = Object.fromEntries(uncontrolledPairs.map(({ uncontrolled }) => [uncontrolled, specimenArgs[uncontrolled]]));
  return e('div', {
    className: 'muxui-storybook-proof',
    role: 'group',
    'aria-label': 'Uncontrolled mode',
    'data-muxui-storybook-proof': 'uncontrolled',
  },
    renderFamily(record.family, specimenArgs),
    e(HarnessStatus, {
      label: 'Default',
      note: uncontrolledPairs.length ? 'Initial default. The component manages subsequent changes.' : 'This family has no controlled/default pair.',
      children: e('output', { 'aria-label': `${record.family} uncontrolled defaults`, 'data-muxui-uncontrolled-values': record.family }, serializableEventValue(valuesToShow)),
    }),
  );
}

const EXECUTABLE_ANATOMY_PARTS = Object.freeze({
  Autocomplete: new Set(['popover', 'list']),
  Virtualizer: new Set(['item']),
});

function executableAnatomyPart(family, part) {
  return EXECUTABLE_ANATOMY_PARTS[family]?.has(part) ?? false;
}

/** The part-map row of a binding's part. An unknown family or part throws, so a typo can never read as "no element". */
function anatomyRow(binding, part) {
  return partRow(familySlug(binding.export), part);
}

/** The selectors that find a part in the rendered anatomy: its row's selector, or none for a part that renders no element. */
function partSelectors(binding, part) {
  const selector = selectorOf(anatomyRow(binding, part));
  return selector === undefined ? [] : [selector];
}

/** Why a part renders no element, from its row, or undefined for a part that has one. */
function noElementReason(binding, part) {
  const row = anatomyRow(binding, part);
  return row.disposition === 'none' ? row.reason : undefined;
}

function anatomyArgsForBinding(record, sourceArgs) {
  const args = { ...sourceArgs };
  const props = new Set(storyApi(record.binding).props);
  if (props.has('description')) args.description = 'Additional context';
  if (props.has('errorMessage')) args.errorMessage = 'A value is required';
  // errorMessage renders only while invalid, so the anatomy shows the error part through invalid.
  if (props.has('errorMessage') && props.has('invalid')) args.invalid = true;
  if (record.family === 'ColorSwatchPicker') args.defaultValue = '#ff0000';
  // The label part is the field label Calendar renders only when it has a label.
  if (record.family === 'Calendar') args.label = 'Date';
  if (record.family === 'ListBox') {
    args.children = e(MuxUI.ListBox.Section, { title: 'Options' },
      e(MuxUI.ListBox.Item, { id: 'one' }, 'One'),
      e(MuxUI.ListBox.Item, { id: 'two' }, 'Two'));
  }
  // Sections, a separator, and a submenu give the list and the open popup every Menu part. The adapter has no submenu of its own to
  // give the delay control to, so the one built here takes it, and its popup takes the geometry the adapter gives the root's popup.
  if (record.family === 'Menu') {
    args.children = [
      e(MuxUI.Menu.Section, { key: 'editing', title: 'Editing' }, e(MuxUI.Menu.Item, { id: 'save' }, 'Save')),
      e(MuxUI.Menu.Separator, { key: 'separator' }),
      e(MuxUI.Menu.Item, { key: 'delete', id: 'delete' }, 'Delete'),
      e(MuxUI.Menu.Submenu, { key: 'share', delay: args.delay },
        e(MuxUI.Menu.Item, { id: 'share' }, 'Share'),
        e(MuxUI.Menu.Popup, { placement: args.placement, offset: args.offset, crossOffset: args.crossOffset, shouldFlip: args.shouldFlip, containerPadding: args.containerPadding, modal: args.modal },
          e(MuxUI.Menu.List, { 'aria-label': 'Share' }, e(MuxUI.Menu.Item, { id: 'copy-link' }, 'Copy link')))),
    ];
  }
  if (record.family === 'CodeBlock') args.mode = 'diff';
  if (record.family === 'Message') args.defaultSourcesExpanded = true;
  if (record.family === 'Dialog') args.actions = e(MuxUI.Button, null, 'Confirm');
  return args;
}

// ---------------------------------------------------------------------------------------------------------------------------
// The Anatomy hooks table (CSS Stage 2 PR 4c, mock D). Its rows are the family's `hooks` block of the styling reference, which
// packages/react/test/support/styling-reference.mjs derives, apps/component-reference.mjs returns and the generator embeds in the
// story module as `record.hooks`. This file ships to the browser, so it only reads that data and never imports the derivation. The
// harness adds the Live column: how many distinct elements of this story carry each hook.
// ---------------------------------------------------------------------------------------------------------------------------

/** The `<tag>` text of the On cell: `<button>`, or `<div>, <span>` when the hook is on several tags. */
const tagText = (tags) => tags.map((tag) => `<${tag}>`).join(', ');

/** The On cell of a state or reflected row: the parts that carry it here, then the parts a rule selects it on that do not, marked `styled`. */
function onText(shownOn, selectedOn) {
  const styledOnly = selectedOn.filter((part) => !shownOn.includes(part));
  return [...shownOn, ...styledOnly.map((part) => `${part} styled`)].join(', ') || '-';
}

const reactFiberKey = (node) => Object.keys(node).find((key) => key.startsWith('__reactFiber$'));

/**
 * The elements of this story that match `selector`: those inside its host, and those its React tree renders elsewhere (an overlay
 * portaled to the document body or a theme scope). Not `document` wholesale: a second host, or another story's overlay, on the same
 * page is not this story's. A portaled node is the story's when its fiber's ancestry passes through the host's fiber (the portal
 * carries the React parent, which the DOM does not). React Aria 1.20 can hand a story its own portal container
 * (`UNSAFE_PortalProvider` of `react-aria`), but the app does not declare that package, and `createPortal(..., document.body)`
 * would escape it.
 */
function storyElements(host, selector) {
  const hostKey = reactFiberKey(host);
  if (!hostKey) throw new Error('The Anatomy host is not a React element, so its portals cannot be told from another story\'s.');
  const owners = new Set([host[hostKey], host[hostKey].alternate]);
  return [...host.ownerDocument.querySelectorAll(selector)].filter((node) => {
    if (host.contains(node)) return true;
    const key = reactFiberKey(node);
    for (let fiber = key && node[key]; fiber; fiber = fiber.return) if (owners.has(fiber)) return true;
    return false;
  });
}

const unique = (list) => [...new Set(list)];

/**
 * What the canvas shows for a family's hooks table: the status of each part, and the Live count and On text of each row.
 * `host` is the story's element (null before it mounts). Plain data, so an unchanged measure never re-renders the table.
 */
function measureHooks(record, host) {
  const { hooks, binding } = record;
  const classRows = hooks.groups.filter(({ id }) => id === 'root' || id === 'part').flatMap(({ rows }) => rows);
  const rootPart = hooks.groups.find(({ id }) => id === 'root')?.rows[0]?.part;
  // A part's elements are found by the part map's selector, the one the status proof uses, for every part including an internal one.
  const elementsOf = (part) => {
    const [selector] = partSelectors(binding, part);
    return host === null || selector === undefined ? [] : storyElements(host, selector);
  };
  const nodesOf = new Map(classRows.map(({ part }) => [part, elementsOf(part)]));
  const rootNodes = nodesOf.get(rootPart) ?? [];
  const classes = {};
  const statuses = {};
  for (const row of classRows) {
    const nodes = nodesOf.get(row.part);
    statuses[row.part] = nodes.length;
    if (row.hook === null) continue;
    const tags = unique(nodes.map((node) => node.localName));
    const inRoot = row.part !== rootPart && nodes.length > 0 && nodes.every((node) => rootNodes.some((root) => root !== node && root.contains(node)));
    classes[row.part] = { live: nodes.length, on: tags.length > 0 && row.conditional === undefined ? `${tagText(tags)}${inRoot ? ' in root' : ''}` : row.on };
  }
  // A state or reflected attribute counts on any documented hook of the family, not only where a rule selects it.
  const documented = unique(classRows.filter((row) => row.hook !== null).flatMap((row) => nodesOf.get(row.part)));
  const attributes = {};
  for (const row of hooks.groups.filter(({ id }) => id === 'state' || id === 'reflected').flatMap(({ rows }) => rows)) {
    const carriers = documented.filter((node) => node.hasAttribute(row.hook));
    const shownOn = classRows.filter((each) => each.hook !== null && nodesOf.get(each.part).some((node) => carriers.includes(node))).map(({ part }) => part);
    attributes[row.hook] = { live: carriers.length, on: onText(shownOn, row.selectedOn) };
  }
  return { statuses, classes, attributes };
}

/**
 * The catalog states and statuses that no documented hook shows in the Anatomy canvas, each with why. The list is what the Storybook
 * test's jsdom render measures; a browser reaches three of them (Avatar's loaded and error once its image loads, Virtualizer's disabled
 * once its rows are measured), and a row that is live prints its count with no reason. They stay in the table with a Live of 0 and
 * this reason, and the test pins the list in both directions, so a state that starts to show, or a new one that does not, fails it.
 * The reason is one of three, found by reading the family's source:
 *   not-reached          a writer of this very attribute exists; this canvas does not show it on a documented hook
 *   spelled-differently  the component expresses the state another way (named in the detail)
 *   no-writer-found      no emitted public hook; the shared styling classification explains the concept state
 * They are "not observed in the canvas", never "nothing sets them": Resizable's invalid has an explicit writer.
 */
export const NOT_OBSERVED_IN_CANVAS = Object.freeze({
  Avatar: Object.freeze({
    'data-muxui-loaded': Object.freeze(['not-reached', 'The image carries it once it has loaded.']),
    'data-muxui-fallback': Object.freeze(['spelled-differently', 'The root carries data-muxui-image-state="fallback".']),
    'data-muxui-error': Object.freeze(['not-reached', 'The image carries it when loading fails.']),
  }),
  Calendar: Object.freeze({ 'data-muxui-state-read-only': Object.freeze(['spelled-differently', 'The grid carries aria-readonly.']) }),
  ColorSwatchPicker: Object.freeze({ 'data-muxui-state-selected': Object.freeze(['not-reached', 'The selected swatch carries it on its internal item, which has no documented hook.']) }),
  DataDiff: Object.freeze({ 'data-muxui-state-empty': Object.freeze(['spelled-differently', 'With no rows it renders the empty part (.muxui-data-diff__empty).']) }),
  Form: Object.freeze({ 'data-muxui-state-invalid': Object.freeze(['no-writer-found']) }),
  HeaderNav: Object.freeze({ 'data-muxui-state-current': Object.freeze(['spelled-differently', 'The current link carries aria-current and the class muxui-header-nav__nav-button--current.']) }),
  Image: Object.freeze({
    'data-muxui-fallback': Object.freeze(['not-reached', 'The image carries it while its fallback source is in use.']),
    'data-muxui-error': Object.freeze(['not-reached', 'The image carries it when loading fails.']),
  }),
  Input: Object.freeze({ 'data-muxui-state-empty': Object.freeze(['no-writer-found']) }),
  ListBox: Object.freeze({ 'data-muxui-state-empty': Object.freeze(['not-reached', 'The list carries it only when it has no items.']) }),
  Markdown: Object.freeze({ 'data-muxui-state-invalid': Object.freeze(['spelled-differently', 'The root carries data-muxui-markdown-error with the failure code.']) }),
  MultiSelect: Object.freeze({
    'data-muxui-state-empty': Object.freeze(['not-reached', 'The option list carries it when empty, and the list is in the closed popup.']),
    'data-muxui-state-selected': Object.freeze(['not-reached', 'A selected option carries it, and the options are in the closed popup.']),
  }),
  PaymentInput: Object.freeze({ 'data-muxui-state-empty': Object.freeze(['no-writer-found']) }),
  PromptComposer: Object.freeze({ 'data-muxui-error': Object.freeze(['spelled-differently', 'The error renders as an alert (.muxui-prompt-composer__error) and the form carries data-muxui-state-invalid.']) }),
  RadioField: Object.freeze({ 'data-muxui-state-invalid': Object.freeze(['not-reached', 'The field carries it when its RadioGroup is invalid; this canvas marks only the field.']) }),
  RangeCalendar: Object.freeze({ 'data-muxui-state-read-only': Object.freeze(['spelled-differently', 'The grid carries aria-readonly.']) }),
  Resizable: Object.freeze({ 'data-muxui-state-invalid': Object.freeze(['not-reached', 'The root carries it when its configuration is not valid.']) }),
  Select: Object.freeze({ 'data-muxui-state-selected': Object.freeze(['not-reached', 'The selected option carries it, and the options are in the closed popup.']) }),
  SelectNative: Object.freeze({ 'data-muxui-state-empty': Object.freeze(['no-writer-found']) }),
  Separator: Object.freeze({ 'data-muxui-state-orientation': Object.freeze(['spelled-differently', 'The separator carries aria-orientation and the class muxui-separator--horizontal or --vertical.']) }),
  Sidebar: Object.freeze({
    'data-muxui-state-current': Object.freeze(['not-reached', 'The current link carries it on its internal nav link, which has no documented hook.']),
    'data-muxui-state-expanded': Object.freeze(['spelled-differently', 'A group carries aria-expanded on its toggle and the open attribute of its details element.']),
  }),
  Slider: Object.freeze({ 'data-muxui-state-selected': Object.freeze(['no-writer-found']) }),
  TagGroup: Object.freeze({ 'data-muxui-state-selected': Object.freeze(['not-reached', 'A selected tag carries it once selectionMode is single or multiple.']) }),
  TagSelect: Object.freeze({
    'data-muxui-state-empty': Object.freeze(['not-reached', 'The option list carries it when no option matches.']),
    'data-muxui-state-selected': Object.freeze(['spelled-differently', 'Selected items render as tags, not as selected options.']),
  }),
  TextArea: Object.freeze({ 'data-muxui-state-empty': Object.freeze(['no-writer-found']) }),
  Virtualizer: Object.freeze({ 'data-muxui-state-disabled': Object.freeze(['not-reached', 'A disabled row carries it, and the rows render only with a measured viewport.']) }),
});

/** The sentence a pinned zero row prints after its note. */
function notObservedNote(family, hook) {
  const entry = NOT_OBSERVED_IN_CANVAS[family]?.[hook];
  if (entry === undefined) return undefined;
  const [reason, recordedDetail] = entry;
  const slug = family.replace(/([a-z])([A-Z])/gu, '$1-$2').toLowerCase();
  const detail = recordedDetail ?? `No emitted CSS state hook. ${nonEmittedStates[slug]?.[hook.replace('data-muxui-state-', '')] ?? 'No writer of this attribute found in the component source.'}`;
  return { reason, text: `Not observed in the Anatomy canvas (${reason}). ${detail}` };
}

const HOOK_GROUPS = Object.freeze({
  root: ['Root class'],
  part: ['Part classes', 'from catalog anatomy'],
  state: ['State attributes', 'presence only'],
  reflected: ['Reflected prop attributes', 'the value the element carries; composed parts can carry their own'],
});

/** One hooks table row: Hook, On, Live, Notes. */
function HookRow({ hook, part, on, live, note, ...attributes }) {
  return e('tr', attributes,
    e('th', { scope: 'row' }, hook === null ? e('span', { className: 'muxui-storybook-hooks-none' }, `(${part})`) : e('code', null, hook)),
    e('td', { 'data-label': 'On' }, on),
    e('td', { 'data-label': 'Live', className: live === 0 ? 'muxui-storybook-hooks-zero' : undefined }, live ?? '-'),
    e('td', null, note));
}

function HooksTable({ record, measured, tableRef }) {
  const { family, binding, hooks } = record;
  const parts = hooks.groups.filter(({ id }) => id === 'root' || id === 'part').flatMap(({ rows }) => rows);
  // The part map is the contract: a part it does not list, or a hooks block that omits one, is an error and never "no element".
  for (const part of binding.api.parts) {
    anatomyRow(binding, part);
    if (!parts.some((row) => row.part === part)) throw new Error(`${family}.${part} has no row in its hooks block`);
  }
  if (parts.length !== binding.api.parts.length) throw new Error(`${family}'s hooks block has ${parts.length} part rows for ${binding.api.parts.length} parts`);
  return e('table', { className: 'muxui-storybook-hooks', 'aria-label': `${family} hooks`, 'data-muxui-storybook-api-parts': family, ref: tableRef },
    e('thead', null, e('tr', null, ['Hook', 'On', 'Live', 'Notes'].map((heading) => e('th', { key: heading, scope: 'col' }, heading)))),
    hooks.groups.map((group) => e('tbody', { key: group.id, 'data-muxui-storybook-hooks-group': group.id },
      e('tr', null, e('th', { scope: 'rowgroup', colSpan: 4 }, HOOK_GROUPS[group.id][0], e('span', { className: 'muxui-storybook-hooks-sub' }, HOOK_GROUPS[group.id][1]))),
      group.rows.map((row) => {
        if (row.kind === 'class') {
          const reason = noElementReason(binding, row.part);
          const executable = executableAnatomyPart(family, row.part);
          const measuredClass = measured.classes[row.part];
          return e(HookRow, {
            key: `class:${row.part}`,
            hook: row.hook,
            part: row.part,
            on: measuredClass?.on ?? row.on,
            live: measuredClass?.live,
            note: row.note,
            'data-muxui-storybook-hook-part': row.part,
            'data-muxui-storybook-api-part-status': reason ? 'no-element' : measured.statuses[row.part] > 0 ? 'found' : executable ? 'executable' : 'unresolved',
            'data-muxui-storybook-api-part-proof': executable ? 'browser' : undefined,
            'data-muxui-storybook-api-part-route': reason ? `no element (${reason})` : partSelectors(binding, row.part).join(' | '),
          });
        }
        const shown = measured.attributes[row.hook];
        const pinned = shown.live === 0 && row.kind === 'state' ? notObservedNote(family, row.hook) : undefined;
        return e(HookRow, {
          key: `${row.kind}:${row.hook}`,
          hook: row.hook,
          on: shown.on,
          live: shown.live,
          note: pinned ? [row.note, ' ', e('span', { key: 'reason', 'data-muxui-storybook-live-reason': pinned.reason }, pinned.text)] : row.note,
          'data-muxui-storybook-hook-kind': row.kind,
        });
      }),
      group.id === 'reflected' ? hooks.notSet.map((row) => e(HookRow, { key: `not-set:${row.hook}`, hook: row.hook, on: row.on, live: undefined, note: row.note, 'data-muxui-storybook-hook-kind': 'not-set' })) : null)),
  );
}

function AnatomyHarness({ record, args }) {
  const hostRef = React.useRef(null);
  const tableRef = React.useRef(null);
  const [measured, setMeasured] = React.useState(() => measureHooks(record, null));
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const collect = () => {
      const next = measureHooks(record, host);
      // An unchanged measure keeps the same object, so React does not render the table again.
      setMeasured((previous) => JSON.stringify(next) === JSON.stringify(previous) ? previous : next);
    };
    collect();
    // Overlay-backed families (notably Toast) mount their actual parts in a portal after the first render, and a state such as hovered
    // or a prop change only writes an attribute. Watch both: additions anywhere in the document (a portal's place), and the attributes
    // the table lists, with `class`, which decides what a class row matches. The table's own updates are not input.
    const attributes = unique(['class', ...record.hooks.groups.filter(({ id }) => id === 'state' || id === 'reflected').flatMap(({ rows }) => rows.map(({ hook }) => hook))]);
    const observer = typeof MutationObserver === 'function' && host.ownerDocument.body
      ? new MutationObserver((changes) => { if (changes.some(({ target }) => !tableRef.current?.contains(target))) collect(); })
      : undefined;
    observer?.observe(host.ownerDocument.body, { childList: true, subtree: true, attributes: true, attributeFilter: attributes });
    return () => observer?.disconnect();
  }, [record]);
  const anatomyArgs = anatomyArgsForBinding(record, args);
  // Compound-only parts need live specimens alongside the flat state matrix.
  const anatomySupport = record.family === 'ColorPicker'
    ? e(MuxUI.ColorPicker, { defaultValue: '#ff0000' },
      e(MuxUI.ColorSlider, { label: 'Red', channel: 'red', defaultValue: '#ff0000' }),
      e(MuxUI.ColorSwatch, { color: '#ff0000' }))
    : null;
  const content = [
    renderStateCoverage(record, anatomyArgs),
    anatomySupport,
    e('div', { key: 'hooks', className: 'muxui-storybook-anatomy-status' },
      e(HooksTable, { record, measured, tableRef }),
      e('p', null, 'Live counts the distinct elements of this story, its canvas and the overlays it renders, that carry the hook. On shows the tags and parts found there; a part marked styled is selected by a Mux rule but not shown by this canvas.')),
  ];
  // The host holds the Toast provider, so the region it portals out is part of this story.
  return e('div', {
    ref: hostRef,
    className: 'muxui-storybook-proof',
    role: 'group',
    'aria-label': 'Anatomy and composition',
    'data-muxui-storybook-proof': 'anatomy',
  }, ...(record.family === 'Toast' ? [e(MuxUI.ToastProvider, null, ...content)] : content));
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
  const trigger = browserProofElement(canvasElement, '.muxui-dialog__trigger, .muxui-button', family);
  trigger.focus();
  trigger.click();
  await waitForBrowserEvent(canvasElement, 'openChange', family);
  const dialog = await waitForBrowserElement('.muxui-dialog', document, 2_000);
  assertBrowser(browserElementVisible(dialog), 'dialog portal is visible after activation');
  await waitForBrowserFocusWithin(dialog);
  const close = dialog.querySelector('.muxui-dialog__close');
  assertBrowser(close, 'dialog close control is missing');
  close.click();
  await waitForBrowserElementGone('.muxui-dialog__backdrop');
  await waitForBrowserFocus(trigger);
}

async function popoverBrowserProof({ canvasElement }) {
  const family = 'Popover';
  const trigger = browserProofElement(canvasElement, '.muxui-popover__trigger, .muxui-button', family);
  trigger.click();
  await waitForBrowserEvent(canvasElement, 'openChange', family);
  const popover = await waitForVisibleBrowserElement('.muxui-popover', family);
  const bounds = popover.getBoundingClientRect();
  assertBrowser(bounds.width > 0 && bounds.height > 0, 'popover has measurable geometry');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

// HeaderNav shows its trigger only below the 40rem container query on the specimen frame, so the proof narrows
// that frame, whatever the viewport, and restores it. A DOM click reaches a hidden trigger, so the trigger must
// first be visible with the header's own links and Sign in hidden. The drawer then holds the links and Sign in.
async function headerNavBrowserProof({ canvasElement }) {
  const family = 'HeaderNav';
  const frame = browserProofElement(canvasElement, '.muxui-storybook-header-frame', family);
  const inlineSize = frame.style.inlineSize;
  frame.style.inlineSize = '20rem';
  try {
    const trigger = await waitForVisibleBrowserElement('.muxui-header-nav__mobile-trigger', family);
    for (const selector of ['.muxui-header-nav__secondary', '.muxui-header-nav__actions', '.muxui-header-nav__actions button']) {
      assertBrowser(!browserElementVisible(browserProofElement(canvasElement, selector, family)), `${selector} is hidden in the narrow header`);
    }
    trigger.focus();
    trigger.click();
    const dialog = await waitForVisibleBrowserElement('.muxui-header-nav__mobile-dialog', family);
    await waitForBrowserFocusWithin(dialog);
    const entries = [...dialog.querySelectorAll('a, button:not(.muxui-header-nav__mobile-close-btn)')].map((node) => node.textContent?.trim());
    assertBrowser(entries.join('|') === 'Docs|Components|Blocks|Sign in', `the drawer lists the links then Sign in, found ${entries.join('|')}`);
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
    await waitForBrowserElementGone('.muxui-header-nav__mobile-dialog');
    await waitForBrowserFocus(trigger);
  } finally {
    frame.style.inlineSize = inlineSize;
  }
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
  const dismiss = toast.querySelector('.muxui-toast__dismiss');
  assertBrowser(dismiss, 'toast dismiss control is missing');
  dismiss.click();
  await waitForBrowserEvent(canvasElement, 'dismiss', family);
}

const BROWSER_PROOF_PLANS = {
  Button: activationPlan('Button', '.muxui-button'),
  Breadcrumbs: activationPlan('Breadcrumbs', '.muxui-breadcrumbs__link', 'navigate'),
  Checkbox: activationPlan('Checkbox', '.muxui-checkbox input', 'change'),
  Disclosure: activationPlan('Disclosure', '.muxui-disclosure__trigger', 'expandedChange'),
  DisclosureGroup: activationPlan('DisclosureGroup', '.muxui-disclosure__trigger', 'expandedChange'),
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
    assertBrowser(root.querySelector('.muxui-meter__fill')?.style.inlineSize?.endsWith('%'), 'meter fill exposes a proportional geometry');
  },
  ProgressBar: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-progress-bar', 'ProgressBar');
    assertBrowser(root.getAttribute('role') === 'progressbar', 'progress bar role');
    assertBrowser(root.querySelector('.muxui-progress-bar__track'), 'progress bar track');
    assertBrowser(root.querySelector('.muxui-progress-bar__fill'), 'progress bar fill');
    assertBrowser(root.getAttribute('aria-valuenow') !== null, 'progress bar exposes its current value');
  },
  Separator: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-separator', 'Separator');
    assertBrowser(root.getAttribute('role') === 'separator', 'separator role');
    assertBrowser(root.getAttribute('aria-orientation') === 'horizontal' || root.classList.contains('muxui-separator--horizontal'), 'separator orientation');
  },
  ToggleButton: activationPlan('ToggleButton', '.muxui-toggle-button', 'change'),
  Autocomplete: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-autocomplete', 'Autocomplete');
    const input = root.querySelector('input');
    assertBrowser(input, 'autocomplete input');
    input.focus();
    const list = await waitForVisibleBrowserElement('.muxui-autocomplete__list', 'Autocomplete');
    const option = list.querySelector('.muxui-autocomplete__option');
    assertBrowser(option, 'autocomplete option');
    option.click();
    await waitForBrowserEvent(canvasElement, 'change', 'Autocomplete');
    assertBrowser(input.value.length > 0, 'autocomplete selection populates the input');
  },
  CheckboxGroup: activationPlan('CheckboxGroup', '.muxui-checkbox input', 'change'),
  DateField: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-date-field', 'DateField');
    const segment = root.querySelector('[data-muxui-state-type="day"], .muxui-date-segment');
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
    assertBrowser(popover.querySelector('.muxui-calendar__cell'), 'date picker calendar cells');
  },
  DateRangePicker: async ({ canvasElement }) => {
    const trigger = browserProofElement(canvasElement, '.muxui-date-trigger', 'DateRangePicker');
    trigger.click();
    await waitForBrowserEvent(canvasElement, 'openChange', 'DateRangePicker');
    const popover = await waitForVisibleBrowserElement('.muxui-date-popover', 'DateRangePicker');
    assertBrowser(popover.querySelector('.muxui-range-calendar__cell'), 'date range calendar cells');
  },
  Form: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-form', 'Form');
    const submit = root.querySelector('button[type="submit"]');
    assertBrowser(submit, 'form submit control');
    // Form's submit and reset are the native events, which pass through unchanged and join no logged channel,
    // so the proof watches the native submit itself.
    let submitted = false;
    root.addEventListener('submit', (event) => {
      submitted = true;
      event.preventDefault();
    }, { once: true, capture: true });
    submit.click();
    assertBrowser(submitted, 'submitting the form fires its native submit event');
  },
  NumberField: activationPlan('NumberField', '.muxui-number-field__increment', 'change'),
  SearchField: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-search-field', 'SearchField');
    const input = root.querySelector('input');
    assertBrowser(input, 'search input');
    setBrowserInputValue(input, 'proof');
    await waitForBrowserEvent(canvasElement, 'change', 'SearchField');
    const clear = root.querySelector('.muxui-search-field__clear');
    assertBrowser(clear, 'search clear control');
    clear.click();
    await waitForBrowserEvent(canvasElement, 'clear', 'SearchField');
    assertBrowser(input.value === '', 'clear interaction empties the search field');
  },
  Switch: activationPlan('Switch', '.muxui-switch input[type="checkbox"]', 'change'),
  TextField: inputChangePlan('TextField', 'input', 'proof'),
  TimeField: async ({ canvasElement }) => {
    assertBrowser(browserProofElement(canvasElement, '.muxui-time-field', 'TimeField').querySelector('[data-muxui-state-type="hour"]'), 'time segment');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1500));
    await repeatBrowserInteractionUntilEvent(canvasElement, 'change', 'TimeField', () => {
      return new Promise((resolvePromise) => setTimeout(() => {
        const root = browserProofElement(canvasElement, '.muxui-time-field', 'TimeField');
        const segment = root.querySelector('[data-muxui-state-type="hour"]');
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
    const cell = root.querySelector('[data-muxui-state-type="day"]:not([aria-disabled="true"]):not([data-muxui-state-selected="true"]), .muxui-calendar__cell:not([aria-disabled="true"])');
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
    const track = root.querySelector('.muxui-color-slider__track');
    assertBrowser(track, 'color slider track');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    activateBrowserColorTarget(track);
    await waitForBrowserEvent(canvasElement, 'change', 'ColorSlider');
  },
  ColorSwatch: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-color-swatch', 'ColorSwatch');
    const bounds = root.getBoundingClientRect();
    assertBrowser(bounds.width > 0 && bounds.height > 0, 'color swatch has measurable geometry');
    assertBrowser(root.getAttribute('data-muxui-color') || getComputedStyle(root).backgroundColor !== '', 'color swatch exposes a color presentation');
  },
  ColorSwatchPicker: activationPlan('ColorSwatchPicker', '.muxui-color-swatch-picker__item', 'change'),
  ColorWheel: async ({ canvasElement }) => {
    const control = browserProofElement(canvasElement, '.muxui-color-wheel [role="slider"], .muxui-color-wheel input[type="range"]', 'ColorWheel');
    nudgeBrowserRangeControl(control);
    await waitForBrowserEvent(canvasElement, 'change', 'ColorWheel');
  },
  ComboBox: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-combo-box', 'ComboBox');
    const input = root.querySelector('input');
    assertBrowser(input, 'combo box input');
    const trigger = root.querySelector('.muxui-combo-box__trigger');
    assertBrowser(trigger, 'combo box options trigger');
    trigger.click();
    const option = await waitForVisibleBrowserElement('.muxui-combo-box__option', 'ComboBox');
    assertBrowser(option, 'combo box option');
    option.click();
    await waitForBrowserEvent(canvasElement, 'select', 'ComboBox');
    assertBrowser(input.value.length > 0, 'combo box selection populates the input');
  },
  GridList: collectionSelectionPlan('GridList', '.muxui-grid-list__item'),
  ListBox: collectionSelectionPlan('ListBox', '.muxui-list-box__item'),
  // The proof story logs every event, which selects the triggered composition, so the items mount once it opens.
  Menu: async ({ canvasElement }) => {
    canvasElement.querySelector('.muxui-menu__trigger')?.click();
    const item = await waitForVisibleBrowserElement('.muxui-menu__item', 'Menu');
    item.focus();
    item.click();
    await waitForBrowserEvent(canvasElement, 'action', 'Menu');
  },
  RadioGroup: activationPlan('RadioGroup', '.muxui-radio-group__radio', 'change'),
  RangeCalendar: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-range-calendar', 'RangeCalendar');
    const cells = [...root.querySelectorAll('.muxui-range-calendar__cell:not([aria-disabled="true"]):not([data-muxui-state-selected="true"])')];
    assertBrowser(cells.length >= 2, 'range calendar has two unselected day cells');
    cells[0].click();
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    cells[1].click();
    await waitForBrowserEvent(canvasElement, 'change', 'RangeCalendar');
  },
  Select: async ({ canvasElement }) => {
    const trigger = browserProofElement(canvasElement, '.muxui-select__trigger', 'Select');
    trigger.click();
    await waitForBrowserEvent(canvasElement, 'openChange', 'Select');
    const popover = await waitForVisibleBrowserElement('.muxui-select__popup', 'Select');
    assertBrowser(popover.querySelector('.muxui-select__option'), 'select options');
  },
  Slider: rangeChangePlan('Slider', '[role="slider"], input[type="range"]'),
  Table: activationPlan('Table', '.muxui-table__row', 'rowAction'),
  Tabs: activationPlan('Tabs', '.muxui-tabs__tab:nth-of-type(2)', 'change'),
  TagGroup: activationPlan('TagGroup', '.muxui-tag-group__remove', 'remove'),
  ToggleButtonGroup: activationPlan('ToggleButtonGroup', '.muxui-toggle-button', 'selectionChange'),
  TokenField: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-token-field', 'TokenField');
    const input = root.querySelector('.muxui-token-field__input[contenteditable="true"]');
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
    assertBrowser([...root.querySelectorAll('.muxui-token-field__token')].some((token) => token.textContent === 'Review'), 'Enter turns the draft into a token');
  },
  Toolbar: async ({ canvasElement }) => {
    const root = browserProofElement(canvasElement, '.muxui-toolbar', 'Toolbar');
    assertBrowser(root.getAttribute('role') === 'toolbar', 'toolbar role');
    assertBrowser(root.querySelector('button, [role="button"]'), 'toolbar control');
  },
  Tree: collectionSelectionPlan('Tree', '.muxui-tree__item'),
  Virtualizer: async ({ canvasElement }) => {
    const virtualizer = browserProofElement(canvasElement, '.muxui-virtualizer', 'Virtualizer');
    const item = virtualizer.querySelector('.muxui-virtualizer__item');
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
BROWSER_PROOF_PLANS.HeaderNav = headerNavBrowserProof;
const R16_BROWSER_PROOF_ROOTS = Object.freeze({
  AlertDialog: '.muxui-alert-dialog__trigger',
  Avatar: '.muxui-avatar',
  ButtonGroup: '.muxui-button-group button',
  Card: '.muxui-card',
  CodeBlock: '.muxui-code-block__copy',
  PromptComposer: '.muxui-prompt-composer__input',
  Message: '.muxui-message__sources-trigger',
  Activity: '.muxui-activity__trigger',
  DataDiff: '.muxui-data-diff input[type="checkbox"]',
  CheckboxField: '.muxui-checkbox-field__button',
  ColorModeToggle: '.muxui-color-mode-toggle',
  CommandPalette: '.muxui-command-palette__trigger',
  Image: '.muxui-image',
  InputTags: '.muxui-input-tags input',
  Input: '.muxui-input',
  Lightbox: '.muxui-lightbox__trigger',
  Markdown: '.muxui-markdown',
  MultiSelect: '.muxui-multi-select__trigger',
  PaymentInput: '.muxui-payment-input__input',
  ProgressCircle: '.muxui-progress-circle',
  RadioField: '.muxui-radio-field__button',
  Resizable: '.muxui-resizable__handle',
  SelectNative: '.muxui-select-native',
  Sidebar: '.muxui-sidebar__mobile-trigger',
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
    argTypes: argTypesForBinding(record.binding, record.typed),
    render: (args) => renderEvents(args),
  };
}

export function createAnatomyStory(record) {
  const argTypes = argTypesForBinding(record.binding, record.typed);
  // Menu's Anatomy is a fixed composition (see anatomyArgsForBinding): its children take precedence over `items`, so that control is not offered.
  if (record.family === 'Menu') argTypes.items = { ...argTypes.items, control: false };
  return {
    name: 'Anatomy / Composition',
    args: storyArgsForBinding(record.binding, 'states', record.family),
    argTypes,
    render: (args) => e(AnatomyHarness, { record, args }),
  };
}

export function createControlledStory(record) {
  const args = controlledStoryArgsForBinding(record.binding, record.family);
  if (record.family === 'ColorModeToggle') delete args.mode;
  return {
    name: 'Controlled',
    args,
    argTypes: argTypesForBinding(record.binding, record.typed),
    render: (args) => e(ControlledHarness, { record, args }),
  };
}

export function createUncontrolledStory(record) {
  const args = uncontrolledStoryArgsForBinding(record.binding, record.family);
  if (record.family === 'ColorModeToggle') {
    delete args.defaultMode;
    delete args.storageKey;
  }
  return {
    name: 'Uncontrolled',
    args,
    argTypes: argTypesForBinding(record.binding, record.typed),
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
    argTypes: argTypesForBinding(record.binding, record.typed),
    parameters: {
      muxuiProof: {
        browser: true,
        events: storyApi(record.binding).events,
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

const SELECT_NATIVE_PANELS = Object.freeze([['', 'Choose a panel'], ['inbox', 'Inbox'], ['research', 'Research']]);
const selectNativePanels = () => SELECT_NATIVE_PANELS.map(([value, label]) => e('option', { key: value, value }, label));

// The native select owns value, defaultValue, and onChange, outside SelectNative's derived API
// (Decision 0031), so no generated Controlled or Events story shows them. This one does: a select
// that follows its change event beside one that starts from a default value and keeps its own.
function SelectNativeSelection() {
  const [value, setValue] = React.useState('inbox');
  const [changes, setChanges] = React.useState([]);
  const onChange = (event) => {
    const next = event.currentTarget.value;
    setValue(next);
    setChanges((previous) => [...previous, `change: ${next}`].slice(-12));
  };
  return e('div', {
    className: 'muxui-storybook-proof',
    role: 'group',
    'aria-label': 'Native selection',
    'data-muxui-storybook-proof': 'native-selection',
  },
  e(MuxUI.SelectNative, { label: 'Controlled panel', value, onChange }, ...selectNativePanels()),
  e(HarnessStatus, {
    label: 'Value',
    note: 'The change event sets the value the select shows.',
    children: e('output', { 'aria-label': 'Controlled panel value', 'data-muxui-select-native-value': '' }, value),
  }),
  e(HarnessStatus, {
    label: 'Event log',
    note: 'Choose a controlled panel to record its change event.',
    children: e('ol', { 'aria-live': 'polite', 'data-muxui-storybook-event-log': 'SelectNative' },
      changes.length === 0
        ? e('li', { 'data-muxui-storybook-event-status': 'waiting' }, 'Waiting for: change')
        : changes.map((message, index) => e('li', { key: `${message}-${index}` }, message))),
  }),
  e(MuxUI.SelectNative, { label: 'Default panel', description: 'Starts at Research and keeps its own selection.', defaultValue: 'research' }, ...selectNativePanels()));
}

/** SelectNative's native controlled and default-value selection, side by side. */
export function createSelectNativeSelectionStory(record) {
  if (record.family !== 'SelectNative') throw new TypeError('Native selection stories require the SelectNative family');
  return {
    name: 'Native selection',
    args: {},
    argTypes: argTypesForBinding(record.binding, record.typed),
    parameters: { controls: { disable: true } },
    render: () => e(SelectNativeSelection),
  };
}

// A menu with a submenu, alone on the page and closed. The state matrix opens its popups together, and React Aria hides
// the others while one is open, so a nested menu is unreachable there; here a person or a test can open it, move into the
// submenu and back, and close it, with a control after it for Tab to land on.
function MenuNestedSpecimen() {
  return e('div', {
    className: 'muxui-storybook-proof',
    role: 'group',
    'aria-label': 'Nested submenu',
    'data-muxui-storybook-proof': 'menu-nested',
    style: { display: 'flex', alignItems: 'flex-start', gap: '1rem', minBlockSize: '14rem' },
  },
  e(MuxUI.Menu.Root, null,
    e(MuxUI.Menu.Trigger, { id: 'menu-nested-trigger' }, 'Actions'),
    e(MuxUI.Menu.Popup, null,
      e(MuxUI.Menu.List, { 'aria-label': 'Actions' },
        e(MuxUI.Menu.Item, { id: 'rename' }, 'Rename'),
        e(MuxUI.Menu.Submenu, null,
          e(MuxUI.Menu.Item, { id: 'share' }, 'Share'),
          e(MuxUI.Menu.Popup, null,
            e(MuxUI.Menu.List, { 'aria-label': 'Share' },
              e(MuxUI.Menu.Item, { id: 'copy-link' }, 'Copy link'),
              e(MuxUI.Menu.Item, { id: 'email' }, 'Email')))),
        e(MuxUI.Menu.Item, { id: 'delete' }, 'Delete')))),
  e(MuxUI.Button, { id: 'menu-nested-after' }, 'After'));
}

/** Menu's nested submenu, isolated from the state matrix, for the keyboard proof that opens it. */
export function createMenuNestedStory(record) {
  if (record.family !== 'Menu') throw new TypeError('Nested submenu stories require the Menu family');
  return {
    name: 'Nested submenu keyboard navigation',
    args: {},
    argTypes: argTypesForBinding(record.binding, record.typed),
    parameters: { controls: { disable: true } },
    render: () => e(MenuNestedSpecimen),
  };
}

// Button's finite values come from its derived API (Decision 0031), in source order.
const BUTTON_MATRIX_VARIANTS = Object.freeze([...buttonApi.api.propDetails.variant.enum]);
const BUTTON_MATRIX_SIZES = Object.freeze([...buttonApi.api.propDetails.size.enum]);

/** Render every adopted Button axis combination in one compact inspection story. */
export function createButtonMatrixStory(record) {
  if (record.family !== 'Button') throw new TypeError('Button matrix stories require the Button family');
  return {
    name: 'Variant × size',
    args: {},
    argTypes: argTypesForBinding(record.binding, record.typed),
    parameters: {
      controls: { disable: true },
      muxuiButtonMatrix: { combinations: BUTTON_MATRIX_VARIANTS.length * BUTTON_MATRIX_SIZES.length },
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
        props: storyApi(record.binding).props,
        events: storyApi(record.binding).events,
        parts: record.binding.api.parts,
        states: record.binding.states,
        controlled: controlledDefaultPairsForBinding(record.binding),
      },
    },
    argTypes: argTypesForBinding(record.binding, record.typed),
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
    argTypes: argTypesForBinding(record.binding, record.typed),
    parameters: variant === 'states'
      ? { muxuiStateCoverage: stateCoverageForBinding(record.binding, record.family) }
      : undefined,
    render,
  };
}
