// @generated-from: packages/react/src/supplemental/icon-button.mjs
// @generated-content-sha256: sha256:561864a926f02a7c84a5a8c0055908979729940b2c39a523e5acd43cbd641f3b
import React from 'react';
import { Button } from './button.mjs';

/** An icon-only action with Button behavior and an explicit accessible name. */
export const IconButton = React.forwardRef(function IconButton({
  children,
  className,
  variant = 'ghost',
  ...props
}, ref) {
  const hasName = [props['aria-label'], props['aria-labelledby']]
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
