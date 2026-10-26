import React from 'react';
import type { ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react';
import { TabPanels as AriaTabPanels } from 'react-aria-components';
import { AriaTabs, AriaTabList, AriaTab, AriaTabPanel } from './substrate.ts';
import type { Key } from 'react-aria-components';
import { normalizeChoiceControlSize } from './choice-context.mjs';
import { TabsMotion } from './tabs-motion.mjs';
import { classNames, accessibleName } from './control-utils.ts';
import { normalizeItems } from './collection-items.ts';
import type { MuxUIItems, NormalizedItem } from './collection-items.ts';
import type { ControlSize, MuxUIAriaAccessibleName } from './fields.ts';

// The accessible name's arms (aria-label and aria-labelledby) and className stay in the public type and are
// not Mux UI-owned members. The own props are a type literal, not an interface, so the public props type
// stays assignable to Record<string, unknown>, as it was before the move.

/** The props Mux UI defines for Tabs. */
export type TabsOwnProps = {
  /** The tabs as data: strings, or items with an `id`, a `label`, a `textValue`, `disabled`, and the `panel` the tab shows. */
  items?: MuxUIItems;
  /** The id of the selected tab, when the caller controls the selection. */
  value?: string;
  /** The id of the tab selected at first, when Tabs controls its own selection. Without one, the first enabled tab is selected. */
  defaultValue?: string;
  /** Disables every tab. A tab's own `disabled` disables just that tab. */
  disabled?: boolean;
  /** The direction the tabs run, which arrow keys follow. */
  orientation?: 'horizontal' | 'vertical';
  /** How arrow keys act. With `automatic`, an arrow key selects the tab it reaches. With `manual`, arrow keys only move focus, and Enter or Space selects the focused tab. */
  keyboardActivation?: 'automatic' | 'manual';
  /** The control size, sm, md, or lg. */
  size?: ControlSize;
  /** The visual treatment of the tab list: underline, pill, overflow, or segment. */
  variant?: 'underline' | 'pill' | 'overflow' | 'segment';
  /** Called with the id of the tab the user selects. It is not called for a disabled tab or while Tabs is disabled. */
  onChange?: (value: string) => void;
};

export type TabsProps = TabsOwnProps & { className?: string } & MuxUIAriaAccessibleName;

// Tabs takes and drops `children`, which its public type never offered, so the render function is typed beside it.
type TabsRenderProps = TabsProps & { children?: unknown };

type TabsVariant = NonNullable<TabsOwnProps['variant']>;
const TABS_VARIANTS: ReadonlySet<string> = new Set(['underline', 'pill', 'overflow', 'segment']);

function isTabsVariant(value: string): value is TabsVariant {
  return TABS_VARIANTS.has(value);
}

function normalizeTabsVariant(value: string = 'underline'): TabsVariant {
  if (!isTabsVariant(value)) {
    throw new TypeError('Tabs variant must be one of: underline, pill, overflow, segment');
  }
  return value;
}

export const Tabs: ForwardRefExoticComponent<TabsProps & RefAttributes<HTMLDivElement>> = /*#__PURE__*/ (() => {
  const component = React.forwardRef<HTMLDivElement, TabsRenderProps>(function Tabs({ items, value, defaultValue, onChange, keyboardActivation = 'automatic', orientation = 'horizontal', disabled = false, size = 'md', variant = 'underline', children: _children, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
    // normalizeItems takes no items as an empty list, so an omitted list has no default here to state.
    const normalized = normalizeItems(items);
    accessibleName({ ariaLabel, ariaLabelledby }, 'Tabs');
    const resolvedSize = normalizeChoiceControlSize(size, 'Tabs');
    const resolvedVariant = normalizeTabsVariant(variant);
    return React.createElement(AriaTabs, {
      ...props,
      ref,
      selectedKey: value,
      // Conditionals, not ?? and ||: extraction reads a fallback on an owned prop as an executed default.
      defaultSelectedKey: defaultValue === undefined || defaultValue === null ? (normalized.find((item) => !item.disabled) ?? normalized[0])?.id : defaultValue,
      onSelectionChange: (key: Key) => { const item = normalized.find((candidate) => candidate.id === String(key)); if (!disabled && !item?.disabled) onChange?.(String(key)); },
      orientation,
      keyboardActivation,
      // React Aria's Tabs props name neither isDisabled nor the data hooks the styles read, and TypeScript accepts such a key in a call only from a spread.
      ...{ isDisabled: disabled },
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
      className: classNames('muxui-tabs', className),
      ...{ 'data-muxui-size': resolvedSize, 'data-muxui-variant': resolvedVariant },
    },
    React.createElement(TabsMotion, { orientation, variant: resolvedVariant, disabled }, React.createElement(AriaTabList<NormalizedItem>, {
      items: normalized,
      className: 'muxui-tabs__list',
      // A render function is a child of React Aria's collection parts, which TypeScript accepts as a prop here and not as a createElement child.
      children: (item) => React.createElement(AriaTab, {
        id: item.id,
        ...{
          isDisabled: disabled ? disabled : item.disabled,
          'data-muxui-state-disabled': (disabled ? disabled : item.disabled) || undefined,
          'aria-disabled': (disabled ? disabled : item.disabled) || undefined,
        },
        className: 'muxui-tabs__tab',
      }, React.createElement('span', { className: 'muxui-tabs__tab-label' }, item.label)),
    })),
    React.createElement(AriaTabPanels<NormalizedItem>, {
      items: normalized,
      className: 'muxui-tabs__panels',
      children: (item) => React.createElement(AriaTabPanel, { id: item.id, className: 'muxui-tabs__panel' }, item.panel as ReactNode),
    }),
    );
  });
  component.displayName = 'Tabs';
  return component;
})();
