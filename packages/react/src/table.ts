import React from 'react';
import type { ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react';
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import { AriaTable, AriaTableBody, AriaTableHeader, AriaColumn, AriaRow, AriaCell } from './substrate.ts';
import type { Key } from 'react-aria-components';
import { classNames, accessibleName } from './control-utils.ts';
import { normalizeItems, keySet, keyList } from './collection-items.ts';
import type { MuxUICollectionItem, MuxUISelection, NormalizedItem } from './collection-items.ts';
import type { MuxUIAriaLabel } from './fields.ts';

/** A column: its `id` names the row field or `values` entry its cells show. */
export interface MuxUITableColumn extends MuxUICollectionItem {
  /** Marks the column whose cells name their row. */
  isRowHeader?: boolean;
  /** Gives the column a sortable header: activating it reports the next sort through `onSortChange`. */
  sortable?: boolean;
}
/** A row: each cell shows the row's `values` entry for its column's id, or else the row's own field of that name. */
export interface MuxUITableRow extends MuxUICollectionItem {
  /** Cell content by column id. */
  values?: Record<string, ReactNode>;
}
export type MuxUITableSortDescriptor = { column: string; direction: 'ascending' | 'descending' };

// The accessible name (aria-label) and className stay in the public type and are not Mux UI-owned members.
// The own props are a type literal, not an interface, so the public props type stays assignable to
// Record<string, unknown>, as it was before the move.

/** The props Mux UI defines for Table. The table is named by aria-label. */
export type TableOwnProps = {
  /** The columns as data: strings, or items with an `id`, a `label`, a `textValue`, `isRowHeader`, and `sortable`. */
  columns?: MuxUITableColumn[];
  /** The rows as data: items with an `id` and either a `values` entry or a field of the row for each column id. Selection follows each row's id when the rows reorder, so give every row an id that stays with its data. */
  rows?: MuxUITableRow[];
  /** The selected row ids when the caller controls the selection, or `'all'`. */
  selectedIds?: MuxUISelection;
  /** The row ids selected at first when the table controls its own selection, or `'all'`. */
  defaultSelectedIds?: MuxUISelection;
  /** The sorted column and its direction. A sort shows only when the application passes it back. `column` must be the id of a column with `sortable: true`, or Table throws a TypeError. */
  sortDescriptor?: MuxUITableSortDescriptor;
  /** Disables the table: rows cannot be selected or acted on, sort changes are ignored, and the root carries `data-muxui-state-disabled`. */
  disabled?: boolean;
  /** How many rows can be selected. */
  selectionMode?: 'none' | 'single' | 'multiple';
  /** Called with the selected row ids, or `'all'`, when the selection changes. It is not called while the table is disabled. */
  onSelectionChange?: (ids: MuxUISelection) => void;
  /** Called with the row record when the user activates a row. With selection on, a click or Enter runs it while nothing is selected and Space starts a selection; once a row is selected, a click changes the selection instead. It is not called for a disabled row or while the table is disabled. */
  onRowAction?: (row?: MuxUITableRow) => void;
  /** Called with the column and the next direction when the user activates a sortable header, which toggles between ascending and descending. Table never sorts rows: the application sorts them and passes `sortDescriptor` back. It is not called while the table is disabled. */
  onSortChange?: (next: MuxUITableSortDescriptor) => void;
};

export type TableProps = MuxUIAriaLabel & TableOwnProps & { className?: string };

// Table takes and drops `children` and `aria-labelledby`, which its public type never offered, so the render function is typed beside it.
type TableRenderProps = TableProps & { children?: unknown; 'aria-labelledby'?: unknown };

/** A column once `normalizeItems` has given it the fields the table reads. */
interface NormalizedColumn extends NormalizedItem {
  isRowHeader?: boolean;
  sortable?: boolean;
}
/** A row once `normalizeItems` has given it the fields the table reads. */
interface NormalizedRow extends NormalizedItem {
  values?: Record<string, ReactNode>;
}

// A sort descriptor is exactly {column, direction}. Each property is read where the checks need it and no earlier, so a
// getter that throws is reached in the order the checks run, and the descriptor is read no more often than it needs to be.
function sortDescriptorOf(value: unknown, columns: NormalizedColumn[]): MuxUITableSortDescriptor {
  const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
  const descriptor = value as { column?: unknown; direction?: unknown };
  if (!value || typeof value !== 'object' || Array.isArray(value) || keys.length !== 2
    || !keys.includes('column') || !keys.includes('direction') || typeof descriptor.column !== 'string'
    || (descriptor.direction !== 'ascending' && descriptor.direction !== 'descending')) {
    throw new TypeError('Table sortDescriptor must be {column: string; direction: ascending|descending}');
  }
  const column = columns.find((candidate) => candidate.id === descriptor.column);
  if (!column || !column.sortable) throw new TypeError(`Table sortDescriptor column must be sortable: ${descriptor.column}`);
  return { column: descriptor.column, direction: descriptor.direction };
}

function normalizeSortDescriptor(value: unknown, columns: NormalizedColumn[]): MuxUITableSortDescriptor | undefined {
  return value === undefined ? undefined : sortDescriptorOf(value, columns);
}

// Decorative Lucide chevron for sortable Table headers. CSS flips it for
// direction and reveals it for the sorted column, hover, and keyboard focus;
// aria-sort from React Aria carries the real state.
function sortChevron() {
  return React.createElement(ChevronDownIcon, { className: 'muxui-icon muxui-icon--sm muxui-table__sort-icon', 'aria-hidden': 'true', focusable: 'false' });
}

export const Table: ForwardRefExoticComponent<TableProps & RefAttributes<HTMLTableElement>> = React.forwardRef<HTMLTableElement, TableRenderProps>(function Table({ columns, rows, selectedIds, defaultSelectedIds, onSelectionChange, onRowAction, sortDescriptor, onSortChange, selectionMode = 'none', disabled = false, children: _children, className, 'aria-label': ariaLabel, 'aria-labelledby': _ariaLabelledby, ...props }, ref) {
  // normalizeItems takes no items as an empty list, so an omitted list has no default here to state. The normalized items carry the fields the table types declare.
  const normalizedRows = normalizeItems(rows) as NormalizedRow[];
  // Cells read the consumer's row, not the normalized copy that injects id, label, and value.
  const sourceRows = new Map(normalizedRows.map((row, index) => [row.id, rows?.[index]]));
  const normalizedColumns = normalizeItems(columns) as NormalizedColumn[];
  const normalizedSortDescriptor = normalizeSortDescriptor(sortDescriptor, normalizedColumns);
  accessibleName({ ariaLabel }, 'Table');
  const disabledKeys = disabled ? new Set(normalizedRows.map((row) => row.id)) : new Set(normalizedRows.filter((row) => row.disabled).map((row) => row.id));
  return React.createElement(AriaTable, {
    ...props,
    ref,
    selectionMode,
    selectedKeys: keySet(selectedIds),
    defaultSelectedKeys: keySet(defaultSelectedIds),
    sortDescriptor: normalizedSortDescriptor,
    disabledKeys,
    // React Aria's Table props name neither isDisabled nor the disabled hooks the styles read, and TypeScript accepts such a key in a call only from a spread.
    ...{ isDisabled: disabled },
    onSelectionChange: (keys) => { if (!disabled) onSelectionChange?.(keyList(keys)); },
    onSortChange: (next) => {
      // Conditionals, not ||: extraction reads a fallback on an owned prop as an executed default.
      if (disabled) return;
      if (!next) return;
      const descriptor = sortDescriptorOf({ column: String(next.column), direction: next.direction }, normalizedColumns);
      onSortChange?.(descriptor);
    },
    ...(onRowAction ? {
      onRowAction: (key: Key) => {
        const row = normalizedRows.find((item) => item.id === String(key));
        if (!disabled && !row?.disabled) onRowAction(row);
      },
    } : {}),
    'aria-label': ariaLabel,
    ...{ 'aria-disabled': disabled ? disabled : undefined, 'data-muxui-state-disabled': disabled ? disabled : undefined },
    className: classNames('muxui-table', className),
  },
  React.createElement(AriaTableHeader<NormalizedColumn>, {
    columns: normalizedColumns,
    className: 'muxui-table__header',
    // A render function is a child of React Aria's collection parts, which TypeScript accepts as a prop here and not as a createElement child.
    children: (column) => React.createElement(AriaColumn, {
      id: column.id,
      textValue: column.textValue,
      isRowHeader: column.isRowHeader,
      allowsSorting: column.sortable,
      className: 'muxui-table__column',
    }, column.sortable ? React.createElement('span', { className: 'muxui-table__column-content' }, column.label, sortChevron()) : column.label),
  }),
  React.createElement(AriaTableBody<NormalizedRow>, {
    items: normalizedRows,
    className: 'muxui-table__body',
    children: (row) => React.createElement(AriaRow, { id: row.id, className: 'muxui-table__row' }, normalizedColumns.map((column) => React.createElement(AriaCell, { key: column.id, className: 'muxui-table__cell' }, row.values?.[column.id] ?? (sourceRows.get(row.id)?.[column.id] as ReactNode) ?? ''))),
  }));
});
Table.displayName = 'Table';
