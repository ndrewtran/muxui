import React from 'react';
import type { ComponentPropsWithoutRef, ForwardRefExoticComponent, ReactElement, RefAttributes } from 'react';
import {
  Text as AriaText,
  TextContext as AriaTextContext,
  DEFAULT_SLOT as ARIA_DEFAULT_SLOT,
} from 'react-aria-components';
import type { TextProps as AriaTextProps } from 'react-aria-components';
import { h, cx } from './part-utils.ts';

export type TextVariant = 'display' | 'heading' | 'title' | 'label' | 'body' | 'expressive' | 'mono';
export type TextSize = 'xs' | 'sm' | 'md' | 'lg';
export type TextColor = 'default' | 'muted';
export type TextElement = 'p' | 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'div' | 'label';

/** The variant and size a Text takes together: the display roles have no extra-small size. */
export type TextVisualProps =
  | { variant?: 'body'; size?: TextSize }
  | { variant: 'display' | 'heading' | 'title'; size?: Exclude<TextSize, 'xs'> }
  | { variant: 'label' | 'expressive' | 'mono'; size?: TextSize };

/**
 * The props Mux UI defines for Text; the catalog's web.react API is derived from this type (Decision 0031).
 * It is generic over the element Text renders, as the public type is, and the catalog records `as` at its
 * constraint. The public type states `variant` and `size` as the arms of TextVisualProps, which together
 * take every value these two take.
 */
type TextOwnProps<T extends TextElement = 'span'> = {
  /** The typographic role: its size and weight. */
  variant?: TextVariant;
  /** The size within the role. The display roles (display, heading, title) have no extra-small size. */
  size?: TextSize;
  /** The text colour: the default, or the muted tone. */
  color?: TextColor;
  /** The element Text renders. */
  as?: T;
  /** Cuts a line that does not fit short with an ellipsis. */
  truncate?: boolean;
};

export type TextProps<T extends TextElement = 'span'> = Omit<ComponentPropsWithoutRef<T>, 'as' | 'className' | 'color' | 'size' | 'variant'> & TextVisualProps & Pick<TextOwnProps<T>, 'as' | 'color' | 'truncate'> & {
  className?: string;
};

export interface TextComponent {
  <T extends TextElement = 'span'>(props: TextProps<T> & RefAttributes<HTMLElementTagNameMap[T]>): ReactElement | null;
}

const TEXT_VARIANTS: ReadonlySet<TextVariant> = new Set(['display', 'heading', 'title', 'label', 'body', 'expressive', 'mono']);
const TEXT_SIZES: Readonly<Record<TextVariant, ReadonlySet<TextSize>>> = Object.freeze({
  display: new Set<TextSize>(['sm', 'md', 'lg']),
  heading: new Set<TextSize>(['sm', 'md', 'lg']),
  title: new Set<TextSize>(['sm', 'md', 'lg']),
  label: new Set<TextSize>(['xs', 'sm', 'md', 'lg']),
  body: new Set<TextSize>(['xs', 'sm', 'md', 'lg']),
  expressive: new Set<TextSize>(['xs', 'sm', 'md', 'lg']),
  mono: new Set<TextSize>(['xs', 'sm', 'md', 'lg']),
});
const TEXT_COLORS: ReadonlySet<TextColor> = new Set(['default', 'muted']);
const TEXT_ELEMENTS: ReadonlySet<TextElement> = new Set(['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'label']);

// An unslotted Text joins a context's default slot (ListBoxItem and MenuItem
// map it to the item label). Contexts with only named slots, such as field
// labels and descriptions, would throw, so it opts out of those instead.
function resolveTextSlot(context: { slots?: Record<string | symbol, unknown> } | null | undefined, slot: string | undefined) {
  if (slot !== undefined) return slot;
  return context?.slots && !(ARIA_DEFAULT_SLOT in context.slots) ? null : undefined;
}

function normalizeTextOption<Value extends string>(value: string | undefined, allowed: ReadonlySet<Value>, option: string): Value {
  if (!allowed.has(value as Value)) throw new TypeError(`Text ${option} must be one of: ${[...allowed].join(', ')}.`);
  return value as Value;
}

// The props the function reads include RAC's implementation-only elementType, which it drops and the public type omits.
type TextRootProps = TextProps<TextElement> & { elementType?: unknown };

/** Apply a canonical Mux typography role while keeping the native host and RAC slot contract. */
const TextRoot: ForwardRefExoticComponent<TextRootProps & RefAttributes<HTMLElement>> = React.forwardRef<HTMLElement, TextRootProps>(function Text({
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
    ...(props as AriaTextProps),
    ref,
    // null opts out of a context's slots, which the props type of the attribute does not admit.
    slot: resolveTextSlot(textContext as Parameters<typeof resolveTextSlot>[0], props.slot) as AriaTextProps['slot'],
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

TextRoot.displayName = 'Text';

// The public type is a generic call signature, which a forwardRef component does not have.
export const Text: TextComponent = TextRoot as unknown as TextComponent;
