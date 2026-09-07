import finiteFixtures from '../../../../catalog/react-r1-6/finite-fixtures.json' with { type: 'json' };
import { fixtureContractFor } from '../../src/visual-migration-contract.mjs';

const CURRENT_SOURCE = 'current-r1-6';
const MARKDOWN_INVALID_LINE = 'x'.repeat(10_001);

const DEFAULT_ITEMS = Object.freeze([
  Object.freeze({ id: 'melbourne', label: 'Melbourne' }),
  Object.freeze({ id: 'sydney', label: 'Sydney' }),
  Object.freeze({ id: 'brisbane', label: 'Brisbane' }),
]);

const currentFamilies = finiteFixtures.components.filter(({ source }) => source === CURRENT_SOURCE);
const caseIndex = new Map(currentFamilies.flatMap((component) => (component.interactionCases ?? []).map((candidate) => [candidate.id, {
  id: candidate.id,
  component: component.family,
  state: candidate.state,
  props: candidate.props ?? {},
  action: candidate.action,
}])));

if (currentFamilies.length !== finiteFixtures.current.supplementalCount) {
  throw new Error('R1.6 current scene must derive every supplemental family from finite-fixtures.json');
}

function parseProps(params) {
  const value = params.get('props');
  if (!value) return {};
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('R1.6 props must be a JSON object');
  return parsed;
}

export function currentEntryForLocation(params) {
  const id = params.get('case');
  const component = params.get('component') ?? params.get('family');
  const state = params.get('state') ?? 'idle';
  const candidate = caseIndex.get(id) ?? (component ? { id: id ?? `${component.toLowerCase()}--${state}`, component, state, props: {}, action: undefined } : undefined);
  if (!candidate || !currentFamilies.some(({ family }) => family === candidate.component)) {
    throw new Error('R1.6 current bootstrap needs a current case or component query parameter');
  }
  return { ...candidate, props: { ...candidate.props, ...parseProps(params) } };
}

function familyData(entry, inherited) {
  const base = {
    ...inherited.data,
    label: 'Name',
    placeholder: 'Enter a value',
    description: 'Supporting information',
    error: 'Please check this value.',
    items: DEFAULT_ITEMS,
  };
  switch (entry.component) {
    case 'Card': return { ...base, label: 'Profile', description: 'Account details' };
    case 'CheckboxField': return { ...base, label: 'Email updates', description: 'Receive product news.' };
    case 'ColorModeToggle': return { ...base, label: 'Color mode' };
    case 'InputTags': return { ...base, label: 'Technologies', placeholder: 'Add a tag', description: 'Add the tools you use.', items: DEFAULT_ITEMS };
    case 'Input': return { ...base, label: 'Name', placeholder: 'Ada Lovelace', description: 'Use your preferred display name.', value: 'Ada Lovelace' };
    case 'Lightbox': return { ...base, label: 'Gallery', items: [{ id: 'one', key: 'one', label: 'Example' }, { id: 'two', key: 'two', label: 'Second example' }] };
    case 'Markdown': return { ...base, label: 'Notes', description: 'A safe link.', markdown: entry.state === 'invalid' ? MARKDOWN_INVALID_LINE : '# Notes\n\nA [safe link](https://example.com).' };
    case 'MultiSelect': return { ...base, label: 'Technologies', placeholder: 'Select technologies', description: 'Choose the tools you use.', items: [{ id: 'react', label: 'React' }, { id: 'css', label: 'CSS' }] };
    case 'PaymentInput': return { ...base, label: 'Card number', placeholder: '1234 5678 9012 3456', description: 'Your card number is encrypted.' };
    case 'ProgressCircle': return { ...base, label: 'Upload progress' };
    case 'RadioField': return { ...base, label: 'Monthly', description: 'Billed every month.' };
    case 'Resizable': return { ...base, label: 'Workspace', description: 'Files and preview.' };
    case 'Sidebar': return { ...base, label: 'Workspace', description: 'Navigation' };
    case 'SwitchField': return { ...base, label: 'Notifications', description: 'Enable product updates.' };
    case 'TagSelect': return { ...base, label: 'Tags', placeholder: 'Add a tag', description: 'Choose one or more tags.', items: [{ id: 'react', label: 'React' }, { id: 'css', label: 'CSS' }] };
    case 'TextArea': return { ...base, label: 'Notes', placeholder: 'Write a note', description: 'Keep it concise.', value: 'A short note.' };
    case 'TextEditor': return { ...base, label: 'Note', placeholder: 'Write a note', description: 'A short formatted note.' };
    default: return base;
  }
}

/** One current-only data contract, keyed by the canonical finite fixture case. */
export function currentSceneFor(entry) {
  const inherited = fixtureContractFor({ family: entry.component }, entry.state);
  return { ...inherited, data: familyData(entry, inherited) };
}

export function actionForCurrentEntry(entry) {
  if (typeof entry.action === 'string') return { type: entry.action };
  return entry.action && typeof entry.action === 'object' ? entry.action : undefined;
}

export function initialOverlaySelectorForCurrentEntry(entry, renderer = 'mux') {
  const prefix = renderer === 'mux' ? 'muxui' : 'tale';
  const selectors = {
    AlertDialog: `.${prefix}-alert-dialog__popup, .${prefix}-alert-dialog__backdrop`,
    CommandPalette: `.${prefix}-command-palette__popup`,
    Lightbox: `.${prefix}-lightbox-popup`,
    MultiSelect: `.${prefix}-multi-select__popup`,
    TagSelect: `.${prefix}-tag-select__popup`,
  };
  return selectors[entry?.component];
}

export function initialOverlayReadyForCurrentEntry(entry, renderer = 'mux') {
  const state = normalizedCurrentState(entry?.state);
  const chipOnlyState = state === 'selected' && ['MultiSelect', 'TagSelect'].includes(entry?.component);
  const needsPortal = entry?.props?.open === true
    || (!chipOnlyState && ['open', 'filtered', 'empty', 'itemhovered', 'itemfocused', 'itemselected', 'itemdisabled', 'closing'].includes(state));
  if (!needsPortal) return true;
  const selector = initialOverlaySelectorForCurrentEntry(entry, renderer);
  if (!selector) return true;
  return [...document.querySelectorAll(selector)].some((element) => {
    if (element.getClientRects().length === 0) return false;
    const styles = getComputedStyle(element);
    return styles.display !== 'none' && styles.visibility !== 'hidden';
  });
}

export function normalizedCurrentState(state) {
  return String(state).toLowerCase().replaceAll('-', '');
}

function actionTargetForCurrent(root, entry) {
  const action = actionForCurrentEntry(entry);
  if (!action || typeof action !== 'object' || !['hover', 'focus', 'press'].includes(action.type) || typeof action.selector !== 'string') return undefined;
  try {
    return root?.querySelector(action.selector) ?? document.querySelector(action.selector) ?? undefined;
  } catch {
    return undefined;
  }
}

function keyedElements(root, keys) {
  const elements = new Set();
  for (const key of keys) {
    const escaped = globalThis.CSS?.escape ? CSS.escape(String(key)) : String(key).replaceAll(/(["\\])/gu, '\\$1');
    const selector = `[data-key="${escaped}"], [data-id="${escaped}"]`;
    try {
      for (const element of root?.querySelectorAll(selector) ?? []) elements.add(element);
      for (const element of document.querySelectorAll(selector)) elements.add(element);
    } catch {
      // A malformed fixture key cannot prove a target state.
      return [];
    }
  }
  return [...elements];
}

function keyboardFocusVisible(element) {
  return element?.matches(':focus-visible')
    || element?.getAttribute('data-focus-visible') === ''
    || element?.getAttribute('data-focus-visible') === 'true';
}

function virtualFocusTargetReached(target) {
  const owner = document.activeElement;
  if (!owner || owner === document.body || !keyboardFocusVisible(owner)) return false;
  const activeDescendant = owner.getAttribute('aria-activedescendant');
  if (!activeDescendant || target.id !== activeDescendant) return false;
  if (target.getClientRects().length === 0) return false;
  const styles = getComputedStyle(target);
  return styles.display !== 'none' && styles.visibility !== 'hidden';
}

function focusedOwnerReached(root) {
  const active = document.activeElement;
  if (!active || active === document.body || !root.contains(active)) return false;
  let candidate = active;
  while (candidate && candidate !== root) {
    if (keyboardFocusVisible(candidate)) return true;
    candidate = candidate.parentElement;
  }
  return keyboardFocusVisible(active);
}

function targetStateReached(root, state, entry) {
  const action = actionForCurrentEntry(entry);
  const target = actionTargetForCurrent(root, entry);
  if (action && typeof action === 'object' && ['hover', 'focus', 'press'].includes(action.type)) {
    if (!target) return false;
    if (action.type === 'hover') return target.matches(':hover') || target.getAttribute('data-hovered') === '' || target.getAttribute('data-hovered') === 'true';
    if (action.type === 'focus') {
      if (document.activeElement === target) return keyboardFocusVisible(target);
      return virtualFocusTargetReached(target);
    }
    return target.matches(':active') || target.getAttribute('data-pressed') === '' || target.getAttribute('data-pressed') === 'true' || target.getAttribute('aria-pressed') === 'true';
  }

  const normalized = normalizedCurrentState(state);
  const props = entry?.props && typeof entry.props === 'object' ? entry.props : {};
  if ((normalized === 'selected' || entry?.id?.includes('--item-selected')) && Array.isArray(props.selectedKeys) && props.selectedKeys.length > 0) {
    return props.selectedKeys.every((key) => keyedElements(root, [key]).some((element) => element.getAttribute('aria-selected') === 'true' || element.getAttribute('data-selected') === '' || element.getAttribute('data-selected') === 'true'));
  }
  if ((normalized === 'disabled' || entry?.id?.includes('--item-disabled')) && Array.isArray(props.items)) {
    const disabledKeys = props.items.filter((item) => item && typeof item === 'object' && item.disabled === true).map((item) => item.id ?? item.key).filter((key) => key !== undefined);
    if (disabledKeys.length > 0) return disabledKeys.every((key) => keyedElements(root, [key]).some((element) => element.disabled === true || element.getAttribute('aria-disabled') === 'true' || element.getAttribute('data-disabled') === '' || element.getAttribute('data-disabled') === 'true'));
  }
  return true;
}

export function stateReachedForCurrent(root, state, entry, renderer = 'mux') {
  if (!root) return false;
  const elements = [root, ...root.querySelectorAll('*')];
  const truthy = (element, name) => {
    const value = element.getAttribute(name);
    return name.startsWith('aria-') ? value === 'true' : value !== null && value !== 'false';
  };
  const classList = (element) => typeof element.className === 'string' ? element.className : typeof element.className?.baseVal === 'string' ? element.className.baseVal : '';
  const any = (predicate) => elements.some(predicate);
  const normalized = normalizedCurrentState(state);
  if (!targetStateReached(root, state, entry)) return false;
  if (normalized === 'focused' || normalized === 'tagfocused') return focusedOwnerReached(root);
  if (normalized === 'opening' || normalized === 'closing') {
    const lifecycle = lifecycleForCurrentEntry(entry ?? { state }, renderer);
    const lifecycleElements = lifecycle?.selector ? [...document.querySelectorAll(lifecycle.selector)] : elements;
    const marker = normalized === 'opening' ? ['data-entering', 'data-opening'] : ['data-exiting', 'data-closing'];
    return lifecycleElements.some((element) => marker.some((name) => truthy(element, name)));
  }
  if (normalized === 'selection') {
    const selection = document.getSelection();
    return Boolean(selection && !selection.isCollapsed && root.contains(selection.anchorNode) && document.querySelector('.muxui-text-editor__bubble-menu, .tale-text-editor__bubble-menu'));
  }
  if (normalized === 'selectioncollapsed') {
    const selection = document.getSelection();
    return Boolean(selection?.isCollapsed) && !document.querySelector('.muxui-text-editor__bubble-menu, .tale-text-editor__bubble-menu');
  }
  if (normalized === 'coloropen') return Boolean(document.querySelector('.muxui-text-editor__color-popup, .tale-text-editor__color-popup, [role="dialog"][aria-label="Text color picker"]'));
  if (normalized === 'mobile') return Boolean(document.querySelector('[role="dialog"][aria-label="Navigation"]'));
  if (normalized === 'filtered') {
    const cityFamily = root.dataset.muxuiFamily === 'CommandPalette';
    const expected = cityFamily ? 'Melbourne' : 'React';
    const absent = cityFamily ? ['Sydney', 'Brisbane'] : ['CSS'];
    const text = document.body.innerText;
    const input = [...document.querySelectorAll('.muxui-command-palette__input, .tale-command-palette__input, .muxui-multi-select__search-input, .tale-multi-select__search-input, .muxui-tag-select__input, .tale-tag-select__input')]
      .find((element) => element.getClientRects().length > 0);
    return input?.value === expected && text.includes(expected) && absent.every((value) => !text.includes(value));
  }
  if (normalized === 'open') return any((element) => truthy(element, 'data-open') || element.getAttribute('aria-expanded') === 'true') || Boolean(document.querySelector('[role="dialog"], [data-overlay-container], [role="listbox"]'));
  if (normalized === 'closed') return !document.querySelector('[role="dialog"], [data-overlay-container], [role="listbox"]');
  if (normalized === 'selected' || normalized === 'checked') return any((element) => truthy(element, 'data-selected') || element.getAttribute('aria-selected') === 'true' || element.getAttribute('aria-checked') === 'true' || element.checked === true) || Boolean(root.querySelector('.muxui-multi-select__value--selected, .muxui-tag-select__tag, .tale-multi-select__value--selected, .tale-tag-select__tag, .muxui-text-editor__btn--active, .tale-text-editor__btn--active'));
  if (normalized === 'unchecked' || normalized === 'unselected') return any((element) => element.getAttribute('aria-checked') === 'false' || element.checked === false);
  if (normalized === 'disabled') return any((element) => element.disabled === true || truthy(element, 'data-disabled') || element.getAttribute('aria-disabled') === 'true');
  if (normalized === 'invalid' && root.dataset.muxuiFamily === 'Markdown') return root.textContent?.trim() === 'Content unavailable' && !root.querySelector('h1, h2, h3, h4, h5, h6, p, a, pre, ul, ol');
  if (normalized === 'invalid') return any((element) => truthy(element, 'data-invalid') || element.getAttribute('aria-invalid') === 'true');
  if (normalized === 'indeterminate') return any((element) => truthy(element, 'data-indeterminate') || element.indeterminate === true) || root.querySelector('input[type="checkbox"]')?.indeterminate === true;
  if (normalized === 'hovered') return any((element) => truthy(element, 'data-hovered') || element.matches(':hover'));
  if (normalized === 'pressed') return any((element) => truthy(element, 'data-pressed') || element.matches(':active'));
  if (normalized === 'pending') return any((element) => truthy(element, 'data-pending') || element.getAttribute('aria-busy') === 'true');
  if (normalized === 'current') return any((element) => truthy(element, 'data-current') || element.getAttribute('aria-current') === 'page' || classList(element).includes('--current'));
  if (normalized === 'horizontal' || normalized === 'vertical') return any((element) => element.getAttribute('aria-orientation') === normalized || element.getAttribute('data-orientation') === normalized || classList(element).includes(`--${normalized}`));
  if (normalized === 'attached') return any((element) => truthy(element, 'data-attached') || classList(element).includes('--attached'));
  if (root.dataset.muxuiFamily === 'Card' && ['elevated', 'outlined', 'filled'].includes(normalized)) return any((element) => classList(element).includes(`--${normalized}`) || element.getAttribute('data-variant') === normalized);
  if (normalized === 'zero') return any((element) => element.getAttribute('aria-valuenow') === '0');
  if (normalized === 'partial') return any((element) => element.getAttribute('aria-valuenow') === '64');
  if (normalized === 'complete') return any((element) => element.getAttribute('aria-valuenow') === '100' || truthy(element, 'data-complete'));
  if (normalized === 'md' && root.dataset.muxuiFamily === 'ProgressCircle') return Boolean(root.querySelector('.muxui-progress-circle, .tale-progress-circle')) && !any((element) => classList(element).includes('--sm') || classList(element).includes('--lg'));
  if (['sm', 'md', 'lg'].includes(normalized)) return any((element) => element.getAttribute('data-size') === normalized || classList(element).includes(`--${normalized}`));
  if (normalized === 'empty') return any((element) => 'value' in element && element.value === '') || any((element) => classList(element).includes('__empty')) || Boolean(document.querySelector('.muxui-multi-select__empty, .tale-multi-select__empty, .muxui-command-palette__empty, .tale-command-palette__empty'));
  if (normalized === 'filled' || ['visa', 'mastercard', 'amex', 'discover', 'unknown'].includes(normalized)) return any((element) => 'value' in element && String(element.value).length > 0) || any((element) => element.getAttribute('data-card-type') === normalized);
  if (normalized === 'typed') return any((element) => 'value' in element && String(element.value) === '4242 4242 4242 4242') && any((element) => element.getAttribute('data-card-type') === 'visa');
  if (normalized === 'light' || normalized === 'dark') {
    const documentMode = document.documentElement.dataset.muxuiColorScheme ?? document.documentElement.dataset.colorMode;
    if (documentMode !== normalized) return false;
    if (root.dataset.muxuiFamily !== 'ColorModeToggle') return any((element) => element.getAttribute('data-mode') === normalized);
    const selected = any((element) => element.getAttribute('data-selected') === 'true' || element.getAttribute('aria-checked') === 'true');
    return normalized === 'dark' ? selected : !selected;
  }
  if (normalized === 'readonly') return any((element) => truthy(element, 'data-readonly') || element.readOnly === true || element.getAttribute('aria-readonly') === 'true');
  if (normalized === 'external') return any((element) => classList(element).includes('external'));
  if (normalized === 'expanded') return any((element) => element.open === true || element.getAttribute('aria-expanded') === 'true');
  if (normalized === 'inline') return Boolean(root.querySelector('.muxui-input-tags, .tale-input-tags')) && !root.querySelector('.muxui-input-tags--below, .tale-input-tags--below');
  if (normalized === 'below') return Boolean(root.querySelector('.muxui-input-tags--below, .tale-input-tags--below'));
  if (normalized === 'idle' || normalized === 'desktop') return true;
  return false;
}

const LIFECYCLE_SELECTORS = Object.freeze({
  AlertDialog: Object.freeze({ mux: '.muxui-alert-dialog__popup, .muxui-alert-dialog__backdrop', donor: '.tale-alert-dialog__popup, .tale-alert-dialog__backdrop' }),
  CommandPalette: Object.freeze({ mux: '.muxui-command-palette__popup', donor: '.tale-command-palette__popup' }),
  Lightbox: Object.freeze({ mux: '.muxui-lightbox-popup', donor: '.tale-lightbox__popup' }),
  MultiSelect: Object.freeze({ mux: '.muxui-multi-select__popup, .muxui-multi-select__dialog', donor: '.tale-multi-select__popup, .tale-multi-select__dialog' }),
  TagSelect: Object.freeze({ mux: '.muxui-tag-select__popup, .muxui-tag-select__listbox', donor: '.tale-tag-select__popup, .tale-tag-select__listbox' }),
});

/** Describe the family-owned overlay lifecycle sampled by the paired runner. */
export function lifecycleForCurrentEntry(entryOrState, renderer = 'mux') {
  const entry = typeof entryOrState === 'string' ? { state: entryOrState } : entryOrState ?? {};
  const normalized = normalizedCurrentState(entry.state);
  const selector = LIFECYCLE_SELECTORS[entry.component]?.[renderer];
  if (!selector || !['opening', 'closing'].includes(normalized)) return undefined;
  return normalized === 'opening'
    ? { kind: 'enter', selector, marker: ['data-entering', 'data-opening'], after: 'present' }
    : { kind: 'exit', selector, marker: ['data-exiting', 'data-closing'], after: 'absent' };
}

const CURRENT_PART_SELECTORS = Object.freeze({
  AlertDialog: Object.freeze({ mux: ['.muxui-alert-dialog__trigger'], donor: ['.tale-alert-dialog__trigger'], open: Object.freeze({ mux: ['.muxui-alert-dialog__trigger', '.muxui-alert-dialog__backdrop', '.muxui-alert-dialog__popup', '.muxui-alert-dialog__content', '.muxui-alert-dialog__close'], donor: ['.tale-alert-dialog__trigger', '.tale-alert-dialog__backdrop', '.tale-alert-dialog__popup', '.tale-alert-dialog__content', '.tale-alert-dialog__close'] }) }),
  ButtonGroup: Object.freeze({ mux: ['.muxui-button-group'], donor: ['.tale-button-group'] }),
  Card: Object.freeze({ mux: ['.muxui-card'], donor: ['.tale-card'] }),
  CheckboxField: Object.freeze({ mux: ['.muxui-checkbox-field'], donor: ['.tale-checkbox-field'] }),
  ColorModeToggle: Object.freeze({ mux: ['.muxui-color-mode-toggle'], donor: ['.tale-color-mode-toggle'] }),
  CommandPalette: Object.freeze({ mux: ['.muxui-command-palette__trigger'], donor: ['.tale-command-palette__trigger'], overlay: Object.freeze({ mux: ['.muxui-command-palette__trigger', '.muxui-command-palette__backdrop', '.muxui-command-palette__popup', '.muxui-command-palette__input', '.muxui-command-palette__listbox'], donor: ['.tale-command-palette__trigger', '.tale-command-palette__backdrop', '.tale-command-palette__popup', '.tale-command-palette__input', '.tale-command-palette__listbox'] }) }),
  HeaderNav: Object.freeze({ mux: ['.muxui-header-nav'], donor: ['.tale-header-nav'], overlay: Object.freeze({ mux: ['.muxui-header-nav__mobile-trigger', '.muxui-header-nav__mobile-overlay', '.muxui-header-nav__mobile-drawer', '.muxui-header-nav__mobile-dialog', '.muxui-header-nav__mobile-close-btn'], donor: ['.tale-header-nav__mobile-trigger', '.tale-header-nav__mobile-overlay', '.tale-header-nav__mobile-drawer', '.tale-header-nav__mobile-dialog', '.tale-header-nav__mobile-close-btn'] }) }),
  InputTags: Object.freeze({ mux: ['.muxui-input-tags'], donor: ['.tale-input-tags'] }),
  Input: Object.freeze({ mux: ['.muxui-input'], donor: ['.tale-input'] }),
  Lightbox: Object.freeze({ mux: ['.muxui-lightbox-trigger'], donor: ['.tale-lightbox__trigger'], overlay: Object.freeze({ mux: ['.muxui-lightbox-trigger', '.muxui-lightbox-backdrop', '.muxui-lightbox-popup', '.muxui-lightbox-content', '.muxui-lightbox-previous', '.muxui-lightbox-next', '.muxui-lightbox-close'], donor: ['.tale-lightbox__trigger', '.tale-lightbox__backdrop', '.tale-lightbox__popup', '.tale-lightbox__content', '.tale-lightbox__previous', '.tale-lightbox__next', '.tale-lightbox__close'] }) }),
  Markdown: Object.freeze({ mux: ['.muxui-markdown'], donor: ['.tale-markdown'] }),
  MultiSelect: Object.freeze({ mux: ['.muxui-multi-select'], donor: ['.tale-multi-select'], overlay: Object.freeze({ mux: ['.muxui-multi-select', '.muxui-multi-select__trigger', '.muxui-multi-select__popup', '.muxui-multi-select__dialog', '.muxui-multi-select__search-input', '.muxui-multi-select__listbox'], donor: ['.tale-multi-select', '.tale-multi-select__trigger', '.tale-multi-select__popup', '.tale-multi-select__dialog', '.tale-multi-select__search-input', '.tale-multi-select__listbox'] }) }),
  PaymentInput: Object.freeze({ mux: ['.muxui-payment-input'], donor: ['.tale-payment-input'] }),
  ProgressCircle: Object.freeze({ mux: ['.muxui-progress-circle'], donor: ['.tale-progress-circle'] }),
  RadioField: Object.freeze({ mux: ['.muxui-radio-field'], donor: ['.tale-radio-field'] }),
  Resizable: Object.freeze({ mux: ['.muxui-resizable'], donor: ['.tale-resizable'] }),
  Sidebar: Object.freeze({ mux: ['.muxui-sidebar'], donor: ['.tale-sidebar'], overlay: Object.freeze({ mux: ['.muxui-sidebar__mobile-header', '.muxui-sidebar__mobile-overlay', '.muxui-sidebar__mobile-drawer', '.muxui-sidebar__mobile-dialog', '.muxui-sidebar__mobile-close-btn'], donor: ['.tale-sidebar__mobile-header', '.tale-sidebar__mobile-overlay', '.tale-sidebar__mobile-drawer', '.tale-sidebar__mobile-dialog', '.tale-sidebar__mobile-close-btn'] }) }),
  SwitchField: Object.freeze({ mux: ['.muxui-switch-field'], donor: ['.tale-switch-field'] }),
  TagSelect: Object.freeze({ mux: ['.muxui-tag-select'], donor: ['.tale-tag-select'], overlay: Object.freeze({ mux: ['.muxui-tag-select', '.muxui-tag-select__group', '.muxui-tag-select__input', '.muxui-tag-select__popup', '.muxui-tag-select__listbox'], donor: ['.tale-tag-select', '.tale-tag-select__group', '.tale-tag-select__input', '.tale-tag-select__popup', '.tale-tag-select__listbox'] }) }),
  TextArea: Object.freeze({ mux: ['.muxui-text-area'], donor: ['.tale-text-area'] }),
  TextEditor: Object.freeze({ mux: ['.muxui-text-editor'], donor: ['.tale-text-editor'], coloropen: Object.freeze({ mux: ['.muxui-text-editor', '.muxui-text-editor__toolbar', '.muxui-text-editor__color-popup', '.muxui-text-editor__color-dialog'], donor: ['.tale-text-editor'] }), selection: Object.freeze({ mux: ['.muxui-text-editor', '.muxui-text-editor__content', '.muxui-text-editor__bubble-menu'], donor: ['.tale-text-editor', '.tale-text-editor__content', '.tale-text-editor__bubble-menu'] }) }),
});

const OVERLAY_STATES = new Set(['open', 'opening', 'closing', 'filtered', 'empty', 'mobile']);

function semanticPartSuffix(suffix) {
  return suffix.endsWith('__hint') ? suffix.replace(/__hint$/u, '__description') : suffix;
}

function stableRelationshipPart(target) {
  const explicitPart = target.getAttribute('data-part') ?? target.getAttribute('data-muxui-part');
  if (explicitPart) return semanticPartSuffix(explicitPart);
  const classes = typeof target.className === 'string' ? target.className.split(/\s+/u) : [];
  const classPart = classes.find((value) => /(?:^|__)(?:label|description|error|hint)$/u.test(value));
  return classPart ? semanticPartSuffix(classPart.replace(/^(?:muxui|tale)-/u, '')) : null;
}

function relationshipTarget(target) {
  if (!target) return {
    present: false,
    tagName: null,
    slot: null,
    part: null,
    role: null,
    hidden: false,
    ariaHidden: null,
    display: null,
    visibility: null,
    text: '',
  };
  const computed = target.ownerDocument?.defaultView?.getComputedStyle?.(target)
    ?? (typeof globalThis.getComputedStyle === 'function' ? globalThis.getComputedStyle(target) : undefined);
  return {
    present: true,
    tagName: target.tagName,
    slot: target.getAttribute('slot'),
    part: stableRelationshipPart(target),
    role: target.getAttribute('role'),
    hidden: typeof target.hasAttribute === 'function' ? target.hasAttribute('hidden') : target.getAttribute('hidden') !== null,
    ariaHidden: target.getAttribute('aria-hidden'),
    display: computed?.display ?? null,
    visibility: computed?.visibility ?? null,
    text: target.textContent?.trim().replace(/\s+/gu, ' ').slice(0, 200) ?? '',
  };
}

export function ariaRelationshipFacts(target, attribute, documentLike = globalThis.document) {
  const ids = (target.getAttribute(attribute) ?? '').trim().split(/\s+/u).filter(Boolean);
  const resolved = ids.map((id) => documentLike?.getElementById?.(id) ?? null);
  return {
    present: ids.length > 0,
    count: ids.length,
    resolves: ids.length > 0 && resolved.every(Boolean),
    targets: resolved.map(relationshipTarget),
  };
}

function stylePart(selector) {
  const target = document.querySelector(selector);
  if (!target) throw new Error(`current finite named part is absent: ${selector}`);
  const styles = getComputedStyle(target);
  const rect = target.getBoundingClientRect();
  const observed = {};
  for (const name of ['aria-describedby', 'aria-errormessage', 'aria-labelledby']) {
    observed[name] = ariaRelationshipFacts(target, name);
  }
  for (const name of [
    'aria-invalid', 'aria-readonly', 'aria-required', 'aria-valuenow', 'aria-valuemin', 'aria-valuemax', 'aria-valuetext',
    'data-card-type', 'data-complete', 'data-disabled', 'data-focused', 'data-hovered', 'data-indeterminate', 'data-pressed', 'data-selected',
  ]) {
    const value = target.getAttribute(name);
    if (value !== null) observed[name] = value;
  }
  if ('value' in target) observed.value = target.value;
  return {
    selector,
    tagName: target.tagName,
    className: typeof target.className === 'string' ? target.className : typeof target.className?.baseVal === 'string' ? target.className.baseVal : '',
    role: target.getAttribute('role'),
    rect: { height: rect.height, width: rect.width, x: rect.x, y: rect.y },
    properties: {
      backgroundColor: styles.backgroundColor,
      borderRadius: styles.borderRadius,
      boxShadow: styles.boxShadow,
      boxSizing: styles.boxSizing,
      color: styles.color,
      display: styles.display,
      fontFamily: styles.fontFamily,
      fontSize: styles.fontSize,
      fontWeight: styles.fontWeight,
      height: styles.height,
      lineHeight: styles.lineHeight,
      letterSpacing: styles.letterSpacing,
      opacity: styles.opacity,
      alignItems: styles.alignItems,
      columnGap: styles.columnGap,
      gap: styles.gap,
      justifyContent: styles.justifyContent,
      marginBottom: styles.marginBottom,
      marginLeft: styles.marginLeft,
      marginRight: styles.marginRight,
      marginTop: styles.marginTop,
      maxHeight: styles.maxHeight,
      maxWidth: styles.maxWidth,
      minHeight: styles.minHeight,
      minWidth: styles.minWidth,
      outlineColor: styles.outlineColor,
      outlineOffset: styles.outlineOffset,
      outlineStyle: styles.outlineStyle,
      outlineWidth: styles.outlineWidth,
      borderBottomColor: styles.borderBottomColor,
      borderBottomStyle: styles.borderBottomStyle,
      borderBottomWidth: styles.borderBottomWidth,
      borderLeftColor: styles.borderLeftColor,
      borderLeftStyle: styles.borderLeftStyle,
      borderLeftWidth: styles.borderLeftWidth,
      borderRightColor: styles.borderRightColor,
      borderRightStyle: styles.borderRightStyle,
      borderRightWidth: styles.borderRightWidth,
      borderTopColor: styles.borderTopColor,
      borderTopStyle: styles.borderTopStyle,
      borderTopWidth: styles.borderTopWidth,
      paddingBottom: styles.paddingBottom,
      paddingLeft: styles.paddingLeft,
      paddingRight: styles.paddingRight,
      paddingTop: styles.paddingTop,
      position: styles.position,
      width: styles.width,
      transition: styles.transition,
      animation: styles.animation,
    },
    observed,
  };
}

function absentStylePart(selector) {
  return {
    selector,
    name: selector,
    present: false,
    count: 0,
    tagName: null,
    className: '',
    role: null,
    rect: null,
    properties: {},
    observed: {},
  };
}

function semanticPartName(selector) {
  const stripNamespace = (value) => value
    .replace(/^(?:muxui|tale)-/u, '')
    .replace(/^lightbox__/u, 'lightbox-');
  const suffix = selector.replace(/^\./u, '').replace(/^(?:muxui|tale)-/u, '');
  const normalized = stripNamespace(suffix).replace(/\.(?:muxui|tale)-/gu, '.');
  if (/^resizable__(?:panel|handle)$/u.test(normalized)) return normalized.replace('__', '-');
  return semanticPartSuffix(normalized);
}

function familyPartSelectors(root, family, stateKey, renderer, entry) {
  const prefix = renderer === 'mux' ? 'muxui' : 'tale';
  const part = (suffix) => `.${prefix}-${suffix}`;
  const parts = [];
  const add = (selector, required = true) => {
    if (required || root.matches(selector) || root.querySelector(selector) || document.querySelector(selector)) parts.push(selector);
  };
  const open = OVERLAY_STATES.has(stateKey) || entry?.props?.open === true || entry?.props?.isOpen === true;
  switch (family) {
    case 'Input':
      add(part('input__root'));
      add(part('input'));
      add(part('input__description'));
      add(part('input__error'));
      break;
    case 'InputTags':
      add(part('input-tags'));
      add(part('input-tags__group'));
      add(part('input-tags__input'));
      if (stateKey === 'below' || root.querySelector(part('input-tags__tags'))) add(part('input-tags__tags'));
      break;
    case 'PaymentInput':
      add(part('payment-input'));
      add(part('payment-input__group'));
      add(part('payment-input__input'));
      add(part('payment-input__card-icon'));
      break;
    case 'TextArea':
      add(part('text-area'));
      add(part('text-area__textarea'));
      add(part('text-area__description'));
      add(part('text-area__error'), stateKey === 'invalid' || entry?.props?.invalid === true);
      break;
    case 'Sidebar':
      if (stateKey !== 'mobile') {
        add(part('sidebar'));
        add(part('sidebar__header'));
        add(part('sidebar__search'));
        add(part('sidebar__search-input'));
        add(part('sidebar__nav-list'));
        add(part('sidebar__account-card'));
      }
      break;
    case 'CommandPalette':
      if (open) {
        add(part('command-palette__popup'));
        add(part('command-palette__input'));
        add(part('command-palette__listbox'));
        if (root.querySelector(part('command-palette__section-header')) || document.querySelector(part('command-palette__section-header'))) add(part('command-palette__section-header'));
        if (root.querySelector(part('command-palette__item')) || document.querySelector(part('command-palette__item'))) {
          add(part('command-palette__item'));
          add(part('command-palette__item-content'));
          add(part('command-palette__item-title'));
          add(part('command-palette__item-meta'));
        }
      }
      break;
    case 'MultiSelect':
      add(part('multi-select__trigger-inner'));
      add(part('multi-select__value'));
      add(part('multi-select__icon'));
      if (open) {
        add(part('multi-select__popup'));
        add(part('multi-select__dialog'));
        add(part('multi-select__search-wrapper'));
        add(part('multi-select__search'));
        add(part('multi-select__search-input'));
        add(part('multi-select__listbox'));
        if (root.querySelector(part('multi-select__item')) || document.querySelector(part('multi-select__item'))) {
          add(part('multi-select__item'));
          add(part('multi-select__item-check'));
          add(part('multi-select__item-text'));
        }
        if (root.querySelector(part('multi-select__footer')) || document.querySelector(part('multi-select__footer'))) {
          add(part('multi-select__footer'));
          add(part('multi-select__footer-btn'));
        }
        if (root.querySelector(part('multi-select__empty')) || document.querySelector(part('multi-select__empty'))) add(part('multi-select__empty'));
      }
      break;
    case 'TagSelect':
      add(part('tag-select__group'));
      add(part('tag-select__input'));
      if (root.querySelector(part('tag-select__tag')) || document.querySelector(part('tag-select__tag'))) {
        add(part('tag-select__tag'));
        add(part('tag-select__tag-text'));
      }
      if (root.querySelector(part('tag-select__tag-remove')) || document.querySelector(part('tag-select__tag-remove'))) add(part('tag-select__tag-remove'));
      if (open) {
        add(part('tag-select__popup'));
        add(part('tag-select__listbox'));
        if (root.querySelector(part('tag-select__item')) || document.querySelector(part('tag-select__item'))) add(part('tag-select__item'));
      }
      break;
    case 'ProgressCircle':
      add(part('progress-circle__track'));
      add(part('progress-circle__rail'));
      add(part('progress-circle__indicator'));
      add(part('progress-circle__label'));
      add(part('progress-circle__value'));
      break;
    case 'Resizable':
      add(renderer === 'mux' ? '.muxui-resizable-panel' : '.tale-resizable__panel');
      add(renderer === 'mux' ? '.muxui-resizable-handle' : '.tale-resizable__handle');
      break;
    case 'TextEditor':
      add(part('text-editor'));
      if (root.querySelector(part('text-editor__toolbar'))) add(part('text-editor__toolbar'));
      if (root.querySelector(part('text-editor__btn'))) add(part('text-editor__btn'));
      if (root.querySelector(`${part('text-editor__btn')}--active`)) add(`${part('text-editor__btn')}--active`);
      add(part('text-editor__content'));
      add(renderer === 'mux' ? part('text-editor__description') : part('text-editor__hint'));
      if (stateKey === 'selection' || stateKey === 'coloropen') {
        if (stateKey === 'selection') add(part('text-editor__bubble-menu'));
        if (stateKey === 'coloropen') {
          add(part('text-editor__color-popup'), renderer === 'mux');
          add(part('text-editor__color-dialog'), renderer === 'mux');
          if (renderer === 'mux') {
            add(part('text-editor__color-swatches'));
            add(part('text-editor__color-swatch'));
            add(part('text-editor__color-field-row'));
            add(part('text-editor__color-field'));
            add(`${part('text-editor__color-field')} input`);
          }
        }
      }
      if (stateKey === 'selection') add(`${part('text-editor__bubble-menu')} ${part('text-editor__btn')}`);
      break;
    default:
      break;
  }
  return parts;
}

/** Read exact current-family anatomy; portal parts are required for open overlays. */
export function currentStyleFactsFor(root, family, state, renderer, entry) {
  if (!root) throw new Error(`current finite ${renderer} root is absent for ${family}`);
  const contract = CURRENT_PART_SELECTORS[family];
  if (!contract) throw new Error(`current finite part contract is missing for ${family}`);
  const stateKey = normalizedCurrentState(state);
  const selectors = contract[stateKey]?.[renderer]
    ?? ((OVERLAY_STATES.has(stateKey) || entry?.props?.open === true || entry?.props?.isOpen === true) ? contract.overlay?.[renderer] : undefined)
    ?? contract[renderer];
  if (!selectors?.length) throw new Error(`current finite ${renderer} part selector is missing for ${family}`);
  const primary = selectors.map(stylePart);
  const additional = familyPartSelectors(root, family, stateKey, renderer, entry)
    .filter((selector) => !selectors.includes(selector));
  const parts = [...primary, ...additional.map(stylePart)].map((part) => ({ ...part, name: semanticPartName(part.selector) }));
  const absentParts = family === 'TextEditor' && stateKey === 'coloropen' && renderer === 'donor'
    ? ['.tale-text-editor__color-popup', '.tale-text-editor__color-dialog']
      .filter((selector) => !document.querySelector(selector))
      .map(absentStylePart)
      .map((part) => ({ ...part, name: semanticPartName(part.selector) }))
    : [];
  return { ...parts[0], parts, absentParts };
}
