import React from 'react';
import XIcon from 'lucide-react/dist/esm/icons/x.mjs';
import { FocusScope } from 'react-aria/FocusScope';
import { mergeRefs } from 'react-aria/mergeRefs';
import { useInteractOutside } from 'react-aria/useInteractOutside';
import { Button as MuxUIButton } from './button.mjs';
import { overlayGeometry, normalizeBoolean, normalizeNonNegativeFinite } from './overlay-positioning.mjs';
import {
  ButtonContext as AriaButtonContext,
  DEFAULT_SLOT as ARIA_DEFAULT_SLOT,
  Dialog as AriaDialog,
  DialogContext as AriaDialogContext,
  DialogTrigger as AriaDialogTrigger,
  DropZone as AriaDropZone,
  FileTrigger as AriaFileTrigger,
  Heading as AriaHeading,
  ModalOverlay as AriaModalOverlay,
  OverlayTriggerStateContext as AriaOverlayTriggerStateContext,
  Popover as AriaPopover,
  PopoverContext as AriaPopoverContext,
  Pressable as AriaPressable,
  PreviewTrigger as AriaPreviewTrigger,
  Text as AriaText,
  Tooltip as AriaTooltip,
  TooltipContext as AriaTooltipContext,
  TooltipTrigger as AriaTooltipTrigger,
  UNSTABLE_Toast as AriaToast,
  UNSTABLE_ToastContent as AriaToastContent,
  UNSTABLE_ToastQueue,
  UNSTABLE_ToastRegion,
} from 'react-aria-components';
import { DialogMotion } from './dialog-motion.mjs';
import { PopoverMotion } from './popover-motion.mjs';
import { observeReducedMotion } from './motion.mjs';
import { useMotionLayout, useMotionLifecycle } from './motion-components.mjs';
import { IconButton } from './supplemental/icon-button.mjs';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

function classNames(base, className) {
  return [base, className].filter(Boolean).join(' ');
}

function normalizeMaxVisible(value) {
  const normalized = Math.floor(normalizeNonNegativeFinite(value, 5, 'Toast maxVisible'));
  if (normalized < 1) throw new TypeError('Toast maxVisible must be at least 1');
  return normalized;
}

// setTimeout converts delays above 2^31 - 1 ms to an immediate timeout.
// 2 ** 31 - 1, the setTimeout maximum, as a literal so the module does no import-time work.
const MAX_TIMEOUT = 2147483647;

function normalizeToastDuration(value) {
  const normalized = normalizeNonNegativeFinite(value, 5000, 'Toast duration');
  if (normalized > MAX_TIMEOUT) throw new TypeError(`Toast duration must not exceed ${MAX_TIMEOUT} ms`);
  return normalized;
}

function hasRenderableLabel(value) {
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return true;
  if (value === undefined || value === null || typeof value === 'boolean') return false;
  if (Array.isArray(value)) return value.some(hasRenderableLabel);
  if (React.isValidElement(value)) {
    if (value.type === React.Fragment) return hasRenderableLabel(value.props.children);
    // Custom React elements are opaque until React renders them; browser accessibility validation owns their output.
    if (typeof value.type !== 'string') return true;
    if (hasAccessibleName(value.props['aria-label']) || hasAccessibleName(value.props['aria-labelledby']) || hasAccessibleName(value.props.title)) return true;
    return hasRenderableLabel(value.props.children);
  }
  return true;
}

function hasAccessibleName(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function fileList(files) {
  return files ? [...files] : [];
}

function normalizeDropItem(item) {
  const normalized = { kind: item.kind };
  if (item.name !== undefined) normalized.name = item.name;
  if (item.type !== undefined) normalized.type = item.type;
  if (item.types !== undefined) normalized.types = new Set(item.types);
  if (typeof item.getFile === 'function') normalized.getFile = item.getFile.bind(item);
  if (typeof item.getText === 'function') normalized.getText = item.getText.bind(item);
  if (typeof item.getEntries === 'function') {
    normalized.getEntries = async function* getEntries() {
      for await (const child of item.getEntries()) yield normalizeDropItem(child);
    };
  }
  return normalized;
}

function normalizeDropEvent(event) {
  return {
    type: 'drop',
    x: event.x,
    y: event.y,
    dropOperation: event.dropOperation,
    items: (event.items ?? []).map(normalizeDropItem),
  };
}

function composeEventHandlers(first, second) {
  if (!first) return second;
  if (!second) return first;
  return (event) => {
    first(event);
    if (!event.defaultPrevented) second(event);
  };
}

function pressableTrigger(trigger, disabled = false, className) {
  if (!React.isValidElement(trigger)) return trigger;
  const normalizedTrigger = className
    ? React.cloneElement(trigger, { className: classNames(trigger.props.className, className) })
    : trigger;
  // RAC trigger components (including MuxUI Button) consume DialogTrigger's
  // PressResponder context directly. Wrapping them in a second Pressable
  // shadows that context and prevents keyboard-triggered opening.
  if (typeof trigger.type !== 'string') return normalizedTrigger;
  return React.createElement(AriaPressable, { isDisabled: disabled }, normalizedTrigger);
}

/**
 * MuxUI owns the public callback shape while RAC owns drop, clipboard, hover, and focus semantics.
 */
export const DropZone = React.forwardRef(function DropZone({
  children = 'Drop files here',
  disabled = false,
  onDrop,
  onActivate,
  className,
  ...props
}, ref) {
  const disabledRef = React.useRef(disabled);
  disabledRef.current = disabled;
  const handleDrop = React.useCallback((event) => {
    if (disabledRef.current) return;
    onDrop?.(normalizeDropEvent(event));
  }, [onDrop]);
  const handleActivate = React.useCallback((event) => {
    // RAC's visually hidden drop button is the root's only own control; clicks
    // from consumer content, such as a nested FileTrigger, are not activation.
    const dropButton = event.currentTarget.firstElementChild?.firstElementChild;
    if (event.target !== dropButton || dropButton.tagName !== 'BUTTON' || disabledRef.current) return;
    onActivate?.({ type: 'activate', x: event.clientX ?? 0, y: event.clientY ?? 0 });
  }, [onActivate]);
  // RAC sets data-disabled on the role-less root; aria-disabled is not valid there.
  return React.createElement(AriaDropZone, {
    ...props,
    ref,
    isDisabled: disabled,
    onDrop: handleDrop,
    onClickCapture: handleActivate,
    className: classNames('muxui-drop-zone', className),
  }, children);
});

DropZone.displayName = 'DropZone';

/** RAC resets the native input before each press, preserving same-file selection behavior. */
export const FileTrigger = React.forwardRef(function FileTrigger({
  children = 'Choose files',
  acceptedFileTypes,
  allowsMultiple = false,
  acceptDirectory = false,
  defaultCamera,
  disabled = false,
  onSelect,
  className,
  ...props
}, ref) {
  const disabledRef = React.useRef(disabled);
  disabledRef.current = disabled;
  const trigger = React.isValidElement(children)
    ? React.cloneElement(children, { className: classNames('muxui-file-trigger', classNames(children.props.className, className)), disabled: disabled || children.props.disabled, 'aria-disabled': disabled || undefined })
    : React.createElement(MuxUIButton, { className: classNames('muxui-file-trigger', className), disabled }, children);
  return React.createElement(AriaFileTrigger, {
    ...props,
    ref,
    acceptedFileTypes,
    allowsMultiple,
    defaultCamera,
    acceptDirectory,
    onSelect: (files) => {
      if (disabledRef.current) return;
      onSelect?.(fileList(files));
    },
  }, pressableTrigger(trigger, disabled));
});

FileTrigger.displayName = 'FileTrigger';

function DialogContent({ title, description, actions, children, ariaLabel, dismissable, explicitClose, className, panelClassName, titleClassName, descriptionClassName, contentClassName, actionsClassName, closeClassName, contentRef, 'aria-describedby': ariaDescribedby, ...props }) {
  const descriptionId = React.useId();
  const describedby = [ariaDescribedby, description !== undefined && description !== null ? descriptionId : undefined].filter(Boolean).join(' ') || undefined;
  const triggerState = React.useContext(AriaOverlayTriggerStateContext);
  // RAC routes slot="close" buttons through this state's close; those
  // explicit actions still close a non-dismissable Dialog.
  const explicitCloseState = React.useMemo(() => triggerState && { ...triggerState, close: explicitClose }, [triggerState, explicitClose]);
  const dialog = React.createElement(AriaDialog, { ...props, ref: contentRef, className: classNames(classNames('muxui-dialog', className), panelClassName), 'aria-label': ariaLabel, 'aria-describedby': describedby },
    hasRenderableLabel(title) ? React.createElement(AriaHeading, { slot: 'title', className: classNames('muxui-dialog-title', titleClassName) }, title) : null,
    description !== undefined && description !== null ? React.createElement('p', { id: descriptionId, className: classNames('muxui-dialog-description', descriptionClassName) }, description) : null,
    React.createElement('div', { className: classNames('muxui-dialog-content', contentClassName) }, children),
    actions !== undefined && actions !== null ? React.createElement('div', { className: classNames('muxui-dialog-actions', actionsClassName) }, actions) : null,
    dismissable ? React.createElement(IconButton, { slot: 'close', size: 'sm', className: classNames('muxui-dialog-close', closeClassName), 'aria-label': 'Close dialog' }, React.createElement(XIcon, { 'aria-hidden': 'true', focusable: 'false', size: 16 })) : null);
  return React.createElement(AriaOverlayTriggerStateContext.Provider, { value: explicitCloseState }, dialog);
}

function DialogOverlay({ dismissable, backdropClassName, children, state, insideTrigger, originRef }) {
  const isOpen = Boolean(state.isOpen);
  const [phase, setPhase] = React.useState({ open: isOpen, exiting: false });
  if (phase.open !== isOpen) setPhase({ open: isOpen, exiting: !isOpen });
  const backdropRef = React.useRef(null);

  const releaseExit = React.useCallback(() => {
    setPhase((current) => current.open || !current.exiting ? current : { ...current, exiting: false });
  }, []);
  const markReduced = React.useCallback((reduced) => {
    const backdrop = backdropRef.current;
    if (!backdrop) return;
    backdrop.toggleAttribute('data-muxui-dialog-reduced', reduced);
    if (!reduced || typeof backdrop.getAnimations !== 'function') return;
    const CSSTransition = backdrop.ownerDocument.defaultView?.CSSTransition;
    if (!CSSTransition) return;
    for (const animation of backdrop.getAnimations()) {
      if (animation instanceof CSSTransition && animation.transitionProperty === 'opacity') animation.cancel();
    }
  }, []);
  const overlayProps = {
    ref: backdropRef,
    isDismissable: dismissable,
    isKeyboardDismissDisabled: !dismissable,
    className: classNames('muxui-dialog-backdrop', backdropClassName),
    isExiting: !isOpen && phase.exiting,
  };
  if (!insideTrigger) {
    overlayProps.isOpen = isOpen;
    overlayProps.onOpenChange = state.onOpenChange;
  }
  return React.createElement(AriaModalOverlay, overlayProps,
    React.createElement(DialogMotion, { originRef, onExitComplete: releaseExit, onReducedChange: markReduced }, children));
}

function useDialogTriggerState({ open, defaultOpen, dismissable, onOpenChange }) {
  const controlled = open !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const close = React.useCallback(() => {
    if (!controlled) setUncontrolledOpen(false);
    onOpenChange?.(false);
  }, [controlled, onOpenChange]);
  // RAC sends Escape, outside press, hidden dismiss buttons, and trigger
  // toggles here; dismissable false rejects those accidental close requests.
  const handleOpenChange = React.useCallback((nextOpen) => {
    if (!nextOpen) {
      if (dismissable) close();
      return;
    }
    if (!controlled) setUncontrolledOpen(true);
    onOpenChange?.(true);
  }, [close, controlled, dismissable, onOpenChange]);
  return {
    isOpen: controlled ? open : uncontrolledOpen,
    onOpenChange: handleOpenChange,
    close,
  };
}

/** RAC Modal/ModalOverlay provide topmost overlay arbitration, inertness, focus scope, and portal lifecycle. */
export const Dialog = /*#__PURE__*/ (() => {
  const component = React.forwardRef(function Dialog({
  children,
  title,
  open,
  defaultOpen = false,
  dismissable = true,
  description,
  actions,
  backdropClassName,
  panelClassName,
  titleClassName,
  descriptionClassName,
  contentClassName,
  actionsClassName,
  closeClassName,
  trigger,
  onOpenChange,
  className,
  'aria-label': ariaLabel,
  ...props
}, ref) {
  const hasTitle = hasRenderableLabel(title);
  if (!hasTitle && !hasAccessibleName(ariaLabel) && !hasAccessibleName(props['aria-labelledby'])) throw new Error('Dialog requires a title or accessible name');
  const triggerState = useDialogTriggerState({ open, defaultOpen, dismissable, onOpenChange });
  const hasTrigger = React.isValidElement(trigger);
  const motionOriginRef = React.useRef(null);
  const content = React.createElement(DialogOverlay, { dismissable, backdropClassName, state: triggerState, insideTrigger: hasTrigger, originRef: motionOriginRef },
    React.createElement(DialogContent, { ...props, contentRef: ref, title, description, actions, ariaLabel, dismissable, explicitClose: triggerState.close, className, panelClassName, titleClassName, descriptionClassName, contentClassName, actionsClassName, closeClassName }, children));
  if (hasTrigger) {
    return React.createElement(AriaDialogTrigger, { isOpen: triggerState.isOpen, onOpenChange: triggerState.onOpenChange }, pressableTrigger(trigger, false, 'muxui-dialog-trigger'), content);
  }
  return React.createElement(React.Fragment, null,
    React.createElement('span', { ref: motionOriginRef, hidden: true, 'aria-hidden': 'true' }),
    content);
  });
  component.displayName = 'Dialog';
  return component;
})();

function PopoverSurface({ modal, children, onPointerDownCapture, ...props }) {
  const surfaceRef = React.useRef(null);
  React.useEffect(() => {
    const surface = surfaceRef.current;
    if (modal && surface && !surface.contains(surface.ownerDocument.activeElement)) {
      surface.focus({ preventScroll: true });
    }
  }, [modal]);
  // A stable scope releases containment without resetting consumer content.
  // The enclosing RAC Popover remains the focus-restoration owner.
  return React.createElement(FocusScope, { contain: modal },
    React.createElement('section', { ...props, ref: surfaceRef, role: 'dialog', tabIndex: -1, onPointerDownCapture }, children));
}

const PopupContent = /*#__PURE__*/ React.forwardRef(function PopupContent({ children, className, geometry, dismissable, anchorRef, modal = true, onDismissOutside, explicitClose, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
  const dialogContext = React.useContext(AriaDialogContext);
  const triggerRef = React.useContext(AriaPopoverContext)?.triggerRef;
  const positionerRef = React.useRef(null);
  const setRef = React.useMemo(() => mergeRefs(positionerRef, ref), [ref]);
  // RAC never dismisses a non-modal popover on outside press. Presses inside
  // this popover's React tree, including portaled descendants, are not outside;
  // trigger presses are left to the trigger's own toggle.
  const pressedInsideRef = React.useRef(false);
  // Like RAC Dialog, a slot="close" button in the content closes the popover,
  // even when dismissable is false; it also stops an enclosing overlay's close
  // slot from leaking in.
  const buttonSlots = React.useMemo(() => ({ slots: { [ARIA_DEFAULT_SLOT]: {}, close: { onPress: explicitClose } } }), [explicitClose]);
  useInteractOutside({
    ref: positionerRef,
    isDisabled: !onDismissOutside,
    onInteractOutsideStart: () => {
      pressedInsideRef.current = false;
    },
    onInteractOutside: (event) => {
      if (pressedInsideRef.current || triggerRef?.current?.contains(event.target)) return;
      onDismissOutside?.();
    },
  });
  return React.createElement(PopoverMotion, {
    ...props,
    ref: setRef,
    triggerRef: anchorRef,
    placement: geometry.placement,
    offset: geometry.offset,
    crossOffset: geometry.crossOffset,
    shouldFlip: geometry.shouldFlip,
    containerPadding: geometry.containerPadding,
    isNonModal: !modal,
    'data-modal': modal,
    className: 'muxui-popover-positioner',
    isKeyboardDismissDisabled: !dismissable,
    shouldCloseOnInteractOutside: dismissable ? undefined : () => false,
  }, React.createElement(PopoverSurface, {
    modal,
    // Capture phase: RAC's usePress stops pointerdown propagation.
    onPointerDownCapture: () => {
      pressedInsideRef.current = true;
    },
    id: dialogContext?.id,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
    className: classNames('muxui-popover', className),
  }, React.createElement(AriaButtonContext.Provider, { value: buttonSlots }, children)));
});

/** RAC Popover owns positioning and dismissal; FocusScope controls optional focus containment. */
export const Popover = /*#__PURE__*/ React.forwardRef(function Popover({
  children,
  trigger,
  open,
  defaultOpen = false,
  dismissable = true,
  placement = 'bottom',
  offset,
  crossOffset,
  shouldFlip,
  containerPadding,
  anchorRef,
  modal = true,
  onOpenChange,
  className,
  ...props
}, ref) {
  if (!React.isValidElement(trigger)) throw new Error('Popover requires a focusable React element as trigger');
  if (!hasAccessibleName(props['aria-label']) && !hasAccessibleName(props['aria-labelledby'])) throw new Error('Popover requires an accessible name');
  const geometry = overlayGeometry({ placement, offset, crossOffset, shouldFlip, containerPadding }, {
    placement: 'bottom',
    offset: 8,
    crossOffset: 0,
    shouldFlip: true,
    containerPadding: 12,
  }, 'Popover');
  const normalizedModal = normalizeBoolean(modal, true, 'Popover modal');
  const triggerState = useDialogTriggerState({ open, defaultOpen, dismissable, onOpenChange });
  // Focus stays on the trigger of a non-modal popover, outside RAC's Escape handling.
  const dismissNonModal = triggerState.isOpen && !normalizedModal && dismissable ? triggerState.close : undefined;
  const onTriggerKeyDown = (event) => {
    if (event.key !== 'Escape' || !dismissNonModal) return;
    event.preventDefault();
    event.stopPropagation();
    dismissNonModal();
  };
  const dismissibleTrigger = React.cloneElement(trigger, { onKeyDown: composeEventHandlers(trigger.props.onKeyDown, onTriggerKeyDown) });
  const content = React.createElement(PopupContent, { ...props, ref, geometry, className, dismissable, anchorRef, modal: normalizedModal, onDismissOutside: dismissNonModal, explicitClose: triggerState.close }, children);
  return React.createElement(AriaDialogTrigger, { isOpen: triggerState.isOpen, onOpenChange: triggerState.onOpenChange }, pressableTrigger(dismissibleTrigger, false, 'muxui-overlay-pop-trigger'), content);
});

function useDisabledTimedOverlay({ disabled, open, defaultOpen, onOpenChange }) {
  const controlled = open !== undefined;
  const disabledRef = React.useRef(disabled);
  const openRef = React.useRef(controlled ? open === true : defaultOpen);
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(controlled || disabled ? false : defaultOpen);
  const pendingRef = React.useRef(false);
  // Initial disabled state masks the trigger without representing a transition.
  const previousDisabledRef = React.useRef(disabled);
  const suppressStaleOpenRef = React.useRef(false);
  disabledRef.current = disabled;
  if (controlled) openRef.current = open === true;

  const markPending = React.useCallback(() => {
    if (!disabledRef.current) {
      pendingRef.current = true;
      suppressStaleOpenRef.current = false;
    }
  }, []);
  const clearPending = React.useCallback(() => {
    pendingRef.current = false;
  }, []);
  const handleOpenChange = React.useCallback((nextOpen) => {
    if (disabledRef.current) return;
    if (nextOpen && suppressStaleOpenRef.current && !pendingRef.current) {
      suppressStaleOpenRef.current = false;
      return;
    }
    suppressStaleOpenRef.current = false;
    openRef.current = nextOpen;
    if (!nextOpen) pendingRef.current = false;
    if (!controlled) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [controlled, onOpenChange]);

  React.useEffect(() => {
    const wasDisabled = previousDisabledRef.current;
    if (disabled && !wasDisabled) {
      const wasOpen = controlled ? open === true : openRef.current;
      const shouldRequestClose = wasOpen || pendingRef.current;
      openRef.current = false;
      pendingRef.current = false;
      suppressStaleOpenRef.current = true;
      if (!controlled) setUncontrolledOpen(false);
      if (shouldRequestClose) onOpenChange?.(false);
    } else if (!disabled && wasDisabled) {
      // The adapter-owned uncontrolled state remains closed after a disable cycle.
      pendingRef.current = false;
    }
    previousDisabledRef.current = disabled;
  }, [controlled, disabled, onOpenChange, open]);

  return {
    controlled,
    disabledRef,
    isOpen: disabled ? false : controlled ? open === true : uncontrolledOpen,
    markPending,
    clearPending,
    handleOpenChange,
  };
}

// Disabling a timed overlay only suppresses the overlay; the consumer's
// trigger keeps working, so it is never marked disabled.
function overlayTrigger(trigger, { disabled, className, markPending, clearPending }) {
  if (!React.isValidElement(trigger)) return trigger;
  return React.cloneElement(trigger, {
    className: classNames(trigger.props.className, className),
    onPointerEnter: composeEventHandlers(trigger.props.onPointerEnter, disabled ? undefined : markPending),
    onPointerDown: composeEventHandlers(trigger.props.onPointerDown, disabled ? undefined : markPending),
    onMouseEnter: composeEventHandlers(trigger.props.onMouseEnter, disabled ? undefined : markPending),
    onTouchStart: composeEventHandlers(trigger.props.onTouchStart, disabled ? undefined : markPending),
    onFocus: composeEventHandlers(trigger.props.onFocus, disabled ? undefined : markPending),
    onKeyDown: composeEventHandlers(trigger.props.onKeyDown, disabled ? undefined : markPending),
    onPointerLeave: composeEventHandlers(trigger.props.onPointerLeave, clearPending),
    onMouseLeave: composeEventHandlers(trigger.props.onMouseLeave, clearPending),
    onBlur: composeEventHandlers(trigger.props.onBlur, clearPending),
  });
}

/** RAC PreviewTrigger owns long press, warmup/cooldown timers, focus, Escape, and safe-area positioning. */
export const PreviewTrigger = React.forwardRef(function PreviewTrigger({
  children,
  trigger,
  delay = 600,
  closeDelay = 200,
  open,
  defaultOpen = false,
  disabled = false,
  onOpenChange,
  placement = 'top',
  offset,
  crossOffset,
  shouldFlip,
  containerPadding,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  ...props
}, ref) {
  if (!React.isValidElement(trigger)) throw new Error('PreviewTrigger requires a focusable React element as trigger');
  if (!hasAccessibleName(ariaLabel) && !hasAccessibleName(ariaLabelledby)) throw new Error('PreviewTrigger requires an accessible name');
  const normalizedDelay = normalizeNonNegativeFinite(delay, 600, 'PreviewTrigger delay');
  const normalizedCloseDelay = normalizeNonNegativeFinite(closeDelay, 200, 'PreviewTrigger closeDelay');
  const geometry = overlayGeometry({ placement, offset, crossOffset, shouldFlip, containerPadding }, {
    placement: 'top',
    offset: 8,
    crossOffset: 0,
    shouldFlip: true,
    containerPadding: 12,
  }, 'PreviewTrigger');
  const adapter = useDisabledTimedOverlay({ disabled, open, defaultOpen, onOpenChange });
  const normalizedTrigger = overlayTrigger(trigger, { disabled, className: undefined, markPending: adapter.markPending, clearPending: adapter.clearPending });
  return React.createElement(AriaPreviewTrigger, {
    delay: normalizedDelay,
    closeDelay: normalizedCloseDelay,
    isOpen: adapter.isOpen,
    onOpenChange: adapter.handleOpenChange,
  },
  pressableTrigger(normalizedTrigger),
  React.createElement(AriaPopover, {
    ...props,
    ref,
    isNonModal: true,
    trigger: 'PreviewTrigger',
    placement: geometry.placement,
    offset: geometry.offset,
    crossOffset: geometry.crossOffset,
    shouldFlip: geometry.shouldFlip,
    containerPadding: geometry.containerPadding,
    className: classNames('muxui-preview-trigger', className),
    // RAC names its own role="dialog" popover without auto-focusing it, so
    // focus stays on the trigger until Tab moves into the preview.
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  }, React.createElement('div', { className: 'muxui-preview-content' }, children)));
});

PreviewTrigger.displayName = 'PreviewTrigger';

const TooltipMotion = React.forwardRef(function TooltipMotion({ children, triggerRef: requestedTriggerRef, ...props }, ref) {
  const triggerContext = React.useContext(AriaTooltipContext);
  const triggerRef = requestedTriggerRef ?? triggerContext?.triggerRef;
  const reducedMotionTriggerRef = triggerContext?.triggerRef ?? triggerRef;
  const [node, setNode] = React.useState(null);
  const setRef = React.useMemo(() => mergeRefs(setNode, ref), [ref]);

  useIsomorphicLayoutEffect(() => {
    if (!node || node.nodeType !== 1 || !node.isConnected) return undefined;
    const settle = (reduced) => {
      node.toggleAttribute('data-muxui-motion-reduced', reduced);
      if (reduced && typeof node.getAnimations === 'function') {
        node.getAnimations().forEach((animation) => animation.cancel());
      }
    };
    const disconnect = observeReducedMotion(node, reducedMotionTriggerRef?.current, settle);
    return () => {
      disconnect();
      node.removeAttribute('data-muxui-motion-reduced');
    };
  }, [node, reducedMotionTriggerRef]);

  return React.createElement(AriaTooltip, {
    ...props,
    ref: setRef,
    triggerRef,
  }, children);
});

/** RAC TooltipTrigger owns global hover/focus timing and keyboard modality semantics. */
export const Tooltip = React.forwardRef(function Tooltip({
  content,
  trigger,
  delay = 500,
  closeDelay = 0,
  placement = 'top',
  offset,
  crossOffset,
  shouldFlip,
  containerPadding,
  anchorRef,
  open,
  defaultOpen = false,
  disabled = false,
  onOpenChange,
  className,
  ...props
}, ref) {
  if (!React.isValidElement(trigger)) throw new Error('Tooltip requires a focusable React element as trigger');
  if (!hasRenderableLabel(content)) throw new Error('Tooltip requires content');
  const normalizedDelay = normalizeNonNegativeFinite(delay, 500, 'Tooltip delay');
  const normalizedCloseDelay = normalizeNonNegativeFinite(closeDelay, 0, 'Tooltip closeDelay');
  const geometry = overlayGeometry({ placement, offset, crossOffset, shouldFlip, containerPadding }, {
    placement: 'top',
    offset: 0,
    crossOffset: 0,
    shouldFlip: true,
    containerPadding: 12,
  }, 'Tooltip');
  const adapter = useDisabledTimedOverlay({ disabled, open, defaultOpen, onOpenChange });
  const normalizedTrigger = overlayTrigger(trigger, { disabled, className: undefined, markPending: adapter.markPending, clearPending: adapter.clearPending });
  return React.createElement(AriaTooltipTrigger, {
    delay: normalizedDelay,
    closeDelay: normalizedCloseDelay,
    isOpen: adapter.isOpen,
    onOpenChange: adapter.handleOpenChange,
  }, pressableTrigger(normalizedTrigger), React.createElement(TooltipMotion, {
    ...props,
    ref,
    triggerRef: anchorRef,
    placement: geometry.placement,
    offset: geometry.offset,
    crossOffset: geometry.crossOffset,
    shouldFlip: geometry.shouldFlip,
    containerPadding: geometry.containerPadding,
    className: classNames('muxui-tooltip', className),
  }, content));
});

Tooltip.displayName = 'Tooltip';

const ToastContext = React.createContext(null);
const TOAST_FALLBACK_TITLE = 'Notification';
const TOAST_PLACEMENTS = new Set(['top-start', 'top-end', 'bottom-start', 'bottom-end']);

function createAnimatedToastQueue(queue, closingKeys) {
  let baseSnapshot = [...queue.visibleToasts];
  let snapshot = baseSnapshot;
  const retained = new Map();
  const skipRetention = new Set();
  const listeners = new Set();
  let suppressRetention = false;
  // Timers pause while the region is hovered or focused and while a toast
  // enters. Resume only a stopped timer once neither applies: RAC's Timer
  // starts a second, unpausable timeout if resumed while running.
  let regionPaused = false;
  const entryHolds = new Set();
  const resumeTimer = (record) => {
    if (record?.timer && record.timer.timerId == null && !regionPaused && !entryHolds.has(record.key)) record.timer.resume();
  };
  const visibleRecord = (key) => queue.visibleToasts.find((toast) => toast.key === key);
  const sameRecords = (first, second) => first.length === second.length && first.every((record, index) => record === second[index]);
  const rebuild = () => {
    const nextSnapshot = [...baseSnapshot];
    [...retained.values()]
      .sort((first, second) => first.index - second.index || first.sequence - second.sequence)
      .forEach(({ record, index }) => {
        nextSnapshot.splice(Math.min(index, nextSnapshot.length), 0, record);
      });
    if (sameRecords(snapshot, nextSnapshot)) return;
    snapshot = nextSnapshot;
    listeners.forEach((listener) => listener());
  };
  const onQueueChange = () => {
    const nextBase = [...queue.visibleToasts];
    const nextKeys = new Set(nextBase.map((toast) => toast.key));
    for (const [index, record] of baseSnapshot.entries()) {
      if (nextKeys.has(record.key)) continue;
      // A visible record can leave the base snapshot because a newer toast
      // displaced it into RAC's private queue. Retain only records whose
      // queue-owned onClose callback marked an actual dismissal.
      if (suppressRetention || skipRetention.delete(record.key) || !closingKeys.delete(record.key)) continue;
      retained.set(record.key, { record: { ...record, isExiting: true }, index, sequence: retained.size });
    }
    for (const key of nextKeys) retained.delete(key);
    baseSnapshot = nextBase;
    rebuild();
  };
  queue.subscribe(onQueueChange);
  const animatedQueue = {
    get visibleToasts() {
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    add(content, options) {
      return queue.add(content, options);
    },
    close(key) {
      if (retained.has(key)) return;
      const wasVisible = baseSnapshot.some((record) => record.key === key);
      queue.visibleToasts.find((toast) => toast.key === key)?.timer?.pause();
      queue.close(key);
      if (!wasVisible) closingKeys.delete(key);
    },
    commitClose(key) {
      if (!retained.delete(key)) return;
      rebuild();
    },
    dispose(key, settle = true) {
      if (settle) return animatedQueue.close(key);
      skipRetention.add(key);
      retained.delete(key);
      const wasVisible = baseSnapshot.some((record) => record.key === key);
      queue.close(key);
      skipRetention.delete(key);
      if (!wasVisible) closingKeys.delete(key);
      rebuild();
    },
    holdTimer(key) {
      entryHolds.add(key);
      visibleRecord(key)?.timer?.pause();
    },
    releaseTimer(key) {
      if (entryHolds.delete(key)) resumeTimer(visibleRecord(key));
    },
    pauseAll() {
      regionPaused = true;
      queue.pauseAll();
    },
    resumeAll() {
      regionPaused = false;
      queue.visibleToasts.forEach(resumeTimer);
    },
    clear() {
      suppressRetention = true;
      retained.clear();
      closingKeys.clear();
      queue.clear();
      suppressRetention = false;
      rebuild();
    },
  };
  return animatedQueue;
}

// Exiting toasts become inert, which drops focus to the body. Move focus out
// first: keyboard users go to the next (else previous) toast, pointer users
// and the last toast return to the element focused before the region.
function moveFocusFromExitingToast(node, returnFocus) {
  const active = node.ownerDocument.activeElement;
  if (!active || !node.contains(active)) return;
  const region = node.closest('.muxui-toast-region');
  const remaining = region ? [...region.querySelectorAll('.muxui-toast:not([data-muxui-toast-exiting])')] : [];
  const next = remaining.find((candidate) => node.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING) ?? remaining.at(-1);
  const target = active.matches(':focus-visible') && next ? next : returnFocus;
  if (target?.isConnected) target.focus({ preventScroll: true });
  else active.blur();
}

function ToastView({ toast, queue, placement, layoutVersion, onExitComplete, originRef, returnFocusRef }) {
  const value = toast.content;
  const hasTitle = hasRenderableLabel(value.title);
  const nodeRef = React.useRef(null);
  const entryFinishedRef = React.useRef(false);
  const finishEntry = React.useCallback(() => {
    entryFinishedRef.current = true;
    queue.releaseTimer(toast.key);
  }, [queue, toast.key]);
  const lifecycleRef = useMotionLifecycle({
    isOpen: !toast.isExiting,
    placement: placement.startsWith('bottom') ? 'bottom' : 'top',
    triggerRef: originRef,
    property: 'transform',
    onEntryComplete: finishEntry,
    onExitComplete: () => onExitComplete(toast.key),
  });
  React.useEffect(() => {
    if (toast.isExiting || !toast.timer || entryFinishedRef.current) return undefined;
    queue.holdTimer(toast.key);
    return () => queue.releaseTimer(toast.key);
  }, [queue, toast.isExiting, toast.key, toast.timer]);
  useIsomorphicLayoutEffect(() => {
    if (toast.isExiting && nodeRef.current) moveFocusFromExitingToast(nodeRef.current, returnFocusRef.current);
  }, [toast.isExiting, returnFocusRef]);
  useMotionLayout(nodeRef, layoutVersion, originRef);
  const setRef = React.useCallback((node) => {
    nodeRef.current = node;
    lifecycleRef(node);
  }, [lifecycleRef]);
  return React.createElement(AriaToast, { ref: setRef, toast, className: classNames('muxui-toast', value.className), 'data-variant': value.variant, 'data-muxui-toast-exiting': toast.isExiting || undefined, 'aria-hidden': toast.isExiting || undefined, inert: toast.isExiting || undefined },
    React.createElement(AriaToastContent, { className: 'muxui-toast-content' },
      React.createElement(AriaText, { slot: 'title', className: classNames('muxui-toast-title', !hasTitle && 'muxui-toast-title-fallback') }, hasTitle ? value.title : TOAST_FALLBACK_TITLE),
      React.createElement(AriaText, { slot: 'description', className: 'muxui-toast-message' }, value.message)),
    React.createElement(IconButton, { slot: 'close', size: 'sm', className: 'muxui-toast-dismiss', 'aria-label': 'Dismiss notification' }, React.createElement(XIcon, { 'aria-hidden': 'true', focusable: 'false', size: 16 })));
}

/** Stable MuxUI facade over RAC's unstable queue/region implementation. */
export const ToastProvider = function ToastProvider({ children, maxVisible = 5, className, placement = 'top-end' }) {
  if (!TOAST_PLACEMENTS.has(placement)) throw new TypeError('Toast placement must be one of top-start, top-end, bottom-start, or bottom-end');
  const queueRef = React.useRef(null);
  if (!queueRef.current) queueRef.current = new UNSTABLE_ToastQueue({ maxVisibleToasts: normalizeMaxVisible(maxVisible) });
  const queue = queueRef.current;
  const closingKeysRef = React.useRef(null);
  if (!closingKeysRef.current) closingKeysRef.current = new Set();
  const animatedQueueRef = React.useRef(null);
  if (!animatedQueueRef.current) animatedQueueRef.current = createAnimatedToastQueue(queue, closingKeysRef.current);
  const animatedQueue = animatedQueueRef.current;
  const motionOriginRef = React.useRef(null);
  const [layoutVersion, setLayoutVersion] = React.useState(0);
  React.useEffect(() => animatedQueue.subscribe(() => setLayoutVersion((version) => version + 1)), [animatedQueue]);
  // The element focused before focus entered the region, for focus restoration.
  const returnFocusRef = React.useRef(null);
  const trackRegionFocus = React.useCallback((node) => {
    node?.addEventListener('focusin', (event) => {
      if (!node.contains(event.relatedTarget)) returnFocusRef.current = event.relatedTarget;
    });
  }, []);
  const callbacksRef = React.useRef(new Map());
  const activeRef = React.useRef(true);
  const teardownRequestedRef = React.useRef(false);
  const notifyDismissed = React.useCallback((key) => {
    if (!activeRef.current || teardownRequestedRef.current) return;
    if (!callbacksRef.current.has(key)) return;
    const callback = callbacksRef.current.get(key);
    callbacksRef.current.delete(key);
    callback?.();
  }, []);
  const enqueue = React.useCallback((content, { duration, onDismiss }, allowDuringTeardown) => {
    if (!activeRef.current || (teardownRequestedRef.current && !allowDuringTeardown)) return '';
    let key;
    key = animatedQueue.add(content, {
      timeout: duration,
      onClose: () => {
        closingKeysRef.current.add(key);
        notifyDismissed(key);
      },
    });
    callbacksRef.current.set(key, onDismiss);
    return key;
  }, [animatedQueue, notifyDismissed]);
  const add = React.useCallback((message, options = {}) => {
    if (!hasRenderableLabel(message)) throw new Error('Toast requires a message');
    const { duration, onDismiss, ...content } = options;
    return enqueue({ ...content, message }, { duration: normalizeToastDuration(duration), onDismiss }, false);
  }, [enqueue]);
  const remove = React.useCallback((id) => {
    if (!activeRef.current || teardownRequestedRef.current) return;
    animatedQueue.close(id);
  }, [animatedQueue]);
  const dispose = React.useCallback((id, settle = true) => {
    if (!activeRef.current || teardownRequestedRef.current) return;
    animatedQueue.visibleToasts.find((toast) => toast.key === id)?.timer?.pause();
    if (!settle) callbacksRef.current.delete(id);
    animatedQueue.dispose(id, settle);
  }, [animatedQueue]);
  // Declarative Toasts own a mutable content record; refresh re-renders it in place.
  const addDeclarative = React.useCallback((content, options) => enqueue(content, options, true), [enqueue]);
  const refresh = React.useCallback(() => setLayoutVersion((version) => version + 1), []);
  const lifecycleRef = React.useRef(0);
  React.useEffect(() => {
    activeRef.current = true;
    teardownRequestedRef.current = false;
    const generation = ++lifecycleRef.current;
    return () => {
      teardownRequestedRef.current = true;
      queueMicrotask(() => {
      if (lifecycleRef.current !== generation) return;
      activeRef.current = false;
      animatedQueue.pauseAll();
      animatedQueue.clear();
      callbacksRef.current.clear();
      });
    };
  }, [queue]);
  const manager = React.useMemo(() => ({ add, remove }), [add, remove]);
  const value = React.useMemo(() => ({ manager, addDeclarative, dispose, refresh }), [addDeclarative, dispose, manager, refresh]);
  return React.createElement(ToastContext.Provider, { value }, children,
    React.createElement('span', { ref: motionOriginRef, hidden: true, 'aria-hidden': 'true' }),
    React.createElement(UNSTABLE_ToastRegion, { ref: trackRegionFocus, queue: animatedQueue, placement, className: classNames('muxui-toast-region', className), 'aria-label': 'Notifications', 'data-placement': placement },
      ({ toast }) => React.createElement(ToastView, { toast, queue: animatedQueue, placement, layoutVersion, originRef: motionOriginRef, returnFocusRef, onExitComplete: animatedQueue.commitClose })));
};

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context.manager;
}

export const Toast = function Toast({
  message,
  title,
  variant = 'neutral',
  duration,
  onDismiss,
  className,
}) {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error('Toast must be used within ToastProvider');
  if (!hasRenderableLabel(message)) throw new Error('Toast requires a message');
  const normalizedDuration = normalizeToastDuration(duration);
  const { addDeclarative, dispose, refresh } = context;
  const contentRef = React.useRef(null);
  const onDismissRef = React.useRef(onDismiss);
  // Enqueue once; later renders update the same record in place, so inline
  // callbacks or JSX never re-announce the toast or reset its timer.
  useIsomorphicLayoutEffect(() => {
    onDismissRef.current = onDismiss;
    const content = contentRef.current;
    if (!content) {
      contentRef.current = { message, title, variant, className };
      return;
    }
    if (content.message === message && content.title === title && content.variant === variant && content.className === className) return;
    Object.assign(content, { message, title, variant, className });
    refresh();
  });
  React.useEffect(() => {
    let dismissed = false;
    const key = addDeclarative(contentRef.current, {
      duration: normalizedDuration,
      onDismiss: () => {
        dismissed = true;
        onDismissRef.current?.();
      },
    });
    return () => queueMicrotask(() => {
      // An accepted dismissal keeps its exit animation, even if onDismiss
      // unmounts this Toast. Other declarative teardown is silent.
      if (!dismissed) dispose(key, false);
    });
  }, [addDeclarative, dispose, normalizedDuration]);
  return null;
};
