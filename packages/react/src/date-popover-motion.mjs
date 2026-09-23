import React from 'react';
import { animate } from 'motion/react';
import { OverlayTriggerStateContext, Popover as AriaPopover, PopoverContext } from 'react-aria-components';
import { observeReducedMotion, resolvedMotionSpring, resolvedMotionTransition } from './motion.mjs';

const DATE_POPOVER_INITIAL_Y = -4;
const DATE_POPOVER_SETTLED_Y = 0;
const DATE_POPOVER_REDUCED_ATTRIBUTE = 'data-muxui-date-popover-reduced';
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

function datePopoverTransform(y) {
  return `translateY(${y}px)`;
}

function readVisibleValues(node) {
  if (typeof window === 'undefined') return { opacity: 1, y: DATE_POPOVER_SETTLED_Y };
  const style = window.getComputedStyle(node);
  const opacity = Number(style.opacity);
  const Matrix = node.ownerDocument.defaultView?.DOMMatrixReadOnly;
  let y = DATE_POPOVER_SETTLED_Y;
  if (Matrix && style.transform !== 'none') {
    const matrix = new Matrix(style.transform);
    if (Number.isFinite(matrix.m42)) y = matrix.m42;
  }
  return {
    opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1,
    y: Number.isFinite(y) ? y : DATE_POPOVER_SETTLED_Y,
  };
}

function targetValues(isOpen) {
  return isOpen
    ? { opacity: 1, y: DATE_POPOVER_SETTLED_Y }
    : { opacity: 0, y: DATE_POPOVER_INITIAL_Y };
}

/**
 * React Aria retains the popup while Motion owns both entry and exit pixels.
 * The explicit exit flag keeps focus and portal ownership in RAC until Motion
 * reports the current close cycle complete.
 */
export function DatePopoverMotion({ children, placement, triggerRef: requestedTriggerRef }) {
  const overlayState = React.useContext(OverlayTriggerStateContext);
  const popoverContext = React.useContext(PopoverContext);
  const triggerRef = requestedTriggerRef ?? popoverContext?.triggerRef;
  const isOpen = Boolean(overlayState?.isOpen);
  const isOpenRef = React.useRef(isOpen);
  isOpenRef.current = isOpen;
  const [phase, setPhase] = React.useState({ open: isOpen, exiting: false });
  if (phase.open !== isOpen) setPhase({ open: isOpen, exiting: !isOpen });
  const [node, setNode] = React.useState(null);
  const controlsRef = React.useRef(null);
  const animatedNodeRef = React.useRef(null);
  const phaseRef = React.useRef(null);
  const animationIdRef = React.useRef(0);

  const settle = React.useCallback((controls, complete = false) => {
    if (complete) controls?.complete();
    controls?.stop();
    if (controlsRef.current === controls) controlsRef.current = null;
  }, []);

  const finishExit = React.useCallback((animationId) => {
    if (animationId !== animationIdRef.current || isOpenRef.current || phaseRef.current !== 'exit') return;
    phaseRef.current = null;
    controlsRef.current = null;
    setPhase((current) => current.open || !current.exiting ? current : { ...current, exiting: false });
  }, []);

  // Keep the reduced marker and mode listeners alive until RAC removes the DOM
  // node, including the interval where its explicit exit state retains it.
  useIsomorphicLayoutEffect(() => {
    if (!node || node.nodeType !== 1) return undefined;
    const triggerNode = triggerRef?.current;
    const disconnect = observeReducedMotion(node, triggerNode, (reduced) => {
      node.toggleAttribute(DATE_POPOVER_REDUCED_ATTRIBUTE, reduced);
      if (!reduced) return;
      const controls = controlsRef.current;
      if (controls) {
        settle(controls, true);
        if (phaseRef.current === 'exit') finishExit(animationIdRef.current);
      } else if (phaseRef.current === 'exit') {
        finishExit(animationIdRef.current);
      }
    });
    return () => {
      disconnect();
      node.removeAttribute(DATE_POPOVER_REDUCED_ATTRIBUTE);
    };
  }, [finishExit, node, settle, triggerRef]);

  useIsomorphicLayoutEffect(() => {
    if (!node || node.nodeType !== 1) return undefined;
    const animationId = animationIdRef.current + 1;
    animationIdRef.current = animationId;
    const initialOpen = isOpen && animatedNodeRef.current !== node;
    animatedNodeRef.current = node;
    const from = initialOpen ? { opacity: 0, y: DATE_POPOVER_INITIAL_Y } : readVisibleValues(node);
    const to = targetValues(isOpen);
    const transition = isOpen
      ? resolvedMotionSpring(node, triggerRef?.current, 'reveal', 'reveal')
      : resolvedMotionTransition(node, triggerRef?.current, 'exit', 'dismiss');
    phaseRef.current = isOpen ? 'entry' : 'exit';

    if (!transition) {
      node.style.opacity = String(to.opacity);
      node.style.transform = datePopoverTransform(to.y);
      if (isOpen) node.style.removeProperty('transform');
      else finishExit(animationId);
      return () => {
        if (phaseRef.current === (isOpen ? 'entry' : 'exit')) phaseRef.current = null;
      };
    }

    let active = true;
    const controls = animate(node, {
      opacity: [from.opacity, to.opacity],
      transform: [datePopoverTransform(from.y), datePopoverTransform(to.y)],
    }, transition);
    // The group promise waits for both channels, including the spring's tail.
    controls.then(() => {
      if (!active || animationId !== animationIdRef.current) return;
      controlsRef.current = null;
      if (!isOpen) finishExit(animationId);
    });
    controlsRef.current = controls;
    return () => {
      active = false;
      settle(controls);
      if (phaseRef.current === (isOpen ? 'entry' : 'exit')) phaseRef.current = null;
    };
  }, [finishExit, isOpen, node, settle, triggerRef]);

  return React.createElement(AriaPopover, {
    ref: setNode,
    placement,
    triggerRef: requestedTriggerRef,
    isExiting: !isOpen && phase.exiting,
    className: 'muxui-date-popover',
  }, children);
}
