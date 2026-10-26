import React from 'react';
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import { ButtonContext, useSlottedContext } from 'react-aria-components';
import { Button } from '../button.ts';
import type { ButtonActivationEvent, ButtonProps, ButtonSize, ButtonVariant } from '../button.ts';

/**
 * The props Mux UI defines for IconButton; the catalog's web.react API is derived
 * from this type (Decision 0031).
 * It is a type literal, not an interface, so the public props type stays assignable to
 * Record<string, unknown>, as it was before the move.
 */
type IconButtonOwnProps = {
  /** Applies the native disabled attribute: the IconButton is neither focusable nor activatable. */
  disabled?: boolean;
  /** Marks an action in flight: a static indicator replaces the icon, and the IconButton stays focusable and named but does not activate. */
  pending?: boolean;
  /** Button's visual recipe, chosen by where the icon sits and what it does. */
  variant?: ButtonVariant;
  /** The square control size. */
  size?: ButtonSize;
  /** Requests the IconButton's one immediate action. */
  onActivate?: (event: ButtonActivationEvent) => void;
};

// The required accessible name stays in the host part of the props: a native attribute
// IconButton checks, not a prop it defines.
type IconButtonName =
  | { 'aria-label': string; 'aria-labelledby'?: string }
  | { 'aria-label'?: string; 'aria-labelledby': string };

/** Supply an icon as children and at least one explicit accessible name. */
export type IconButtonProps = IconButtonOwnProps
  & Omit<ButtonProps, keyof IconButtonOwnProps | 'aria-label' | 'aria-labelledby' | 'showTextWhileLoading'>
  & IconButtonName;

/** An icon-only action with Button behavior and an explicit accessible name. */
export const IconButton: ForwardRefExoticComponent<IconButtonProps & RefAttributes<HTMLButtonElement>> = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({
  children,
  className,
  disabled,
  pending,
  variant = 'ghost',
  size = 'md',
  onActivate,
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
  // Button forwards data attributes to its <button>, though ButtonProps does not name them.
  const buttonProps = {
    ...props,
    ref,
    disabled,
    pending,
    variant,
    size,
    onActivate,
    className: ['muxui-icon-button', className].filter(Boolean).join(' '),
    'data-muxui-icon-button': '',
    showTextWhileLoading: false,
  };
  return React.createElement(Button, buttonProps, React.createElement('span', {
    className: 'muxui-icon-button__icon',
    'aria-hidden': true,
  }, children));
});

IconButton.displayName = 'IconButton';
