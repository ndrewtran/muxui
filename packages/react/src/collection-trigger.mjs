import React from 'react';
import { Button as AriaButton } from 'react-aria-components';

// RAC supplies trigger semantics while Mux preserves native button handlers and refs.
export const CollectionTrigger = React.forwardRef(function CollectionTrigger({ children, disabled, onActivate, className, ...nativeProps }, ref) {
  const eventProps = Object.fromEntries(Object.entries(nativeProps).filter(([key]) => /^on[A-Z]/u.test(key)));
  const attributes = Object.fromEntries(Object.entries(nativeProps).filter(([key]) => !/^on[A-Z]/u.test(key)));
  return React.createElement(AriaButton, {
    ...attributes, ref, isDisabled: disabled, className,
    onPress: onActivate ? (event) => { if (!disabled) onActivate({ type: 'activate', pointerType: event.pointerType, target: event.target }); } : undefined,
    render: (buttonProps) => {
      const merged = { ...nativeProps, ...buttonProps };
      for (const [name, handler] of Object.entries(eventProps)) {
        if (typeof handler !== 'function') continue;
        const internal = buttonProps[name];
        merged[name] = internal ? (event) => { handler(event); if (!event.defaultPrevented) internal(event); } : handler;
      }
      return React.createElement('button', merged);
    },
  }, children);
});
