import React from 'react';
import type { CSSProperties, ForwardRefExoticComponent, HTMLAttributes, ReactNode, RefAttributes } from 'react';
import { ListBoxMotion } from './listbox-motion.mjs';
import { ListBoxSection as AriaListBoxSection, Header as AriaHeader } from 'react-aria-components';
import { AriaListBox, AriaListBoxItem } from './substrate.ts';
import type {
  Key,
  ListBoxItemProps as AriaListBoxItemProps,
  ListBoxProps as AriaListBoxProps,
  ListBoxSectionProps as AriaListBoxSectionProps,
} from 'react-aria-components';
import { classNames, accessibleName } from './control-utils.ts';
import { textContent, normalizeItems, keySet, keyList, collectionItem } from './collection-items.ts';
import type { MuxUICollectionItem, MuxUIItems, MuxUISelection, NormalizedItem } from './collection-items.ts';
import type { MuxUIAriaAccessibleName } from './fields.ts';

// The props each part defines, as one type per part: the catalog's web.react API is derived from them
// (Decision 0031), the root's as the family-level block and Section's and Item's under partApis. Each is a
// type literal, so its public props type stays assignable to Record<string, unknown>, as it was before the
// move. The accessible name's arms (aria-label and aria-labelledby), children, style, and className stay in
// the public type and are not Mux UI-owned members. ListBox.Header owns no prop.

/** The props Mux UI defines for ListBox. ListBox has no `name` and submits nothing. */
export type ListBoxOwnProps = {
  /** The options as data: strings, or items with an `id`, a `label`, a `textValue`, and `disabled`. Children take precedence: when both are supplied, the items are not rendered. */
  items?: MuxUIItems;
  /** The selected item ids when the caller controls the selection, or `'all'`. */
  selectedIds?: MuxUISelection;
  /** The ids selected at first when the list controls its own selection, or `'all'`. */
  defaultSelectedIds?: MuxUISelection;
  /** Disables every item and stops the selection and action callbacks. An item's own `disabled={false}` cannot re-enable it under a disabled list. */
  disabled?: boolean;
  /** How many items can be selected. With `single`, pressing the selected item again clears the selection, so the list can end with nothing selected. */
  selectionMode?: 'none' | 'single' | 'multiple';
  /** Called with the selected item ids, or `'all'`, when the selection changes. It is not called while the list is disabled. */
  onSelectionChange?: (ids: MuxUISelection) => void;
  /** Called when the user activates an item. A list built from `items` passes the item record; one built from children passes the identity fields `id`, `key`, and `value`. It is not called for a disabled item or while the list is disabled. */
  onAction?: (item?: MuxUICollectionItem) => void;
  /** `stack` navigates along the orientation. `grid` uses the items' actual positions for two-dimensional arrow navigation, and the columns and sizes come from CSS or `style`. */
  layout?: 'stack' | 'grid';
  /** The direction arrow keys move along a stack layout. */
  orientation?: 'vertical' | 'horizontal';
};

export type ListBoxProps = ListBoxOwnProps & { children?: ReactNode; style?: CSSProperties; className?: string } & MuxUIAriaAccessibleName;

/** The props Mux UI defines for ListBox.Item. Every other attribute of a div passes through to the option. */
export type ListBoxItemOwnProps = {
  /** The stable string id the selection and action callbacks report. */
  id: string;
  /** The text typeahead matches. Without one it is the text of the item's children, which is unambiguous only for plain text, so give rich children a `textValue`. */
  textValue?: string;
  /** Disables the item. A disabled list disables every item whatever this says. */
  disabled?: boolean;
};

export type ListBoxItemProps = Omit<HTMLAttributes<HTMLDivElement>, 'id'> & ListBoxItemOwnProps;

/** The props Mux UI defines for ListBox.Section. Every other attribute of a section passes through to it. */
export type ListBoxSectionOwnProps = {
  /** The visible heading of the section, rendered in a ListBox.Header. Without one, name the section with `aria-label`. */
  title?: ReactNode;
};

export type ListBoxSectionProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & ListBoxSectionOwnProps;

// A forwardRef result carries no statics, so the compound states them.
type ListBoxComponent = ForwardRefExoticComponent<ListBoxProps & RefAttributes<HTMLDivElement>> & {
  Root: ForwardRefExoticComponent<ListBoxProps & RefAttributes<HTMLDivElement>>;
  Section: ForwardRefExoticComponent<ListBoxSectionProps & RefAttributes<HTMLElement>>;
  Header: ForwardRefExoticComponent<HTMLAttributes<HTMLElement> & RefAttributes<HTMLElement>>;
  Item: ForwardRefExoticComponent<ListBoxItemProps & RefAttributes<HTMLDivElement>>;
};

const ListBoxContext = React.createContext({ disabled: false });

// Keep component creation and metadata local so unused motion can be removed.
export const ListBox: ListBoxComponent = /*#__PURE__*/ (() => {
  const ListBox = React.forwardRef<HTMLDivElement, ListBoxProps>(function ListBoxRoot({ items, selectedIds, defaultSelectedIds, onSelectionChange, onAction, selectionMode = 'single', disabled = false, children, className, style, layout = 'stack', orientation = 'vertical', ...props }, ref) {
    accessibleName({ ariaLabel: props['aria-label'], ariaLabelledby: props['aria-labelledby'] }, 'ListBox');
    if (layout !== 'stack' && layout !== 'grid') throw new TypeError('ListBox layout must be stack or grid');
    if (orientation !== 'vertical' && orientation !== 'horizontal') throw new TypeError('ListBox orientation must be vertical or horizontal');
    // normalizeItems takes no items as an empty list, so an omitted list has no default here to state.
    const normalized = normalizeItems(items);
    const hasChildren = children !== undefined && children !== null;
    // Conditionals, not || on the owned disabled: extraction reads a fallback on an owned prop as an executed default.
    const disabledKeys = new Set(normalized.filter((item) => (disabled ? disabled : item.disabled)).map((item) => item.id));
    const actionProps = onAction ? {
      onAction: (key: Key) => {
        const item = normalized.find((candidate) => candidate.id === String(key));
        if (!disabled && !item?.disabled) onAction(item ?? collectionItem(key));
      },
    } : {};
    const listBox = React.createElement(AriaListBox<NormalizedItem>, {
      ...(props as AriaListBoxProps<NormalizedItem>), items: hasChildren ? undefined : normalized, selectionMode,
      selectedKeys: keySet(selectedIds), defaultSelectedKeys: keySet(defaultSelectedIds), disabledKeys,
      onSelectionChange: (keys) => { if (!disabled) onSelectionChange?.(keyList(keys)); },
      ...actionProps,
      // React Aria's props do not name aria-disabled or the data-* hooks the styles read, and TypeScript accepts such a key in a call only from a spread.
      ...{ 'data-muxui-state-disabled': disabled ? disabled : undefined, 'aria-disabled': disabled ? disabled : undefined },
      layout, orientation, style, className: classNames('muxui-list-box', className),
      children: hasChildren ? children : (item: NormalizedItem) => React.createElement(ListBox.Item, { id: item.id, textValue: item.textValue, disabled: item.disabled }, item.label),
    });
    return React.createElement(ListBoxContext.Provider, { value: { disabled } },
      React.createElement(ListBoxMotion, { selectionMode, rootRef: ref, children: listBox }));
  }) as ListBoxComponent;
  ListBox.displayName = 'ListBox';
  ListBox.Root = ListBox;
  ListBox.Section = React.forwardRef<HTMLElement, ListBoxSectionProps>(function ListBoxSection({ children, className, title, ...props }, ref) {
    return React.createElement(AriaListBoxSection, { ...(props as AriaListBoxSectionProps<unknown>), ref, className: classNames('muxui-list-box__section', className) },
      title !== undefined ? React.createElement(ListBox.Header, null, title) : null, children);
  });
  ListBox.Header = React.forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(function ListBoxHeader({ children, className, ...props }, ref) {
    return React.createElement(AriaHeader, { ...props, ref, className: classNames('muxui-list-box__header', className) }, children);
  });
  ListBox.Item = React.forwardRef<HTMLDivElement, ListBoxItemProps>(function ListBoxItem({ children, id, textValue, disabled = false, className, ...props }, ref) {
    const context = React.useContext(ListBoxContext);
    const effectiveDisabled = disabled ? disabled : context.disabled;
    return React.createElement(AriaListBoxItem, {
      ...(props as AriaListBoxItemProps), ref, id,
      // A conditional, not ??: extraction reads a fallback on an owned prop as an executed default, and the item's own text is none.
      textValue: textValue == null ? (textContent(children) || undefined) : textValue,
      isDisabled: effectiveDisabled,
      ...{ 'data-muxui-state-disabled': effectiveDisabled || undefined, 'aria-disabled': effectiveDisabled || undefined },
      className: classNames('muxui-list-box__item', className),
    }, children);
  });
  return ListBox;
})();
