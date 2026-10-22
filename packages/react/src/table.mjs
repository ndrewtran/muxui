import React from 'react';
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import {
  Table as AriaTable,
  TableBody as AriaTableBody,
  TableHeader as AriaTableHeader,
  Column as AriaColumn,
  Row as AriaRow,
  Cell as AriaCell,
} from 'react-aria-components';
import { classNames, accessibleName } from './control-utils.mjs';
import { normalizeItems, keySet, keyList } from './collection-items.mjs';

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
