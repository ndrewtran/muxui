import React from 'react';
import {
  OverlayTriggerStateContext,
  Popover as AriaPopover,
  PopoverContext,
} from 'react-aria-components';
import { useMotionLifecycle } from './motion-components.mjs';

/**
 * RAC positioning and dismissal stay on the outer popover. The lifecycle
 * writes the independent `translate` channel there so the complete painted
 * surface moves and fades without replacing RAC's placement transform.
 */
export const PopoverMotion = /*#__PURE__*/ React.forwardRef(function PopoverMotion({
  children,
  className,
  style,
  placement,
  isOpen,
  defaultOpen,
  onOpenChange,
  triggerRef,
  ...props
}, ref) {
  const overlayState = React.useContext(OverlayTriggerStateContext);
  const popoverContext = React.useContext(PopoverContext);
  const contextOpen = overlayState?.isOpen ?? popoverContext?.isOpen;
  const contextTriggerRef = popoverContext?.triggerRef;
  const resolvedTriggerRef = triggerRef ?? contextTriggerRef;
  const controlledByProp = isOpen !== undefined;
  const hasDefaultOpen = defaultOpen !== undefined;
  const controlledByContext = contextOpen !== undefined && !hasDefaultOpen && !controlledByProp;
  const usesLocalState = controlledByProp || hasDefaultOpen || !controlledByContext;
  const [localOpen, setLocalOpen] = React.useState(Boolean(defaultOpen));
  const requestedOpen = controlledByProp
    ? Boolean(isOpen)
    : usesLocalState ? localOpen : Boolean(contextOpen);
  const [phase, setPhase] = React.useState({ open: requestedOpen, exiting: false });
  if (phase.open !== requestedOpen) setPhase({ open: requestedOpen, exiting: !requestedOpen });

  const lifecycleRef = useMotionLifecycle({
    isOpen: requestedOpen,
    placement: placement ?? popoverContext?.placement,
    triggerRef: resolvedTriggerRef,
    property: 'translate',
    onExitComplete: () => {
      setPhase((current) => current.open || !current.exiting ? current : { ...current, exiting: false });
    },
  });

  const handleOpenChange = React.useCallback((nextOpen) => {
    if (usesLocalState && !controlledByProp) setLocalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [controlledByProp, onOpenChange, usesLocalState]);

  const renderChildren = React.useCallback((renderProps) => {
    return typeof children === 'function' ? children(renderProps) : children;
  }, [children]);

  const setRef = React.useCallback((node) => {
    lifecycleRef(node);
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [lifecycleRef, ref]);

  const ariaProps = {
    ...props,
    ref: setRef,
    className,
    style,
    placement: placement ?? popoverContext?.placement,
    triggerRef: resolvedTriggerRef,
    onOpenChange: handleOpenChange,
    isExiting: Boolean(props.isExiting || (!requestedOpen && phase.exiting)),
    children: renderChildren,
  };
  if (controlledByProp) ariaProps.isOpen = isOpen;
  else if (usesLocalState) {
    ariaProps.isOpen = localOpen;
  }
  return React.createElement(AriaPopover, ariaProps);
});
