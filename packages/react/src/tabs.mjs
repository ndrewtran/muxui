import React from 'react';
import {
  Tabs as AriaTabs,
  TabList as AriaTabList,
  Tab as AriaTab,
  TabPanels as AriaTabPanels,
  TabPanel as AriaTabPanel,
} from 'react-aria-components';
import { normalizeChoiceControlSize } from './choice-context.mjs';
import { TabsMotion } from './tabs-motion.mjs';
import { classNames, accessibleName } from './control-utils.ts';
import { normalizeItems } from './collection-items.ts';

const TABS_VARIANTS = new Set(['underline', 'pill', 'overflow', 'segment']);

function normalizeTabsVariant(value = 'underline') {
  if (!TABS_VARIANTS.has(value)) {
    throw new TypeError('Tabs variant must be one of: underline, pill, overflow, segment');
  }
  return value;
}

export const Tabs = /*#__PURE__*/ (() => {
  const component = React.forwardRef(function Tabs({ items = [], value, defaultValue, onChange, keyboardActivation = 'automatic', orientation = 'horizontal', disabled = false, size, variant = 'underline', children: _children, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
    const normalized = normalizeItems(items);
    accessibleName({ ariaLabel, ariaLabelledby }, 'Tabs');
    const resolvedSize = normalizeChoiceControlSize(size, 'Tabs');
    const resolvedVariant = normalizeTabsVariant(variant);
    return React.createElement(AriaTabs, { ...props, ref, selectedKey: value, defaultSelectedKey: defaultValue ?? (normalized.find((item) => !item.disabled) ?? normalized[0])?.id, onSelectionChange: (key) => { const item = normalized.find((candidate) => candidate.id === String(key)); if (!disabled && !item?.disabled) onChange?.(String(key)); }, orientation, keyboardActivation, isDisabled: disabled, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, className: classNames('muxui-tabs', className), 'data-size': resolvedSize, 'data-variant': resolvedVariant },
      React.createElement(TabsMotion, { orientation, variant: resolvedVariant, disabled }, React.createElement(AriaTabList, { items: normalized, className: 'muxui-tab-list' }, (item) => React.createElement(AriaTab, { id: item.id, isDisabled: disabled || item.disabled, 'data-disabled': disabled || item.disabled || undefined, 'aria-disabled': disabled || item.disabled || undefined, className: 'muxui-tab' }, React.createElement('span', { className: 'muxui-tab-label' }, item.label)))),
      React.createElement(AriaTabPanels, { items: normalized, className: 'muxui-tab-panels' }, (item) => React.createElement(AriaTabPanel, { id: item.id, className: 'muxui-tab-panel' }, item.panel)),
    );
  });
  component.displayName = 'Tabs';
  return component;
})();
