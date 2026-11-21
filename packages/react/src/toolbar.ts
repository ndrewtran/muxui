import React from 'react';
import type { ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react';
import { AriaToolbar } from './substrate.ts';
import { classNames, accessibleName } from './control-utils.ts';
import type { MuxUIAriaAccessibleName } from './fields.ts';

/**
 * The props Mux UI defines for Toolbar. The controls it groups are its children, and it is named by
 * aria-label or aria-labelledby.
 */
export type ToolbarOwnProps = {
  /** The direction the controls are laid out and the arrow keys move focus along. Vertical stacks them in a column. */
  orientation?: 'horizontal' | 'vertical';
  /** The look of the toolbar itself. `contained` draws a filled, bordered surface around the controls; `plain` draws none, so the controls sit on the surface around them. Keyboard behaviour is the same in both. */
  variant?: 'contained' | 'plain';
};

export type ToolbarProps = ToolbarOwnProps & { children?: ReactNode; className?: string } & MuxUIAriaAccessibleName;

// The wrapper also takes and drops a `disabled`, which its public type does not offer: a Toolbar does not
// disable the controls it groups, and the attribute must not reach the DOM.
export const Toolbar: ForwardRefExoticComponent<ToolbarProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, ToolbarProps & { disabled?: unknown }>(function Toolbar({ orientation = 'horizontal', variant = 'contained', disabled: _disabled, children, className, ...props }, ref) {
  accessibleName({ ariaLabel: props['aria-label'], ariaLabelledby: props['aria-labelledby'] }, 'Toolbar');
  if (variant !== 'contained' && variant !== 'plain') throw new TypeError('Toolbar variant must be contained or plain');
  // React Aria's props do not name the data-* hooks the styles read, and TypeScript accepts such a key in a call only from a spread.
  return React.createElement(AriaToolbar, { ...props, ref, orientation, ...{ 'data-muxui-variant': variant }, className: classNames('muxui-toolbar', className) }, children);
});
Toolbar.displayName = 'Toolbar';
