import type * as React from 'react';

export type DataDiffValue = string | number | boolean | null;
export type DataDiffColumn = { readonly id: string; readonly label: string };
export type DataDiffValues = Readonly<Record<string, DataDiffValue>>;

type DataDiffRowIdentity = { readonly id: string; readonly label: string; readonly disabled?: boolean };

export type DataDiffRow = DataDiffRowIdentity & (
  | { readonly kind: 'unchanged' | 'added' | 'removed'; readonly values: DataDiffValues; readonly before?: never; readonly after?: never }
  | { readonly kind: 'updated'; readonly before: DataDiffValues; readonly after: DataDiffValues; readonly values?: never }
);

export type DataDiffProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'dangerouslySetInnerHTML'> & {
  children?: never;
  dangerouslySetInnerHTML?: never;
  /** Visible heading and accessible table name. Native title remains a tooltip. */
  label: string;
  description?: string;
  columns: readonly DataDiffColumn[];
  /** Records contain exactly the declared column IDs, with explicit scalar values. */
  rows: readonly DataDiffRow[];
  selectedIds?: readonly string[];
  /** Defaults to all enabled proposed changes; unchanged rows are never selectable. */
  defaultSelectedIds?: readonly string[];
  onSelectionChange?: (ids: readonly string[]) => void;
  /** Called only by explicit Apply activation, with selected IDs in row order. */
  onApply?: (ids: readonly string[]) => void;
  pending?: boolean;
  disabled?: boolean;
  applyLabel?: string;
  emptyMessage?: string;
};

export declare const DataDiff: React.ForwardRefExoticComponent<DataDiffProps & React.RefAttributes<HTMLDivElement>>;
