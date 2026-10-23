import React from 'react';
import type { CSSProperties, ForwardRefExoticComponent, ReactElement, RefAttributes, UIEvent, UIEventHandler } from 'react';
import {
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Virtualizer as AriaVirtualizer,
  ListLayout,
  GridLayout,
  Size,
} from 'react-aria-components';
import type { GridLayoutOptions, Key, ListLayoutOptions, Rect } from 'react-aria-components';
import { classNames, accessibleName } from './control-utils.ts';
import { normalizeItems } from './collection-items.ts';
import type { MuxUIItems, NormalizedItem } from './collection-items.ts';
import { GridVirtualizerContext } from './grid-virtualizer-context.ts';
import type { GridGap } from './grid-virtualizer-context.ts';
import type { MuxUIAriaLabel } from './fields.ts';

// The props each layout defines, as one all-optional type: the catalog's web.react API is derived from it (Decision 0031).
// What a layout requires or forbids is stated by the two arms of the public type below, built from these members, so a
// member's `required: false` here means "not unconditionally required". The accessible name (aria-label), className, and
// style stay in the public arms and are not Mux UI-owned members. The grid layout's own sizing defaults, 200, unbounded,
// 200, and unbounded, apply to that layout only, so they are stated in the descriptions and not as parameter defaults.

/** The props Mux UI defines for Virtualizer. */
export type VirtualizerOwnProps = {
  /** `stack`, the default, is a fixed-row list that renders its own items. `grid` wraps one GridList that has layout="grid" and the vertical orientation, and lays it out in measured rows. */
  layout?: 'stack' | 'grid';
  /** The rows of a stack layout, as strings or items with an `id`, a `label`, a `textValue`, and `disabled`. Stack layout only: a grid takes its items on its GridList. */
  items?: MuxUIItems;
  /** The stack viewport's block size in px, a finite number greater than 0. Stack layout only. */
  height?: number;
  /** The fixed height of each stack row in px, a finite number greater than 0. Rows are not measured, so content taller than this overflows into the next row. Stack layout only. */
  itemHeight?: number;
  /** The rows mounted above and below the visible window, an integer of 0 or more. For a grid they are whole grid rows. */
  overscan?: number;
  /** Disables every stack row and stops `onScroll`. Stack layout only: a grid disables its GridList instead. */
  disabled?: boolean;
  /** Called when the stack viewport scrolls. It is not called while the Virtualizer is disabled. Stack layout only. */
  onScroll?: UIEventHandler<HTMLDivElement>;
  /** The GridList a grid layout lays out, which must have layout="grid". Required for a grid; a stack renders its own items and takes no children. */
  children?: ReactElement;
  /** Minimum item width in px for a grid, a finite number greater than 0. Default 200. */
  minItemWidth?: number;
  /** Maximum item width in px for a grid, Infinity or a finite number no smaller than `minItemWidth`. Default unbounded, so items stretch to fill their columns. */
  maxItemWidth?: number;
  /** Estimated height in px of the grid rows that have not mounted yet, a finite number greater than 0. Default 200. Mounted rows take their measured content height. */
  estimatedItemHeight?: number;
  /** Cap on the number of grid columns, Infinity or an integer greater than 0. Default unbounded. A narrow container shows fewer. */
  maxColumns?: number;
};

/** The default fixed-row list: a bounded, named scroll viewport that renders its own items. */
export type VirtualizerStackProps = MuxUIAriaLabel & Pick<VirtualizerOwnProps, 'items' | 'height' | 'itemHeight' | 'overscan' | 'disabled' | 'onScroll'> & {
  layout?: 'stack';
  className?: string;
  style?: CSSProperties;
  children?: never;
  minItemWidth?: never;
  maxItemWidth?: never;
  estimatedItemHeight?: never;
  maxColumns?: never;
};

/** Lays out a GridList with layout="grid" in measured rows. It renders no element of its own: the GridList is the scroll region, so name, size, spacing, and scroll handling belong on the GridList. */
export type VirtualizerGridProps = Pick<VirtualizerOwnProps, 'minItemWidth' | 'maxItemWidth' | 'estimatedItemHeight' | 'maxColumns' | 'overscan'> & {
  layout: 'grid';
  children: ReactElement;
  'aria-label'?: never;
  'aria-labelledby'?: never;
  items?: never;
  height?: never;
  itemHeight?: never;
  disabled?: never;
  onScroll?: never;
  className?: never;
  style?: never;
};

export type VirtualizerProps = VirtualizerStackProps | VirtualizerGridProps;

// A forwardRef result carries no statics, so the component states its signature: the stack arm takes a ref to its
// viewport, and the grid arm, which renders no element, takes none.
type VirtualizerComponent = ForwardRefExoticComponent<(VirtualizerStackProps & RefAttributes<HTMLDivElement>) | (VirtualizerGridProps & { ref?: never })>;

// What the render function reads: the props Mux UI owns, the accessible name and style it forwards or drops, and the
// renderItem that a JavaScript caller may still pass and the component drops.
type VirtualizerRenderProps = VirtualizerOwnProps & {
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
  style?: CSSProperties;
  renderItem?: unknown;
};

type FixedRowLayoutOptions = ListLayoutOptions & { overscan?: number };
// The grid layout is only built by GridVirtualizer, which supplies every option it reads.
type GridLayoutSettings = Required<Pick<GridLayoutOptions, 'minItemSize' | 'maxItemSize' | 'minSpace' | 'maxColumns'>> & GridLayoutOptions & { overscan: number };

function assertPositiveVirtualizerNumber(value: unknown, property: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new TypeError(`Virtualizer ${property} must be a finite number greater than 0`);
}

function assertNonNegativeVirtualizerNumber(value: unknown, property: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) throw new TypeError(`Virtualizer ${property} must be a finite number greater than or equal to 0`);
}

// Mux owns the row-count overscan policy while RAC still owns the collection,
// focus persistence, scroll anchoring, and visible-rect lifecycle.
class MuxFixedRowListLayout extends ListLayout<unknown, FixedRowLayoutOptions> {
  // Assigned in update, as before, so the field is declared and not initialized.
  declare overscan: number | undefined;

  update(invalidationContext: Parameters<ListLayout<unknown, FixedRowLayoutOptions>['update']>[0]) {
    this.overscan = invalidationContext.layoutOptions?.overscan ?? 2;
    super.update(invalidationContext);
  }

  shouldInvalidateLayoutOptions(newOptions: FixedRowLayoutOptions, oldOptions: FixedRowLayoutOptions) {
    return newOptions?.overscan !== oldOptions?.overscan || super.shouldInvalidateLayoutOptions(newOptions, oldOptions);
  }

  getVisibleLayoutInfos(rect: Rect) {
    const visibleRect = this.virtualizer?.visibleRect;
    const rowSize = (this.rowSize ?? this.estimatedRowSize ?? 48) + this.gap;
    if (!visibleRect || visibleRect.width <= 0 || visibleRect.height <= 0 || rowSize <= 0) return super.getVisibleLayoutInfos(rect);
    const expandedRect = visibleRect.copy();
    const overscanSize = rowSize * (this.overscan ?? 2);
    expandedRect.y = Math.max(0, expandedRect.y - overscanSize);
    expandedRect.height += overscanSize * 2;
    const start = Math.max(0, Math.floor(visibleRect.y / rowSize) - (this.overscan ?? 2));
    const end = Math.ceil((visibleRect.y + visibleRect.height) / rowSize) + (this.overscan ?? 2);
    return super.getVisibleLayoutInfos(expandedRect).filter((layoutInfo) => {
      if (layoutInfo.type !== 'item') return true;
      const index = Math.round((layoutInfo.rect.y - this.padding) / rowSize);
      return (index >= start && index < end) || this.virtualizer!.isPersistedKey(layoutInfo.key);
    });
  }
}

// Smallest row in [0, count) that satisfies a monotonic test, or count when none does.
function firstRowWhere(count: number, test: (row: number) => boolean): number {
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (test(middle)) high = middle;
    else low = middle + 1;
  }
  return low;
}

// Grid counterpart of MuxFixedRowListLayout. RAC owns the collection, focus
// persistence, and item measurement; Mux owns spacing and row-count overscan.
// It is only built by GridVirtualizer, which supplies every layout option.
class MuxGridLayout extends GridLayout<unknown, GridLayoutSettings> {
  // Assigned in update, as before, so the fields are declared and not initialized.
  declare overscan: number;
  declare itemKeys: Key[];
  declare itemIndex: Map<Key, number>;

  update(invalidationContext: Parameters<GridLayout<unknown, GridLayoutSettings>['update']>[0]) {
    const options = invalidationContext.layoutOptions!;
    this.overscan = options.overscan;
    super.update({ ...invalidationContext, layoutOptions: this.fitSpacing(options) });
    this.itemKeys = [];
    this.itemIndex = new Map();
    for (const node of this.virtualizer!.collection) {
      if (node.type !== 'item') continue;
      this.itemIndex.set(node.key, this.itemKeys.length);
      this.itemKeys.push(node.key);
    }
  }

  // RAC sizes items from (width - n * space) and spreads the remainder over n + 1
  // gaps, so its visible gap comes out smaller than the space it was given. Size
  // items from n + 1 gaps instead, so columns sit exactly one CSS gap apart and
  // the outer edges get one gap too. Columns still follow RAC's
  // floor(width / (minItemWidth + gap)). Reserving the n + 1 gaps can leave items
  // narrower than minItemWidth: by up to gap / n each, and by more, down to 1px,
  // when even one column is wider than the container. A very large gap shows both.
  fitSpacing({ minItemSize, maxItemSize, minSpace, maxColumns, ...options }: GridLayoutSettings): GridLayoutSettings {
    const width = this.virtualizer!.size.width;
    const columns = Math.max(1, Math.min(maxColumns, Math.floor(width / (minItemSize.width + minSpace.width))));
    const fit = Math.max(1, Math.floor((width - (columns + 1) * minSpace.width) / columns));
    return {
      ...options,
      minSpace,
      maxColumns: columns,
      minItemSize: new Size(Math.min(minItemSize.width, fit), minItemSize.height),
      maxItemSize: new Size(Math.min(maxItemSize.width, fit), maxItemSize.height),
      maxHorizontalSpace: minSpace.width,
    };
  }

  shouldInvalidateLayoutOptions(newOptions: GridLayoutSettings, oldOptions: GridLayoutSettings) {
    return newOptions.overscan !== oldOptions.overscan || super.shouldInvalidateLayoutOptions(newOptions, oldOptions);
  }

  // Mounts the rows that intersect the visible rect plus `overscan` whole rows on
  // each side, in collection order, with persisted keys such as the focused item.
  getVisibleLayoutInfos(rect: Rect) {
    const { virtualizer, itemKeys, numColumns } = this;
    const visibleRect = virtualizer?.visibleRect;
    const firstItem = itemKeys?.length > 0 ? this.getLayoutInfo(itemKeys[0]) : null;
    if (!visibleRect || visibleRect.width <= 0 || visibleRect.height <= 0 || !firstItem || numColumns < 1) return super.getVisibleLayoutInfos(rect);
    const rowCount = Math.ceil(itemKeys.length / numColumns);
    const rowRect = (row: number) => this.getLayoutInfo(itemKeys[row * numColumns])!.rect;
    const firstRow = firstRowWhere(rowCount, (row) => rowRect(row).maxY > visibleRect.y);
    const lastRow = firstRowWhere(rowCount, (row) => rowRect(row).y >= visibleRect.maxY) - 1;
    const start = Math.max(0, firstRow - this.overscan) * numColumns;
    // The last row can be partial, so its end is the item count, not a whole row.
    const end = Math.min(itemKeys.length, (lastRow + 1 + this.overscan) * numColumns);
    const persisted = [...virtualizer.persistedKeys]
      .map((key) => this.itemIndex.get(key))
      .filter((index): index is number => index !== undefined && (index < start || index >= end))
      .sort((left, right) => left - right);
    const indexes = [...persisted.filter((index) => index < start)];
    for (let index = start; index < end; index++) indexes.push(index);
    indexes.push(...persisted.filter((index) => index >= end));
    return indexes.map((index) => this.getLayoutInfo(itemKeys[index])!);
  }
}

function assertMaxItemWidth(value: unknown, minItemWidth: number): void {
  if (value !== Number.POSITIVE_INFINITY && (typeof value !== 'number' || !Number.isFinite(value) || value < minItemWidth)) {
    throw new TypeError('Virtualizer maxItemWidth must be Infinity or a finite number no smaller than minItemWidth');
  }
}

function assertMaxColumns(value: unknown): void {
  if (value !== Number.POSITIVE_INFINITY && (typeof value !== 'number' || !Number.isInteger(value) || value < 1)) {
    throw new TypeError('Virtualizer maxColumns must be Infinity or an integer greater than 0');
  }
}

const NO_GAP = Object.freeze({ column: 0, row: 0 });

// Lays the GridList child out in measured, variable-height rows. The GridList
// owns the scroll region and its CSS gap; the gap it reports becomes the layout spacing.
function GridVirtualizer({ minItemWidth, maxItemWidth, estimatedItemHeight, maxColumns, overscan, children }: { minItemWidth: number; maxItemWidth: number; estimatedItemHeight: number; maxColumns: number; overscan: number; children: ReactElement }) {
  const [gap, setGap] = React.useState<GridGap>(NO_GAP);
  const reportGap = React.useCallback((next: GridGap) => {
    setGap((current) => (current.column === next.column && current.row === next.row ? current : next));
  }, []);
  const layoutOptions = React.useMemo(() => ({
    // Equal min and max heights make RAC estimate every unmeasured row as exactly
    // estimatedItemHeight, not scaled with item width. Measured heights ignore it.
    minItemSize: new Size(minItemWidth, estimatedItemHeight),
    maxItemSize: new Size(maxItemWidth, estimatedItemHeight),
    minSpace: new Size(gap.column, gap.row),
    maxColumns,
    // Rows size to their content, so a whole-item aspect ratio can never clip text or actions.
    preserveAspectRatio: false,
    overscan,
  }), [minItemWidth, maxItemWidth, estimatedItemHeight, maxColumns, overscan, gap]);
  return React.createElement(GridVirtualizerContext.Provider, { value: reportGap },
    // Observing item size re-measures rows after late font or image loads and text reflow.
    React.createElement(AriaVirtualizer<GridLayoutOptions>, { layout: MuxGridLayout, layoutOptions, shouldObserveItemSize: true, children }));
}

// Grid mode renders no element of its own, so these belong on its GridList; stack
// mode has no columns. Types forbid both, and these checks fail loudly for JS callers.
const GRIDLIST_OWNED_PROPS: (keyof VirtualizerRenderProps)[] = ['aria-label', 'aria-labelledby', 'items', 'height', 'itemHeight', 'disabled', 'onScroll', 'className', 'style'];
const GRID_ONLY_PROPS: (keyof VirtualizerRenderProps)[] = ['minItemWidth', 'maxItemWidth', 'estimatedItemHeight', 'maxColumns'];

export const Virtualizer: VirtualizerComponent = React.forwardRef<HTMLDivElement, VirtualizerRenderProps>(function Virtualizer({ layout = 'stack', items, renderItem: _renderItem, itemHeight = 40, height = 240, overscan = 2, disabled = false, children, minItemWidth, maxItemWidth, estimatedItemHeight, maxColumns, className, 'aria-label': ariaLabel, 'aria-labelledby': _ariaLabelledby, style, onScroll, ...props }, ref) {
  // The props as they were passed. The layout checks below ask whether a prop was supplied, which a parameter default hides, and
  // reading the same prop from a second binding of the parameter would read an accessor prop twice. arguments is the parameter itself.
  const rawProps: VirtualizerRenderProps = arguments[0];
  if (layout !== 'stack' && layout !== 'grid') throw new TypeError('Virtualizer layout must be stack or grid');
  if (layout === 'grid') {
    const misplaced = GRIDLIST_OWNED_PROPS.find((name) => rawProps[name] !== undefined);
    if (misplaced) throw new TypeError(`Virtualizer layout="grid" takes no ${misplaced}; set it on the GridList`);
    // The grid's sizing defaults apply to the grid layout only, so they are conditionals here and not parameter defaults.
    const gridMinItemWidth = minItemWidth === undefined ? 200 : minItemWidth;
    const gridMaxItemWidth = maxItemWidth === undefined ? Number.POSITIVE_INFINITY : maxItemWidth;
    const gridEstimatedItemHeight = estimatedItemHeight === undefined ? 200 : estimatedItemHeight;
    const gridMaxColumns = maxColumns === undefined ? Number.POSITIVE_INFINITY : maxColumns;
    assertPositiveVirtualizerNumber(gridMinItemWidth, 'minItemWidth');
    assertPositiveVirtualizerNumber(gridEstimatedItemHeight, 'estimatedItemHeight');
    assertMaxItemWidth(gridMaxItemWidth, gridMinItemWidth);
    assertMaxColumns(gridMaxColumns);
    assertNonNegativeVirtualizerNumber(overscan, 'overscan');
    if (!React.isValidElement(children) || React.Children.count(children) !== 1) throw new TypeError('Virtualizer grid layout requires a single GridList element as its child');
    if (ref !== null) throw new TypeError('Virtualizer grid layout renders no element of its own, so it takes no ref; pass the ref to its GridList');
    return React.createElement(GridVirtualizer, { minItemWidth: gridMinItemWidth, maxItemWidth: gridMaxItemWidth, estimatedItemHeight: gridEstimatedItemHeight, maxColumns: gridMaxColumns, overscan, children });
  }
  const gridOnly = GRID_ONLY_PROPS.find((name) => rawProps[name] !== undefined);
  if (gridOnly) throw new TypeError(`Virtualizer ${gridOnly} applies to layout="grid" only`);
  accessibleName({ ariaLabel }, 'Virtualizer');
  assertPositiveVirtualizerNumber(itemHeight, 'itemHeight');
  assertPositiveVirtualizerNumber(height, 'height');
  assertNonNegativeVirtualizerNumber(overscan, 'overscan');
  const normalized = normalizeItems(items);
  return React.createElement(AriaVirtualizer<FixedRowLayoutOptions>, {
    layout: MuxFixedRowListLayout,
    layoutOptions: { rowSize: itemHeight, overscan },
    children: React.createElement(AriaListBox<NormalizedItem>, {
      ...props,
      ref,
      items: normalized,
      selectionMode: 'none',
      disabledKeys: disabled ? new Set(normalized.map((item) => item.id)) : new Set(normalized.filter((item) => item.disabled).map((item) => item.id)),
      // React Aria's ListBox props name neither isDisabled (it takes disabledKeys) nor aria-disabled, and TypeScript accepts such a key
      // in a call only from a spread. isDisabled is passed on as before, so the props React Aria receives are unchanged.
      ...{ isDisabled: disabled },
      'aria-label': ariaLabel,
      ...{ 'aria-disabled': disabled ? disabled : undefined },
      className: classNames('muxui-virtualizer', className),
      style: { ...style, blockSize: height, overflow: 'auto' },
      onScroll: (event: UIEvent<HTMLDivElement>) => { if (!disabled) onScroll?.(event); },
      children: (item: NormalizedItem) => React.createElement(AriaListBoxItem, {
        id: item.id,
        textValue: item.textValue,
        className: 'muxui-virtualizer-item',
        isDisabled: disabled ? disabled : item.disabled,
      }, item.label ?? item.value ?? item.id),
    }),
  });
}) as VirtualizerComponent;
Virtualizer.displayName = 'Virtualizer';
