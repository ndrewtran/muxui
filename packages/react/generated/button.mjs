// @generated-from: packages/react/src/button.mjs
// @generated-content-sha256: sha256:38863aecc95b8be5943387a3dc65d08a36a9a905a6b395fa5c92c1c7e1911cab
import React from 'react';
import { Button as AriaButton } from 'react-aria-components';

// The seven variants are the canonical axis. `secondary` remains a
// compatibility spelling for the earlier Mux UI surface and maps to neutral
// styling in CSS; `tone` likewise remains an orthogonal legacy alias.
const BUTTON_VARIANTS = new Set(['primary', 'neutral', 'ghost', 'danger', 'danger-neutral', 'danger-ghost', 'inverse', 'secondary']);
const BUTTON_TONES = new Set(['default', 'destructive']);
const BUTTON_SIZES = new Set(['sm', 'md', 'lg']);

function assertButtonOption(name, value, allowed) {
  if (!allowed.has(value)) {
    throw new TypeError(`Button ${name} must be one of: ${[...allowed].join(', ')}`);
  }
}

/**
 * Mux UI's Button is an immediate-action control. The React Aria primitive is
 * deliberately kept behind this boundary so the public package can replace
 * its substrate without changing the MuxUI contract.
 */
export const Button = React.forwardRef(function Button({
  children,
  className,
  disabled = false,
  pending = false,
  showTextWhileLoading = false,
  variant = 'primary',
  tone = 'default',
  size = 'md',
  onActivate,
  type = 'button',
  'aria-busy': ariaBusy,
  ...props
}, ref) {
  assertButtonOption('variant', variant, BUTTON_VARIANTS);
  assertButtonOption('tone', tone, BUTTON_TONES);
  assertButtonOption('size', size, BUTTON_SIZES);

  const handlePress = (event) => {
    const activation = {
      type: 'activate',
      pointerType: event.pointerType,
      target: event.target,
    };
    onActivate?.(activation);
  };

  const showPendingText = pending && showTextWhileLoading;
  const callerNamesButton = props['aria-label'] != null || props['aria-labelledby'] != null;
  const pendingContentLabelId = `muxui-button-label-${React.useId()}`;
  const labelPendingContent = pending && !showTextWhileLoading && !callerNamesButton;
  const content = React.createElement('span', {
    className: ['muxui-button-content', showPendingText ? 'muxui-button-content--with-spinner' : ''].filter(Boolean).join(' '),
    id: labelPendingContent ? pendingContentLabelId : undefined,
    style: pending && !showTextWhileLoading ? { visibility: 'hidden' } : undefined,
  }, children);
  const spinner = pending ? React.createElement('svg', {
    className: ['muxui-button-spinner', showPendingText ? 'muxui-button-spinner--inline' : ''].filter(Boolean).join(' '),
    viewBox: '0 0 24 24',
    fill: 'none',
    'aria-hidden': 'true',
  }, React.createElement('circle', {
    className: 'muxui-button-spinner-track', cx: '12', cy: '12', r: '10', strokeWidth: '3',
  }), React.createElement('circle', {
    className: 'muxui-button-spinner-arc', cx: '12', cy: '12', r: '10', strokeWidth: '3', strokeLinecap: 'round',
  })) : null;
  return React.createElement(AriaButton, {
    ...props,
    ref,
    type,
    className: ['muxui-button', className].filter(Boolean).join(' '),
    isDisabled: disabled,
    isPending: pending,
    render: (domProps) => React.createElement('button', {
      ...domProps,
      ...(labelPendingContent && !callerNamesButton
        ? { 'aria-labelledby': pendingContentLabelId }
        : {}),
      'data-variant': variant,
      'data-tone': tone,
      'data-size': size,
      'aria-busy': pending || ariaBusy || undefined,
    }),
    onPress: handlePress,
  }, content, spinner);
});

Button.displayName = 'Button';
