import React from 'react';
import {
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Virtualizer as AriaVirtualizer,
  ListLayout,
  GridLayout,
  Size,
} from 'react-aria-components';
import { classNames, accessibleName } from './control-utils.mjs';
import { normalizeItems } from './collection-items.mjs';
import { GridVirtualizerContext } from './grid-virtualizer-context.mjs';

function assertPositiveVirtualizerNumber(value, property) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new TypeError(`Virtualizer ${property} must be a finite number greater than 0`);
}

function assertNonNegativeVirtualizerNumber(value, property) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) throw new TypeError(`Virtualizer ${property} must be a finite number greater than or equal to 0`);
}

// Mux owns the row-count overscan policy while RAC still owns the collection,
// focus persistence, scroll anchoring, and visible-rect lifecycle.
class MuxFixedRowListLayout extends ListLayout {
  update(invalidationContext) {
    this.overscan = invalidationContext.layoutOptions?.overscan ?? 2;
    super.update(invalidationContext);
  }

  shouldInvalidateLayoutOptions(newOptions, oldOptions) {
    return newOptions?.overscan !== oldOptions?.overscan || super.shouldInvalidateLayoutOptions(newOptions, oldOptions);
  }

  getVisibleLayoutInfos(rect) {
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
      return (index >= start && index < end) || this.virtualizer.isPersistedKey(layoutInfo.key);
    });
  }
}

// Smallest row in [0, count) that satisfies a monotonic test, or count when none does.
function firstRowWhere(count, test) {
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
class MuxGridLayout extends GridLayout {
  update(invalidationContext) {
    const options = invalidationContext.layoutOptions;
    this.overscan = options.overscan;
    super.update({ ...invalidationContext, layoutOptions: this.fitSpacing(options) });
    this.itemKeys = [];
    this.itemIndex = new Map();
    for (const node of this.virtualizer.collection) {
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
  fitSpacing({ minItemSize, maxItemSize, minSpace, maxColumns, ...options }) {
    const width = this.virtualizer.size.width;
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

  shouldInvalidateLayoutOptions(newOptions, oldOptions) {
    return newOptions.overscan !== oldOptions.overscan || super.shouldInvalidateLayoutOptions(newOptions, oldOptions);
  }

  // Mounts the rows that intersect the visible rect plus `overscan` whole rows on
  // each side, in collection order, with persisted keys such as the focused item.
  getVisibleLayoutInfos(rect) {
    const { virtualizer, itemKeys, numColumns } = this;
    const visibleRect = virtualizer?.visibleRect;
    const firstItem = itemKeys?.length > 0 ? this.getLayoutInfo(itemKeys[0]) : null;
    if (!visibleRect || visibleRect.width <= 0 || visibleRect.height <= 0 || !firstItem || numColumns < 1) return super.getVisibleLayoutInfos(rect);
    const rowCount = Math.ceil(itemKeys.length / numColumns);
    const rowRect = (row) => this.getLayoutInfo(itemKeys[row * numColumns]).rect;
    const firstRow = firstRowWhere(rowCount, (row) => rowRect(row).maxY > visibleRect.y);
    const lastRow = firstRowWhere(rowCount, (row) => rowRect(row).y >= visibleRect.maxY) - 1;
    const start = Math.max(0, firstRow - this.overscan) * numColumns;
    // The last row can be partial, so its end is the item count, not a whole row.
    const end = Math.min(itemKeys.length, (lastRow + 1 + this.overscan) * numColumns);
    const persisted = [...virtualizer.persistedKeys]
      .map((key) => this.itemIndex.get(key))
      .filter((index) => index !== undefined && (index < start || index >= end))
      .sort((left, right) => left - right);
    const indexes = [...persisted.filter((index) => index < start)];
    for (let index = start; index < end; index++) indexes.push(index);
    indexes.push(...persisted.filter((index) => index >= end));
    return indexes.map((index) => this.getLayoutInfo(itemKeys[index]));
  }
}

function assertMaxItemWidth(value, minItemWidth) {
  if (value !== Number.POSITIVE_INFINITY && (typeof value !== 'number' || !Number.isFinite(value) || value < minItemWidth)) {
    throw new TypeError('Virtualizer maxItemWidth must be Infinity or a finite number no smaller than minItemWidth');
  }
}

function assertMaxColumns(value) {
  if (value !== Number.POSITIVE_INFINITY && (typeof value !== 'number' || !Number.isInteger(value) || value < 1)) {
    throw new TypeError('Virtualizer maxColumns must be Infinity or an integer greater than 0');
  }
}

const NO_GAP = Object.freeze({ column: 0, row: 0 });

// Lays the GridList child out in measured, variable-height rows. The GridList
// owns the scroll region and its CSS gap; the gap it reports becomes the layout spacing.
function GridVirtualizer({ minItemWidth, maxItemWidth, estimatedItemHeight, maxColumns, overscan, children }) {
  const [gap, setGap] = React.useState(NO_GAP);
  const reportGap = React.useCallback((next) => {
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
    React.createElement(AriaVirtualizer, { layout: MuxGridLayout, layoutOptions, shouldObserveItemSize: true }, children));
}

// Grid mode renders no element of its own, so these belong on its GridList; stack
// mode has no columns. Types forbid both, and these checks fail loudly for JS callers.
const GRIDLIST_OWNED_PROPS = ['aria-label', 'aria-labelledby', 'items', 'height', 'itemHeight', 'disabled', 'onScroll', 'className', 'style'];
const GRID_ONLY_PROPS = ['minItemWidth', 'maxItemWidth', 'estimatedItemHeight', 'maxColumns'];

export const Virtualizer = React.forwardRef(function Virtualizer(rawProps, ref) {
  const { layout = 'stack', items = [], renderItem: _renderItem, itemHeight = 40, height = 240, overscan = 2, disabled = false, children, minItemWidth = 200, maxItemWidth = Number.POSITIVE_INFINITY, estimatedItemHeight = 200, maxColumns = Number.POSITIVE_INFINITY, className, 'aria-label': ariaLabel, 'aria-labelledby': _ariaLabelledby, style, onScroll, ...props } = rawProps;
  if (layout !== 'stack' && layout !== 'grid') throw new TypeError('Virtualizer layout must be stack or grid');
  if (layout === 'grid') {
    const misplaced = GRIDLIST_OWNED_PROPS.find((name) => rawProps[name] !== undefined);
    if (misplaced) throw new TypeError(`Virtualizer layout="grid" takes no ${misplaced}; set it on the GridList`);
    assertPositiveVirtualizerNumber(minItemWidth, 'minItemWidth');
    assertPositiveVirtualizerNumber(estimatedItemHeight, 'estimatedItemHeight');
    assertMaxItemWidth(maxItemWidth, minItemWidth);
    assertMaxColumns(maxColumns);
    assertNonNegativeVirtualizerNumber(overscan, 'overscan');
    if (!React.isValidElement(children) || React.Children.count(children) !== 1) throw new TypeError('Virtualizer grid layout requires a single GridList element as its child');
    if (ref !== null) throw new TypeError('Virtualizer grid layout renders no element of its own, so it takes no ref; pass the ref to its GridList');
    return React.createElement(GridVirtualizer, { minItemWidth, maxItemWidth, estimatedItemHeight, maxColumns, overscan }, children);
  }
  const gridOnly = GRID_ONLY_PROPS.find((name) => rawProps[name] !== undefined);
  if (gridOnly) throw new TypeError(`Virtualizer ${gridOnly} applies to layout="grid" only`);
  accessibleName({ ariaLabel }, 'Virtualizer');
  assertPositiveVirtualizerNumber(itemHeight, 'itemHeight');
  assertPositiveVirtualizerNumber(height, 'height');
  assertNonNegativeVirtualizerNumber(overscan, 'overscan');
  const normalized = normalizeItems(items);
  return React.createElement(AriaVirtualizer, { layout: MuxFixedRowListLayout, layoutOptions: { rowSize: itemHeight, overscan } },
    React.createElement(AriaListBox, {
      ...props,
      ref,
      items: normalized,
      selectionMode: 'none',
      disabledKeys: disabled ? new Set(normalized.map((item) => item.id)) : new Set(normalized.filter((item) => item.disabled).map((item) => item.id)),
      isDisabled: disabled,
      'aria-label': ariaLabel,
      'aria-disabled': disabled || undefined,
      className: classNames('muxui-virtualizer', className),
      style: { ...style, blockSize: height, overflow: 'auto' },
      onScroll: (event) => { if (!disabled) onScroll?.(event); },
    }, (item) => React.createElement(AriaListBoxItem, {
      id: item.id,
      textValue: item.textValue,
      className: 'muxui-virtualizer-item',
      isDisabled: disabled || item.disabled,
    }, item.label ?? item.value ?? item.id)));
});
Virtualizer.displayName = 'Virtualizer';
