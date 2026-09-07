import finiteFixtures from '../../../../catalog/react-r1-6/finite-fixtures.json' with { type: 'json' };
import { equivalentPartSelectorsFor } from '../../src/visual-migration-contract.mjs';

const excludedFamilies = new Set(['Group', 'TokenField']);
const originalRecords = finiteFixtures.components.filter(({ source, family }) => source === 'historical-fixed-53' && !excludedFamilies.has(family));

function normalizedState(state) {
  return String(state).toLowerCase().replaceAll(/[-\s]/gu, '');
}

const implementedStates = new Set([
  'idle', 'focused', 'disabled', 'invalid', 'current', 'pending', 'hovered',
  'pressed', 'readonly', 'selected', 'indeterminate', 'required', 'open',
  'closed', 'dismissed', 'collapsed', 'expanded', 'droptarget', 'submitting',
  'empty', 'opening', 'closing', 'progress', 'complete', 'filled', 'horizontal',
  'vertical', 'visible', 'timed',
]);

export const originalFiniteStateCoverage = Object.freeze(Object.fromEntries(
  [...new Set(originalRecords.flatMap(({ interactionCases }) => interactionCases.map(({ state }) => normalizedState(state))))].sort()
    .map((state) => [state, Object.freeze(originalRecords
      .filter(({ interactionCases }) => interactionCases.some((scenario) => normalizedState(scenario.state) === state))
      .map(({ family }) => family))]),
));

const unsupportedStates = Object.keys(originalFiniteStateCoverage).filter((state) => !implementedStates.has(state));
if (unsupportedStates.length > 0) {
  throw new Error(`original finite state adapter lacks predicates for catalog states: ${unsupportedStates.join(', ')}`);
}

/**
 * The finite capture compares the visible semantic region, so the provider
 * owns the named DOM parts that make that region real. Keep this declaration
 * beside the original renderer rather than teaching the generic runner about
 * individual Tale/Mux families.
 */
const finitePartSelectors = Object.freeze({
  Dialog: Object.freeze({
    root: { mux: '.muxui-dialog', donor: '.tale-dialog__popup' },
    trigger: { mux: '.muxui-dialog-trigger', donor: '.tale-button' },
    backdrop: { mux: '.muxui-dialog-backdrop', donor: '.tale-dialog__backdrop' },
    title: { mux: '.muxui-dialog-title', donor: '.tale-dialog__title' },
    // Pair the actual body paragraph in each renderer. Tale's Dialog has no
    // separate content wrapper; Mux keeps its public wrapper around children.
    content: { mux: '.muxui-dialog-content > p', donor: '.tale-dialog__description' },
    close: { mux: '.muxui-dialog-close', donor: '.tale-dialog__close' },
  }),
  Popover: Object.freeze({
    trigger: { mux: '.muxui-overlay-pop-trigger', donor: '.tale-button' },
    root: { mux: '.muxui-popover', donor: '.tale-popover__popup' },
  }),
  PreviewTrigger: Object.freeze({
    trigger: { mux: '.muxui-button', donor: '.tale-preview-card__trigger' },
    root: { mux: '.muxui-preview-trigger', donor: '.tale-preview-card__popup' },
    content: { mux: '.muxui-preview-content', donor: '.tale-preview-card' },
  }),
  Tooltip: Object.freeze({
    trigger: { mux: '.muxui-button', donor: '.tale-tooltip__trigger' },
    root: { mux: '.muxui-tooltip', donor: '.tale-tooltip__popup' },
  }),
  Toast: Object.freeze({
    region: { mux: '.muxui-toast-region', donor: '.tale-toast-region' },
    toast: { mux: '.muxui-toast', donor: '.tale-toast' },
    title: { mux: '.muxui-toast-title', donor: '.tale-toast__title' },
    message: { mux: '.muxui-toast-message', donor: '.tale-toast__description' },
    dismiss: { mux: '.muxui-toast-dismiss', donor: '.tale-toast__dismiss' },
  }),
  ColorPicker: Object.freeze({
    // The donor root is its ColorArea. Mux owns an outer picker layout
    // wrapper, so retain that wrapper as a separate fact and compare the
    // embedded ColorArea as the equivalent visual control.
    root: { mux: '.muxui-color-picker', donor: '.tale-color-area' },
    area: { mux: '.muxui-color-picker .muxui-color-area', donor: '.tale-color-area' },
  }),
  DatePicker: Object.freeze({
    root: { mux: '.muxui-date-picker', donor: '.tale-date-picker' },
    input: { mux: '.muxui-date-input', donor: '.tale-date-picker__input' },
    segment: { mux: '.muxui-date-segment', donor: '.tale-date-picker__segment' },
    trigger: { mux: '.muxui-date-trigger', donor: '.tale-date-picker__trigger' },
    popover: { mux: '.muxui-date-popover', donor: '.tale-date-picker__popover' },
    dialog: { mux: '.muxui-date-dialog', donor: '.tale-date-picker__dialog' },
    calendar: { mux: '.muxui-calendar', donor: '.tale-calendar' },
    item: { mux: '.muxui-calendar-cell', donor: '.tale-calendar__cell' },
  }),
  DateRangePicker: Object.freeze({
    root: { mux: '.muxui-date-range-picker', donor: '.tale-date-range-picker' },
    start: { mux: '.muxui-date-input[slot="start"]', donor: '.tale-date-range-picker__start' },
    end: { mux: '.muxui-date-input[slot="end"]', donor: '.tale-date-range-picker__end' },
    segment: { mux: '.muxui-date-range-picker .muxui-date-segment', donor: '.tale-date-range-picker__segment' },
    trigger: { mux: '.muxui-date-trigger', donor: '.tale-date-range-picker__trigger' },
    popover: { mux: '.muxui-date-popover', donor: '.tale-date-range-picker__popover' },
    dialog: { mux: '.muxui-date-dialog', donor: '.tale-date-range-picker__dialog' },
    calendar: { mux: '.muxui-calendar', donor: '.tale-range-calendar' },
    item: { mux: '.muxui-range-calendar-cell', donor: '.tale-range-calendar__cell' },
  }),
  ComboBox: Object.freeze({
    root: { mux: '.muxui-combo-box', donor: '.tale-combobox' },
    input: { mux: '.muxui-field-input', donor: '.tale-combobox__input' },
    trigger: { mux: '.muxui-combo-box-trigger', donor: '.tale-combobox__trigger' },
    popover: { mux: '.muxui-combo-box-popover', donor: '.tale-combobox__popover' },
    list: { mux: '.muxui-combo-box-list', donor: '.tale-combobox__listbox' },
    item: { mux: '.muxui-combo-box-option', donor: '.tale-combobox__item' },
  }),
  Select: Object.freeze({
    root: { mux: '.muxui-select', donor: '.tale-select' },
    trigger: { mux: '.muxui-select-trigger', donor: '.tale-select__trigger' },
    popover: { mux: '.muxui-select-popover', donor: '.tale-select__popover' },
    list: { mux: '.muxui-select-list', donor: '.tale-select__listbox' },
    item: { mux: '.muxui-select-option', donor: '.tale-select__item' },
  }),
  Menu: Object.freeze({
    root: { mux: '.muxui-menu', donor: '.tale-menu__popup' },
    item: { mux: '.muxui-menu-item', donor: '.tale-menu__item' },
  }),
});

const openStates = new Set(['open', 'opening', 'closing']);
const dismissedStates = new Set(['dismissed']);

function finitePartContract(family, state, renderer, openOverride) {
  const parts = finitePartSelectors[family];
  if (!parts) return { present: [], absent: [] };
  const stateKey = normalizedState(state);
  const open = openOverride ?? openStates.has(stateKey);
  if (family === 'Dialog') {
    return {
      present: open ? ['trigger', 'backdrop', 'root', 'title', 'content', 'close'] : ['trigger'],
      absent: open ? [] : ['backdrop', 'root', 'title', 'content', 'close'],
    };
  }
  if (family === 'Popover') {
    return { present: open ? ['trigger', 'root'] : ['trigger'], absent: open ? [] : ['root'] };
  }
  if (family === 'PreviewTrigger') {
    return { present: open ? ['trigger', 'root', 'content'] : ['trigger'], absent: open ? [] : ['root', 'content'] };
  }
  if (family === 'Tooltip') {
    return { present: open ? ['trigger', 'root'] : ['trigger'], absent: open ? [] : ['root'] };
  }
  if (family === 'Toast') {
    return dismissedStates.has(stateKey)
      ? { present: ['region'], absent: ['toast', 'title', 'message', 'dismiss'] }
      : { present: ['region', 'toast', 'title', 'message', 'dismiss'], absent: [] };
  }
  if (family === 'ColorPicker') return { present: ['root', 'area'], absent: [] };
  if (family === 'DatePicker' || family === 'DateRangePicker') {
    return {
      present: open ? Object.keys(parts) : family === 'DatePicker' ? ['root', 'input', 'segment', 'trigger'] : ['root', 'start', 'end', 'segment', 'trigger'],
      absent: open ? [] : ['popover', 'dialog', 'calendar', 'item'],
    };
  }
  if (family === 'ComboBox') {
    return { present: open ? Object.keys(parts) : ['root', 'input', 'trigger'], absent: open ? [] : ['popover', 'list', 'item'] };
  }
  if (family === 'Select') {
    return { present: open ? Object.keys(parts) : ['root', 'trigger'], absent: open ? [] : ['popover', 'list', 'item'] };
  }
  if (family === 'Menu') return { present: ['root', 'item'], absent: [] };
  return { present: [], absent: [] };
}

export function finitePartSelectorsForOriginalFinite(family, state, renderer, openOverride) {
  const contract = finitePartContract(family, state, renderer, openOverride);
  const parts = finitePartSelectors[family] ?? {};
  return {
    present: contract.present.map((name) => ({ name, selector: parts[name]?.[renderer] })).filter(({ selector }) => selector),
    absent: contract.absent.map((name) => ({ name, selector: parts[name]?.[renderer] })).filter(({ selector }) => selector),
  };
}

function elementsFor(root) {
  return root ? [root, ...root.querySelectorAll('*')] : [];
}

function hasTrueMarker(element, name) {
  if (!element.hasAttribute(name)) return false;
  const value = element.getAttribute(name);
  return value === '' || value === 'true';
}

function isVisible(element) {
  if (!element || element.getClientRects().length === 0) return false;
  const style = getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function overlaySelector(renderer) {
  return renderer === 'mux'
    ? '[role="dialog"], [data-overlay-container], .muxui-dialog-backdrop, .muxui-dialog-modal, .muxui-popover-positioner, .muxui-popover, .muxui-preview-trigger, .muxui-tooltip, .muxui-date-popover, .muxui-combo-box-popover, .muxui-select-popover'
    : '.tale-dialog__backdrop, .tale-dialog__popup, .tale-popover__popup, .tale-preview-card__popup, .tale-tooltip__popup, .tale-date-picker__popover, .tale-date-range-picker__popover, .tale-combobox__popover, .tale-select__popover';
}

function visibleOverlays(renderer) {
  return [...document.querySelectorAll(overlaySelector(renderer))].filter(isVisible);
}

function actualRoot(root, renderer) {
  if (!isVisible(root)) return false;
  // Toast content is owned by its region and may be portalled outside the
  // case marker. Its marker still proves the declarative fixture mounted;
  // lifecycle checks below inspect the real region/toast instead.
  return root.querySelectorAll('*').length > 0 || visibleToasts(renderer).length > 0;
}

function toastSelector(renderer) {
  return renderer === 'mux' ? '.muxui-toast' : '.tale-toast';
}

function visibleToasts(renderer) {
  return [...document.querySelectorAll(toastSelector(renderer))].filter(isVisible);
}

function ariaRelationship(element, attribute) {
  const ids = (element.getAttribute(attribute) ?? '').trim().split(/\s+/u).filter(Boolean);
  return {
    present: ids.length > 0,
    resolves: ids.length > 0 && ids.every((id) => document.getElementById(id) !== null),
  };
}

/**
 * Verify the state exposed by the mounted component. Marker attributes count
 * only when React Aria rendered an affirmative marker, never when a false
 * attribute was forwarded to the DOM.
 */
export function stateReachedForOriginalFinite(root, state, renderer, family) {
  const normalized = normalizedState(state);
  if (!implementedStates.has(normalized)) throw new Error(`unsupported original finite state: ${state}`);
  // A real dismissal unmounts a portalled overlay. The case marker remains as
  // the runner's stable boundary, so require that boundary and prove absence
  // of every actual overlay instead of requiring stale child DOM.
  if (normalized === 'dismissed') return isVisible(root) && visibleOverlays(renderer).length === 0;
  if (!actualRoot(root, renderer)) return false;
  const elements = elementsFor(root);
  const any = (predicate) => elements.some(predicate);
  const overlayVisible = visibleOverlays(renderer);

  if (family === 'Select' && normalized === 'readonly') {
    // React Aria 1.20's Select has no public read-only state. Mux currently
    // suppresses its callback but cannot expose a truthful DOM read-only
    // predicate, so retain this as an observed unsupported state.
    return false;
  }
  if (family === 'Select' && normalized === 'selected') {
    const selectedValue = root.querySelector('.muxui-select-value, .tale-select__value');
    const selectedTextVisible = selectedValue !== null
      && isVisible(selectedValue)
      && selectedValue.getAttribute('data-placeholder') !== 'true'
      && selectedValue.textContent?.trim().length > 0;
    const hiddenSelect = root.querySelector('select');
    const nativeSelection = hiddenSelect !== null
      && [...hiddenSelect.options].some((option) => option.selected && option.value.trim().length > 0);
    const selectedOption = root.querySelector('[role="option"][aria-selected="true"]');
    return selectedTextVisible && (nativeSelection || selectedOption !== null);
  }
  if (family === 'Slider' && normalized === 'selected') {
    // Slider has no selected boolean. The catalog's selected case carries the
    // canonical numeric value, so prove the actual RAC slider value rather
    // than accepting a forwarded fixture prop or a generic marker.
    return elements.some((element) => element.matches('[role="slider"]') && Number(element.getAttribute('aria-valuenow')) === 60);
  }
  if (family === 'Separator' && normalized === 'horizontal') {
    return elements.some((element) => {
      const implicitHorizontal = element.tagName === 'HR' && !element.hasAttribute('aria-orientation');
      const explicitHorizontal = element.getAttribute('aria-orientation') === 'horizontal' || element.getAttribute('data-orientation') === 'horizontal';
      if (!implicitHorizontal && !explicitHorizontal) return false;
      const rect = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      return styles.display !== 'none' && styles.visibility !== 'hidden' && rect.width >= 0 && rect.height > 0;
    });
  }
  if (family === 'Table' && normalized === 'empty') {
    const body = root.querySelector('tbody, [role="rowgroup"]');
    const dataRows = body ? [...body.querySelectorAll('tr, [role="row"]')] : [];
    const emptyMessage = [...root.querySelectorAll('[data-empty], [data-empty-state], [role="status"], [aria-live]')]
      .find((element) => isVisible(element) && element.textContent?.trim().length > 0);
    return dataRows.length === 0 && emptyMessage !== undefined;
  }
  switch (normalized) {
    case 'idle': return true;
    case 'focused': return root.contains(document.activeElement) && document.activeElement !== document.body;
    case 'disabled': return any((element) => element.disabled === true || hasTrueMarker(element, 'data-disabled') || element.getAttribute('aria-disabled') === 'true');
    case 'invalid': return any((element) => hasTrueMarker(element, 'data-invalid') || element.getAttribute('aria-invalid') === 'true' || element.matches(':invalid'));
    case 'current': return any((element) => hasTrueMarker(element, 'data-current') || (element.hasAttribute('aria-current') && element.getAttribute('aria-current') !== 'false'));
    case 'pending': return any((element) => hasTrueMarker(element, 'data-pending') || element.getAttribute('aria-busy') === 'true');
    case 'hovered': return any((element) => hasTrueMarker(element, 'data-hovered') || element.matches(':hover'));
    case 'pressed': return any((element) => hasTrueMarker(element, 'data-pressed') || element.getAttribute('aria-pressed') === 'true' || element.matches(':active'));
    case 'readonly': return any((element) => hasTrueMarker(element, 'data-readonly') || element.getAttribute('aria-readonly') === 'true' || element.readOnly === true);
    case 'selected': return any((element) => hasTrueMarker(element, 'data-selected') || element.getAttribute('aria-selected') === 'true' || element.getAttribute('aria-checked') === 'true' || element.checked === true);
    case 'indeterminate': return any((element) => hasTrueMarker(element, 'data-indeterminate') || element.indeterminate === true || element.getAttribute('aria-valuetext')?.toLowerCase().includes('indeterminate'));
    case 'required': return any((element) => hasTrueMarker(element, 'data-required') || element.getAttribute('aria-required') === 'true' || element.required === true);
    case 'open': return any((element) => hasTrueMarker(element, 'data-open') || element.getAttribute('aria-expanded') === 'true') || overlayVisible.length > 0;
    case 'closed':
    case 'dismissed': return overlayVisible.length === 0;
    case 'collapsed': return any((element) => element.getAttribute('aria-expanded') === 'false' || element.getAttribute('data-expanded') === 'false');
    case 'expanded': return any((element) => hasTrueMarker(element, 'data-expanded') || element.getAttribute('aria-expanded') === 'true');
    case 'droptarget': return any((element) => hasTrueMarker(element, 'data-dragging') || hasTrueMarker(element, 'data-drop-target'));
    case 'submitting': return any((element) => hasTrueMarker(element, 'data-submitting') || hasTrueMarker(element, 'data-pending') || element.getAttribute('aria-busy') === 'true');
    case 'empty': return any((element) => 'value' in element && element.value === '') || !root.querySelector('[role="option"], [role="row"], [role="treeitem"], [data-key]');
    case 'opening': return overlayVisible.some((element) => hasTrueMarker(element, 'data-entering') || hasTrueMarker(element, 'data-opening'));
    case 'closing': return overlayVisible.some((element) => hasTrueMarker(element, 'data-exiting') || hasTrueMarker(element, 'data-closing'));
    case 'progress': return any((element) => element.getAttribute('aria-valuenow') === '64');
    case 'complete': return any((element) => element.getAttribute('aria-valuenow') === '100' || hasTrueMarker(element, 'data-complete'));
    case 'filled': return any((element) => 'value' in element && String(element.value).length > 0) || any((element) => hasTrueMarker(element, 'data-filled'));
    case 'horizontal': return any((element) => element.getAttribute('aria-orientation') === 'horizontal' || element.getAttribute('data-orientation') === 'horizontal');
    case 'vertical': return any((element) => element.getAttribute('aria-orientation') === 'vertical' || element.getAttribute('data-orientation') === 'vertical');
    case 'visible': return visibleToasts(renderer).length > 0;
    // A timed state needs an observed before/deadline/after lifecycle. The
    // browser runner owns that clock progression and must not accept a static
    // visible toast as equivalent evidence.
    case 'timed': return false;
    default: throw new Error(`unsupported original finite state: ${state}`);
  }
}

function elementForSelector(root, selector) {
  return root?.matches(selector) ? root : root?.querySelector(selector) ?? document.querySelector(selector);
}

function styleFactsForElement(target, selector, name) {
  const styles = getComputedStyle(target);
  const rect = target.getBoundingClientRect();
  return {
    name,
    selector,
    tagName: target.tagName,
    className: typeof target.className === 'string' ? target.className : '',
    role: target.getAttribute('role'),
    aria: {
      checked: target.getAttribute('aria-checked'),
      controls: ariaRelationship(target, 'aria-controls'),
      describedBy: ariaRelationship(target, 'aria-describedby'),
      disabled: target.getAttribute('aria-disabled'),
      expanded: target.getAttribute('aria-expanded'),
      labelledBy: ariaRelationship(target, 'aria-labelledby'),
      selected: target.getAttribute('aria-selected'),
    },
    rect: { height: rect.height, width: rect.width, x: rect.x, y: rect.y },
    properties: {
      animationDuration: styles.animationDuration,
      animationName: styles.animationName,
      boxSizing: styles.boxSizing,
      borderBottomWidth: styles.borderBottomWidth,
      borderBottomColor: styles.borderBottomColor,
      borderBottomStyle: styles.borderBottomStyle,
      borderLeftWidth: styles.borderLeftWidth,
      borderLeftColor: styles.borderLeftColor,
      borderLeftStyle: styles.borderLeftStyle,
      borderRadius: styles.borderRadius,
      borderRightWidth: styles.borderRightWidth,
      borderRightColor: styles.borderRightColor,
      borderRightStyle: styles.borderRightStyle,
      borderTopWidth: styles.borderTopWidth,
      borderTopColor: styles.borderTopColor,
      borderTopStyle: styles.borderTopStyle,
      boxShadow: styles.boxShadow,
      display: styles.display,
      alignItems: styles.alignItems,
      flexDirection: styles.flexDirection,
      justifyContent: styles.justifyContent,
      fontFamily: styles.fontFamily,
      fontSize: styles.fontSize,
      fontStyle: styles.fontStyle,
      fontWeight: styles.fontWeight,
      gap: styles.gap,
      height: styles.height,
      lineHeight: styles.lineHeight,
      letterSpacing: styles.letterSpacing,
      marginBottom: styles.marginBottom,
      marginLeft: styles.marginLeft,
      marginRight: styles.marginRight,
      marginTop: styles.marginTop,
      maxHeight: styles.maxHeight,
      maxWidth: styles.maxWidth,
      minHeight: styles.minHeight,
      minWidth: styles.minWidth,
      opacity: styles.opacity,
      outlineColor: styles.outlineColor,
      outlineOffset: styles.outlineOffset,
      outlineStyle: styles.outlineStyle,
      outlineWidth: styles.outlineWidth,
      paddingBottom: styles.paddingBottom,
      paddingLeft: styles.paddingLeft,
      paddingRight: styles.paddingRight,
      paddingTop: styles.paddingTop,
      position: styles.position,
      transform: styles.transform,
      transitionDuration: styles.transitionDuration,
      transitionProperty: styles.transitionProperty,
      width: styles.width,
      color: styles.color,
      backgroundColor: styles.backgroundColor,
      fill: styles.fill,
      stroke: styles.stroke,
    },
  };
}

/** Return raw CSS and named anatomy facts for the original finite contract. */
export function styleFactsForOriginalFinite(root, family, state, renderer) {
  // The finite donor projection uses Tale Accordion for DisclosureGroup. The
  // sealed historical plan predates that direct crosswalk and still points at
  // the standalone Disclosure class, so keep this selector override local to
  // finite proof rather than changing retained provenance or its contract.
  const stateKey = normalizedState(state);
  const primaryPartName = family === 'ColorPicker'
    ? 'area'
    : ['Dialog', 'Popover', 'PreviewTrigger', 'Tooltip'].includes(family) && openStates.has(stateKey)
      ? 'root'
      : undefined;
  const selector = primaryPartName
    ? finitePartSelectors[family]?.[primaryPartName]?.[renderer]
    : family === 'DisclosureGroup' && renderer === 'donor'
      ? '.tale-accordion'
      : equivalentPartSelectorsFor(family, state)[renderer === 'mux' ? 0 : 1];
  if (!selector) throw new Error(`original finite ${renderer} part selector is missing for ${family}`);
  const openPartNames = {
    Dialog: ['backdrop', 'root'],
    Popover: ['root'],
    PreviewTrigger: ['root'],
    Tooltip: ['root'],
    DatePicker: ['popover'],
    DateRangePicker: ['popover'],
    ComboBox: ['popover'],
    Select: ['popover'],
  }[family] ?? [];
  const actualOpen = openPartNames.some((name) => {
    const partSelector = finitePartSelectors[family]?.[name]?.[renderer];
    return partSelector !== undefined && isVisible(document.querySelector(partSelector));
  });
  const declared = finitePartSelectorsForOriginalFinite(family, state, renderer, actualOpen || undefined);
  const present = declared.present.length > 0 ? declared.present : [{ name: 'root', selector }];
  const absent = declared.absent;
  for (const { name, selector: absentSelector } of absent) {
    if (document.querySelector(absentSelector)) throw new Error(`original finite ${renderer} ${family} ${name} must be absent: ${absentSelector}`);
  }
  const parts = present.map(({ name, selector: partSelector }) => {
    const target = elementForSelector(root, partSelector);
    if (!target) throw new Error(`original finite ${renderer} ${family} ${name} is absent: ${partSelector}`);
    return styleFactsForElement(target, partSelector, name);
  });
  const primary = parts.find((part) => part.selector === selector) ?? parts[0];
  return {
    ...primary,
    parts,
    absence: absent.map(({ name, selector: absentSelector }) => ({ name, selector: absentSelector, present: false })),
  };
}

/** Describe only real DOM lifecycle evidence; the runner samples its phases. */
export function lifecycleFactsForOriginalFinite(_root, state, renderer) {
  const normalized = normalizedState(state);
  if (normalized === 'timed') {
    return { kind: 'timer', selector: toastSelector(renderer), before: 'visible', after: 'absent' };
  }
  if (normalized === 'opening') {
    return { kind: 'enter', selector: overlaySelector(renderer), marker: ['data-entering', 'data-opening'], after: 'present' };
  }
  if (normalized === 'closing') {
    return { kind: 'exit', selector: overlaySelector(renderer), marker: ['data-exiting', 'data-closing'], after: 'absent' };
  }
  return undefined;
}
