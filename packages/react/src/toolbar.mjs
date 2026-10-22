import React from 'react';
import { Toolbar as AriaToolbar } from 'react-aria-components';
import { classNames, accessibleName } from './control-utils.mjs';

export const Toolbar = React.forwardRef(function Toolbar({ orientation = 'horizontal', disabled: _disabled, children, className, ...props }, ref) {
  accessibleName({ ariaLabel: props['aria-label'], ariaLabelledby: props['aria-labelledby'] }, 'Toolbar');
  return React.createElement(AriaToolbar, { ...props, ref, orientation, className: classNames('muxui-toolbar', className) }, children);
});
Toolbar.displayName = 'Toolbar';
