// The states half of the Stage 2 styling contract (Decision 0031 item 16): the closed state list the substrate adapter
// reads, and the spelling React Aria uses for each state. The part map and the class scheme stay in test/support until
// the class PR. Keep it erasable (no enums, no namespaces) and free of import-time work.

/**
 * The presence states, each set as `data-muxui-state-<name>` by React Aria through the substrate adapter and by Mux on
 * its own elements. Spelled as the catalog spells them. The list is closed to states React Aria drives; a status Mux
 * writes for one family (loaded, streaming, complete, ...) is a `data-muxui-<name>` attribute, not a state.
 */
export const booleanStates = [
  'disabled', 'read-only', 'required', 'invalid', 'pending', 'selected', 'indeterminate', 'expanded', 'open', 'current',
  'placeholder', 'empty', 'hovered', 'pressed', 'focused', 'focus-visible', 'focus-within', 'dragging', 'drop-target',
  'unavailable', 'today', 'outside-month', 'selection-start', 'selection-end', 'entering', 'exiting',
  'allows-sorting', 'has-child-items', 'has-submenu',
] as const;

/**
 * The enumerated states and their values, as React Aria reports them today (`type` is the date segment type, and
 * `placement` is a popover's resolved side). Mux's own placements (PromptComposer's above and below, Toast's corners)
 * are `data-muxui-placement`, a reflected prop, not this state.
 */
export const enumeratedStates = {
  orientation: ['horizontal', 'vertical'],
  placement: ['top', 'bottom', 'left', 'right'],
  layout: ['stack', 'grid'],
  'sort-direction': ['ascending', 'descending'],
  type: ['era', 'year', 'month', 'day', 'hour', 'minute', 'second', 'dayPeriod', 'literal', 'timeZoneName'],
} as const;

export type StateName = (typeof booleanStates)[number] | keyof typeof enumeratedStates;

export const stateAttribute = (state: StateName): string => `data-muxui-state-${state}`;

/**
 * The attribute React Aria sets for each state, and the Mux name it becomes. React Aria spells every state
 * `data-<name>` except read-only, which it spells `data-readonly`. Written out so the module has no import-time work
 * (`findModuleSideEffects` rejects a computed table); the type checks every value against the state list and the
 * styling guard checks every state has exactly one entry.
 */
export const substrateStateAttributes = Object.freeze({
  'data-disabled': 'data-muxui-state-disabled',
  'data-readonly': 'data-muxui-state-read-only',
  'data-required': 'data-muxui-state-required',
  'data-invalid': 'data-muxui-state-invalid',
  'data-pending': 'data-muxui-state-pending',
  'data-selected': 'data-muxui-state-selected',
  'data-indeterminate': 'data-muxui-state-indeterminate',
  'data-expanded': 'data-muxui-state-expanded',
  'data-open': 'data-muxui-state-open',
  'data-current': 'data-muxui-state-current',
  'data-placeholder': 'data-muxui-state-placeholder',
  'data-empty': 'data-muxui-state-empty',
  'data-hovered': 'data-muxui-state-hovered',
  'data-pressed': 'data-muxui-state-pressed',
  'data-focused': 'data-muxui-state-focused',
  'data-focus-visible': 'data-muxui-state-focus-visible',
  'data-focus-within': 'data-muxui-state-focus-within',
  'data-dragging': 'data-muxui-state-dragging',
  'data-drop-target': 'data-muxui-state-drop-target',
  'data-unavailable': 'data-muxui-state-unavailable',
  'data-today': 'data-muxui-state-today',
  'data-outside-month': 'data-muxui-state-outside-month',
  'data-selection-start': 'data-muxui-state-selection-start',
  'data-selection-end': 'data-muxui-state-selection-end',
  'data-entering': 'data-muxui-state-entering',
  'data-exiting': 'data-muxui-state-exiting',
  'data-allows-sorting': 'data-muxui-state-allows-sorting',
  'data-has-child-items': 'data-muxui-state-has-child-items',
  'data-has-submenu': 'data-muxui-state-has-submenu',
  'data-orientation': 'data-muxui-state-orientation',
  'data-placement': 'data-muxui-state-placement',
  'data-layout': 'data-muxui-state-layout',
  'data-sort-direction': 'data-muxui-state-sort-direction',
  'data-type': 'data-muxui-state-type',
} as const satisfies Record<`data-${string}`, `data-muxui-state-${StateName}`>);
