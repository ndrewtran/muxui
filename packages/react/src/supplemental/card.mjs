import React from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { usePendingSubmitProps } from '../button.ts';
import { h, cx, dataState, nativePart, pressHandler } from './part-utils.ts';

/* Card */
function cardProps({ variant = 'outlined', padding = 'md', className, ...props }) {
  const safeVariant = ['elevated', 'outlined', 'filled'].includes(variant) ? variant : 'outlined';
  const safePadding = ['sm', 'md', 'lg'].includes(padding) ? padding : 'md';
  return { ...props, className: cx('muxui-card', `muxui-card--${safeVariant}`, `muxui-card--${safePadding}`, className) };
}

export const Card = {
  Root: React.forwardRef(function CardRoot({ variant, padding, ...props }, ref) {
    return h('div', { ...cardProps({ ...props, variant, padding }), ref });
  }),
  Button: React.forwardRef(function CardButton({ variant, padding, selected, disabled = false, pending = false, onActivate, ...props }, ref) {
    const pendingSubmitProps = usePendingSubmitProps(pending, props.type);
    return h(AriaButton, {
      ...cardProps({ ...props, variant, padding, className: cx('muxui-card--button', props.className) }),
      ref,
      isDisabled: disabled,
      isPending: pending,
      'aria-pressed': selected,
      'data-selected': dataState(selected),
      'data-pending': dataState(pending),
      onPress: pressHandler(onActivate),
      render: (domProps) => h('button', { ...domProps, ...pendingSubmitProps }),
    });
  }),
  Header: React.forwardRef(function CardHeader(props, ref) { return nativePart('div', 'muxui-card__header', props, ref); }),
  Body: React.forwardRef(function CardBody(props, ref) { return nativePart('div', 'muxui-card__body', props, ref); }),
  Footer: React.forwardRef(function CardFooter(props, ref) { return nativePart('div', 'muxui-card__footer', props, ref); }),
};
