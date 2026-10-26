import React from 'react';
import type { ForwardRefExoticComponent, MouseEvent, ReactElement, ReactNode, RefAttributes } from 'react';
import { TreeMotion } from './tree-motion.mjs';
import ChevronRightIcon from 'lucide-react/dist/esm/icons/chevron-right.mjs';
import { TreeItemContent as AriaTreeItemContent } from 'react-aria-components';
import { AriaTree, AriaTreeItem } from './substrate.ts';
import type { Key, TreeItemProps } from 'react-aria-components';
import { IconButton } from './supplemental/icon-button.ts';
import { classNames, accessibleName } from './control-utils.ts';
import { textContent, keySet, keyList } from './collection-items.ts';
import type { MuxUICollectionItem, MuxUISelection, NormalizedItem } from './collection-items.ts';
import type { MuxUIAriaAccessibleName } from './fields.ts';

/** A node of the tree: its nested items are `children`, or else `items`. */
export interface MuxUITreeItem extends MuxUICollectionItem {
  children?: MuxUITreeItem[];
  items?: MuxUITreeItem[];
}

// The accessible name's arms (aria-label and aria-labelledby) and className stay in the public type and are
// not Mux UI-owned members. The own props are a type literal, not an interface, so the public props type
// stays assignable to Record<string, unknown>, as it was before the move.

/** The props Mux UI defines for Tree. Tree takes no `children`: its items come from `items`. */
export type TreeOwnProps = {
  /** The tree as data: strings, or items with an `id`, a `label`, a `textValue`, `disabled`, and nested `children` (or `items`). Give every item an id that is unique across the whole tree and stable when the data changes. An item without an id takes its key, value, or position among its siblings as its id, and a repeated id gets a numeric suffix in tree order. A disabled item disables all of its descendants. */
  items?: MuxUITreeItem[];
  /** The selected item ids when the caller controls the selection, or `'all'`. */
  selectedIds?: MuxUISelection;
  /** The ids selected at first when the tree controls its own selection, or `'all'`. */
  defaultSelectedIds?: MuxUISelection;
  /** The expanded item ids when the caller controls expansion, or `'all'`. */
  expandedIds?: MuxUISelection;
  /** The ids expanded at first when the tree controls its own expansion, or `'all'`. */
  defaultExpandedIds?: MuxUISelection;
  /** Disables every item and stops the selection, expansion, and action callbacks. */
  disabled?: boolean;
  /** How many items can be selected. */
  selectionMode?: 'none' | 'single' | 'multiple';
  /** What expands a parent item. With `row`, a click or tap on its label or row space expands or collapses it; with `chevron`, only its chevron control does. */
  expansionTrigger?: 'chevron' | 'row';
  /** Called with the selected item ids, or `'all'`, when the selection changes. It is not called while the tree is disabled. */
  onSelectionChange?: (ids: MuxUISelection) => void;
  /** Called with the expanded item ids, or `'all'`, when an item expands or collapses. It is not called while the tree is disabled. */
  onExpandedChange?: (ids: MuxUISelection) => void;
  /** Called with the item record when the user activates an item. With selection on, a click or Enter runs it while nothing is selected and Space starts a selection; once an item is selected, a click changes the selection instead. It is not called for a disabled item or while the tree is disabled. */
  onAction?: (item?: MuxUITreeItem) => void;
};

export type TreeProps = TreeOwnProps & { className?: string } & MuxUIAriaAccessibleName;

// Tree takes and drops `children`, which its public type never offered, so the render function is typed beside it.
type TreeRenderProps = TreeProps & { children?: unknown };

/** A tree item once it is normalized: it has its id, its resolved disabled state (its own or an ancestor's), and its nested items. */
interface NormalizedTreeItem extends NormalizedItem {
  disabled: boolean;
  children: NormalizedTreeItem[];
}

function normalizeTreeItems(items: MuxUITreeItem[] = [], used = new Set<string>(), parentDisabled = false): NormalizedTreeItem[] {
  return items.map((item, index) => {
    const source: MuxUITreeItem = typeof item === 'string' ? { label: item, value: item } : (item ?? {});
    const base = String(source.id ?? source.key ?? source.value ?? index);
    let id = base || String(index);
    let suffix = 1;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    const nested = normalizeTreeItems(source.children ?? source.items ?? [], used, parentDisabled || Boolean(source.disabled));
    // An item may carry its label as `name`, which the index signature leaves unknown.
    const label = (source.label ?? source.name ?? source.value ?? id) as ReactNode;
    return { ...source, id, key: id, label, value: source.value ?? id, textValue: source.textValue ?? (textContent(label) || id), disabled: parentDisabled || Boolean(source.disabled), children: nested };
  });
}

function treeKeys(items: NormalizedTreeItem[], keys: string[] = []): string[] {
  for (const item of items) {
    keys.push(item.id);
    treeKeys(item.children ?? [], keys);
  }
  return keys;
}

function findTreeItem(items: NormalizedTreeItem[], key: Key): NormalizedTreeItem | undefined {
  for (const item of items) {
    if (item.id === String(key)) return item;
    const nested = findTreeItem(item.children ?? [], key);
    if (nested) return nested;
  }
  return undefined;
}

type TreeExpansionTrigger = NonNullable<TreeOwnProps['expansionTrigger']>;
const TREE_EXPANSION_TRIGGERS: ReadonlySet<string> = new Set(['chevron', 'row']);

function isTreeExpansionTrigger(value: string): value is TreeExpansionTrigger {
  return TREE_EXPANSION_TRIGGERS.has(value);
}

function normalizeTreeExpansionTrigger(value: string = 'row'): TreeExpansionTrigger {
  if (!isTreeExpansionTrigger(value)) {
    throw new TypeError('Tree expansionTrigger must be one of: chevron, row');
  }
  return value;
}

const TREE_INTERACTIVE_SELECTOR = 'a,button,input,select,textarea,summary,[role="button"],[role="checkbox"],[role="combobox"],[role="link"],[role="menuitem"],[role="option"],[role="radio"],[role="switch"],[tabindex]:not([tabindex="-1"])';

function isTreeInteractiveTarget(target: EventTarget, boundary: Element): boolean {
  if (!(target instanceof Element)) return false;
  let current: Element | null = target;
  while (current && current !== boundary) {
    if (current.matches(TREE_INTERACTIVE_SELECTOR)) return true;
    const contentEditable = current.getAttribute('contenteditable');
    if (contentEditable !== null && contentEditable !== 'false') return true;
    current = current.parentElement;
  }
  return false;
}

function treeItem(item: NormalizedTreeItem, expansionTrigger: TreeExpansionTrigger, treeDisabled: boolean): ReactElement {
  const nested = item.children ?? [];
  const rowExpansionEnabled = expansionTrigger === 'row' && !treeDisabled && !item.disabled && nested.length > 0;
  const rowExpansion: { toggleKey: (() => void) | undefined } = { toggleKey: undefined };
  // React Aria's TreeItemProps wants a props-level `children`. This call supplies the item's content and its nested items as
  // variadic arguments instead, because an unkeyed `children: [content, nested]` array draws React's key warnings. So the props
  // are asserted whole, which also covers onClickCapture, a prop React Aria's types do not name.
  const props = {
    id: item.id,
    textValue: item.textValue,
    hasChildItems: nested.length > 0,
    isDisabled: item.disabled,
    className: 'muxui-tree-item',
    onClickCapture: rowExpansionEnabled ? (event: MouseEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.target as Node)) return;
      if (isTreeInteractiveTarget(event.target, event.currentTarget)) return;
      rowExpansion.toggleKey?.();
    } : undefined,
  } as TreeItemProps<unknown>;
  return React.createElement(AriaTreeItem, props,
    // The render function is a prop of React Aria's item content, which TypeScript accepts here and not as a createElement child.
    React.createElement(AriaTreeItemContent, {
      children: ({ state }) => {
        rowExpansion.toggleKey = rowExpansionEnabled ? () => state.toggleKey(item.id) : undefined;
        return React.createElement('div', { className: 'muxui-tree-item-content' },
          nested.length ? React.createElement(IconButton, { slot: 'chevron', 'aria-label': 'Toggle', disabled: item.disabled, className: 'muxui-tree-toggle' }, React.createElement(ChevronRightIcon, { 'aria-hidden': 'true', focusable: 'false', fill: 'currentColor', strokeWidth: 0, size: 16 })) : null,
          React.createElement('span', { className: 'muxui-tree-item-label' }, item.label));
      },
    }),
    nested.map((child) => React.cloneElement(treeItem(child, expansionTrigger, treeDisabled), { key: child.id })));
}

export const Tree: ForwardRefExoticComponent<TreeProps & RefAttributes<HTMLDivElement>> = /*#__PURE__*/ (() => {
  const component = React.forwardRef<HTMLDivElement, TreeRenderProps>(function Tree({ items, selectedIds, defaultSelectedIds, expandedIds, defaultExpandedIds, onSelectionChange, onExpandedChange, onAction, selectionMode = 'single', expansionTrigger = 'row', disabled = false, children: _children, className, ...props }, ref) {
    accessibleName({ ariaLabel: props['aria-label'], ariaLabelledby: props['aria-labelledby'] }, 'Tree');
    const normalizedExpansionTrigger = normalizeTreeExpansionTrigger(expansionTrigger);
    // normalizeTreeItems takes no items as an empty list, so an omitted list has no default here to state.
    const normalized = normalizeTreeItems(items);
    const allKeys = treeKeys(normalized);
    const disabledKeys = new Set(disabled ? allKeys : allKeys.filter((key) => findTreeItem(normalized, key)?.disabled));
    const expanded = expandedIds === 'all' ? new Set(allKeys) : keySet(expandedIds);
    const defaultExpanded = defaultExpandedIds === 'all' ? new Set(allKeys) : keySet(defaultExpandedIds);
    const motionControllerRef = React.useRef<{ beforeExpandedChange(): void } | null>(null);
    const handleExpandedChange = React.useCallback((keys: Set<Key>) => {
      motionControllerRef.current?.beforeExpandedChange();
      if (!disabled) onExpandedChange?.(keyList(keys));
    }, [disabled, onExpandedChange]);
    const tree = React.createElement(AriaTree, {
      ...props,
      selectionMode,
      selectedKeys: keySet(selectedIds),
      defaultSelectedKeys: keySet(defaultSelectedIds),
      expandedKeys: expanded,
      defaultExpandedKeys: defaultExpanded,
      disabledKeys,
      onSelectionChange: (keys) => { if (!disabled) onSelectionChange?.(keyList(keys)); },
      onExpandedChange: handleExpandedChange,
      ...(onAction ? {
        onAction: (key: Key) => {
          const item = findTreeItem(normalized, key);
          if (!disabled && !item?.disabled) onAction(item);
        },
      } : {}),
      // React Aria's Tree props name no isDisabled, and TypeScript accepts such a key in a call only from a spread.
      ...{ isDisabled: disabled },
      className: classNames('muxui-tree', className),
    }, normalized.map((item) => React.cloneElement(treeItem(item, normalizedExpansionTrigger, disabled), { key: item.id })));
    return React.createElement(TreeMotion, { rootRef: ref, controllerRef: motionControllerRef, children: tree });
  });
  component.displayName = 'Tree';
  return component;
})();
