import React from 'react';
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  ForwardRefExoticComponent,
  MouseEvent,
  ReactNode,
  RefAttributes,
} from 'react';
import { Button as AriaButton } from 'react-aria-components';
import type { ButtonProps as AriaButtonProps, PressEvent } from 'react-aria-components';

export type ButtonPointerType = 'mouse' | 'pen' | 'touch' | 'keyboard' | 'virtual' | undefined;

/** What `onActivate` reports for one activation. */
export interface ButtonActivationEvent {
  readonly type: 'activate';
  readonly pointerType: ButtonPointerType;
  readonly target: HTMLButtonElement;
}

/**
 * The props Mux UI defines for Button; the catalog's web.react API is derived
 * from this interface (Decision 0031).
 */
export interface ButtonOwnProps {
  /** Applies the native disabled attribute: the Button is neither focusable nor activatable. */
  disabled?: boolean;
  /** Marks an action in flight: the Button shows a spinner, stays focusable, and does not activate. */
  pending?: boolean;
  /** Keeps the label visible beside the spinner while pending. */
  showTextWhileLoading?: boolean;
  /** The visual recipe, chosen by the action's emphasis and consequence. */
  variant?: 'primary' | 'neutral' | 'ghost' | 'danger' | 'danger-neutral' | 'danger-ghost' | 'inverse';
  /** The control size. */
  size?: 'sm' | 'md' | 'lg';
  /** Requests the Button's one immediate action. */
  onActivate?: (event: ButtonActivationEvent) => void;
}

/** Button's props: its own props and the native button attributes it passes through. */
export interface ButtonProps extends ButtonOwnProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className' | 'disabled' | 'onClick' | 'style'> {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

type ButtonVariant = NonNullable<ButtonOwnProps['variant']>;
type ButtonSize = NonNullable<ButtonOwnProps['size']>;

// Records keyed by the prop types, so a value added to a type must be added here too.
const BUTTON_VARIANTS: Readonly<Record<ButtonVariant, true>> = {
  primary: true, neutral: true, ghost: true, danger: true, 'danger-neutral': true, 'danger-ghost': true, inverse: true,
};
const BUTTON_SIZES: Readonly<Record<ButtonSize, true>> = { sm: true, md: true, lg: true };

const subscribeToNothing = () => () => {};

/**
 * DOM button props that keep a pending submit button from submitting its form, or `undefined`
 * when `pending` and `type` do not call for them. Spread them onto the rendered `<button>` of
 * a React Aria Button (Button and Card.Button) after its own DOM props.
 */
export function usePendingSubmitProps(pending: boolean | undefined, type: ButtonHTMLAttributes<HTMLButtonElement>['type']) {
  // React Aria renders a pending submit Button as type=button, but a form with one text field
  // still submits on Enter when it has no submit button. Keep type=submit so Enter clicks this
  // Button, and cancel that click along with any other click on it. A script's
  // form.requestSubmit(button) fires no click and is application code, so it is not blocked.
  // Server markup has no click handler until hydration, so a pending submit Button is natively
  // disabled until then: it cannot be clicked, and a disabled default button makes Enter submit
  // nothing. False while hydrating and true for client-only renders, so hydration finds the same markup.
  const hydrated = React.useSyncExternalStore(subscribeToNothing, () => true, () => false);
  if (!pending || type !== 'submit') return undefined;
  return {
    type: 'submit' as const,
    onClick: (event: MouseEvent<HTMLButtonElement>) => event.preventDefault(),
    ...(hydrated ? {} : { disabled: true }),
  };
}

// Untyped callers can pass anything; Object.hasOwn alone would coerce ['primary'] or a String object to a key.
function assertButtonOption(name: string, value: unknown, allowed: Readonly<Record<string, true>>) {
  if (typeof value !== 'string' || !Object.hasOwn(allowed, value)) {
    throw new TypeError(`Button ${name} must be one of: ${Object.keys(allowed).join(', ')}`);
  }
}

/**
 * Mux UI's Button is an immediate-action control. The React Aria primitive is
 * deliberately kept behind this boundary so the public package can replace
 * its substrate without changing the MuxUI contract.
 */
export const Button: ForwardRefExoticComponent<ButtonProps & RefAttributes<HTMLButtonElement>> = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  children,
  className,
  disabled,
  pending,
  showTextWhileLoading = false,
  variant = 'primary',
  size = 'md',
  onActivate,
  type = 'button',
  'aria-busy': ariaBusy,
  ...props
}, ref) {
  assertButtonOption('variant', variant, BUTTON_VARIANTS);
  assertButtonOption('size', size, BUTTON_SIZES);

  const handlePress = (event: PressEvent) => {
    const activation: ButtonActivationEvent = {
      type: 'activate',
      pointerType: event.pointerType,
      // React Aria presses on the rendered <button>.
      target: event.target as HTMLButtonElement,
    };
    onActivate?.(activation);
  };

  const pendingSubmitProps = usePendingSubmitProps(pending, type);

  const showPendingText = pending && showTextWhileLoading;
  const callerNamesButton = props['aria-label'] != null || props['aria-labelledby'] != null;
  const pendingContentLabelId = `muxui-button-label-${React.useId()}`;
  const labelPendingContent = pending && !showTextWhileLoading && !callerNamesButton;
  // Omit undefined state props so RAC slots can supply their own state; an explicit false still wins.
  const inheritedStateProps = {
    ...(disabled === undefined ? {} : { isDisabled: disabled }),
    ...(pending === undefined ? {} : { isPending: pending }),
  };
  const pendingAriaProps = pending === undefined && ariaBusy === undefined
    ? {}
    // A conditional, not pending || ...: extraction reads a fallback on an owned prop as an executed default.
    : { 'aria-busy': pending ? true : ariaBusy || undefined };
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
    // React Aria passes the native attributes it does not own through to the <button>; its
    // focus and keyboard handler types name Element where React's name HTMLButtonElement.
    ...(props as AriaButtonProps),
    ...inheritedStateProps,
    ref,
    type,
    className: ['muxui-button', className].filter(Boolean).join(' '),
    render: (domProps) => React.createElement('button', {
      ...domProps,
      ...(labelPendingContent && !callerNamesButton
        ? { 'aria-labelledby': pendingContentLabelId }
        : {}),
      'data-variant': variant,
      'data-size': size,
      ...pendingAriaProps,
      ...pendingSubmitProps,
    }),
    onPress: handlePress,
  }, content, spinner);
});

Button.displayName = 'Button';
