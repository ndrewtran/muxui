import React from 'react';
import {
  Text as AriaText,
  TextContext as AriaTextContext,
  DEFAULT_SLOT as ARIA_DEFAULT_SLOT,
} from 'react-aria-components';
import { h, cx } from './part-utils.ts';

const TEXT_VARIANTS = new Set(['display', 'heading', 'title', 'label', 'body', 'expressive', 'mono']);
const TEXT_SIZES = Object.freeze({
  display: new Set(['sm', 'md', 'lg']),
  heading: new Set(['sm', 'md', 'lg']),
  title: new Set(['sm', 'md', 'lg']),
  label: new Set(['xs', 'sm', 'md', 'lg']),
  body: new Set(['xs', 'sm', 'md', 'lg']),
  expressive: new Set(['xs', 'sm', 'md', 'lg']),
  mono: new Set(['xs', 'sm', 'md', 'lg']),
});
const TEXT_COLORS = new Set(['default', 'muted']);
const TEXT_ELEMENTS = new Set(['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'label']);

// An unslotted Text joins a context's default slot (ListBoxItem and MenuItem
// map it to the item label). Contexts with only named slots, such as field
// labels and descriptions, would throw, so it opts out of those instead.
function resolveTextSlot(context, slot) {
  if (slot !== undefined) return slot;
  return context?.slots && !(ARIA_DEFAULT_SLOT in context.slots) ? null : undefined;
}

function normalizeTextOption(value, allowed, option) {
  if (!allowed.has(value)) throw new TypeError(`Text ${option} must be one of: ${[...allowed].join(', ')}.`);
  return value;
}

/** Apply a canonical Mux typography role while keeping the native host and RAC slot contract. */
export const Text = React.forwardRef(function Text({
  variant = 'body',
  size = 'md',
  color = 'default',
  as = 'span',
  truncate = false,
  className,
  elementType: _elementType,
  ...props
}, ref) {
  const resolvedVariant = normalizeTextOption(variant, TEXT_VARIANTS, 'variant');
  const resolvedSize = normalizeTextOption(size, TEXT_SIZES[resolvedVariant], 'size');
  const resolvedColor = normalizeTextOption(color, TEXT_COLORS, 'color');
  const resolvedElement = normalizeTextOption(as, TEXT_ELEMENTS, 'as');
  const textContext = React.useContext(AriaTextContext);
  return h(AriaText, {
    ...props,
    ref,
    slot: resolveTextSlot(textContext, props.slot),
    elementType: resolvedElement,
    className: cx(
      'muxui-text',
      `muxui-text--${resolvedVariant}-${resolvedSize}`,
      resolvedColor !== 'default' && `muxui-text--${resolvedColor}`,
      truncate && 'muxui-text--truncate',
      className,
    ),
  });
});

Text.displayName = 'Text';
