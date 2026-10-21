import React from 'react';
import type { ForwardRefExoticComponent, HTMLAttributes, MouseEvent, Ref, RefAttributes } from 'react';
import Check from 'lucide-react/dist/esm/icons/check.mjs';
import Minus from 'lucide-react/dist/esm/icons/minus.mjs';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right.mjs';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.mjs';
import { useCandidateMotion } from './candidate-motion.mjs';

export type DataDiffValue = string | number | boolean | null;
export type DataDiffColumn = { readonly id: string; readonly label: string };
/** A row's value for each declared column, by column id. */
export type DataDiffValues = { readonly [columnId: string]: DataDiffValue };

/** The members every row has. The hand-written declarations made this name public, so it stays exported. */
export type DataDiffRowIdentity = { readonly id: string; readonly label: string; readonly disabled?: boolean };

/** A proposed change to one row: added, removed, and unchanged rows carry values, updated rows before and after. */
export type DataDiffRow =
  | { readonly id: string; readonly label: string; readonly disabled?: boolean; readonly kind: 'unchanged' | 'added' | 'removed'; readonly values: DataDiffValues; readonly before?: never; readonly after?: never }
  | { readonly id: string; readonly label: string; readonly disabled?: boolean; readonly kind: 'updated'; readonly before: DataDiffValues; readonly after: DataDiffValues; readonly values?: never };

/**
 * The props Mux UI defines for DataDiff; the catalog's web.react API is derived from
 * this interface (Decision 0031).
 */
interface DataDiffOwnProps {
  /** Visible heading and accessible table name. Native title remains a tooltip. */
  label: string;
  /** What Apply will do, shown under the heading. */
  description?: string;
  /** The columns, each with a unique, nonblank id and label. */
  columns: readonly DataDiffColumn[];
  /** Records contain exactly the declared column IDs, with explicit scalar values. */
  rows: readonly DataDiffRow[];
  /** The selected row ids, when the caller controls the selection. */
  selectedIds?: readonly string[];
  /** The ids selected at first, when DataDiff controls the selection. Without them every enabled proposed change starts selected; unchanged rows are never selectable. */
  defaultSelectedIds?: readonly string[];
  /** Reports the selected row ids, in row order, after each selection change. */
  onSelectionChange?: (ids: readonly string[]) => void;
  /** Called only by explicit Apply activation, with selected IDs in row order. */
  onApply?: (ids: readonly string[]) => void;
  /** Marks an apply in flight: selection and Apply are unavailable. */
  pending?: boolean;
  /** Makes selection and Apply unavailable. */
  disabled?: boolean;
  /** Replaces the whole Apply button label, which otherwise counts the selected changes. */
  applyLabel?: string;
  /** The text shown when there are no rows. */
  emptyMessage?: string;
}

export interface DataDiffProps extends DataDiffOwnProps, Omit<HTMLAttributes<HTMLDivElement>, keyof DataDiffOwnProps | 'children' | 'dangerouslySetInnerHTML'> {
  children?: never;
  dangerouslySetInnerHTML?: never;
}

type CheckboxProps = { checked: boolean; indeterminate?: boolean; disabled?: boolean; ref?: Ref<HTMLInputElement>; 'aria-label': string; onChange: () => void };

// Native inputs preserve host event bubbling; the visible indicator follows Mux Checkbox.
function checkbox({ checked, indeterminate = false, disabled, ...props }: CheckboxProps) {
  return React.createElement('label', { className: 'muxui-checkbox muxui-checkbox--sm', 'data-size': 'sm', 'data-selected': checked || undefined, 'data-indeterminate': indeterminate || undefined, 'data-disabled': disabled || undefined },
    React.createElement('input', { ...props, type: 'checkbox', checked, disabled, 'aria-checked': indeterminate ? 'mixed' : checked }),
    React.createElement('span', { className: 'muxui-checkbox-indicator', 'aria-hidden': true, 'data-selected': checked || undefined, 'data-indeterminate': indeterminate || undefined },
      (indeterminate || checked) && React.createElement(indeterminate ? Minus : Check, { size: 12, 'aria-hidden': true, focusable: 'false' })));
}

const changeLabels: Readonly<Record<DataDiffRow['kind'], string>> = { unchanged: 'Unchanged', added: 'Added', removed: 'Removed', updated: 'Updated' };
const changeMarkers: Readonly<Record<DataDiffRow['kind'], string>> = { unchanged: '', added: '+', removed: '−', updated: '' };

// Untyped callers can pass anything, so every record is checked as it arrives.
function plainRecord(value: unknown) {
  return value !== null && typeof value === 'object'
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function nonblank(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`DataDiff ${name} must be a nonblank string.`);
}

function validateValues(values: DataDiffValues, columns: readonly DataDiffColumn[], name: string) {
  if (!plainRecord(values) || Reflect.ownKeys(values).length !== columns.length) {
    throw new TypeError(`DataDiff ${name} must contain exactly the declared columns.`);
  }
  for (const column of columns) {
    const descriptor = Object.getOwnPropertyDescriptor(values, column.id);
    const value = descriptor?.value;
    if (!descriptor || !('value' in descriptor)
      || !(value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value))) {
      throw new TypeError(`DataDiff ${name}.${column.id} must be an explicit string, finite number, boolean, or null.`);
    }
  }
}

function validateData(columns: readonly DataDiffColumn[], rows: readonly DataDiffRow[]) {
  if (!Array.isArray(columns) || !columns.length) throw new TypeError('DataDiff columns must be a nonempty array.');
  if (!Array.isArray(rows)) throw new TypeError('DataDiff rows must be an array.');
  const columnIds = new Set();
  for (const column of columns) {
    if (!plainRecord(column)) throw new TypeError('DataDiff columns must be records.');
    nonblank(column.id, 'column id');
    nonblank(column.label, 'column label');
    if (columnIds.has(column.id)) throw new TypeError(`DataDiff duplicate column id: ${column.id}`);
    columnIds.add(column.id);
  }
  const rowIds = new Set();
  for (const row of rows) {
    if (!plainRecord(row)) throw new TypeError('DataDiff rows must be records.');
    nonblank(row.id, 'row id');
    nonblank(row.label, 'row label');
    if (rowIds.has(row.id)) throw new TypeError(`DataDiff duplicate row id: ${row.id}`);
    rowIds.add(row.id);
    if (!Object.hasOwn(changeLabels, row.kind)) throw new TypeError('DataDiff row kind must be unchanged, added, removed, or updated.');
    if (row.disabled !== undefined && typeof row.disabled !== 'boolean') throw new TypeError('DataDiff row disabled must be a boolean.');
    if (row.kind === 'updated') {
      if (Object.hasOwn(row, 'values')) throw new TypeError('DataDiff updated rows require before and after, without values.');
      validateValues(row.before, columns, `row ${row.id} before`);
      validateValues(row.after, columns, `row ${row.id} after`);
    } else {
      if (Object.hasOwn(row, 'before') || Object.hasOwn(row, 'after')) throw new TypeError('DataDiff non-updated rows require values, without before or after.');
      validateValues(row.values, columns, `row ${row.id} values`);
    }
  }
}

function validateIds(value: readonly string[] | undefined, name: string) {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw new TypeError(`DataDiff ${name} must be an array of string IDs.`);
  for (const id of value) nonblank(id, name);
}

function pruneSelection(ids: Iterable<string>, selectable: readonly DataDiffRow[]) {
  const requested = new Set(ids);
  return selectable.filter((row) => requested.has(row.id)).map((row) => row.id);
}

function scalar(value: DataDiffValue) {
  return value === null ? 'null' : String(value);
}

function cellValue(row: DataDiffRow, column: DataDiffColumn) {
  if (row.kind !== 'updated') return scalar(row.values[column.id]);
  const before = row.before[column.id];
  const after = row.after[column.id];
  if (Object.is(before, after)) return scalar(after);
  return React.createElement('span', { className: 'muxui-data-diff-values' },
    React.createElement('span', { className: 'muxui-data-diff-before' },
      React.createElement('span', { className: 'muxui-data-diff-sr-only' }, 'Before: '),
      React.createElement('del', null, scalar(before))),
    React.createElement(ArrowRight, { className: 'muxui-data-diff-arrow', size: 14, 'aria-hidden': true, focusable: 'false' }),
    React.createElement('span', { className: 'muxui-data-diff-after' },
      React.createElement('span', { className: 'muxui-data-diff-sr-only' }, 'After: '),
      React.createElement('ins', null, scalar(after))));
}

/** Review caller-supplied scalar changes. Selection and Apply never mutate records. */
export const DataDiff: ForwardRefExoticComponent<DataDiffProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, DataDiffProps>(function DataDiff({
  label, description = 'Select changes to apply', columns, rows,
  selectedIds, defaultSelectedIds, onSelectionChange, onApply,
  pending = false, disabled = false, applyLabel, emptyMessage = 'No rows to review.',
  className, children, dangerouslySetInnerHTML, ...props
}, ref) {
  nonblank(label, 'label');
  if (typeof description !== 'string') throw new TypeError('DataDiff description must be a string.');
  nonblank(emptyMessage, 'emptyMessage');
  if (applyLabel !== undefined) nonblank(applyLabel, 'applyLabel');
  if (typeof disabled !== 'boolean' || typeof pending !== 'boolean') throw new TypeError('DataDiff disabled and pending must be booleans.');
  for (const [name, callback] of Object.entries({ onSelectionChange, onApply })) {
    if (callback !== undefined && typeof callback !== 'function') throw new TypeError(`DataDiff ${name} must be a function.`);
  }
  if (children !== undefined || dangerouslySetInnerHTML !== undefined) throw new TypeError('DataDiff content is owned by columns and rows.');
  validateData(columns, rows);
  validateIds(selectedIds, 'selectedIds');
  validateIds(defaultSelectedIds, 'defaultSelectedIds');
  const selectable = rows.filter((row) => row.kind !== 'unchanged' && !row.disabled);
  // Conditionals, not ??: extraction reads a fallback on an owned prop as an executed default.
  // Without defaultSelectedIds every selectable row starts selected, which is computed from the
  // rows, not static; the selection is controlled while selectedIds is set.
  const [selection, setSelection] = React.useState(() => pruneSelection(defaultSelectedIds == null ? selectable.map((row) => row.id) : defaultSelectedIds, selectable));
  const selected = pruneSelection(selectedIds == null ? selection : selectedIds, selectable);
  const selectedSet = new Set(selected);
  // Conditionals, not ||: extraction reads || on an owned prop with a false default as an executed fallback.
  const gated = disabled ? true : pending;
  const allSelected = selectable.length > 0 && selected.length === selectable.length;
  const mixed = selected.length > 0 && !allSelected;
  const selectAllRef = React.useRef<HTMLInputElement | null>(null);
  const totalsRef = React.useRef<HTMLSpanElement | null>(null);
  const applyCountRef = React.useRef<HTMLSpanElement | null>(null);
  const selectionKey = JSON.stringify(selected);
  useCandidateMotion(totalsRef, selectionKey, { active: !pending });
  useCandidateMotion(applyCountRef, selected.length, { active: !pending && applyLabel === undefined });
  const titleId = React.useId();
  const descriptionId = React.useId();

  // Drop removed/unavailable uncontrolled IDs permanently, rather than selecting
  // them again if a later render reintroduces the same row.
  React.useEffect(() => {
    if (selectedIds !== undefined) return;
    setSelection((current) => {
      const next = pruneSelection(current, selectable);
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
    });
  }, [rows, selectedIds]);

  React.useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = mixed; }, [mixed]);

  const changeSelection = (ids: readonly string[]) => {
    if (gated) return;
    const next = pruneSelection(ids, selectable);
    if (selectedIds === undefined) setSelection(next);
    onSelectionChange?.([...next]);
  };
  const toggleRow = (row: DataDiffRow) => {
    if (row.kind === 'unchanged' || row.disabled || gated) return;
    changeSelection(selectedSet.has(row.id) ? selected.filter((id) => id !== row.id) : [...selected, row.id]);
  };
  const counts = ['removed', 'added', 'updated'].map((kind) => ({ kind, count: rows.filter((row) => row.kind === kind && selectedSet.has(row.id)).length }));
  const totals = counts.filter(({ count }) => count).map(({ kind, count }) => `${count} ${kind === 'removed' ? 'removal' : kind === 'added' ? 'addition' : 'update'}${count === 1 ? '' : 's'}`).join(' · ') || 'No changes selected';

  return React.createElement('div', {
    ...props, ref,
    className: ['muxui-data-diff', className].filter(Boolean).join(' '),
    'data-pending': pending ? true : undefined,
    'data-disabled': disabled ? true : undefined,
    'aria-busy': pending ? true : props['aria-busy'],
  },
  React.createElement('div', { className: 'muxui-data-diff-header' },
    React.createElement('span', { id: titleId, className: 'muxui-data-diff-title' }, label),
    description && React.createElement('span', { id: descriptionId, className: 'muxui-data-diff-description' }, description)),
  React.createElement('div', { className: 'muxui-data-diff-viewport', tabIndex: 0, role: 'region', 'aria-labelledby': titleId, 'aria-describedby': description ? descriptionId : undefined },
    React.createElement('table', { className: 'muxui-data-diff-table', 'aria-labelledby': titleId, 'aria-describedby': description ? descriptionId : undefined },
      React.createElement('thead', { className: 'muxui-data-diff-head' },
        React.createElement('tr', null,
          React.createElement('th', { scope: 'col', className: 'muxui-data-diff-selection' },
            checkbox({ ref: selectAllRef, checked: allSelected, indeterminate: mixed, 'aria-label': 'Select all proposed changes', disabled: gated || !selectable.length,
              onChange: () => changeSelection(allSelected ? [] : selectable.map((row) => row.id)) })),
          columns.map((column) => React.createElement('th', { key: column.id, scope: 'col', className: 'muxui-data-diff-column' }, column.label)))),
      React.createElement('tbody', { className: 'muxui-data-diff-body' },
        rows.length ? rows.map((row) => React.createElement('tr', {
          key: row.id, className: 'muxui-data-diff-row', 'data-row-id': row.id,
          'data-change': row.kind, 'data-selected': selectedSet.has(row.id) || undefined,
          'data-selectable': row.kind !== 'unchanged' && !row.disabled && !gated || undefined,
          'data-disabled': row.disabled || undefined,
          onClick: (event: MouseEvent<HTMLTableRowElement>) => { if (!(event.target as Element).closest('.muxui-data-diff-selection')) toggleRow(row); },
        },
        React.createElement('td', { className: 'muxui-data-diff-selection' }, row.kind !== 'unchanged' && checkbox({
          checked: selectedSet.has(row.id), 'aria-label': `Select ${row.label} (${changeLabels[row.kind].toLowerCase()})`, disabled: gated || row.disabled,
          onChange: () => toggleRow(row),
        })),
        columns.map((column, index) => React.createElement(index === 0 ? 'th' : 'td', {
          key: column.id, className: 'muxui-data-diff-cell', scope: index === 0 ? 'row' : undefined,
        }, index === 0 && React.createElement(React.Fragment, null,
          React.createElement('span', { className: 'muxui-data-diff-change', 'aria-hidden': true }, row.kind === 'updated' ? React.createElement(RefreshCw, { size: 14, 'aria-hidden': true, focusable: 'false' }) : changeMarkers[row.kind]),
          React.createElement('span', { className: 'muxui-data-diff-sr-only' }, `${changeLabels[row.kind]} row, ${row.label}: `)), cellValue(row, column))))) : React.createElement('tr', null, React.createElement('td', { colSpan: columns.length + 1, className: 'muxui-data-diff-empty' }, emptyMessage))))),
  React.createElement('div', { className: 'muxui-data-diff-footer' },
    React.createElement('span', { ref: totalsRef, className: 'muxui-data-diff-totals', role: 'status', 'aria-live': 'polite', 'aria-atomic': true }, totals),
    React.createElement('button', { 'data-size': 'sm', 'data-variant': 'primary', type: 'button', className: 'muxui-button muxui-data-diff-apply', disabled: gated || !selected.length || !onApply, 'data-disabled': gated || !selected.length || !onApply || undefined, 'data-pending': pending ? true : undefined,
      onClick: () => { if (!gated && selected.length) onApply?.([...selected]); },
    // Without applyLabel the label counts the selection, with the same conditional in place of ??.
    }, React.createElement('span', { ref: applyCountRef, className: 'muxui-data-diff-apply-label' }, pending ? 'Applying…' : applyLabel == null ? `Apply ${selected.length} ${selected.length === 1 ? 'change' : 'changes'}` : applyLabel))));
});

DataDiff.displayName = 'DataDiff';
