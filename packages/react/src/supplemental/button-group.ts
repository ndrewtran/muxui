import React from 'react';
import type { ForwardRefExoticComponent, HTMLAttributes, ReactNode, RefAttributes } from 'react';
import { AriaGroup } from '../substrate.ts';
import { h, cx, dataState } from './part-utils.ts';

/**
 * The props Mux UI defines for ButtonGroup; the catalog's web.react API is derived from
 * this type (Decision 0031). The group's accessible name is aria-label or aria-labelledby.
 */
type ButtonGroupOwnProps = {
  /** The direction the buttons lay out in. */
  orientation?: 'horizontal' | 'vertical';
  /** Joins the buttons, rounding only the group's outer corners. */
  attached?: boolean;
  /** Marks the group disabled. Its buttons keep their own disabled state. */
  disabled?: boolean;
  /** `presentation` names nothing; a group or region needs an accessible name, and without one the group is presentation. */
  role?: 'group' | 'region' | 'presentation';
};

export type ButtonGroupProps = ButtonGroupOwnProps & HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
};

/* ButtonGroup */
export const ButtonGroup: ForwardRefExoticComponent<ButtonGroupProps & RefAttributes<HTMLDivElement>> = /*#__PURE__*/ React.forwardRef<HTMLDivElement, ButtonGroupProps>(function ButtonGroup({
  children,
  orientation = 'horizontal',
  attached = false,
  disabled = false,
  role = 'group',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  className,
  ...props
}, ref) {
  const resolvedRole = role === 'presentation' || (ariaLabel || ariaLabelledby) ? role : 'presentation';
  return h(AriaGroup, {
    ...props,
    ref,
    role: resolvedRole,
    'aria-label': resolvedRole === 'presentation' ? undefined : ariaLabel,
    'aria-labelledby': resolvedRole === 'presentation' ? undefined : ariaLabelledby,
    isDisabled: disabled,
    ...{ 'data-muxui-state-orientation': orientation === 'vertical' ? 'vertical' : 'horizontal', 'data-attached': dataState(attached) },
    className: cx('muxui-button-group', `muxui-button-group--${orientation === 'vertical' ? 'vertical' : 'horizontal'}`, attached && 'muxui-button-group--attached', className),
  }, typeof children === 'function' ? null : children);
});
