import React from 'react';
import { OverlayTriggerStateContext, PopoverContext } from 'react-aria-components';
import { AriaPopover } from './substrate.ts';
import { useMotionLifecycle } from './motion-components.mjs';

// Whether a popup started opening in the render under way: noted as one renders open for the first time since it last
// closed, and cleared once the work queued with that render is done. A Popover that mounts open later in the same render
// reads it, so that popup registers first (see PopupContent in overlays.ts).
let popupOpening = false;

/** Whether a popup started opening earlier in the render under way. */
export function isPopupOpening() {
  return popupOpening;
}

function notePopupOpening() {
  if (popupOpening) return;
  popupOpening = true;
  queueMicrotask(() => {
    popupOpening = false;
  });
}

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
  // Whether the popup was open when it last rendered to the page.
  const shown = React.useRef(false);
  if (requestedOpen && !shown.current) notePopupOpening();
  React.useEffect(() => {
    shown.current = requestedOpen;
  });

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
