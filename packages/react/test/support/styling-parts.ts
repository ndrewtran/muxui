// The class contract of the Stage 2 styling work (Decision 0031 items 16 and 19), as data only: every catalog anatomy entry once,
// with the class a consumer selects or the reason Mux has no element to class. Tests, Storybook's anatomy proof and the Figma
// anatomy specs import this file by relative path; nothing ships from it (the state half is src/styling-contract.ts, which the
// substrate adapter reads). Keep it erasable TypeScript (no enums, no namespaces), and keep every reader on this one module: the
// planner routes a change here to both consumers (tooling/audits/repository-policy/src/ci-impact.mjs), and the row type and
// `selectorOf` live here so that no reader needs a second support file.

/** The class scheme: a part is a BEM element of the family class, `muxui-<slug>__<part>`; the root is `muxui-<slug>`. */
export const partClass = (slug: string, part: string): string => part === 'root' ? `muxui-${slug}` : `muxui-${slug}__${part}`;

/**
 * The only shared classes that become documented hooks, always scoped (`.muxui-select .muxui-field-label`, or the wrapper or
 * owner popover a row's `selector` names). Every other shared class stays internal.
 */
export const publicSharedClasses = ['muxui-field-label', 'muxui-field-input', 'muxui-field-description', 'muxui-field-error'] as const;

/**
 * The five wrapper and owner-popover classes a row's `selector` may use as a scope. They are the real ancestors of the hook, not
 * anatomy parts: no row names one as its own hook, and no other class may be a scope.
 */
export const scopeClasses = [
  'muxui-checkbox-group__field', 'muxui-radio-group__field', 'muxui-switch-field',
  'muxui-date-picker__popover', 'muxui-date-range-picker__popover',
] as const;

/**
 * The element predicates a `selector` may put on its hook: Card.Button is a native button, Sidebar.NavButton an anchor, and the
 * CodeBlock and PromptComposer live regions are the status elements among several elements that share a class.
 */
export const elementQualifiers = ['button', 'a', '[role="status"]'] as const;

/** Why a part has no element Mux can class: React Aria or the caller renders it, it is a provider or a state, or it is the children. */
export const noElementReasons = ['provider', 'children', 'substrate', 'caller', 'state'] as const;

/**
 * - class: a family-owned class on a Mux-owned element; the hook is `partClass(family, part)` unless the row records an `exception`.
 * - root-element: the part is the root element itself (Card.Button renders the card root as a native button); the hook is the root class.
 * - field: a shared field hook, `muxui-field-<part>`, scoped by the family root or by the row's `selector`.
 * - composed: the part is another family's public component; the hook is that family's class.
 * - internal: a class several families share, or none owns; emitted and styled, never documented.
 * - none: no element Mux can class; the row records the `reason`.
 */
export const dispositions = ['class', 'root-element', 'field', 'composed', 'internal', 'none'] as const;

export type Disposition = typeof dispositions[number];
export type NoElementReason = typeof noElementReasons[number];

export type PartRow = {
  readonly family: string;
  readonly part: string;
  readonly disposition: Disposition;
  /** The class, without the dot. Absent only for a `none` row. */
  readonly hook?: string;
  /** The full selector when the bare hook is not enough: a wrapper or owner-popover scope, or an element predicate. */
  readonly selector?: string;
  /** Why `hook` is not `partClass(family, part)`. */
  readonly exception?: string;
  /** No authored rule selects the hook; why. A fixture stylesheet proves a consumer's rule on the selector reaches the element. */
  readonly hookOnly?: string;
  /** The family whose root class shares the element: the control is also a `muxui-button`. Applies to the element Mux renders. */
  readonly composedOf?: string;
  /**
   * Why `composedOf` is conditional: the element can be one the caller supplies, and a native element carries the hook but not the
   * `composedOf` root class. Only a Mux component the caller passes (a `Button`) brings its own root class.
   */
  readonly callerSupplied?: string;
  /** For a `none` row. */
  readonly reason?: NoElementReason;
};

/** Every catalog anatomy entry, in catalog order. */
export const partRows: readonly PartRow[] = [
  { family: 'activity', part: 'root', disposition: 'class', hook: 'muxui-activity' },
  { family: 'activity', part: 'header', disposition: 'class', hook: 'muxui-activity__header' },
  { family: 'activity', part: 'trigger', disposition: 'class', hook: 'muxui-activity__trigger', composedOf: 'button' },
  { family: 'activity', part: 'items', disposition: 'class', hook: 'muxui-activity__items' },
  { family: 'activity', part: 'status', disposition: 'class', hook: 'muxui-activity__status' },
  { family: 'activity', part: 'details', disposition: 'class', hook: 'muxui-activity__details' },
  { family: 'activity', part: 'actions', disposition: 'class', hook: 'muxui-activity__actions' },
  { family: 'alert-dialog', part: 'root', disposition: 'none', reason: 'provider' },
  { family: 'alert-dialog', part: 'trigger', disposition: 'class', hook: 'muxui-alert-dialog__trigger' },
  { family: 'alert-dialog', part: 'backdrop', disposition: 'class', hook: 'muxui-alert-dialog__backdrop' },
  { family: 'alert-dialog', part: 'popup', disposition: 'class', hook: 'muxui-alert-dialog__popup' },
  { family: 'alert-dialog', part: 'content', disposition: 'class', hook: 'muxui-alert-dialog__content' },
  { family: 'alert-dialog', part: 'title', disposition: 'class', hook: 'muxui-alert-dialog__title' },
  { family: 'alert-dialog', part: 'description', disposition: 'class', hook: 'muxui-alert-dialog__description' },
  { family: 'alert-dialog', part: 'actions', disposition: 'class', hook: 'muxui-alert-dialog__actions' },
  { family: 'alert-dialog', part: 'close', disposition: 'class', hook: 'muxui-alert-dialog__close' },
  { family: 'autocomplete', part: 'root', disposition: 'class', hook: 'muxui-autocomplete' },
  { family: 'autocomplete', part: 'label', disposition: 'field', hook: 'muxui-field-label' },
  { family: 'autocomplete', part: 'input', disposition: 'field', hook: 'muxui-field-input' },
  { family: 'autocomplete', part: 'popover', disposition: 'class', hook: 'muxui-autocomplete__popover' },
  { family: 'autocomplete', part: 'list', disposition: 'class', hook: 'muxui-autocomplete__list' },
  { family: 'avatar', part: 'root', disposition: 'class', hook: 'muxui-avatar' },
  { family: 'avatar', part: 'image', disposition: 'class', hook: 'muxui-avatar__image' },
  { family: 'avatar', part: 'fallback', disposition: 'class', hook: 'muxui-avatar__fallback' },
  { family: 'breadcrumbs', part: 'root', disposition: 'class', hook: 'muxui-breadcrumbs' },
  { family: 'breadcrumbs', part: 'list', disposition: 'class', hook: 'muxui-breadcrumbs__list' },
  { family: 'breadcrumbs', part: 'item', disposition: 'class', hook: 'muxui-breadcrumbs__item' },
  { family: 'breadcrumbs', part: 'link', disposition: 'class', hook: 'muxui-breadcrumbs__link' },
  { family: 'button', part: 'root', disposition: 'class', hook: 'muxui-button' },
  { family: 'button', part: 'label', disposition: 'class', hook: 'muxui-button__label' },
  { family: 'button-group', part: 'root', disposition: 'class', hook: 'muxui-button-group' },
  { family: 'calendar', part: 'root', disposition: 'class', hook: 'muxui-calendar' },
  { family: 'calendar', part: 'label', disposition: 'field', hook: 'muxui-field-label' },
  { family: 'calendar', part: 'grid', disposition: 'class', hook: 'muxui-calendar__grid' },
  { family: 'calendar', part: 'cell', disposition: 'class', hook: 'muxui-calendar__cell' },
  { family: 'card', part: 'root', disposition: 'class', hook: 'muxui-card' },
  { family: 'card', part: 'button', disposition: 'root-element', hook: 'muxui-card', selector: 'button.muxui-card' },
  { family: 'card', part: 'header', disposition: 'class', hook: 'muxui-card__header' },
  { family: 'card', part: 'body', disposition: 'class', hook: 'muxui-card__body' },
  { family: 'card', part: 'footer', disposition: 'class', hook: 'muxui-card__footer' },
  { family: 'checkbox', part: 'root', disposition: 'class', hook: 'muxui-checkbox' },
  { family: 'checkbox', part: 'input', disposition: 'none', reason: 'substrate' },
  { family: 'checkbox', part: 'indicator', disposition: 'class', hook: 'muxui-checkbox__indicator' },
  { family: 'checkbox', part: 'label', disposition: 'class', hook: 'muxui-checkbox__label' },
  { family: 'checkbox-field', part: 'root', disposition: 'class', hook: 'muxui-checkbox-field' },
  { family: 'checkbox-field', part: 'button', disposition: 'class', hook: 'muxui-checkbox-field__button' },
  { family: 'checkbox-field', part: 'indicator', disposition: 'class', hook: 'muxui-checkbox-field__indicator' },
  { family: 'checkbox-field', part: 'description', disposition: 'class', hook: 'muxui-checkbox-field__description' },
  { family: 'checkbox-field', part: 'error', disposition: 'class', hook: 'muxui-checkbox-field__error' },
  { family: 'checkbox-group', part: 'root', disposition: 'class', hook: 'muxui-checkbox-group' },
  { family: 'checkbox-group', part: 'label', disposition: 'field', hook: 'muxui-field-label', selector: '.muxui-checkbox-group__field .muxui-field-label' },
  { family: 'checkbox-group', part: 'description', disposition: 'field', hook: 'muxui-field-description' },
  { family: 'checkbox-group', part: 'error', disposition: 'field', hook: 'muxui-field-error' },
  { family: 'checkbox-group', part: 'options', disposition: 'none', reason: 'children' },
  { family: 'code-block', part: 'root', disposition: 'class', hook: 'muxui-code-block' },
  { family: 'code-block', part: 'header', disposition: 'class', hook: 'muxui-code-block__header' },
  { family: 'code-block', part: 'filename', disposition: 'class', hook: 'muxui-code-block__filename' },
  { family: 'code-block', part: 'copy', disposition: 'class', hook: 'muxui-code-block__copy', composedOf: 'button' },
  { family: 'code-block', part: 'pre', disposition: 'class', hook: 'muxui-code-block__pre' },
  { family: 'code-block', part: 'code', disposition: 'class', hook: 'muxui-code-block__code' },
  { family: 'code-block', part: 'line', disposition: 'class', hook: 'muxui-code-block__line' },
  { family: 'code-block', part: 'number', disposition: 'class', hook: 'muxui-code-block__number' },
  { family: 'code-block', part: 'marker', disposition: 'class', hook: 'muxui-code-block__marker' },
  { family: 'code-block', part: 'status', disposition: 'class', hook: 'muxui-code-block__status', selector: '.muxui-code-block__status[role="status"]' },
  { family: 'color-area', part: 'root', disposition: 'class', hook: 'muxui-color-area' },
  { family: 'color-area', part: 'area', disposition: 'root-element', hook: 'muxui-color-area' },
  { family: 'color-area', part: 'thumb', disposition: 'class', hook: 'muxui-color-area__thumb' },
  { family: 'color-field', part: 'root', disposition: 'class', hook: 'muxui-color-field' },
  { family: 'color-field', part: 'label', disposition: 'field', hook: 'muxui-field-label' },
  { family: 'color-field', part: 'input', disposition: 'field', hook: 'muxui-field-input' },
  { family: 'color-field', part: 'description', disposition: 'field', hook: 'muxui-field-description' },
  { family: 'color-field', part: 'error', disposition: 'field', hook: 'muxui-field-error' },
  { family: 'color-mode-toggle', part: 'root', disposition: 'class', hook: 'muxui-color-mode-toggle' },
  { family: 'color-picker', part: 'root', disposition: 'class', hook: 'muxui-color-picker' },
  { family: 'color-picker', part: 'field', disposition: 'composed', hook: 'muxui-color-field' },
  { family: 'color-picker', part: 'area', disposition: 'composed', hook: 'muxui-color-area' },
  { family: 'color-picker', part: 'slider', disposition: 'composed', hook: 'muxui-color-slider' },
  { family: 'color-picker', part: 'swatch', disposition: 'composed', hook: 'muxui-color-swatch' },
  { family: 'color-slider', part: 'root', disposition: 'class', hook: 'muxui-color-slider' },
  { family: 'color-slider', part: 'label', disposition: 'field', hook: 'muxui-field-label' },
  { family: 'color-slider', part: 'track', disposition: 'class', hook: 'muxui-color-slider__track' },
  { family: 'color-slider', part: 'thumb', disposition: 'class', hook: 'muxui-color-slider__thumb' },
  { family: 'color-swatch', part: 'root', disposition: 'class', hook: 'muxui-color-swatch' },
  { family: 'color-swatch-picker', part: 'root', disposition: 'class', hook: 'muxui-color-swatch-picker' },
  { family: 'color-swatch-picker', part: 'swatch', disposition: 'composed', hook: 'muxui-color-swatch' },
  { family: 'color-swatch-picker', part: 'selection', disposition: 'none', reason: 'state' },
  { family: 'color-wheel', part: 'root', disposition: 'class', hook: 'muxui-color-wheel' },
  { family: 'color-wheel', part: 'track', disposition: 'class', hook: 'muxui-color-wheel__track' },
  { family: 'color-wheel', part: 'thumb', disposition: 'class', hook: 'muxui-color-wheel__thumb' },
  { family: 'combo-box', part: 'root', disposition: 'class', hook: 'muxui-combo-box' },
  { family: 'combo-box', part: 'label', disposition: 'field', hook: 'muxui-field-label' },
  { family: 'combo-box', part: 'input', disposition: 'field', hook: 'muxui-field-input' },
  { family: 'combo-box', part: 'list', disposition: 'class', hook: 'muxui-combo-box__list' },
  { family: 'combo-box', part: 'option', disposition: 'class', hook: 'muxui-combo-box__option' },
  { family: 'command-palette', part: 'root', disposition: 'class', hook: 'muxui-command-palette' },
  { family: 'command-palette', part: 'trigger', disposition: 'class', hook: 'muxui-command-palette__trigger' },
  { family: 'command-palette', part: 'backdrop', disposition: 'class', hook: 'muxui-command-palette__backdrop' },
  { family: 'command-palette', part: 'popup', disposition: 'class', hook: 'muxui-command-palette__popup' },
  { family: 'command-palette', part: 'title', disposition: 'class', hook: 'muxui-command-palette__title' },
  { family: 'command-palette', part: 'description', disposition: 'class', hook: 'muxui-command-palette__description' },
  { family: 'command-palette', part: 'close', disposition: 'class', hook: 'muxui-command-palette__close' },
  { family: 'command-palette', part: 'content', disposition: 'class', hook: 'muxui-command-palette__content' },
  { family: 'command-palette', part: 'search-field', disposition: 'class', hook: 'muxui-command-palette__search-field' },
  { family: 'command-palette', part: 'input', disposition: 'class', hook: 'muxui-command-palette__input' },
  { family: 'command-palette', part: 'clear-button', disposition: 'class', hook: 'muxui-command-palette__clear-button' },
  { family: 'command-palette', part: 'listbox', disposition: 'class', hook: 'muxui-command-palette__listbox' },
  { family: 'command-palette', part: 'section', disposition: 'class', hook: 'muxui-command-palette__section' },
  { family: 'command-palette', part: 'section-header', disposition: 'class', hook: 'muxui-command-palette__section-header' },
  { family: 'command-palette', part: 'item', disposition: 'class', hook: 'muxui-command-palette__item' },
  { family: 'command-palette', part: 'separator', disposition: 'class', hook: 'muxui-command-palette__separator', hookOnly: 'The separator hr carries it and no authored rule selects it.' },
  { family: 'command-palette', part: 'collection', disposition: 'none', reason: 'children' },
  { family: 'command-palette', part: 'item-icon', disposition: 'class', hook: 'muxui-command-palette__item-icon' },
  { family: 'command-palette', part: 'item-content', disposition: 'class', hook: 'muxui-command-palette__item-content' },
  { family: 'command-palette', part: 'item-title', disposition: 'class', hook: 'muxui-command-palette__item-title' },
  { family: 'command-palette', part: 'item-description', disposition: 'class', hook: 'muxui-command-palette__item-description' },
  { family: 'command-palette', part: 'item-meta', disposition: 'class', hook: 'muxui-command-palette__item-meta' },
  { family: 'command-palette', part: 'shortcut', disposition: 'class', hook: 'muxui-command-palette__shortcut' },
  { family: 'command-palette', part: 'load-more-item', disposition: 'class', hook: 'muxui-command-palette__load-more-item' },
  { family: 'command-palette', part: 'empty', disposition: 'class', hook: 'muxui-command-palette__empty' },
  { family: 'command-palette', part: 'footer', disposition: 'class', hook: 'muxui-command-palette__footer' },
  { family: 'command-palette', part: 'chips', disposition: 'class', hook: 'muxui-command-palette__chips' },
  { family: 'command-palette', part: 'chip', disposition: 'class', hook: 'muxui-command-palette__chip' },
  { family: 'command-palette', part: 'chip-remove', disposition: 'class', hook: 'muxui-command-palette__chip-remove' },
  { family: 'data-diff', part: 'root', disposition: 'class', hook: 'muxui-data-diff' },
  { family: 'data-diff', part: 'header', disposition: 'class', hook: 'muxui-data-diff__header' },
  { family: 'data-diff', part: 'title', disposition: 'class', hook: 'muxui-data-diff__title' },
  { family: 'data-diff', part: 'description', disposition: 'class', hook: 'muxui-data-diff__description' },
  { family: 'data-diff', part: 'viewport', disposition: 'class', hook: 'muxui-data-diff__viewport' },
  { family: 'data-diff', part: 'table', disposition: 'class', hook: 'muxui-data-diff__table' },
  { family: 'data-diff', part: 'head', disposition: 'class', hook: 'muxui-data-diff__head' },
  { family: 'data-diff', part: 'column', disposition: 'class', hook: 'muxui-data-diff__column' },
  { family: 'data-diff', part: 'body', disposition: 'class', hook: 'muxui-data-diff__body', hookOnly: 'The tbody carries it; the table and the rows are styled and the body is not.' },
  { family: 'data-diff', part: 'row', disposition: 'class', hook: 'muxui-data-diff__row' },
  { family: 'data-diff', part: 'cell', disposition: 'class', hook: 'muxui-data-diff__cell' },
  { family: 'data-diff', part: 'selection', disposition: 'class', hook: 'muxui-data-diff__selection' },
  { family: 'data-diff', part: 'change', disposition: 'class', hook: 'muxui-data-diff__change' },
  { family: 'data-diff', part: 'values', disposition: 'class', hook: 'muxui-data-diff__values' },
  { family: 'data-diff', part: 'before', disposition: 'class', hook: 'muxui-data-diff__before' },
  { family: 'data-diff', part: 'after', disposition: 'class', hook: 'muxui-data-diff__after' },
  { family: 'data-diff', part: 'arrow', disposition: 'class', hook: 'muxui-data-diff__arrow' },
  { family: 'data-diff', part: 'footer', disposition: 'class', hook: 'muxui-data-diff__footer' },
  { family: 'data-diff', part: 'totals', disposition: 'class', hook: 'muxui-data-diff__totals' },
  { family: 'data-diff', part: 'apply', disposition: 'class', hook: 'muxui-data-diff__apply', composedOf: 'button' },
  { family: 'data-diff', part: 'empty', disposition: 'class', hook: 'muxui-data-diff__empty' },
  { family: 'date-field', part: 'root', disposition: 'class', hook: 'muxui-date-field' },
  { family: 'date-field', part: 'label', disposition: 'field', hook: 'muxui-field-label' },
  { family: 'date-field', part: 'input', disposition: 'internal', hook: 'muxui-date-input' },
  { family: 'date-field', part: 'segment', disposition: 'internal', hook: 'muxui-date-segment' },
  { family: 'date-field', part: 'description', disposition: 'field', hook: 'muxui-field-description' },
  { family: 'date-field', part: 'error', disposition: 'field', hook: 'muxui-field-error' },
  { family: 'date-picker', part: 'root', disposition: 'class', hook: 'muxui-date-picker' },
  { family: 'date-picker', part: 'label', disposition: 'field', hook: 'muxui-field-label' },
  { family: 'date-picker', part: 'input', disposition: 'internal', hook: 'muxui-date-input' },
  { family: 'date-picker', part: 'segment', disposition: 'internal', hook: 'muxui-date-segment' },
  { family: 'date-picker', part: 'trigger', disposition: 'internal', hook: 'muxui-date-trigger' },
  { family: 'date-picker', part: 'calendar', disposition: 'composed', hook: 'muxui-calendar', selector: '.muxui-date-picker__popover .muxui-calendar' },
  { family: 'date-picker', part: 'description', disposition: 'field', hook: 'muxui-field-description' },
  { family: 'date-picker', part: 'error', disposition: 'field', hook: 'muxui-field-error' },
  { family: 'date-range-picker', part: 'root', disposition: 'class', hook: 'muxui-date-range-picker' },
  { family: 'date-range-picker', part: 'label', disposition: 'field', hook: 'muxui-field-label' },
  { family: 'date-range-picker', part: 'start', disposition: 'class', hook: 'muxui-date-range-picker__start', hookOnly: 'The start date input carries it beside muxui-date-input, which the field rules select; the class only tells the two inputs apart.' },
  { family: 'date-range-picker', part: 'end', disposition: 'class', hook: 'muxui-date-range-picker__end', hookOnly: 'The end date input carries it beside muxui-date-input, which the field rules select; the class only tells the two inputs apart.' },
  { family: 'date-range-picker', part: 'trigger', disposition: 'internal', hook: 'muxui-date-trigger' },
  { family: 'date-range-picker', part: 'calendar', disposition: 'composed', hook: 'muxui-calendar', selector: '.muxui-date-range-picker__popover .muxui-calendar' },
  { family: 'date-range-picker', part: 'description', disposition: 'field', hook: 'muxui-field-description' },
  { family: 'date-range-picker', part: 'error', disposition: 'field', hook: 'muxui-field-error' },
  { family: 'dialog', part: 'backdrop', disposition: 'class', hook: 'muxui-dialog__backdrop' },
  { family: 'dialog', part: 'root', disposition: 'class', hook: 'muxui-dialog' },
  { family: 'dialog', part: 'title', disposition: 'class', hook: 'muxui-dialog__title' },
  { family: 'dialog', part: 'description', disposition: 'class', hook: 'muxui-dialog__description' },
  { family: 'dialog', part: 'content', disposition: 'class', hook: 'muxui-dialog__content' },
  { family: 'dialog', part: 'actions', disposition: 'class', hook: 'muxui-dialog__actions' },
  { family: 'dialog', part: 'close', disposition: 'class', hook: 'muxui-dialog__close' },
  { family: 'disclosure', part: 'root', disposition: 'class', hook: 'muxui-disclosure' },
  { family: 'disclosure', part: 'trigger', disposition: 'class', hook: 'muxui-disclosure__trigger' },
  { family: 'disclosure', part: 'panel', disposition: 'class', hook: 'muxui-disclosure__panel' },
  { family: 'disclosure-group', part: 'root', disposition: 'class', hook: 'muxui-disclosure-group' },
  { family: 'disclosure-group', part: 'disclosure', disposition: 'composed', hook: 'muxui-disclosure' },
  { family: 'drop-zone', part: 'root', disposition: 'class', hook: 'muxui-drop-zone' },
  { family: 'drop-zone', part: 'content', disposition: 'none', reason: 'children' },
  { family: 'file-trigger', part: 'root', disposition: 'class', hook: 'muxui-file-trigger', composedOf: 'button', callerSupplied: 'A child element is cloned with the hook; a native button child carries muxui-file-trigger and no muxui-button.' },
  { family: 'file-trigger', part: 'input', disposition: 'none', reason: 'substrate' },
  { family: 'form', part: 'root', disposition: 'class', hook: 'muxui-form' },
  { family: 'form', part: 'content', disposition: 'none', reason: 'children' },
  { family: 'grid-list', part: 'root', disposition: 'class', hook: 'muxui-grid-list' },
  { family: 'grid-list', part: 'item', disposition: 'class', hook: 'muxui-grid-list__item' },
  { family: 'group', part: 'root', disposition: 'class', hook: 'muxui-group' },
  { family: 'group', part: 'label', disposition: 'none', reason: 'children' },
  { family: 'group', part: 'content', disposition: 'none', reason: 'children' },
  { family: 'header-nav', part: 'root', disposition: 'class', hook: 'muxui-header-nav' },
  { family: 'header-nav', part: 'logo', disposition: 'class', hook: 'muxui-header-nav__logo' },
  { family: 'header-nav', part: 'nav-button', disposition: 'class', hook: 'muxui-header-nav__nav-button' },
  { family: 'header-nav', part: 'actions', disposition: 'class', hook: 'muxui-header-nav__actions' },
  { family: 'header-nav', part: 'secondary', disposition: 'class', hook: 'muxui-header-nav__secondary' },
  { family: 'header-nav', part: 'mobile-trigger', disposition: 'class', hook: 'muxui-header-nav__mobile-trigger', composedOf: 'button' },
  { family: 'icon-button', part: 'root', disposition: 'class', hook: 'muxui-icon-button' },
  { family: 'icon-button', part: 'icon', disposition: 'class', hook: 'muxui-icon-button__icon' },
  { family: 'image', part: 'root', disposition: 'class', hook: 'muxui-image' },
  { family: 'input', part: 'root', disposition: 'class', hook: 'muxui-input__root', exception: 'Input.Root renders the wrapper as muxui-input__root; muxui-input is the control inside it.' },
  { family: 'input', part: 'input', disposition: 'class', hook: 'muxui-input', exception: 'The control carries the family class itself; muxui-input__input is not emitted.' },
  { family: 'input', part: 'label', disposition: 'class', hook: 'muxui-input__label' },
  { family: 'input', part: 'description', disposition: 'class', hook: 'muxui-input__description' },
  { family: 'input', part: 'error', disposition: 'class', hook: 'muxui-input__error' },
  { family: 'input-tags', part: 'root', disposition: 'class', hook: 'muxui-input-tags' },
  { family: 'input-tags', part: 'label', disposition: 'class', hook: 'muxui-input-tags__label' },
  { family: 'input-tags', part: 'group', disposition: 'class', hook: 'muxui-input-tags__group' },
  { family: 'input-tags', part: 'tag-wrapper', disposition: 'class', hook: 'muxui-input-tags__tag-wrapper' },
  { family: 'input-tags', part: 'tag-group', disposition: 'class', hook: 'muxui-input-tags__tag-group' },
  { family: 'input-tags', part: 'tag-list', disposition: 'class', hook: 'muxui-input-tags__tag-list' },
  { family: 'input-tags', part: 'tag', disposition: 'class', hook: 'muxui-input-tags__tag' },
  { family: 'input-tags', part: 'input', disposition: 'class', hook: 'muxui-input-tags__input' },
  { family: 'input-tags', part: 'description', disposition: 'class', hook: 'muxui-input-tags__description' },
  { family: 'input-tags', part: 'error', disposition: 'class', hook: 'muxui-input-tags__error' },
  { family: 'lightbox', part: 'root', disposition: 'class', hook: 'muxui-lightbox', hookOnly: 'Lightbox carries the class on its root div; no authored rule selects the root, only its parts.' },
  { family: 'lightbox', part: 'trigger', disposition: 'class', hook: 'muxui-lightbox__trigger', composedOf: 'button' },
  { family: 'lightbox', part: 'backdrop', disposition: 'class', hook: 'muxui-lightbox__backdrop' },
  { family: 'lightbox', part: 'popup', disposition: 'class', hook: 'muxui-lightbox__popup' },
  { family: 'lightbox', part: 'content', disposition: 'class', hook: 'muxui-lightbox__content' },
  { family: 'lightbox', part: 'caption', disposition: 'class', hook: 'muxui-lightbox__caption' },
  { family: 'lightbox', part: 'previous', disposition: 'class', hook: 'muxui-lightbox__previous' },
  { family: 'lightbox', part: 'next', disposition: 'class', hook: 'muxui-lightbox__next' },
  { family: 'lightbox', part: 'close', disposition: 'class', hook: 'muxui-lightbox__close' },
  { family: 'link', part: 'root', disposition: 'class', hook: 'muxui-link' },
  { family: 'link', part: 'label', disposition: 'root-element', hook: 'muxui-link' },
  { family: 'list-box', part: 'root', disposition: 'class', hook: 'muxui-list-box' },
  { family: 'list-box', part: 'section', disposition: 'class', hook: 'muxui-list-box__section' },
  { family: 'list-box', part: 'header', disposition: 'class', hook: 'muxui-list-box__header' },
  { family: 'list-box', part: 'item', disposition: 'class', hook: 'muxui-list-box__item' },
  { family: 'markdown', part: 'root', disposition: 'class', hook: 'muxui-markdown' },
  { family: 'markdown', part: 'heading', disposition: 'class', hook: 'muxui-markdown__heading', hookOnly: 'The heading rules select h1 to h6 by element, not by this class.' },
  { family: 'markdown', part: 'content', disposition: 'none', reason: 'children' },
  { family: 'markdown', part: 'link', disposition: 'composed', hook: 'muxui-link' },
  { family: 'markdown', part: 'code', disposition: 'class', hook: 'muxui-markdown__code' },
  { family: 'menu', part: 'root', disposition: 'class', hook: 'muxui-menu__root', exception: 'Menu.Root renders the wrapper as muxui-menu__root; muxui-menu is the list, in a popup and in the standalone Menu.' },
  { family: 'menu', part: 'trigger', disposition: 'class', hook: 'muxui-menu__trigger' },
  { family: 'menu', part: 'popup', disposition: 'class', hook: 'muxui-menu__popup' },
  { family: 'menu', part: 'list', disposition: 'class', hook: 'muxui-menu__list', hookOnly: 'Only the list of a Menu.Root popup carries it, beside muxui-menu, which the list rules select.' },
  { family: 'menu', part: 'item', disposition: 'class', hook: 'muxui-menu__item' },
  { family: 'menu', part: 'submenu', disposition: 'none', reason: 'children' },
  { family: 'menu', part: 'section', disposition: 'class', hook: 'muxui-menu__section', hookOnly: 'The section carries it; its header and items are styled and the section is not.' },
  { family: 'menu', part: 'header', disposition: 'class', hook: 'muxui-menu__header' },
  { family: 'menu', part: 'separator', disposition: 'class', hook: 'muxui-menu__separator' },
  { family: 'message', part: 'root', disposition: 'class', hook: 'muxui-message' },
  { family: 'message', part: 'author', disposition: 'class', hook: 'muxui-message__author' },
  { family: 'message', part: 'content', disposition: 'class', hook: 'muxui-message__content' },
  { family: 'message', part: 'actions', disposition: 'class', hook: 'muxui-message__actions' },
  { family: 'message', part: 'sources', disposition: 'class', hook: 'muxui-message__sources' },
  { family: 'message', part: 'follow-ups', disposition: 'class', hook: 'muxui-message__follow-ups' },
  { family: 'message', part: 'status', disposition: 'class', hook: 'muxui-message__status' },
  { family: 'meter', part: 'root', disposition: 'class', hook: 'muxui-meter' },
  { family: 'meter', part: 'label', disposition: 'internal', hook: 'muxui-value-label' },
  { family: 'meter', part: 'track', disposition: 'class', hook: 'muxui-meter__track' },
  { family: 'meter', part: 'fill', disposition: 'class', hook: 'muxui-meter__fill' },
  { family: 'multi-select', part: 'root', disposition: 'class', hook: 'muxui-multi-select' },
  { family: 'multi-select', part: 'label', disposition: 'class', hook: 'muxui-multi-select__label' },
  { family: 'multi-select', part: 'trigger', disposition: 'class', hook: 'muxui-multi-select__trigger' },
  { family: 'multi-select', part: 'value', disposition: 'class', hook: 'muxui-multi-select__value' },
  { family: 'multi-select', part: 'icon', disposition: 'class', hook: 'muxui-multi-select__icon' },
  { family: 'multi-select', part: 'popup', disposition: 'class', hook: 'muxui-multi-select__popup' },
  { family: 'multi-select', part: 'dialog', disposition: 'class', hook: 'muxui-multi-select__dialog' },
  { family: 'multi-select', part: 'search', disposition: 'class', hook: 'muxui-multi-select__search' },
  { family: 'multi-select', part: 'search-input', disposition: 'class', hook: 'muxui-multi-select__search-input' },
  { family: 'multi-select', part: 'listbox', disposition: 'class', hook: 'muxui-multi-select__listbox' },
  { family: 'multi-select', part: 'item', disposition: 'class', hook: 'muxui-multi-select__item' },
  { family: 'multi-select', part: 'empty', disposition: 'class', hook: 'muxui-multi-select__empty' },
  { family: 'multi-select', part: 'footer', disposition: 'class', hook: 'muxui-multi-select__footer' },
  { family: 'number-field', part: 'root', disposition: 'class', hook: 'muxui-number-field' },
  { family: 'number-field', part: 'label', disposition: 'field', hook: 'muxui-field-label' },
  { family: 'number-field', part: 'input', disposition: 'field', hook: 'muxui-field-input' },
  { family: 'number-field', part: 'decrement', disposition: 'class', hook: 'muxui-number-field__decrement', composedOf: 'button' },
  { family: 'number-field', part: 'increment', disposition: 'class', hook: 'muxui-number-field__increment', composedOf: 'button' },
  { family: 'number-field', part: 'description', disposition: 'field', hook: 'muxui-field-description' },
  { family: 'number-field', part: 'error', disposition: 'field', hook: 'muxui-field-error' },
  { family: 'payment-input', part: 'root', disposition: 'class', hook: 'muxui-payment-input' },
  { family: 'payment-input', part: 'group', disposition: 'class', hook: 'muxui-payment-input__group' },
  { family: 'payment-input', part: 'input', disposition: 'class', hook: 'muxui-payment-input__input' },
  { family: 'payment-input', part: 'label', disposition: 'class', hook: 'muxui-payment-input__label' },
  { family: 'payment-input', part: 'description', disposition: 'class', hook: 'muxui-payment-input__description' },
  { family: 'payment-input', part: 'error', disposition: 'class', hook: 'muxui-payment-input__error' },
  { family: 'payment-input', part: 'card-icon', disposition: 'class', hook: 'muxui-payment-input__card-icon' },
  { family: 'popover', part: 'trigger', disposition: 'class', hook: 'muxui-popover__trigger', composedOf: 'button', callerSupplied: 'The trigger prop is the caller\'s element, cloned with the hook; a native button carries muxui-popover__trigger and no muxui-button.' },
  { family: 'popover', part: 'root', disposition: 'class', hook: 'muxui-popover' },
  { family: 'popover', part: 'content', disposition: 'none', reason: 'children' },
  { family: 'preview-trigger', part: 'trigger', disposition: 'none', reason: 'caller' },
  { family: 'preview-trigger', part: 'root', disposition: 'class', hook: 'muxui-preview-trigger' },
  { family: 'preview-trigger', part: 'content', disposition: 'class', hook: 'muxui-preview-trigger__content' },
  { family: 'progress-bar', part: 'root', disposition: 'class', hook: 'muxui-progress-bar' },
  { family: 'progress-bar', part: 'label', disposition: 'internal', hook: 'muxui-value-label' },
  { family: 'progress-bar', part: 'track', disposition: 'class', hook: 'muxui-progress-bar__track' },
  { family: 'progress-bar', part: 'fill', disposition: 'class', hook: 'muxui-progress-bar__fill' },
  { family: 'progress-circle', part: 'root', disposition: 'class', hook: 'muxui-progress-circle' },
  { family: 'progress-circle', part: 'track', disposition: 'class', hook: 'muxui-progress-circle__track' },
  { family: 'progress-circle', part: 'label', disposition: 'class', hook: 'muxui-progress-circle__label' },
  { family: 'progress-circle', part: 'value', disposition: 'class', hook: 'muxui-progress-circle__value' },
  { family: 'prompt-composer', part: 'root', disposition: 'class', hook: 'muxui-prompt-composer' },
  { family: 'prompt-composer', part: 'input', disposition: 'class', hook: 'muxui-prompt-composer__input' },
  { family: 'prompt-composer', part: 'controls', disposition: 'class', hook: 'muxui-prompt-composer__controls' },
  { family: 'prompt-composer', part: 'attachments', disposition: 'class', hook: 'muxui-prompt-composer__attachments' },
  { family: 'prompt-composer', part: 'suggestions', disposition: 'class', hook: 'muxui-prompt-composer__suggestions' },
  { family: 'prompt-composer', part: 'error', disposition: 'class', hook: 'muxui-prompt-composer__error' },
  { family: 'prompt-composer', part: 'status', disposition: 'class', hook: 'muxui-prompt-composer__status', selector: '.muxui-prompt-composer__status[role="status"]' },
  { family: 'radio-field', part: 'root', disposition: 'class', hook: 'muxui-radio-field' },
  { family: 'radio-field', part: 'button', disposition: 'class', hook: 'muxui-radio-field__button' },
  { family: 'radio-field', part: 'indicator', disposition: 'class', hook: 'muxui-radio-field__indicator' },
  { family: 'radio-field', part: 'dot', disposition: 'class', hook: 'muxui-radio-field__dot' },
  { family: 'radio-field', part: 'description', disposition: 'class', hook: 'muxui-radio-field__description' },
  { family: 'radio-field', part: 'error', disposition: 'class', hook: 'muxui-radio-field__error' },
  { family: 'radio-group', part: 'root', disposition: 'class', hook: 'muxui-radio-group' },
  { family: 'radio-group', part: 'label', disposition: 'field', hook: 'muxui-field-label', selector: '.muxui-radio-group__field .muxui-field-label' },
  { family: 'radio-group', part: 'error', disposition: 'field', hook: 'muxui-field-error' },
  { family: 'radio-group', part: 'radio', disposition: 'class', hook: 'muxui-radio-group__radio' },
  { family: 'range-calendar', part: 'root', disposition: 'class', hook: 'muxui-range-calendar' },
  { family: 'range-calendar', part: 'label', disposition: 'field', hook: 'muxui-field-label' },
  { family: 'range-calendar', part: 'grid', disposition: 'composed', hook: 'muxui-calendar__grid' },
  { family: 'range-calendar', part: 'cell', disposition: 'class', hook: 'muxui-range-calendar__cell' },
  { family: 'resizable', part: 'root', disposition: 'class', hook: 'muxui-resizable' },
  { family: 'resizable', part: 'panel', disposition: 'class', hook: 'muxui-resizable__panel' },
  { family: 'resizable', part: 'handle', disposition: 'class', hook: 'muxui-resizable__handle' },
  { family: 'search-field', part: 'root', disposition: 'class', hook: 'muxui-search-field' },
  { family: 'search-field', part: 'label', disposition: 'field', hook: 'muxui-field-label' },
  { family: 'search-field', part: 'input', disposition: 'field', hook: 'muxui-field-input' },
  { family: 'search-field', part: 'clear', disposition: 'class', hook: 'muxui-search-field__clear', composedOf: 'button' },
  { family: 'search-field', part: 'description', disposition: 'field', hook: 'muxui-field-description' },
  { family: 'search-field', part: 'error', disposition: 'field', hook: 'muxui-field-error' },
  { family: 'select', part: 'root', disposition: 'class', hook: 'muxui-select' },
  { family: 'select', part: 'label', disposition: 'field', hook: 'muxui-field-label' },
  { family: 'select', part: 'trigger', disposition: 'class', hook: 'muxui-select__trigger' },
  { family: 'select', part: 'value', disposition: 'class', hook: 'muxui-select__value' },
  { family: 'select', part: 'popup', disposition: 'class', hook: 'muxui-select__popup' },
  { family: 'select', part: 'list', disposition: 'class', hook: 'muxui-select__list' },
  { family: 'select', part: 'option', disposition: 'class', hook: 'muxui-select__option' },
  { family: 'select', part: 'description', disposition: 'field', hook: 'muxui-field-description' },
  { family: 'select', part: 'error', disposition: 'field', hook: 'muxui-field-error' },
  { family: 'select-native', part: 'root', disposition: 'class', hook: 'muxui-select-native' },
  { family: 'select-native', part: 'select', disposition: 'root-element', hook: 'muxui-select-native' },
  { family: 'select-native', part: 'label', disposition: 'class', hook: 'muxui-select-native__label' },
  { family: 'select-native', part: 'description', disposition: 'class', hook: 'muxui-select-native__description' },
  { family: 'select-native', part: 'error', disposition: 'class', hook: 'muxui-select-native__error' },
  { family: 'separator', part: 'root', disposition: 'class', hook: 'muxui-separator' },
  { family: 'sidebar', part: 'provider', disposition: 'none', reason: 'provider' },
  { family: 'sidebar', part: 'root', disposition: 'class', hook: 'muxui-sidebar' },
  { family: 'sidebar', part: 'toggle', disposition: 'class', hook: 'muxui-sidebar__toggle', hookOnly: 'The toggle is an IconButton, which the icon button rules style.' },
  { family: 'sidebar', part: 'header', disposition: 'class', hook: 'muxui-sidebar__header' },
  { family: 'sidebar', part: 'search', disposition: 'class', hook: 'muxui-sidebar__search' },
  { family: 'sidebar', part: 'divider', disposition: 'class', hook: 'muxui-sidebar__divider' },
  { family: 'sidebar', part: 'nav-list', disposition: 'class', hook: 'muxui-sidebar__nav-list' },
  { family: 'sidebar', part: 'section', disposition: 'class', hook: 'muxui-sidebar__section' },
  { family: 'sidebar', part: 'nav-item', disposition: 'class', hook: 'muxui-sidebar__nav-item' },
  { family: 'sidebar', part: 'nav-button', disposition: 'class', hook: 'muxui-sidebar__nav-button', selector: 'a.muxui-sidebar__nav-button' },
  { family: 'sidebar', part: 'account-card', disposition: 'class', hook: 'muxui-sidebar__account-card' },
  { family: 'sidebar', part: 'account-menu', disposition: 'class', hook: 'muxui-sidebar__account-menu' },
  { family: 'sidebar', part: 'mobile-trigger', disposition: 'class', hook: 'muxui-sidebar__mobile-trigger', composedOf: 'button' },
  { family: 'sidebar', part: 'feature-card', disposition: 'class', hook: 'muxui-sidebar__feature-card' },
  { family: 'slider', part: 'root', disposition: 'class', hook: 'muxui-slider' },
  { family: 'slider', part: 'label', disposition: 'field', hook: 'muxui-field-label' },
  { family: 'slider', part: 'track', disposition: 'class', hook: 'muxui-slider__track' },
  { family: 'slider', part: 'thumb', disposition: 'class', hook: 'muxui-slider__thumb' },
  { family: 'switch', part: 'root', disposition: 'class', hook: 'muxui-switch' },
  { family: 'switch', part: 'input', disposition: 'none', reason: 'substrate' },
  { family: 'switch', part: 'indicator', disposition: 'class', hook: 'muxui-switch__indicator' },
  { family: 'switch', part: 'label', disposition: 'class', hook: 'muxui-switch__label' },
  { family: 'switch', part: 'description', disposition: 'field', hook: 'muxui-field-description', selector: '.muxui-switch-field .muxui-field-description' },
  { family: 'switch', part: 'error', disposition: 'field', hook: 'muxui-field-error', selector: '.muxui-switch-field .muxui-field-error' },
  { family: 'switch-field', part: 'root', disposition: 'class', hook: 'muxui-switch-field' },
  { family: 'switch-field', part: 'button', disposition: 'class', hook: 'muxui-switch-field__button' },
  { family: 'switch-field', part: 'thumb', disposition: 'class', hook: 'muxui-switch-field__thumb' },
  { family: 'switch-field', part: 'description', disposition: 'class', hook: 'muxui-switch-field__description' },
  { family: 'switch-field', part: 'error', disposition: 'class', hook: 'muxui-switch-field__error' },
  { family: 'table', part: 'root', disposition: 'class', hook: 'muxui-table' },
  { family: 'table', part: 'header', disposition: 'class', hook: 'muxui-table__header' },
  { family: 'table', part: 'column', disposition: 'class', hook: 'muxui-table__column' },
  { family: 'table', part: 'body', disposition: 'class', hook: 'muxui-table__body' },
  { family: 'table', part: 'row', disposition: 'class', hook: 'muxui-table__row' },
  { family: 'table', part: 'cell', disposition: 'class', hook: 'muxui-table__cell' },
  { family: 'tabs', part: 'root', disposition: 'class', hook: 'muxui-tabs' },
  { family: 'tabs', part: 'list', disposition: 'class', hook: 'muxui-tabs__list' },
  { family: 'tabs', part: 'tab', disposition: 'class', hook: 'muxui-tabs__tab' },
  { family: 'tabs', part: 'panels', disposition: 'class', hook: 'muxui-tabs__panels', hookOnly: 'The wrapper around the panels carries it; each panel is styled through muxui-tabs__panel.' },
  { family: 'tabs', part: 'panel', disposition: 'class', hook: 'muxui-tabs__panel' },
  { family: 'tag-group', part: 'root', disposition: 'class', hook: 'muxui-tag-group' },
  { family: 'tag-group', part: 'label', disposition: 'field', hook: 'muxui-field-label' },
  { family: 'tag-group', part: 'list', disposition: 'class', hook: 'muxui-tag-group__list' },
  { family: 'tag-group', part: 'tag', disposition: 'class', hook: 'muxui-tag-group__tag' },
  { family: 'tag-group', part: 'remove', disposition: 'class', hook: 'muxui-tag-group__remove', composedOf: 'button' },
  { family: 'tag-select', part: 'root', disposition: 'class', hook: 'muxui-tag-select' },
  { family: 'tag-select', part: 'label', disposition: 'class', hook: 'muxui-tag-select__label' },
  { family: 'tag-select', part: 'combobox', disposition: 'class', hook: 'muxui-tag-select__combobox' },
  { family: 'tag-select', part: 'group', disposition: 'class', hook: 'muxui-tag-select__group' },
  { family: 'tag-select', part: 'tag', disposition: 'class', hook: 'muxui-tag-select__tag' },
  { family: 'tag-select', part: 'tag-text', disposition: 'class', hook: 'muxui-tag-select__tag-text' },
  { family: 'tag-select', part: 'tag-remove', disposition: 'class', hook: 'muxui-tag-select__tag-remove', composedOf: 'button' },
  { family: 'tag-select', part: 'input', disposition: 'class', hook: 'muxui-tag-select__input' },
  { family: 'tag-select', part: 'listbox', disposition: 'class', hook: 'muxui-tag-select__listbox' },
  { family: 'tag-select', part: 'item', disposition: 'class', hook: 'muxui-tag-select__item' },
  { family: 'tag-select', part: 'description', disposition: 'class', hook: 'muxui-tag-select__description' },
  { family: 'tag-select', part: 'error', disposition: 'class', hook: 'muxui-tag-select__error' },
  { family: 'text', part: 'root', disposition: 'class', hook: 'muxui-text', hookOnly: 'Only the size and variant modifiers of muxui-text are styled; no rule selects the bare class.' },
  { family: 'text-area', part: 'root', disposition: 'class', hook: 'muxui-text-area' },
  { family: 'text-area', part: 'textarea', disposition: 'class', hook: 'muxui-text-area__textarea' },
  { family: 'text-area', part: 'label', disposition: 'class', hook: 'muxui-text-area__label' },
  { family: 'text-area', part: 'description', disposition: 'class', hook: 'muxui-text-area__description' },
  { family: 'text-area', part: 'error', disposition: 'class', hook: 'muxui-text-area__error' },
  { family: 'text-editor', part: 'root', disposition: 'class', hook: 'muxui-text-editor' },
  { family: 'text-editor', part: 'label', disposition: 'class', hook: 'muxui-text-editor__label' },
  { family: 'text-editor', part: 'toolbar', disposition: 'class', hook: 'muxui-text-editor__toolbar' },
  { family: 'text-editor', part: 'content', disposition: 'class', hook: 'muxui-text-editor__content' },
  { family: 'text-editor', part: 'description', disposition: 'class', hook: 'muxui-text-editor__description' },
  { family: 'text-editor', part: 'hint', disposition: 'class', hook: 'muxui-text-editor__hint' },
  { family: 'text-editor', part: 'error', disposition: 'class', hook: 'muxui-text-editor__error' },
  { family: 'text-editor', part: 'color-popup', disposition: 'class', hook: 'muxui-text-editor__color-popup' },
  { family: 'text-editor', part: 'custom-color-field', disposition: 'class', hook: 'muxui-text-editor__custom-color-field' },
  { family: 'text-editor', part: 'image-picker', disposition: 'class', hook: 'muxui-text-editor__image-picker', hookOnly: 'The insert-image button carries it beside muxui-text-editor__btn, which the toolbar rules select.', composedOf: 'button' },
  { family: 'text-editor', part: 'bubble-menu', disposition: 'class', hook: 'muxui-text-editor__bubble-menu' },
  { family: 'text-editor', part: 'selection-actions', disposition: 'class', hook: 'muxui-text-editor__selection-actions' },
  { family: 'text-field', part: 'root', disposition: 'class', hook: 'muxui-text-field' },
  { family: 'text-field', part: 'label', disposition: 'field', hook: 'muxui-field-label' },
  { family: 'text-field', part: 'input', disposition: 'field', hook: 'muxui-field-input' },
  { family: 'text-field', part: 'description', disposition: 'field', hook: 'muxui-field-description' },
  { family: 'text-field', part: 'error', disposition: 'field', hook: 'muxui-field-error' },
  { family: 'time-field', part: 'root', disposition: 'class', hook: 'muxui-time-field' },
  { family: 'time-field', part: 'label', disposition: 'field', hook: 'muxui-field-label' },
  { family: 'time-field', part: 'input', disposition: 'internal', hook: 'muxui-date-input' },
  { family: 'time-field', part: 'segment', disposition: 'internal', hook: 'muxui-date-segment' },
  { family: 'time-field', part: 'description', disposition: 'field', hook: 'muxui-field-description' },
  { family: 'time-field', part: 'error', disposition: 'field', hook: 'muxui-field-error' },
  { family: 'toast', part: 'region', disposition: 'class', hook: 'muxui-toast__region' },
  { family: 'toast', part: 'toast', disposition: 'root-element', hook: 'muxui-toast' },
  { family: 'toast', part: 'title', disposition: 'class', hook: 'muxui-toast__title' },
  { family: 'toast', part: 'message', disposition: 'class', hook: 'muxui-toast__message' },
  { family: 'toast', part: 'dismiss', disposition: 'class', hook: 'muxui-toast__dismiss' },
  { family: 'toggle-button', part: 'root', disposition: 'class', hook: 'muxui-toggle-button', composedOf: 'button' },
  { family: 'toggle-button', part: 'label', disposition: 'root-element', hook: 'muxui-toggle-button', composedOf: 'button' },
  { family: 'toggle-button-group', part: 'root', disposition: 'class', hook: 'muxui-toggle-button-group' },
  { family: 'toggle-button-group', part: 'button', disposition: 'composed', hook: 'muxui-toggle-button', composedOf: 'button' },
  { family: 'token-field', part: 'root', disposition: 'class', hook: 'muxui-token-field' },
  { family: 'token-field', part: 'label', disposition: 'field', hook: 'muxui-field-label' },
  { family: 'token-field', part: 'input', disposition: 'class', hook: 'muxui-token-field__input' },
  { family: 'token-field', part: 'token', disposition: 'class', hook: 'muxui-token-field__token' },
  { family: 'toolbar', part: 'root', disposition: 'class', hook: 'muxui-toolbar' },
  { family: 'toolbar', part: 'control', disposition: 'none', reason: 'caller' },
  { family: 'tooltip', part: 'trigger', disposition: 'none', reason: 'caller' },
  { family: 'tooltip', part: 'tooltip', disposition: 'root-element', hook: 'muxui-tooltip' },
  { family: 'tree', part: 'root', disposition: 'class', hook: 'muxui-tree' },
  { family: 'tree', part: 'item', disposition: 'class', hook: 'muxui-tree__item' },
  { family: 'tree', part: 'children', disposition: 'none', reason: 'children' },
  { family: 'virtualizer', part: 'root', disposition: 'class', hook: 'muxui-virtualizer' },
  { family: 'virtualizer', part: 'viewport', disposition: 'root-element', hook: 'muxui-virtualizer' },
  { family: 'virtualizer', part: 'item', disposition: 'class', hook: 'muxui-virtualizer__item' },
];

const rowsByKey = new Map(partRows.map((row) => [`${row.family}.${row.part}`, row]));

/** The row of a family part. A part the table lacks throws, so a reader never takes a misspelled part for "no element". */
export function partRow(family: string, part: string): PartRow {
  const row = rowsByKey.get(`${family}.${part}`);
  if (row === undefined) throw new Error(`no part-map row for ${family}.${part}`);
  return row;
}

/**
 * The selector that proves a row: `selector` when the row has one, else the hook scoped by the family root for a field row and
 * the bare hook for every other disposition. A `none` row has no element and so no selector.
 */
export function selectorOf(row: PartRow): string | undefined {
  if (row.disposition === 'none') return undefined;
  if (row.selector !== undefined) return row.selector;
  if (row.hook === undefined) throw new Error(`${row.family}.${row.part} has no hook`);
  if (row.disposition !== 'field') return `.${row.hook}`;
  // Toast and Tooltip have no root part: the part named for the family is the root element.
  const root = rowsByKey.get(`${row.family}.root`)?.hook ?? partClass(row.family, 'root');
  return `.${root} .${row.hook}`;
}

/** The selector of a part that must have an element, for a reader that selects one part. Throws for a `none` part. */
export function partSelector(family: string, part: string): string {
  const selector = selectorOf(partRow(family, part));
  if (selector === undefined) throw new Error(`${family}.${part} renders no element`);
  return selector;
}

/** How a catalog state name relates to the state contract (see `catalogStateKinds`). */
export type StateKind = 'state' | 'enum' | 'prop' | 'status' | 'environment' | 'derived' | 'unresolved';

/** A kind and its target: `['state', name]`, `['enum', name, value]`, `['status', attribute]`, or the kind alone. */
export type StateClassification = readonly [kind: StateKind, ...target: string[]];

const names = (list: readonly string[]): Record<string, StateClassification> => Object.fromEntries(list.map((name) => [name, ['state', name]]));
const kinds = (kind: StateKind, list: readonly string[]): Record<string, StateClassification> => Object.fromEntries(list.map((name) => [name, [kind]]));

/**
 * How each catalog state name relates to the contract: `state` is a boolean state, `enum` an enumerated state
 * and value, `prop` a reflected prop, `status` a status a family writes for its own lifecycle (data-muxui-<name>, not
 * a state React Aria drives), `environment` a scheme or viewport, `derived` a state computed from others (a missing
 * state, a value range, a lifecycle phase, with no attribute of its own). A name used for two meanings (`collapsed`)
 * takes the one with an attribute today. Every name is settled: `unresolved` remains a kind only so a new catalog
 * state cannot pass without a reason and the PR that settles it.
 *
 * It lives beside the part map because the styling reference derives each family's state rows from both, and a change to
 * either is a change to what the docs and Storybook print (the planner routes both to the same consumers).
 */
export const catalogStateKinds: Readonly<Record<string, StateClassification>> = {
  ...names([
    'disabled', 'focused', 'focus-visible', 'hovered', 'pressed', 'invalid', 'read-only', 'required', 'pending',
    'selected', 'indeterminate', 'expanded', 'open', 'current', 'empty', 'drop-target',
  ]),
  opening: ['state', 'entering'],
  closing: ['state', 'exiting'],
  horizontal: ['enum', 'orientation', 'horizontal'],
  vertical: ['enum', 'orientation', 'vertical'],
  ...kinds('prop', [
    'sm', 'md', 'lg', 'radius-full', 'radius-lg', 'radius-md', 'radius-sm', 'elevated', 'outlined', 'attached',
    'below', 'inline', 'wrap', 'diff', 'truncated', 'external', 'collapsed', 'streaming', 'running', 'failed',
    'timed', 'visa', 'mastercard', 'amex', 'discover', 'unknown',
  ]),
  ...kinds('environment', ['dark', 'light', 'desktop', 'mobile']),
  ...kinds('derived', [
    'checked', 'unchecked', 'unselected', 'mixed', 'closed', 'dismissed', 'visible', 'idle', 'default', 'complete',
    'partial', 'zero', 'progress', 'filled', 'filtered', 'submitting', 'tag-focused', 'color-open',
  ]),
  // Avatar and Image write these about their image: data-muxui-loaded, data-muxui-fallback and data-muxui-error, and
  // Avatar's data-muxui-image-state holds loading, loaded, fallback or error. PromptComposer reflects its error prop as data-muxui-error.
  loaded: ['status', 'loaded'],
  fallback: ['status', 'fallback'],
  error: ['status', 'error'],
  // The phase before an image settles has no attribute of its own: it is image-state "loading", or none of the three above.
  loading: ['derived'],
  // TextEditor derives these from its selection and its selection request flow and shows them as which control renders.
  ...kinds('derived', ['selection', 'selection-collapsed', 'selection-request-error', 'selection-request-pending', 'selection-request-review']),
};
