import React from 'react';
import { ButtonContext, useSlottedContext } from 'react-aria-components';
import { Button } from '../button.mjs';

/** An icon-only action with Button behavior and an explicit accessible name. */
export const IconButton = React.forwardRef(function IconButton({
  children,
  className,
  variant = 'ghost',
  ...props
}, ref) {
  const contextProps = useSlottedContext(ButtonContext, props.slot);
  const ariaLabel = props['aria-label'] !== undefined ? props['aria-label'] : contextProps?.['aria-label'];
  const ariaLabelledby = props['aria-labelledby'] !== undefined ? props['aria-labelledby'] : contextProps?.['aria-labelledby'];
  const hasName = [ariaLabel, ariaLabelledby]
    .some((value) => typeof value === 'string' && value.trim().length > 0);
  if (!hasName) {
    throw new TypeError('IconButton requires a non-empty aria-label or aria-labelledby.');
  }
  return React.createElement(Button, {
    ...props,
    ref,
    variant,
    className: ['muxui-icon-button', className].filter(Boolean).join(' '),
    'data-muxui-icon-button': '',
    showTextWhileLoading: false,
  }, React.createElement('span', {
    className: 'muxui-icon-button-icon',
    'aria-hidden': true,
  }, children));
});

IconButton.displayName = 'IconButton';
