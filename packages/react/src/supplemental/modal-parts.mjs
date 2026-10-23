import React from 'react';
import {
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
  OverlayTriggerStateContext,
  PopoverContext,
} from 'react-aria-components';
import { useModalMotion } from '../dialog-motion.mjs';
import { observeReducedMotion } from '../motion.mjs';
import { h, useIsomorphicLayoutEffect } from './part-utils.mjs';

/* AlertDialog */
const ModalMotionContext = React.createContext(null);
const DIALOG_REDUCED_ATTRIBUTE = 'data-muxui-dialog-reduced';

function MotionModalBackdrop({ children, className, onOpenChange, triggerRef: providedTriggerRef, ...props }, ref) {
  const state = React.useContext(OverlayTriggerStateContext);
  const popoverContext = React.useContext(PopoverContext);
  const triggerRef = providedTriggerRef ?? popoverContext?.triggerRef;
  const isOpen = props.isOpen ?? state?.isOpen ?? false;
  const [backdropNode, setBackdropNode] = React.useState(null);
  const [phase, setPhase] = React.useState({ open: Boolean(isOpen), exiting: false });
  if (phase.open !== Boolean(isOpen)) setPhase({ open: Boolean(isOpen), exiting: !isOpen });
  const releaseExit = React.useCallback(() => {
    setPhase((current) => current.open || !current.exiting ? current : { ...current, exiting: false });
  }, []);
  const setBackdropRef = React.useCallback((node) => {
    setBackdropNode(node);
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);
  useIsomorphicLayoutEffect(() => {
    if (!backdropNode) return undefined;
    const originalOpacity = backdropNode.style.opacity;
    const originalOpacityPriority = backdropNode.style.getPropertyPriority('opacity');
    const originalTransition = backdropNode.style.transition;
    const originalTransitionPriority = backdropNode.style.getPropertyPriority('transition');
    const restoreStyle = () => {
      if (originalOpacity) backdropNode.style.setProperty('opacity', originalOpacity, originalOpacityPriority);
      else backdropNode.style.removeProperty('opacity');
      if (originalTransition) backdropNode.style.setProperty('transition', originalTransition, originalTransitionPriority);
      else backdropNode.style.removeProperty('transition');
    };
    const disconnect = observeReducedMotion(backdropNode, triggerRef?.current, (reduced) => {
      backdropNode.toggleAttribute(DIALOG_REDUCED_ATTRIBUTE, reduced);
      if (reduced) {
        backdropNode.style.setProperty('opacity', '1', 'important');
        backdropNode.style.setProperty('transition', 'none', 'important');
      } else {
        restoreStyle();
      }
    });
    return () => {
      disconnect();
      backdropNode.removeAttribute(DIALOG_REDUCED_ATTRIBUTE);
      restoreStyle();
    };
  }, [backdropNode, triggerRef]);
  return h(AriaModalOverlay, {
    ...props,
    ref: setBackdropRef,
    onOpenChange,
    isExiting: !isOpen && phase.exiting,
    className,
  }, h(ModalMotionContext.Provider, { value: { isOpen: Boolean(isOpen), isExiting: !isOpen && phase.exiting, triggerRef, onExitComplete: releaseExit } }, children));
}

export const MotionModalBackdropForwardRef = /*#__PURE__*/ React.forwardRef(MotionModalBackdrop);

function MotionModalPopup({ children, className, ...props }, ref) {
  const state = React.useContext(OverlayTriggerStateContext);
  const motion = React.useContext(ModalMotionContext);
  const popoverContext = React.useContext(PopoverContext);
  const isOpen = motion?.isOpen ?? state?.isOpen ?? true;
  const [popupNode, setPopupNode] = React.useState(null);
  useModalMotion({
    node: popupNode,
    isOpen,
    triggerRef: motion?.triggerRef ?? popoverContext?.triggerRef,
    reducedAttribute: 'data-muxui-motion-reduced',
    onExitComplete: motion?.onExitComplete,
  });
  const setRef = React.useCallback((node) => {
    setPopupNode(node);
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);
  return h(AriaModal, { ...props, ref: setRef, isExiting: props.isExiting ?? motion?.isExiting, className }, children);
}

export const MotionModalPopupForwardRef = /*#__PURE__*/ React.forwardRef(MotionModalPopup);
