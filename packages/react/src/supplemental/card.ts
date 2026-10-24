import React from 'react';
import type { ButtonHTMLAttributes, ForwardRefExoticComponent, HTMLAttributes, RefAttributes } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import type { ButtonProps as AriaButtonProps } from 'react-aria-components';
import { usePendingSubmitProps } from '../button.ts';
import { h, cx, dataState, nativePart, pressHandler } from './part-utils.ts';
import type { PartProps, SupplementalActivation } from './part-utils.ts';

export type CardVariant = 'elevated' | 'outlined' | 'filled';
export type CardPadding = 'sm' | 'md' | 'lg';

/**
 * The props Mux UI defines for Card.Root, the compound's root; the catalog's web.react API is derived from
 * this type (Decision 0031). Button owns the same two and more, in CardButtonOwnProps. Both are type literals,
 * not interfaces, so the public props types stay assignable to Record<string, unknown>, as they were before the move.
 */
type CardOwnProps = {
  /** The card's surface: raised, outlined or filled. */
  variant?: CardVariant;
  /** The space inside the card. */
  padding?: CardPadding;
};

/** The props Mux UI defines for Card.Button; its API is the button entry in the catalog's partApis. */
type CardButtonOwnProps = {
  /** The card's surface: raised, outlined or filled. */
  variant?: CardVariant;
  /** The space inside the card. */
  padding?: CardPadding;
  /** Marks the card as the chosen one, as aria-pressed. */
  selected?: boolean;
  /** Marks the card busy: it ignores presses until the work finishes. */
  pending?: boolean;
  /** Marks the card disabled. */
  disabled?: boolean;
  /** Called when the card is pressed. */
  onActivate?: (event: SupplementalActivation) => void;
};

export type CardRootProps = HTMLAttributes<HTMLDivElement> & CardOwnProps;
export type CardButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { className?: string } & CardButtonOwnProps;
export type CardHeaderProps = PartProps<HTMLDivElement>;
export type CardBodyProps = PartProps<HTMLDivElement>;
export type CardFooterProps = PartProps<HTMLDivElement>;

/* Card */
// A value outside the sets falls back to the default look, whatever the types say.
function cardProps<Props extends object>({ variant, padding, className, ...props }: Props & { variant: CardVariant; padding: CardPadding; className?: string }) {
  const safeVariant = ['elevated', 'outlined', 'filled'].includes(variant) ? variant : 'outlined';
  const safePadding = ['sm', 'md', 'lg'].includes(padding) ? padding : 'md';
  return { ...props, className: cx('muxui-card', `muxui-card--${safeVariant}`, `muxui-card--${safePadding}`, className) };
}

const CardRoot = /*#__PURE__*/ React.forwardRef<HTMLDivElement, CardRootProps>(function CardRoot({ variant = 'outlined', padding = 'md', ...props }, ref) {
  return h('div', { ...cardProps({ ...props, variant, padding }), ref });
});
const CardButton = /*#__PURE__*/ React.forwardRef<HTMLButtonElement, CardButtonProps>(function CardButton({ variant = 'outlined', padding = 'md', selected, disabled = false, pending = false, onActivate, ...props }, ref) {
  const pendingSubmitProps = usePendingSubmitProps(pending, props.type);
  // The native button attributes reach React Aria's Button, whose props type names only its own.
  return h(AriaButton, {
    ...cardProps({ ...(props as AriaButtonProps), variant, padding, className: cx('muxui-card--button', props.className) }),
    ref,
    isDisabled: disabled,
    isPending: pending,
    'aria-pressed': selected,
    ...{ 'data-selected': dataState(selected), 'data-pending': dataState(pending) },
    onPress: pressHandler(onActivate),
    render: (domProps) => h('button', { ...domProps, ...pendingSubmitProps }),
  });
});
const CardHeader = /*#__PURE__*/ React.forwardRef<HTMLDivElement, CardHeaderProps>(function CardHeader(props, ref) { return nativePart('div', 'muxui-card__header', props, ref); });
const CardBody = /*#__PURE__*/ React.forwardRef<HTMLDivElement, CardBodyProps>(function CardBody(props, ref) { return nativePart('div', 'muxui-card__body', props, ref); });
const CardFooter = /*#__PURE__*/ React.forwardRef<HTMLDivElement, CardFooterProps>(function CardFooter(props, ref) { return nativePart('div', 'muxui-card__footer', props, ref); });

export const Card: {
  Root: ForwardRefExoticComponent<CardRootProps & RefAttributes<HTMLDivElement>>;
  Button: ForwardRefExoticComponent<CardButtonProps & RefAttributes<HTMLButtonElement>>;
  Header: ForwardRefExoticComponent<PartProps<HTMLDivElement> & RefAttributes<HTMLDivElement>>;
  Body: ForwardRefExoticComponent<PartProps<HTMLDivElement> & RefAttributes<HTMLDivElement>>;
  Footer: ForwardRefExoticComponent<PartProps<HTMLDivElement> & RefAttributes<HTMLDivElement>>;
} = /*#__PURE__*/ Object.freeze({
  Root: CardRoot,
  Button: CardButton,
  Header: CardHeader,
  Body: CardBody,
  Footer: CardFooter,
});
