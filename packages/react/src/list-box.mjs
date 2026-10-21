import React from 'react';
import { ListBoxMotion } from './listbox-motion.mjs';
import {
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  ListBoxSection as AriaListBoxSection,
  Header as AriaHeader,
} from 'react-aria-components';
import { classNames, accessibleName } from './control-utils.mjs';
import { textContent, normalizeItems, keySet, keyList, collectionItem } from './collection-items.mjs';

const ListBoxContext = React.createContext({ disabled: false });

// Keep component creation and metadata local so unused motion can be removed.
export const ListBox = /*#__PURE__*/ (() => {
  const ListBox = React.forwardRef(function ListBoxRoot({ items = [], selectedIds, defaultSelectedIds, onSelectionChange, onAction, selectionMode = 'single', disabled = false, children, className, style, layout = 'stack', orientation = 'vertical', ...props }, ref) {
    accessibleName({ ariaLabel: props['aria-label'], ariaLabelledby: props['aria-labelledby'] }, 'ListBox');
    if (layout !== 'stack' && layout !== 'grid') throw new TypeError('ListBox layout must be stack or grid');
    if (orientation !== 'vertical' && orientation !== 'horizontal') throw new TypeError('ListBox orientation must be vertical or horizontal');
    const normalized = normalizeItems(items);
    const hasChildren = children !== undefined && children !== null;
    const disabledKeys = new Set(normalized.filter((item) => disabled || item.disabled).map((item) => item.id));
    const actionProps = onAction ? {
      onAction: (key) => {
        const item = normalized.find((candidate) => candidate.id === String(key));
        if (!disabled && !item?.disabled) onAction(item ?? collectionItem(key));
      },
    } : {};
    const listBox = React.createElement(AriaListBox, {
      ...props, items: hasChildren ? undefined : normalized, selectionMode,
      selectedKeys: keySet(selectedIds), defaultSelectedKeys: keySet(defaultSelectedIds), disabledKeys,
      onSelectionChange: (keys) => { if (!disabled) onSelectionChange?.(keyList(keys)); },
      ...actionProps,
      'data-disabled': disabled || undefined, 'aria-disabled': disabled || undefined,
      layout, orientation, style, className: classNames('muxui-list-box', className),
    }, hasChildren ? children : (item) => React.createElement(ListBox.Item, { id: item.id, textValue: item.textValue, disabled: item.disabled }, item.label));
    return React.createElement(ListBoxContext.Provider, { value: { disabled } },
      React.createElement(ListBoxMotion, { selectionMode, rootRef: ref }, listBox));
  });
  ListBox.displayName = 'ListBox';
  ListBox.Root = ListBox;
  ListBox.Section = React.forwardRef(function ListBoxSection({ children, className, title, ...props }, ref) {
    return React.createElement(AriaListBoxSection, { ...props, ref, className: classNames('muxui-list-box-section', className) },
      title !== undefined ? React.createElement(ListBox.Header, null, title) : null, children);
  });
  ListBox.Header = React.forwardRef(function ListBoxHeader({ children, className, ...props }, ref) {
    return React.createElement(AriaHeader, { ...props, ref, className: classNames('muxui-list-box-section-header', className) }, children);
  });
  ListBox.Item = React.forwardRef(function ListBoxItem({ children, id, textValue, disabled = false, className, ...props }, ref) {
    const context = React.useContext(ListBoxContext);
    const effectiveDisabled = disabled || context.disabled;
    return React.createElement(AriaListBoxItem, { ...props, ref, id, textValue: textValue ?? (textContent(children) || undefined), isDisabled: effectiveDisabled, 'data-disabled': effectiveDisabled || undefined, 'aria-disabled': effectiveDisabled || undefined, className: classNames('muxui-list-box-item', className) }, children);
  });
  return ListBox;
})();
