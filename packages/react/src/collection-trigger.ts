import React from 'react';
import type { ButtonHTMLAttributes, ForwardRefExoticComponent, ReactNode, RefAttributes, SyntheticEvent } from 'react';
import { AriaButton } from './substrate.ts';
import type { ButtonProps as AriaButtonProps } from 'react-aria-components';
import type { ButtonActivationEvent } from './button.ts';

/** The props a collection family's trigger takes: the native button attributes, a disabled flag, and `onActivate`. */
interface CollectionTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className' | 'disabled'> {
  children?: ReactNode;
  className?: string | undefined;
  disabled?: boolean | undefined;
  onActivate?: ((event: ButtonActivationEvent) => void) | undefined;
}

// RAC supplies trigger semantics while Mux preserves native button handlers and refs.
export const CollectionTrigger: ForwardRefExoticComponent<CollectionTriggerProps & RefAttributes<HTMLButtonElement>> = React.forwardRef<HTMLButtonElement, CollectionTriggerProps>(function CollectionTrigger({ children, disabled, onActivate, className, ...nativeProps }, ref) {
  const eventProps: Record<string, unknown> = Object.fromEntries(Object.entries(nativeProps).filter(([key]) => /^on[A-Z]/u.test(key)));
  const attributes = Object.fromEntries(Object.entries(nativeProps).filter(([key]) => !/^on[A-Z]/u.test(key)));
  return React.createElement(AriaButton, {
    // React Aria types its focus and keyboard handlers on Element where React's name HTMLButtonElement.
    ...(attributes as AriaButtonProps), ref, isDisabled: disabled, className,
    onPress: onActivate ? (event) => { if (!disabled) onActivate({ type: 'activate', pointerType: event.pointerType, target: event.target as HTMLButtonElement }); } : undefined,
    render: (buttonProps) => {
      const merged: Record<string, unknown> = { ...nativeProps, ...buttonProps };
      // React Aria's own handlers sit beside the native ones in its render props, which are an interface with no index signature.
      const internals = buttonProps as Record<string, unknown>;
      for (const [name, handler] of Object.entries(eventProps)) {
        if (typeof handler !== 'function') continue;
        const internal = internals[name];
        merged[name] = typeof internal === 'function'
          ? (event: SyntheticEvent) => { handler(event); if (!event.defaultPrevented) internal(event); }
          : handler;
      }
      return React.createElement('button', merged);
    },
  }, children);
});
