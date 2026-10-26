import React from 'react';
import type { ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react';
import { AriaToggleButtonGroup } from './substrate.ts';
import type { Key } from 'react-aria-components';
import { normalizeToggleButtonSize, ToggleButtonSizeContext } from './toggle-button-context.mjs';
import { ToggleButtonGroupMotion } from './toggle-button-group-motion.mjs';
import { classNames, accessibleName } from './control-utils.ts';
import type { MuxUIAriaAccessibleName } from './fields.ts';

/**
 * The props Mux UI defines for ToggleButtonGroup. The ToggleButtons it groups are its children, and
 * it is named by aria-label or aria-labelledby.
 */
export type ToggleButtonGroupOwnProps = {
  /** The ids of the selected ToggleButtons, when the caller controls the selection. A single-selection group holds at most one; the all value is not accepted. */
  selectedIds?: readonly string[];
  /** The ids of the ToggleButtons that start selected, when the group controls itself. A single-selection group holds at most one; the all value is not accepted. */
  defaultSelectedIds?: readonly string[];
  /** Whether the group selects one ToggleButton or several. Any other value throws a TypeError. */
  selectionMode?: 'single' | 'multiple';
  /** Disables the group and every ToggleButton in it. */
  disabled?: boolean;
  /** The direction the buttons are laid out and the arrow keys move focus along. */
  orientation?: 'horizontal' | 'vertical';
  /** Keeps the selection from being cleared: the selected button stays selected when pressed again. */
  disallowEmptySelection?: boolean;
  /** The control size. The ToggleButtons take it from the group. */
  size?: 'sm' | 'md' | 'lg';
  /** Called with the ids of the selected ToggleButtons each time the selection changes. A disabled group does not call it. */
  onSelectionChange?: (ids: readonly string[]) => void;
};

export type ToggleButtonGroupProps = ToggleButtonGroupOwnProps & { children?: ReactNode; className?: string } & MuxUIAriaAccessibleName;

function readonlyKeyArray(value: readonly string[] | undefined, property: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((key) => typeof key !== 'string')) {
    throw new TypeError(`${property} must be a readonly string array`);
  }
  return [...value];
}

function readonlyKeySet(value: readonly string[] | undefined, property: string, selectionMode: 'single' | 'multiple'): Set<string> | undefined {
  if (selectionMode !== 'single' && selectionMode !== 'multiple') {
    throw new TypeError('ToggleButtonGroup selectionMode must be single or multiple');
  }
  const keys = readonlyKeyArray(value, property);
  if (keys && selectionMode === 'single' && keys.length > 1) {
    throw new TypeError(`${property} must contain at most one ID in single selection mode`);
  }
  return keys === undefined ? undefined : new Set(keys);
}

export const ToggleButtonGroup: ForwardRefExoticComponent<ToggleButtonGroupProps & RefAttributes<HTMLDivElement>> = /*#__PURE__*/ (() => {
  const component = React.forwardRef<HTMLDivElement, ToggleButtonGroupProps>(function ToggleButtonGroup({ selectedIds, defaultSelectedIds, onSelectionChange, selectionMode = 'single', orientation = 'horizontal', disabled = false, disallowEmptySelection = false, size = 'md', children, className, ...props }, ref) {
    accessibleName({ ariaLabel: props['aria-label'], ariaLabelledby: props['aria-labelledby'] }, 'ToggleButtonGroup');
    const selectedKeys = readonlyKeySet(selectedIds, 'selectedIds', selectionMode);
    const defaultSelectedKeys = readonlyKeySet(defaultSelectedIds, 'defaultSelectedIds', selectionMode);
    const resolvedSize = normalizeToggleButtonSize(size, 'ToggleButtonGroup');
    const group = React.createElement(AriaToggleButtonGroup, {
      ...props,
      selectedKeys,
      defaultSelectedKeys,
      selectionMode,
      disallowEmptySelection,
      // React Aria types the selection as a set of keys. The check stays for the all value its state can hold.
      onSelectionChange: (keys: Set<Key> | 'all') => {
        if (!disabled) {
          if (keys === 'all') throw new TypeError('ToggleButtonGroup selection cannot be all');
          if (disallowEmptySelection && keys.size === 0) return;
          onSelectionChange?.([...keys].map(String));
        }
      },
      orientation,
      isDisabled: disabled,
      // The data-* hook the styles read is not a prop React Aria types, and TypeScript accepts such a key in a call only from a spread.
      ...{ 'data-muxui-size': resolvedSize },
      className: classNames('muxui-toggle-button-group', className),
    }, children);
    return React.createElement(ToggleButtonSizeContext.Provider, { value: resolvedSize },
      // The motion wrapper's props name its group as children, which createElement would otherwise set from its third argument.
      React.createElement(ToggleButtonGroupMotion, { selectionMode, disabled, rootRef: ref, children: group }));
  });
  component.displayName = 'ToggleButtonGroup';
  return component;
})();
