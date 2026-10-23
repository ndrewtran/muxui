import React from 'react';
import type { CSSProperties, ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react';
import { GridListMotion } from './grid-list-motion.mjs';
import { GridList as AriaGridList, GridListItem as AriaGridListItem } from 'react-aria-components';
import type { GridListProps as AriaGridListProps, Key } from 'react-aria-components';
import { GridListItemDisabledContext } from './grid-list-item-context.mjs';
import { classNames, accessibleName } from './control-utils.ts';
import { textContent, normalizeItems, keySet, keyList, collectionItem } from './collection-items.ts';
import type { MuxUICollectionItem, MuxUIItems, MuxUISelection, NormalizedItem } from './collection-items.ts';
import { GridVirtualizerContext } from './grid-virtualizer-context.ts';
import type { ReportGridGap } from './grid-virtualizer-context.ts';
import type { MuxUIAriaAccessibleName } from './fields.ts';

// The props each part defines, as one type per part: the catalog's web.react API is derived from them
// (Decision 0031), the root's as the family-level block and Item's under partApis. Each is a type literal,
// so its public props type stays assignable to Record<string, unknown>, as it was before the move. The
// accessible name's arms (aria-label and aria-labelledby), children, style, and className stay in the
// public type and are not Mux UI-owned members.

/** The props Mux UI defines for GridList. */
export type GridListOwnProps = {
  /** The rows or cards as data: strings, or items with an `id`, a `label`, a `textValue`, and `disabled`. Children take precedence: when both are supplied, the items are not rendered. */
  items?: MuxUIItems;
  /** The selected item ids when the caller controls the selection, or `'all'`. */
  selectedIds?: MuxUISelection;
  /** The ids selected at first when the list controls its own selection, or `'all'`. */
  defaultSelectedIds?: MuxUISelection;
  /** Disables every item and stops the selection and action callbacks. An item's own `disabled={false}` cannot re-enable it under a disabled list. */
  disabled?: boolean;
  /** How many items can be selected. With `onAction` set and `single` or `multiple`, a click or Enter runs the action while nothing is selected and Space starts a selection; once an item is selected, a click changes the selection instead. */
  selectionMode?: 'none' | 'single' | 'multiple';
  /** Called with the selected item ids, or `'all'`, when the selection changes. It is not called while the list is disabled. */
  onSelectionChange?: (ids: MuxUISelection) => void;
  /** Called when the user activates an item. A list built from `items` passes the item record; one built from children passes the identity fields `id`, `key`, and `value`. It is not called for a disabled item or while the list is disabled. */
  onAction?: (item?: MuxUICollectionItem) => void;
  /** `stack` is a vertical list of rows. `grid` lays the items out in auto-fill columns of at least 10rem, as cards whose content wraps. Inside a grid Virtualizer a GridList must use `grid`. */
  layout?: 'stack' | 'grid';
  /** The direction a stack layout runs. `horizontal` scrolls along the inline axis and moves between items by their rendered positions. Inside a grid Virtualizer a GridList must be `vertical`. */
  orientation?: 'vertical' | 'horizontal';
};

export type GridListProps = GridListOwnProps & { children?: ReactNode; style?: CSSProperties; className?: string } & MuxUIAriaAccessibleName;

/** The props Mux UI defines for GridList.Item. */
export type GridListItemOwnProps = {
  /** The stable string id the selection and action callbacks report. */
  id: string;
  /** The text typeahead matches and the item's name. Without one it is the text of the item's children, which is unambiguous only for plain text, so give rich children a `textValue`. */
  textValue?: string;
  /** Disables the item. A disabled list disables every item whatever this says. */
  disabled?: boolean;
};

export type GridListItemProps = GridListItemOwnProps & { className?: string; style?: CSSProperties; children?: ReactNode };

// A forwardRef result carries no statics, so the compound states them. GridList is its own root.
type GridListComponent = ForwardRefExoticComponent<GridListProps & RefAttributes<HTMLDivElement>> & {
  Item: ForwardRefExoticComponent<GridListItemProps & RefAttributes<HTMLDivElement>>;
};

const GridListContext = React.createContext({ disabled: false });

const useVirtualizedLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

// Computed lengths resolve to px, including clamp() and viewport-unit tokens. A
// percentage or `normal` is not a length, so it counts as no gap.
function gapPixels(value: string): number {
  const pixels = Number.parseFloat(value);
  return value.endsWith('px') && Number.isFinite(pixels) ? Math.max(0, pixels) : 0;
}

// Reports the root's resolved column and row gap on mount, whenever the root
// resizes, and on window resize, since a fluid gap follows the viewport.
function useVirtualizedGap(root: HTMLDivElement | null, reportGap: ReportGridGap | null): void {
  useVirtualizedLayoutEffect(() => {
    if (!root || !reportGap) return undefined;
    const view = root.ownerDocument.defaultView!;
    const read = () => {
      const style = view.getComputedStyle(root);
      reportGap({ column: gapPixels(style.columnGap), row: gapPixels(style.rowGap) });
    };
    read();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read);
    observer?.observe(root);
    view.addEventListener('resize', read);
    return () => {
      observer?.disconnect();
      view.removeEventListener('resize', read);
    };
  }, [root, reportGap]);
}

// RAC scrolls a keyboard-focused row into view once, against estimated row sizes.
// Measured sizes, and scrolling that lands after RAC's own, then move that row: a
// Home press after End can end up back at the old position. So for a second after
// a navigation key press, once focus has left the item it was on, keep revealing the
// focused row whenever the content resizes or the view scrolls. Other keys never
// start that window, and a wheel, touch, or pointer press ends it at once, so the
// reveal never pulls the view back from where the user scrolled. The origin is an
// item key, not a node: the Virtualizer recycles row nodes, so after a jump key the
// newly focused item can render into the node the origin item had.
const NAVIGATION_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
const REVEAL_WINDOW_MS = 1000;

function useVirtualizedFocusReveal(root: HTMLDivElement | null, enabled: boolean): void {
  useVirtualizedLayoutEffect(() => {
    if (!root || !enabled || typeof ResizeObserver === 'undefined') return undefined;
    const doc = root.ownerDocument;
    let armedUntil = 0;
    let originKey: string | null = null;
    let content: Element | null = null;
    let contentSize = '';
    const focusedRow = () => doc.activeElement?.closest('[role="row"]') ?? null;
    // RAC sets data-key on every row.
    const keyOf = (row: Element | null) => row?.getAttribute('data-key') ?? null;
    const sizeOf = (node: Element) => {
      const { width, height } = node.getBoundingClientRect();
      return `${width}x${height}`;
    };
    // Scrolling an already visible row is a no-op, so revealing is safe to repeat.
    const reveal = () => {
      const row = focusedRow();
      if (performance.now() < armedUntil && row && keyOf(row) !== originKey && root.contains(row)) row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    // A ResizeObserver also reports once as soon as it observes, with nothing resized.
    // Comparing sizes keeps that report, and any other unchanged one, from revealing.
    const onResize = () => {
      const size = sizeOf(content!);
      if (size === contentSize) return;
      contentSize = size;
      reveal();
    };
    const observer = new ResizeObserver(onResize);
    const onKeyDown = (event: KeyboardEvent) => {
      if (!NAVIGATION_KEYS.has(event.key)) return;
      if (content !== root.firstElementChild) {
        content = root.firstElementChild;
        observer.disconnect();
        if (content) observer.observe(content);
      }
      if (content) contentSize = sizeOf(content);
      originKey = keyOf(focusedRow());
      armedUntil = performance.now() + REVEAL_WINDOW_MS;
    };
    // The root scrolls itself when bounded, and the document scrolls it when not.
    const onScroll = (event: Event) => {
      if (event.target === root || event.target === doc) reveal();
    };
    const disarm = () => { armedUntil = 0; };
    // The document sees every wheel, touch, and press on the root, and also a scrollbar
    // drag that scrolls the page around an unbounded root.
    const disarming = ['wheel', 'touchstart', 'pointerdown'];
    root.addEventListener('keydown', onKeyDown, true);
    doc.addEventListener('scroll', onScroll, { capture: true, passive: true });
    for (const type of disarming) doc.addEventListener(type, disarm, { capture: true, passive: true });
    return () => {
      observer.disconnect();
      root.removeEventListener('keydown', onKeyDown, true);
      doc.removeEventListener('scroll', onScroll, { capture: true });
      for (const type of disarming) doc.removeEventListener(type, disarm, { capture: true });
    };
  }, [root, enabled]);
}

export const GridList: GridListComponent = /*#__PURE__*/ (() => {
  const component = React.forwardRef<HTMLDivElement, GridListProps>(function GridList({ children, style, items, selectedIds, defaultSelectedIds, onSelectionChange, onAction, selectionMode = 'single', disabled = false, layout = 'stack', orientation = 'vertical', className, ...rest }, ref) {
    // normalizeItems takes no items as an empty list, so an omitted list has no default here to state. It runs first, as it did before the move, so its error comes first.
    const normalized = normalizeItems(items);
    accessibleName({ ariaLabel: rest['aria-label'], ariaLabelledby: rest['aria-labelledby'] }, 'grid-list');
    const disabledKeys = disabled ? new Set(normalized.map((item) => item.id)) : new Set(normalized.filter((item) => item.disabled).map((item) => item.id));
    // A selection that is not a list, or a className that is not text, throws here, ahead of the layout checks below, as it did before the move.
    const selectedKeys = keySet(selectedIds);
    const defaultSelectedKeys = keySet(defaultSelectedIds);
    const rootClassName = classNames('muxui-grid-list', className);
    const reportGap = React.useContext(GridVirtualizerContext);
    const [gapRoot, setGapRoot] = React.useState<HTMLDivElement | null>(null);
    useVirtualizedGap(gapRoot, reportGap);
    useVirtualizedFocusReveal(gapRoot, reportGap !== null);
    const gapRef = React.useCallback((node: HTMLDivElement | null) => {
      setGapRoot(node);
      if (typeof ref === 'function') return ref(node);
      if (ref) ref.current = node;
      return undefined;
    }, [ref]);
    if (layout !== 'stack' && layout !== 'grid') throw new TypeError('GridList layout must be stack or grid');
    if (orientation !== 'vertical' && orientation !== 'horizontal') throw new TypeError('GridList orientation must be vertical or horizontal');
    const virtualized = reportGap !== null;
    if (virtualized && (layout !== 'grid' || orientation !== 'vertical')) throw new TypeError('GridList inside a grid Virtualizer must use layout="grid" and the vertical orientation');
    const hasChildren = children !== undefined && children !== null;
    const gridList = React.createElement(AriaGridList<NormalizedItem>, {
      ...(rest as AriaGridListProps<NormalizedItem>),
      items: hasChildren ? undefined : normalized,
      selectionMode,
      selectedKeys,
      defaultSelectedKeys,
      disabledKeys,
      onSelectionChange: (keys) => { if (!disabled) onSelectionChange?.(keyList(keys)); },
      // A RAC action handler turns presses into actions while nothing is
      // selected, so only consumer actions may suppress press selection.
      ...(onAction ? {
        onAction: (key: Key) => {
          const item = normalized.find((candidate) => candidate.id === String(key));
          if (!disabled && !item?.disabled) onAction(item ?? collectionItem(key));
        },
      } : {}),
      // React Aria's GridList props name neither isDisabled (it takes disabledKeys), aria-disabled, nor the data-muxui-virtualized hook the
      // styles read, and TypeScript accepts such a key in a call only from a spread. isDisabled is passed on as before, so the props React Aria receives are unchanged.
      ...{ isDisabled: disabled, 'aria-disabled': disabled ? disabled : undefined },
      layout,
      orientation,
      // RAC already forces tab navigation in the grid layout. A horizontal stack
      // needs it too: the default arrow behavior spends Left and Right on nested
      // controls, so they could never move between items.
      keyboardNavigationBehavior: orientation === 'horizontal' ? 'tab' : 'arrow',
      ...{ 'data-muxui-virtualized': virtualized || undefined },
      style,
      className: rootClassName,
      children: hasChildren ? children : (item: NormalizedItem) => React.createElement(component.Item, { id: item.id, textValue: item.textValue, disabled: item.disabled }, item.label),
    });
    // Only this list's own root reports its gap, so a GridList nested in an item stays a plain list.
    return React.createElement(GridListContext.Provider, { value: { disabled } },
      React.createElement(GridVirtualizerContext.Provider, { value: null },
        React.createElement(GridListMotion, { rootRef: virtualized ? gapRef : ref, children: gridList })));
  }) as GridListComponent;
  component.displayName = 'GridList';
  component.Item = React.forwardRef<HTMLDivElement, GridListItemProps>(function GridListItem({ children, id, textValue, disabled = false, className, style }, ref) {
    const context = React.useContext(GridListContext);
    // Conditionals, not || and ??: extraction reads a fallback on an owned prop as an executed default.
    const effectiveDisabled = disabled ? disabled : context.disabled;
    return React.createElement(AriaGridListItem, {
      ref, id, style,
      textValue: textValue == null ? (textContent(children) || undefined) : textValue,
      isDisabled: effectiveDisabled,
      ...{ 'data-disabled': effectiveDisabled || undefined, 'aria-disabled': effectiveDisabled || undefined },
      className: classNames('muxui-grid-list-item', className),
    }, React.createElement(GridListItemDisabledContext.Provider, { value: effectiveDisabled }, children));
  });
  return component;
})();
