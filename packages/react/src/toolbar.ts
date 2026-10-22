import React from 'react';
import type { ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react';
import { Toolbar as AriaToolbar } from 'react-aria-components';
import { classNames, accessibleName } from './control-utils.ts';
import type { MuxUIAriaAccessibleName } from './fields.ts';

/**
 * The props Mux UI defines for Toolbar. The controls it groups are its children, and it is named by
 * aria-label or aria-labelledby.
 */
export type ToolbarOwnProps = {
  /** The direction the controls are laid out and the arrow keys move focus along. Vertical stacks them in a column. */
  orientation?: 'horizontal' | 'vertical';
};

export type ToolbarProps = ToolbarOwnProps & { children?: ReactNode; className?: string } & MuxUIAriaAccessibleName;

// The wrapper also takes and drops a `disabled`, which its public type does not offer: a Toolbar does not
// disable the controls it groups, and the attribute must not reach the DOM.
export const Toolbar: ForwardRefExoticComponent<ToolbarProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, ToolbarProps & { disabled?: unknown }>(function Toolbar({ orientation = 'horizontal', disabled: _disabled, children, className, ...props }, ref) {
  accessibleName({ ariaLabel: props['aria-label'], ariaLabelledby: props['aria-labelledby'] }, 'Toolbar');
  return React.createElement(AriaToolbar, { ...props, ref, orientation, className: classNames('muxui-toolbar', className) }, children);
});
Toolbar.displayName = 'Toolbar';
