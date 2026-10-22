import React from 'react';
import { GridListMotion } from './grid-list-motion.mjs';
import { GridList as AriaGridList, GridListItem as AriaGridListItem } from 'react-aria-components';
import { GridListItemDisabledContext } from './grid-list-item-context.mjs';
import { classNames, accessibleName } from './control-utils.ts';
import { textContent, normalizeItems, keySet, keyList, collectionItem } from './collection-items.mjs';
import { GridVirtualizerContext } from './grid-virtualizer-context.mjs';

function collectionProps(props, componentName) {
  const { items = [], selectedIds, defaultSelectedIds, onSelectionChange, onAction, selectionMode = 'single', disabled = false, children: _children, className, ...rest } = props;
  const normalized = normalizeItems(items);
  accessibleName({ ariaLabel: rest['aria-label'], ariaLabelledby: rest['aria-labelledby'] }, componentName);
  const disabledKeys = disabled ? new Set(normalized.map((item) => item.id)) : new Set(normalized.filter((item) => item.disabled).map((item) => item.id));
  return { normalized, rest, selectedKeys: keySet(selectedIds), defaultSelectedKeys: keySet(defaultSelectedIds), onSelectionChange: (keys) => { if (!disabled) onSelectionChange?.(keyList(keys)); }, onAction, selectionMode, className: classNames(`muxui-${componentName}`, className), disabled, disabledKeys };
}

const GridListContext = React.createContext({ disabled: false });

const useVirtualizedLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

// Computed lengths resolve to px, including clamp() and viewport-unit tokens. A
// percentage or `normal` is not a length, so it counts as no gap.
function gapPixels(value) {
  const pixels = Number.parseFloat(value);
  return value.endsWith('px') && Number.isFinite(pixels) ? Math.max(0, pixels) : 0;
}

// Reports the root's resolved column and row gap on mount, whenever the root
// resizes, and on window resize, since a fluid gap follows the viewport.
function useVirtualizedGap(root, reportGap) {
  useVirtualizedLayoutEffect(() => {
    if (!root || !reportGap) return undefined;
    const view = root.ownerDocument.defaultView;
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

function useVirtualizedFocusReveal(root, enabled) {
  useVirtualizedLayoutEffect(() => {
    if (!root || !enabled || typeof ResizeObserver === 'undefined') return undefined;
    const doc = root.ownerDocument;
    let armedUntil = 0;
    let originKey = null;
    let content = null;
    let contentSize = '';
    const focusedRow = () => doc.activeElement?.closest('[role="row"]') ?? null;
    // RAC sets data-key on every row.
    const keyOf = (row) => row?.getAttribute('data-key') ?? null;
    const sizeOf = (node) => {
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
      const size = sizeOf(content);
      if (size === contentSize) return;
      contentSize = size;
      reveal();
    };
    const observer = new ResizeObserver(onResize);
    const onKeyDown = (event) => {
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
    const onScroll = (event) => {
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

export const GridList = /*#__PURE__*/ (() => {
  const component = React.forwardRef(function GridList({ children, style, layout = 'stack', orientation = 'vertical', ...props }, ref) {
    const { normalized, rest, selectedKeys, defaultSelectedKeys, onSelectionChange, onAction, selectionMode, className, disabled, disabledKeys } = collectionProps(props, 'grid-list');
    const reportGap = React.useContext(GridVirtualizerContext);
    const [gapRoot, setGapRoot] = React.useState(null);
    useVirtualizedGap(gapRoot, reportGap);
    useVirtualizedFocusReveal(gapRoot, reportGap !== null);
    const gapRef = React.useCallback((node) => {
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
    const gridList = React.createElement(AriaGridList, {
      ...rest,
      items: hasChildren ? undefined : normalized,
      selectionMode,
      selectedKeys,
      defaultSelectedKeys,
      disabledKeys,
      onSelectionChange,
      // A RAC action handler turns presses into actions while nothing is
      // selected, so only consumer actions may suppress press selection.
      ...(onAction ? {
        onAction: (key) => {
          const item = normalized.find((candidate) => candidate.id === String(key));
          if (!disabled && !item?.disabled) onAction(item ?? collectionItem(key));
        },
      } : {}),
      isDisabled: disabled,
      'aria-disabled': disabled || undefined,
      layout,
      orientation,
      // RAC already forces tab navigation in the grid layout. A horizontal stack
      // needs it too: the default arrow behavior spends Left and Right on nested
      // controls, so they could never move between items.
      keyboardNavigationBehavior: orientation === 'horizontal' ? 'tab' : 'arrow',
      'data-muxui-virtualized': virtualized || undefined,
      style,
      className,
    }, hasChildren ? children : (item) => React.createElement(component.Item, { id: item.id, textValue: item.textValue, disabled: item.disabled }, item.label));
    // Only this list's own root reports its gap, so a GridList nested in an item stays a plain list.
    return React.createElement(GridListContext.Provider, { value: { disabled } },
      React.createElement(GridVirtualizerContext.Provider, { value: null },
        React.createElement(GridListMotion, { rootRef: virtualized ? gapRef : ref }, gridList)));
  });
  component.displayName = 'GridList';
  component.Item = React.forwardRef(function GridListItem({ children, id, textValue, disabled = false, className, style }, ref) {
    const context = React.useContext(GridListContext);
    const effectiveDisabled = disabled || context.disabled;
    return React.createElement(AriaGridListItem, {
      ref, id, style,
      textValue: textValue ?? (textContent(children) || undefined),
      isDisabled: effectiveDisabled,
      'data-disabled': effectiveDisabled || undefined,
      'aria-disabled': effectiveDisabled || undefined,
      className: classNames('muxui-grid-list-item', className),
    }, React.createElement(GridListItemDisabledContext.Provider, { value: effectiveDisabled }, children));
  });
  return component;
})();
