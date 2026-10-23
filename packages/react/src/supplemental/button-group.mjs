import React from 'react';
import { Group as AriaGroup } from 'react-aria-components';
import { h, cx, dataState } from './part-utils.mjs';

/* ButtonGroup */
export const ButtonGroup = React.forwardRef(function ButtonGroup({
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
    'data-orientation': orientation === 'vertical' ? 'vertical' : 'horizontal',
    'data-attached': dataState(attached),
    className: cx('muxui-button-group', `muxui-button-group--${orientation === 'vertical' ? 'vertical' : 'horizontal'}`, attached && 'muxui-button-group--attached', className),
  }, typeof children === 'function' ? null : children);
});
