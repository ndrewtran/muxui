import React from 'react';
import { animate } from 'motion/react';
import {
  Modal as AriaModal,
  OverlayTriggerStateContext,
  PopoverContext,
} from 'react-aria-components';
import { observeReducedMotion, resolvedMotionTransition } from './motion.mjs';

const DIALOG_REDUCED_ATTRIBUTE = 'data-muxui-dialog-reduced';
const MODAL_INITIAL_Y = -8;
const MODAL_EXIT_Y = -8;
const MODAL_SETTLED_Y = 0;
const MODAL_INITIAL_SCALE = 0.97;
const MODAL_SETTLED_SCALE = 1;
const MODAL_Y_VARIABLE = '--muxui-modal-y';
const MODAL_SCALE_VARIABLE = '--muxui-modal-scale';
// This canonical entry pacing role drives both the panel spring and backdrop fade.
const MODAL_DEFAULT_ENTRY_DURATION = 0.18;
const MODAL_SPRING = Object.freeze({ stiffness: 560, damping: 40, mass: 0.5 });
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

function parseTranslate(value) {
  const match = /^\s*(-?(?:\d+\.?\d*|\.\d+))px(?:\s+(-?(?:\d+\.?\d*|\.\d+))px)?/u.exec(String(value ?? ''));
  return match ? Number(match[2] ?? match[1]) : MODAL_SETTLED_Y;
}

function parseScale(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized === 'none') return MODAL_SETTLED_SCALE;
  const scale = Number(normalized.split(/\s+/u)[0]);
  return Number.isFinite(scale) && scale > 0 ? scale : MODAL_SETTLED_SCALE;
}

function readModalValues(node) {
  if (typeof window === 'undefined') return { opacity: 1, y: MODAL_SETTLED_Y, scale: MODAL_SETTLED_SCALE };
  const style = window.getComputedStyle(node);
  const opacity = Number(style.opacity);
  return {
    opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1,
    y: parseTranslate(style.getPropertyValue(MODAL_Y_VARIABLE)),
    scale: parseScale(style.getPropertyValue(MODAL_SCALE_VARIABLE)),
  };
}

function modalHiddenValues() {
  return { opacity: 0, y: MODAL_EXIT_Y, scale: MODAL_INITIAL_SCALE };
}

function modalTargetValues(isOpen) {
  return isOpen
    ? { opacity: 1, y: MODAL_SETTLED_Y, scale: MODAL_SETTLED_SCALE }
    : modalHiddenValues();
}

function modalEntryTransition(transition) {
  const durationScale = transition.duration / MODAL_DEFAULT_ENTRY_DURATION;
  return {
    type: 'spring',
    stiffness: MODAL_SPRING.stiffness / (durationScale ** 2),
    damping: MODAL_SPRING.damping / durationScale,
    mass: MODAL_SPRING.mass,
  };
}

function modalTransition(node, triggerNode, isOpen) {
  const transition = isOpen
    ? resolvedMotionTransition(node, triggerNode, 'modal-enter', 'modal')
    : resolvedMotionTransition(node, triggerNode, 'exit', 'modal');
  if (!transition) return null;
  return isOpen ? modalEntryTransition(transition) : transition;
}

function styleValues(node, values) {
  node.style.opacity = String(values.opacity);
  node.style.setProperty(MODAL_Y_VARIABLE, `${values.y}px`);
  node.style.setProperty(MODAL_SCALE_VARIABLE, String(values.scale));
}

function originalStyles(node) {
  return {
    opacity: node.style.opacity,
    opacityPriority: node.style.getPropertyPriority('opacity'),
    y: node.style.getPropertyValue(MODAL_Y_VARIABLE),
    yPriority: node.style.getPropertyPriority(MODAL_Y_VARIABLE),
    scale: node.style.getPropertyValue(MODAL_SCALE_VARIABLE),
    scalePriority: node.style.getPropertyPriority(MODAL_SCALE_VARIABLE),
  };
}

function restoreStyles(node, original) {
  if (!original) return;
  if (original.opacity) node.style.setProperty('opacity', original.opacity, original.opacityPriority);
  else node.style.removeProperty('opacity');
  if (original.y) node.style.setProperty(MODAL_Y_VARIABLE, original.y, original.yPriority);
  else node.style.removeProperty(MODAL_Y_VARIABLE);
  if (original.scale) node.style.setProperty(MODAL_SCALE_VARIABLE, original.scale, original.scalePriority);
  else node.style.removeProperty(MODAL_SCALE_VARIABLE);
}

/**
 * Own the pixels of a finite modal open/close cycle while RAC retains portal,
 * focus, dismissal, and inertness ownership. Modal-only CSS variables compose
 * the panel's y/scale motion with each surface's existing centering transform.
 */
export function useModalMotion({ node, isOpen, triggerRef, reducedAttribute = 'data-muxui-motion-reduced', onExitComplete, onReducedChange }) {
  const isOpenRef = React.useRef(Boolean(isOpen));
  const controlsRef = React.useRef(null);
  const valuesRef = React.useRef(null);
  const originalStylesRef = React.useRef(null);
  const animatedNodeRef = React.useRef(null);
  const phaseRef = React.useRef(null);
  const animationIdRef = React.useRef(0);
  const onExitCompleteRef = React.useRef(onExitComplete);
  const onReducedChangeRef = React.useRef(onReducedChange);
  onExitCompleteRef.current = onExitComplete;
  onReducedChangeRef.current = onReducedChange;
  isOpenRef.current = Boolean(isOpen);

  const finishExit = React.useCallback((animationId) => {
    if (animationId !== animationIdRef.current || isOpenRef.current || phaseRef.current !== 'exit') return;
    phaseRef.current = null;
    controlsRef.current = null;
    onExitCompleteRef.current?.();
  }, []);

  const stopControls = React.useCallback((controls) => {
    controls?.stop();
    controls?.cancel?.();
    if (controlsRef.current === controls) controlsRef.current = null;
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (!node || node.nodeType !== 1 || !node.isConnected) return undefined;
    originalStylesRef.current = originalStyles(node);
    valuesRef.current = null;
    return () => {
      animationIdRef.current += 1;
      stopControls(controlsRef.current);
      valuesRef.current = null;
      originalStylesRef.current = null;
      animatedNodeRef.current = null;
    };
  }, [node, stopControls]);

  useIsomorphicLayoutEffect(() => {
    if (!node || node.nodeType !== 1 || !node.isConnected) return undefined;
    const disconnect = observeReducedMotion(node, triggerRef?.current, (reduced) => {
      node.toggleAttribute(reducedAttribute, reduced);
      onReducedChangeRef.current?.(reduced);
      if (!reduced) return;
      animationIdRef.current += 1;
      stopControls(controlsRef.current);
      if (!node.isConnected) return;
      const target = modalTargetValues(Boolean(isOpenRef.current));
      styleValues(node, target);
      valuesRef.current = target;
      if (!isOpenRef.current && phaseRef.current === 'exit') finishExit(animationIdRef.current);
    });
    return () => {
      disconnect();
      node.removeAttribute(reducedAttribute);
      onReducedChangeRef.current?.(false);
    };
  }, [finishExit, node, reducedAttribute, stopControls, triggerRef]);

  useIsomorphicLayoutEffect(() => {
    if (!node || node.nodeType !== 1 || !node.isConnected) return undefined;
    const animationId = animationIdRef.current + 1;
    animationIdRef.current = animationId;
    const initialOpen = Boolean(isOpen) && animatedNodeRef.current !== node;
    animatedNodeRef.current = node;
    const from = initialOpen ? modalHiddenValues() : valuesRef.current ?? readModalValues(node);
    const to = modalTargetValues(Boolean(isOpen));
    const transition = modalTransition(node, triggerRef?.current, Boolean(isOpen));
    let controls = null;
    let active = true;
    let completed = false;
    phaseRef.current = isOpen ? 'entry' : 'exit';

    const complete = () => {
      if (completed || !active || animationId !== animationIdRef.current || !node.isConnected) return;
      completed = true;
      if (controlsRef.current === controls) controlsRef.current = null;
      valuesRef.current = to;
      if (isOpen) restoreStyles(node, originalStylesRef.current);
      else styleValues(node, to);
      if (!isOpen) finishExit(animationId);
    };

    if (!transition) {
      complete();
      return () => {
        if (phaseRef.current === (isOpen ? 'entry' : 'exit')) phaseRef.current = null;
      };
    }

    const values = { opacity: from.opacity, y: from.y, scale: from.scale };
    const apply = (progress) => {
      if (!active || animationId !== animationIdRef.current || !node.isConnected) return;
      values.opacity = from.opacity + ((to.opacity - from.opacity) * progress);
      values.y = from.y + ((to.y - from.y) * progress);
      values.scale = from.scale + ((to.scale - from.scale) * progress);
      valuesRef.current = values;
      styleValues(node, values);
    };
    apply(0);
    controls = animate(0, 1, { ...transition, onUpdate: apply, onComplete: complete });
    controlsRef.current = controls;
    controls.then(() => {
      if (!active || animationId !== animationIdRef.current) return;
      complete();
    });
    return () => {
      active = false;
      if (node.isConnected) valuesRef.current = readModalValues(node);
      stopControls(controls);
      if (phaseRef.current === (isOpen ? 'entry' : 'exit')) phaseRef.current = null;
    };
  }, [finishExit, isOpen, node, stopControls, triggerRef]);

  React.useEffect(() => () => {
    animationIdRef.current += 1;
    stopControls(controlsRef.current);
  }, [stopControls]);

  return null;
}

/**
 * Motion owns the panel pixels while RAC owns the modal lifecycle and focus behavior.
 * The parent supplies isExiting so RAC retains the portal until onExitComplete fires.
 */
export function DialogMotion({ children, originRef, onExitComplete, onReducedChange }) {
  const state = React.useContext(OverlayTriggerStateContext);
  const popoverContext = React.useContext(PopoverContext);
  const triggerRef = popoverContext?.triggerRef;
  const isOpen = Boolean(state?.isOpen);
  const [modalNode, setModalNode] = React.useState(null);
  const panel = modalNode?.querySelector('.muxui-dialog') ?? null;
  useModalMotion({
    node: panel,
    isOpen,
    triggerRef: triggerRef ?? originRef,
    reducedAttribute: DIALOG_REDUCED_ATTRIBUTE,
    onExitComplete,
    onReducedChange,
  });

  const assignModalRef = React.useCallback((node) => {
    setModalNode(node);
  }, []);

  return React.createElement(AriaModal, { ref: assignModalRef, className: 'muxui-dialog-modal' }, children);
}
