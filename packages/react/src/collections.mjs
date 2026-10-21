import React from 'react';
import { TreeMotion } from './tree-motion.mjs';
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import ChevronRightIcon from 'lucide-react/dist/esm/icons/chevron-right.mjs';
import XIcon from 'lucide-react/dist/esm/icons/x.mjs';
import {
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  Slider as AriaSlider,
  SliderOutput as AriaSliderOutput,
  Table as AriaTable,
  TableBody as AriaTableBody,
  TableHeader as AriaTableHeader,
  Column as AriaColumn,
  Row as AriaRow,
  Cell as AriaCell,
  Tabs as AriaTabs,
  TabList as AriaTabList,
  Tab as AriaTab,
  TabPanels as AriaTabPanels,
  TabPanel as AriaTabPanel,
  TagGroup as AriaTagGroup,
  TagList as AriaTagList,
  Tag as AriaTag,
  ToggleButtonGroup as AriaToggleButtonGroup,
  TokenField as AriaTokenField,
  TokenInput as AriaTokenInput,
  Token as AriaToken,
  Toolbar as AriaToolbar,
  Tree as AriaTree,
  TreeItem as AriaTreeItem,
  TreeItemContent as AriaTreeItemContent,
  Label as AriaLabel,
  FieldError as AriaFieldError,
  TokenFieldValue,
} from 'react-aria-components';
import { normalizeToggleButtonSize, ToggleButtonSizeContext } from './toggle-button-context.mjs';
import { normalizeChoiceControlSize, ChoiceControlSizeContext } from './choice-context.mjs';
import { RadioGroupMotion, RadioMotionIndicator } from './radio-motion.mjs';
import { SliderMotionTrack } from './slider-motion.mjs';
import { TabsMotion } from './tabs-motion.mjs';
import { ToggleButtonGroupMotion } from './toggle-button-group-motion.mjs';
import { IconButton } from './supplemental/icon-button.ts';
import { classNames, accessibleName } from './control-utils.mjs';
import { textContent, normalizeItems, keySet, keyList } from './collection-items.mjs';
import { readOnlyKeyGuard, useReadOnlyTargets } from './read-only-guard.mjs';

export { Calendar, RangeCalendar } from './calendar.mjs';
export { ColorSwatch } from './color-swatch.mjs';
export { ColorField } from './color-field.mjs';
export { ColorArea } from './color-area.mjs';
export { ColorSlider } from './color-slider.mjs';
export { ColorWheel } from './color-wheel.mjs';
export { ColorPicker } from './color-picker.mjs';
export { ColorSwatchPicker } from './color-swatch-picker.mjs';
export { ListBox } from './list-box.mjs';
export { GridList } from './grid-list.mjs';
export { Menu } from './menu.mjs';
export { ComboBox } from './combo-box.mjs';
export { Select } from './select.mjs';
export { Virtualizer } from './virtualizer.mjs';

const TABS_VARIANTS = new Set(['underline', 'pill', 'overflow', 'segment']);
const TAG_VARIANTS = ['soft', 'outline', 'dot', 'strong'];
const TAG_COLORS = [
  'neutral', 'brand', 'success', 'warning', 'error',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'bluegreen', 'cyan', 'sky', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];

function normalizeTabsVariant(value = 'underline') {
  if (!TABS_VARIANTS.has(value)) {
    throw new TypeError('Tabs variant must be one of: underline, pill, overflow, segment');
  }
  return value;
}

function normalizeTagOption(name, options, value) {
  if (!options.includes(value)) throw new TypeError(`TagGroup ${name} must be one of: ${options.join(', ')}`);
  return value;
}

function readonlyKeyArray(value, property) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((key) => typeof key !== 'string')) {
    throw new TypeError(`${property} must be a readonly string array`);
  }
  return [...value];
}

function readonlyKeySet(value, property, selectionMode) {
  if (selectionMode !== 'single' && selectionMode !== 'multiple') {
    throw new TypeError('ToggleButtonGroup selectionMode must be single or multiple');
  }
  const keys = readonlyKeyArray(value, property);
  if (keys && selectionMode === 'single' && keys.length > 1) {
    throw new TypeError(`${property} must contain at most one ID in single selection mode`);
  }
  return keys === undefined ? undefined : new Set(keys);
}

export const RadioGroup = /*#__PURE__*/ (() => {
  const component = React.forwardRef(function RadioGroup({ label, errorMessage, options = [], children, value, defaultValue, onChange, disabled = false, readOnly = false, required = false, invalid = false, orientation = 'vertical', size = 'md', name, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
    accessibleName({ label, ariaLabel, ariaLabelledby }, 'RadioGroup');
    const labelId = React.useId();
    // The visible label text labels the group, so the two cannot drift apart.
    const generatedLabelledby = ariaLabel === undefined && ariaLabelledby === undefined && label !== undefined && label !== null
      ? labelId
      : undefined;
    if (orientation !== 'horizontal' && orientation !== 'vertical') {
      throw new TypeError('RadioGroup orientation must be horizontal or vertical');
    }
    if (options.length > 0 && children !== undefined && children !== null) {
      throw new TypeError('RadioGroup options and children are mutually exclusive');
    }
    const resolvedSize = normalizeChoiceControlSize(size, 'RadioGroup');
    const radioContent = options.length > 0
      ? options.map((option) => React.createElement(AriaRadio, { key: String(option.id ?? option.value), value: String(option.value ?? option.id), isDisabled: disabled || option.disabled, className: classNames('muxui-radio', resolvedSize === undefined || resolvedSize === 'md' ? undefined : `muxui-radio--${resolvedSize}`) }, (renderProps) => React.createElement(React.Fragment, null,
        React.createElement(RadioMotionIndicator, { renderProps }),
        option.label ?? option.value)))
      : children;
    const group = React.createElement(AriaRadioGroup, { ref, name, value, defaultValue, onChange: (next) => { if (!disabled && !readOnly) onChange?.(next); }, isDisabled: disabled, isReadOnly: readOnly, isRequired: required, isInvalid: invalid || undefined, orientation, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby ?? generatedLabelledby, 'data-orientation': orientation, 'data-size': resolvedSize, className: classNames('muxui-radio-group', className) }, radioContent,
      // Inside the group, so RAC wires it into the group's aria-describedby and shows it only while the group is invalid.
      // It is always mounted: without errorMessage it shows the server or browser validation message, as CheckboxGroup does.
      React.createElement(AriaFieldError, { className: 'muxui-field-error muxui-radio-group-error' }, errorMessage));
    const motionGroup = React.createElement(RadioGroupMotion, { rootRef: ref }, group);
    const content = label === undefined
      ? motionGroup
      : React.createElement('div', { className: 'muxui-radio-group-field', 'data-disabled': disabled || undefined, 'data-invalid': invalid || undefined },
        React.createElement('span', { id: generatedLabelledby, className: 'muxui-field-label' }, label),
        motionGroup);
    return React.createElement(ChoiceControlSizeContext.Provider, { value: resolvedSize }, content);
  });
  component.displayName = 'RadioGroup';
  return component;
})();

export const Slider = /* @__PURE__ */ (() => {
  const component = React.forwardRef(function Slider({ label, value, defaultValue, onChange, onChangeEnd, min = 0, max = 100, step = 1, disabled = false, readOnly = false, orientation = 'horizontal', name, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
    accessibleName({ label, ariaLabel, ariaLabelledby }, 'Slider');
    const readOnlyRef = useReadOnlyTargets(ref, readOnly, '[role="slider"], input[type="range"]');
    const preventReadOnlyInteraction = React.useCallback((event) => {
      if (readOnly) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, [readOnly]);
    const handleChange = React.useCallback((next) => {
      if (!disabled && !readOnly) onChange?.(next);
    }, [disabled, onChange, readOnly]);
    const handleChangeEnd = React.useCallback((next) => {
      if (!disabled && !readOnly) onChangeEnd?.(next);
    }, [disabled, onChangeEnd, readOnly]);
    const assignSliderRef = React.useCallback((node) => {
      if (node) {
        if (disabled) node.setAttribute('aria-disabled', 'true');
        else node.removeAttribute('aria-disabled');
      }
      readOnlyRef(node);
    }, [disabled, readOnlyRef]);
    return React.createElement(AriaSlider, {
      ...props,
      ref: assignSliderRef,
      value,
      defaultValue,
      onChange: handleChange,
      onChangeEnd: readOnly ? undefined : handleChangeEnd,
      minValue: min,
      maxValue: max,
      step,
      isDisabled: disabled,
      orientation,
      'data-readonly': readOnly || undefined,
      onMouseDownCapture: preventReadOnlyInteraction,
      onTouchStartCapture: preventReadOnlyInteraction,
      onPointerDownCapture: preventReadOnlyInteraction,
      onPointerMoveCapture: preventReadOnlyInteraction,
      onTouchMoveCapture: preventReadOnlyInteraction,
      onClickCapture: preventReadOnlyInteraction,
      onKeyDownCapture: readOnlyKeyGuard(readOnly),
      onChangeCapture: preventReadOnlyInteraction,
      className: classNames('muxui-slider', className),
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
    }, React.createElement('div', { className: 'muxui-slider-header' }, label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null, React.createElement(AriaOutput, { className: 'muxui-slider-output' })), React.createElement('div', { className: 'muxui-slider-control' }, React.createElement(SliderMotionTrack, { orientation, readOnly, name })));
  });
  component.displayName = 'Slider';
  return component;
})();

const AriaOutput = AriaSliderOutput;

function normalizeSortDescriptor(value, columns) {
  if (value === undefined) return undefined;
  const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
  if (!value || typeof value !== 'object' || Array.isArray(value) || keys.length !== 2
    || !keys.includes('column') || !keys.includes('direction') || typeof value.column !== 'string'
    || (value.direction !== 'ascending' && value.direction !== 'descending')) {
    throw new TypeError('Table sortDescriptor must be {column: string; direction: ascending|descending}');
  }
  const column = columns.find((candidate) => candidate.id === value.column);
  if (!column || !column.sortable) throw new TypeError(`Table sortDescriptor column must be sortable: ${value.column}`);
  return { column: value.column, direction: value.direction };
}

// Decorative Lucide chevron for sortable Table headers. CSS flips it for
// direction and reveals it for the sorted column, hover, and keyboard focus;
// aria-sort from React Aria carries the real state.
function sortChevron() {
  return React.createElement(ChevronDownIcon, { className: 'muxui-icon muxui-icon--sm muxui-table-sort-icon', 'aria-hidden': 'true', focusable: 'false' });
}

export const Table = React.forwardRef(function Table({ columns = [], rows = [], selectedIds, defaultSelectedIds, onSelectionChange, onRowAction, sortDescriptor, onSortChange, selectionMode = 'none', disabled = false, children: _children, className, 'aria-label': ariaLabel, 'aria-labelledby': _ariaLabelledby, ...props }, ref) {
  const normalizedRows = normalizeItems(rows);
  // Cells read the consumer's row, not the normalized copy that injects id, label, and value.
  const sourceRows = new Map(normalizedRows.map((row, index) => [row.id, rows[index]]));
  const normalizedColumns = normalizeItems(columns);
  const normalizedSortDescriptor = normalizeSortDescriptor(sortDescriptor, normalizedColumns);
  accessibleName({ ariaLabel }, 'Table');
  const disabledKeys = disabled ? new Set(normalizedRows.map((row) => row.id)) : new Set(normalizedRows.filter((row) => row.disabled).map((row) => row.id));
  return React.createElement(AriaTable, { ...props, ref, selectionMode, selectedKeys: keySet(selectedIds), defaultSelectedKeys: keySet(defaultSelectedIds), sortDescriptor: normalizedSortDescriptor, disabledKeys, isDisabled: disabled, onSelectionChange: (keys) => { if (!disabled) onSelectionChange?.(keyList(keys)); }, onSortChange: (next) => { if (disabled || !next) return; const descriptor = normalizeSortDescriptor({ column: String(next.column), direction: next.direction }, normalizedColumns); onSortChange?.(descriptor); }, ...(onRowAction ? { onRowAction: (key) => { const row = normalizedRows.find((item) => item.id === String(key)); if (!disabled && !row?.disabled) onRowAction(row); } } : {}), 'aria-label': ariaLabel, 'aria-disabled': disabled || undefined, 'data-disabled': disabled || undefined, className: classNames('muxui-table', className) },
    React.createElement(AriaTableHeader, { columns: normalizedColumns, className: 'muxui-table-header' }, (column) => React.createElement(AriaColumn, { id: column.id, textValue: column.textValue, isRowHeader: column.isRowHeader, allowsSorting: column.sortable, className: 'muxui-table-column' }, column.sortable ? React.createElement('span', { className: 'muxui-table-column-content' }, column.label, sortChevron()) : column.label)),
    React.createElement(AriaTableBody, { items: normalizedRows, className: 'muxui-table-body' }, (row) => React.createElement(AriaRow, { id: row.id, className: 'muxui-table-row' }, normalizedColumns.map((column) => React.createElement(AriaCell, { key: column.id, className: 'muxui-table-cell' }, row.values?.[column.id] ?? sourceRows.get(row.id)?.[column.id] ?? '')))),
  );
});
Table.displayName = 'Table';

export const Tabs = /*#__PURE__*/ (() => {
  const component = React.forwardRef(function Tabs({ items = [], value, defaultValue, onChange, keyboardActivation = 'automatic', orientation = 'horizontal', disabled = false, size, variant = 'underline', children: _children, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
    const normalized = normalizeItems(items);
    accessibleName({ ariaLabel, ariaLabelledby }, 'Tabs');
    const resolvedSize = normalizeChoiceControlSize(size, 'Tabs');
    const resolvedVariant = normalizeTabsVariant(variant);
    return React.createElement(AriaTabs, { ...props, ref, selectedKey: value, defaultSelectedKey: defaultValue ?? (normalized.find((item) => !item.disabled) ?? normalized[0])?.id, onSelectionChange: (key) => { const item = normalized.find((candidate) => candidate.id === String(key)); if (!disabled && !item?.disabled) onChange?.(String(key)); }, orientation, keyboardActivation, isDisabled: disabled, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, className: classNames('muxui-tabs', className), 'data-size': resolvedSize, 'data-variant': resolvedVariant },
      React.createElement(TabsMotion, { orientation, variant: resolvedVariant, disabled }, React.createElement(AriaTabList, { items: normalized, className: 'muxui-tab-list' }, (item) => React.createElement(AriaTab, { id: item.id, isDisabled: disabled || item.disabled, 'data-disabled': disabled || item.disabled || undefined, 'aria-disabled': disabled || item.disabled || undefined, className: 'muxui-tab' }, React.createElement('span', { className: 'muxui-tab-label' }, item.label)))),
      React.createElement(AriaTabPanels, { items: normalized, className: 'muxui-tab-panels' }, (item) => React.createElement(AriaTabPanel, { id: item.id, className: 'muxui-tab-panel' }, item.panel)),
    );
  });
  component.displayName = 'Tabs';
  return component;
})();

export const TagGroup = React.forwardRef(function TagGroup({ label, items = [], variant = 'soft', color = 'neutral', selectionMode = 'none', selectedKeys, defaultSelectedKeys, onSelectionChange, onRemove, onAction, disabled = false, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
  const normalized = normalizeItems(items);
  accessibleName({ label, ariaLabel, ariaLabelledby }, 'TagGroup');
  const resolvedVariant = normalizeTagOption('variant', TAG_VARIANTS, variant);
  const groupColor = normalizeTagOption('color', TAG_COLORS, color);
  // An item's own colour wins over the group's.
  const tagColor = (item) => (item.color === undefined ? groupColor : normalizeTagOption('item color', TAG_COLORS, item.color));
  normalized.forEach(tagColor);
  // Without selectedKeys the group holds React Aria's own selection value, so range anchors and select-all keep working.
  // It drops the ids of items removed since the last render; a default waiting for its first item is not a removal.
  const controlled = selectedKeys !== undefined;
  const itemIds = new Set(normalized.map((item) => item.id));
  const [held, setHeld] = React.useState(() => new Set(defaultSelectedKeys));
  const [knownIds, setKnownIds] = React.useState(itemIds);
  if (itemIds.size !== knownIds.size || [...itemIds].some((id) => !knownIds.has(id))) {
    setKnownIds(itemIds);
    const removed = new Set([...knownIds].filter((id) => !itemIds.has(id)));
    // Any removal rebuilds the selection as a plain Set: a deselected id can still be a range anchor.
    if (held !== 'all' && removed.size > 0) setHeld(new Set([...held].filter((id) => !removed.has(id))));
  }
  // The application gets a fresh Set of ids; 'all' becomes the enabled ids.
  const handleSelectionChange = (keys) => {
    if (disabled) return;
    if (!controlled) setHeld(keys);
    onSelectionChange?.(keys === 'all' ? new Set(normalized.filter((item) => !item.disabled).map((item) => item.id)) : new Set([...keys].map(String)));
  };
  return React.createElement(AriaTagGroup, { ref, selectionMode, selectedKeys: controlled ? selectedKeys : held, onSelectionChange: handleSelectionChange, ...(onRemove ? { onRemove: (keys) => { if (!disabled) onRemove([...keys].map(String).map((id) => normalized.find((item) => item.id === id)).filter((item) => item && !item.disabled)); } } : {}), ...(onAction ? { onAction: (key) => { const item = normalized.find((candidate) => candidate.id === String(key)); if (!disabled && !item?.disabled) onAction(item); } } : {}), isDisabled: disabled, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, className: classNames('muxui-tag-group', className) }, label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null, React.createElement(AriaTagList, { items: normalized, className: 'muxui-tag-list' }, (item) => React.createElement(AriaTag, { id: item.id, textValue: item.textValue, isDisabled: disabled || item.disabled, className: 'muxui-tag', 'data-color': tagColor(item), 'data-variant': resolvedVariant }, item.label, onRemove ? React.createElement(IconButton, { slot: 'remove', disabled: disabled || item.disabled, className: 'muxui-tag-remove' }, React.createElement(XIcon, { 'aria-hidden': 'true', focusable: 'false', size: 12 })) : null)));
});
TagGroup.displayName = 'TagGroup';

export const ToggleButtonGroup = /*#__PURE__*/ (() => {
  const component = React.forwardRef(function ToggleButtonGroup({ selectedIds, defaultSelectedIds, onSelectionChange, selectionMode = 'single', orientation = 'horizontal', disabled = false, disallowEmptySelection = false, size = 'md', children, className, ...props }, ref) {
    accessibleName({ ariaLabel: props['aria-label'], ariaLabelledby: props['aria-labelledby'] }, 'ToggleButtonGroup');
    const selectedKeys = readonlyKeySet(selectedIds, 'selectedIds', selectionMode);
    const defaultSelectedKeys = readonlyKeySet(defaultSelectedIds, 'defaultSelectedIds', selectionMode);
    const resolvedSize = normalizeToggleButtonSize(size, 'ToggleButtonGroup');
    const group = React.createElement(AriaToggleButtonGroup, {
      ...props,
      selectedKeys,
      defaultSelectedKeys,
      selectionMode,
      disallowEmptySelection,
      onSelectionChange: (keys) => {
        if (!disabled) {
          if (keys === 'all') throw new TypeError('ToggleButtonGroup selection cannot be all');
          if (disallowEmptySelection && keys.size === 0) return;
          onSelectionChange?.([...keys].map(String));
        }
      },
      orientation,
      isDisabled: disabled,
      'data-size': resolvedSize,
      className: classNames('muxui-toggle-button-group', className),
    }, children);
    return React.createElement(ToggleButtonSizeContext.Provider, { value: resolvedSize },
      React.createElement(ToggleButtonGroupMotion, { selectionMode, disabled, rootRef: ref }, group));
  });
  component.displayName = 'ToggleButtonGroup';
  return component;
})();

function toTokenValue(values = [], text = '') {
  const segments = values.map((value) => ({ type: 'token', text: String(value), value: String(value) }));
  if (text) segments.push({ type: 'text', text });
  return new TokenFieldValue(segments);
}

function tokenValues(fieldValue) {
  return fieldValue.segments.filter((segment) => segment.type === 'token').map((segment) => String(segment.value ?? segment.text));
}

function draftText(fieldValue) {
  return fieldValue.segments.filter((segment) => segment.type === 'text').map((segment) => segment.text).join('');
}

// Enter commits each trimmed text run as a token in place; blank runs are dropped.
// Duplicate tokens are kept, matching the token array contract.
function commitDraftText(fieldValue) {
  const segments = fieldValue.segments.flatMap((segment) => {
    if (segment.type !== 'text') return [segment];
    const text = segment.text.trim();
    return text ? [{ type: 'token', text, value: text }] : [];
  });
  return new TokenFieldValue(segments, { caretPosition: { index: segments.length, offset: 0 } });
}

function sameTokens(left, right) {
  return left.length === right.length && left.every((token, index) => token === String(right[index]));
}

function useTokenFieldFormReset(onReset) {
  const callbackRef = React.useRef(onReset);
  const formRef = React.useRef(null);
  const listenerRef = React.useRef(null);
  const resetTokenRef = React.useRef(0);
  callbackRef.current = onReset;
  return React.useCallback((node) => {
    const nextForm = node?.form ?? null;
    if (nextForm === formRef.current) return;
    if (formRef.current && listenerRef.current) formRef.current.removeEventListener('reset', listenerRef.current, true);
    formRef.current = nextForm;
    listenerRef.current = null;
    if (!nextForm) return;
    const listener = (event) => {
      const resetToken = ++resetTokenRef.current;
      Promise.resolve().then(() => {
        if (resetTokenRef.current !== resetToken || formRef.current !== nextForm || listenerRef.current !== listener || event.defaultPrevented) return;
        callbackRef.current();
      });
    };
    listenerRef.current = listener;
    nextForm.addEventListener('reset', listener, true);
  }, []);
}

// The public value is the token array; typed text stays an internal draft beside
// the tokens until Enter commits it. React Aria ends IME composition whenever the
// value object changes, so the field value keeps its identity until the tokens or
// the text change.
export const TokenField = React.forwardRef(function TokenField({ label, value, defaultValue = [], onChange, disabled = false, readOnly = false, name, placeholder, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
  accessibleName({ label, ariaLabel, ariaLabelledby }, 'TokenField');
  const controlled = value !== undefined;
  const initialDefaultValueRef = React.useRef(null);
  if (initialDefaultValueRef.current === null) initialDefaultValueRef.current = [...defaultValue];
  const initialDefaultValue = initialDefaultValueRef.current;
  const [fieldValue, setFieldValue] = React.useState(() => toTokenValue(controlled ? value : initialDefaultValue));
  const [resetVersion, setResetVersion] = React.useState(0);
  let currentFieldValue = fieldValue;
  // Controlled tokens that differ from the field (an outside change or a rejected
  // edit) replace the field tokens and keep the draft text.
  if (controlled && !sameTokens(tokenValues(fieldValue), value)) {
    currentFieldValue = toTokenValue(value, draftText(fieldValue));
    setFieldValue(currentFieldValue);
  }
  const currentValue = tokenValues(currentFieldValue);
  const inputRef = React.useRef(null);
  const showPlaceholder = Boolean(placeholder) && currentFieldValue.toString() === '';
  React.useLayoutEffect(() => {
    if (showPlaceholder) inputRef.current?.setAttribute('aria-placeholder', placeholder);
    else inputRef.current?.removeAttribute('aria-placeholder');
  }, [showPlaceholder, placeholder]);
  const resetAnchorRef = useTokenFieldFormReset(() => {
    if (!controlled) {
      setFieldValue(toTokenValue(initialDefaultValue));
      setResetVersion((version) => version + 1);
    }
  });
  const handleChange = (next) => {
    if (disabled || readOnly) return;
    const nextValue = tokenValues(next);
    // A controlled consumer that keeps its tokens rejects the change on the next render.
    setFieldValue(next);
    if (!sameTokens(nextValue, currentValue)) onChange?.(nextValue);
  };
  // React Aria calls onSubmit for Enter (insertParagraph), never mid-composition.
  const handleSubmit = () => {
    if (disabled || readOnly || !draftText(currentFieldValue).trim()) return;
    handleChange(commitDraftText(currentFieldValue));
  };
  return React.createElement(AriaTokenField, { key: resetVersion, ref, value: currentFieldValue, onChange: handleChange, onSubmit: handleSubmit, isDisabled: disabled, isReadOnly: readOnly, className: classNames('muxui-token-field', className), 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null, React.createElement(AriaTokenInput, { ref: inputRef, className: 'muxui-token-input', children: (segment) => segment.type === 'token' ? React.createElement(AriaToken, { className: 'muxui-token' }, segment.text) : null }), React.createElement('input', { ref: resetAnchorRef, type: 'hidden', disabled: true, tabIndex: -1, 'aria-hidden': 'true' }), name ? currentValue.map((token, index) => React.createElement('input', { key: `${token}-${index}`, type: 'hidden', name, value: token, disabled, 'aria-hidden': 'true' })) : null, showPlaceholder ? React.createElement('span', { className: 'muxui-token-placeholder', 'aria-hidden': 'true' }, placeholder) : null);
});
TokenField.displayName = 'TokenField';

export const Toolbar = React.forwardRef(function Toolbar({ orientation = 'horizontal', disabled: _disabled, children, className, ...props }, ref) {
  accessibleName({ ariaLabel: props['aria-label'], ariaLabelledby: props['aria-labelledby'] }, 'Toolbar');
  return React.createElement(AriaToolbar, { ...props, ref, orientation, className: classNames('muxui-toolbar', className) }, children);
});
Toolbar.displayName = 'Toolbar';

function normalizeTreeItems(items, used = new Set(), parentDisabled = false) {
  return items.map((item, index) => {
    const source = typeof item === 'string' ? { label: item, value: item } : (item ?? {});
    const base = String(source.id ?? source.key ?? source.value ?? index);
    let id = base || String(index);
    let suffix = 1;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    const nested = normalizeTreeItems(source.children ?? source.items ?? [], used, parentDisabled || Boolean(source.disabled));
    const label = source.label ?? source.name ?? source.value ?? id;
    return { ...source, id, key: id, label, value: source.value ?? id, textValue: source.textValue ?? (textContent(label) || id), disabled: parentDisabled || Boolean(source.disabled), children: nested };
  });
}

function treeKeys(items, keys = []) {
  for (const item of items) {
    keys.push(item.id);
    treeKeys(item.children ?? [], keys);
  }
  return keys;
}

function findTreeItem(items, key) {
  for (const item of items) {
    if (item.id === String(key)) return item;
    const nested = findTreeItem(item.children ?? [], key);
    if (nested) return nested;
  }
  return undefined;
}

const TREE_EXPANSION_TRIGGERS = new Set(['chevron', 'row']);

function normalizeTreeExpansionTrigger(value = 'row') {
  if (!TREE_EXPANSION_TRIGGERS.has(value)) {
    throw new TypeError('Tree expansionTrigger must be one of: chevron, row');
  }
  return value;
}

const TREE_INTERACTIVE_SELECTOR = 'a,button,input,select,textarea,summary,[role="button"],[role="checkbox"],[role="combobox"],[role="link"],[role="menuitem"],[role="option"],[role="radio"],[role="switch"],[tabindex]:not([tabindex="-1"])';

function isTreeInteractiveTarget(target, boundary) {
  if (!(target instanceof Element)) return false;
  let current = target;
  while (current && current !== boundary) {
    if (current.matches(TREE_INTERACTIVE_SELECTOR)) return true;
    const contentEditable = current.getAttribute('contenteditable');
    if (contentEditable !== null && contentEditable !== 'false') return true;
    current = current.parentElement;
  }
  return false;
}

function treeItem(item, expansionTrigger, treeDisabled) {
  const nested = item.children ?? [];
  const rowExpansionEnabled = expansionTrigger === 'row' && !treeDisabled && !item.disabled && nested.length > 0;
  const rowExpansion = { toggleKey: undefined };
  return React.createElement(AriaTreeItem, {
    id: item.id,
    textValue: item.textValue,
    hasChildItems: nested.length > 0,
    isDisabled: item.disabled,
    className: 'muxui-tree-item',
    onClickCapture: rowExpansionEnabled ? (event) => {
      if (!event.currentTarget.contains(event.target)) return;
      if (isTreeInteractiveTarget(event.target, event.currentTarget)) return;
      rowExpansion.toggleKey?.();
    } : undefined,
  },
    React.createElement(AriaTreeItemContent, null, ({ state }) => {
      rowExpansion.toggleKey = rowExpansionEnabled ? () => state.toggleKey(item.id) : undefined;
      return React.createElement('div', { className: 'muxui-tree-item-content' },
        nested.length ? React.createElement(IconButton, { slot: 'chevron', 'aria-label': 'Toggle', disabled: item.disabled, className: 'muxui-tree-toggle' }, React.createElement(ChevronRightIcon, { 'aria-hidden': 'true', focusable: 'false', fill: 'currentColor', strokeWidth: 0, size: 16 })) : null,
        React.createElement('span', { className: 'muxui-tree-item-label' }, item.label));
    }),
    nested.map((child) => React.cloneElement(treeItem(child, expansionTrigger, treeDisabled), { key: child.id })));
}

export const Tree = /*#__PURE__*/ (() => {
  const component = React.forwardRef(function Tree({ items = [], selectedIds, defaultSelectedIds, expandedIds, defaultExpandedIds, onSelectionChange, onExpandedChange, onAction, selectionMode = 'single', expansionTrigger = 'row', disabled = false, children: _children, className, ...props }, ref) {
    accessibleName({ ariaLabel: props['aria-label'], ariaLabelledby: props['aria-labelledby'] }, 'Tree');
    const normalizedExpansionTrigger = normalizeTreeExpansionTrigger(expansionTrigger);
    const normalized = normalizeTreeItems(items);
    const allKeys = treeKeys(normalized);
    const disabledKeys = new Set(disabled ? allKeys : allKeys.filter((key) => findTreeItem(normalized, key)?.disabled));
    const expanded = expandedIds === 'all' ? new Set(allKeys) : keySet(expandedIds);
    const defaultExpanded = defaultExpandedIds === 'all' ? new Set(allKeys) : keySet(defaultExpandedIds);
    const motionControllerRef = React.useRef(null);
    const handleExpandedChange = React.useCallback((keys) => {
      motionControllerRef.current?.beforeExpandedChange();
      if (!disabled) onExpandedChange?.(keyList(keys));
    }, [disabled, onExpandedChange]);
    const tree = React.createElement(AriaTree, { ...props, selectionMode, selectedKeys: keySet(selectedIds), defaultSelectedKeys: keySet(defaultSelectedIds), expandedKeys: expanded, defaultExpandedKeys: defaultExpanded, disabledKeys, onSelectionChange: (keys) => { if (!disabled) onSelectionChange?.(keyList(keys)); }, onExpandedChange: handleExpandedChange, ...(onAction ? { onAction: (key) => { const item = findTreeItem(normalized, key); if (!disabled && !item?.disabled) onAction(item); } } : {}), isDisabled: disabled, className: classNames('muxui-tree', className) }, normalized.map((item) => React.cloneElement(treeItem(item, normalizedExpansionTrigger, disabled), { key: item.id })));
    return React.createElement(TreeMotion, { rootRef: ref, controllerRef: motionControllerRef }, tree);
  });
  component.displayName = 'Tree';
  return component;
})();
