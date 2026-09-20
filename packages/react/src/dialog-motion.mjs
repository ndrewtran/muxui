import React from 'react';
import { animate } from 'motion/react';
import {
  Modal as AriaModal,
  OverlayTriggerStateContext,
  PopoverContext,
} from 'react-aria-components';
import { observeReducedMotion, resolvedMotionTransition } from './motion.mjs';

const DIALOG_REDUCED_ATTRIBUTE = 'data-muxui-dialog-reduced';
const DIALOG_INITIAL_Y = 120;
const DIALOG_EXIT_Y = -120;
const DIALOG_SETTLED_Y = 0;
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

function dialogTransform(y) {
  return `translate(-50%, -50%) translateY(${y}px)`;
}

function readVisibleValues(node) {
  if (typeof window === 'undefined') return { opacity: 1, y: DIALOG_SETTLED_Y };
  const style = window.getComputedStyle(node);
  const opacity = Number(style.opacity);
  const rect = node.getBoundingClientRect();
  const Matrix = node.ownerDocument.defaultView?.DOMMatrixReadOnly;
  let y = DIALOG_SETTLED_Y;
  if (Matrix && rect.height > 0 && style.transform !== 'none') {
    const matrix = new Matrix(style.transform);
    if (Number.isFinite(matrix.m42)) y = matrix.m42 + (rect.height / 2);
  }
  return {
    opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1,
    y: Number.isFinite(y) ? y : DIALOG_SETTLED_Y,
  };
}

function targetValues(isOpen) {
  return isOpen
    ? { opacity: 1, y: DIALOG_SETTLED_Y }
    : { opacity: 0, y: DIALOG_EXIT_Y };
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
  const isOpenRef = React.useRef(isOpen);
  isOpenRef.current = isOpen;
  const [modalNode, setModalNode] = React.useState(null);
  const controlsRef = React.useRef(null);
  const panelRef = React.useRef(null);
  const firstMountRef = React.useRef(true);
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
    onExitComplete?.();
  }, [onExitComplete]);

  useIsomorphicLayoutEffect(() => {
    if (!modalNode || modalNode.nodeType !== 1) return undefined;
    const panel = modalNode.querySelector('.muxui-dialog');
    panelRef.current = panel;
    return () => {
      if (panelRef.current === panel) panelRef.current = null;
    };
  }, [modalNode]);

  useIsomorphicLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel || panel.nodeType !== 1) return undefined;
    const scopeNode = triggerRef?.current ?? originRef?.current;
    const disconnect = observeReducedMotion(panel, scopeNode, (reduced) => {
      panel.toggleAttribute(DIALOG_REDUCED_ATTRIBUTE, reduced);
      onReducedChange?.(reduced);
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
      panel.removeAttribute(DIALOG_REDUCED_ATTRIBUTE);
      onReducedChange?.(false);
    };
  }, [finishExit, modalNode, onReducedChange, originRef, settle, triggerRef]);

  useIsomorphicLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel || panel.nodeType !== 1) return undefined;
    const animationId = animationIdRef.current + 1;
    animationIdRef.current = animationId;
    const initialOpen = isOpen && firstMountRef.current;
    firstMountRef.current = false;
    const from = initialOpen ? { opacity: 0, y: DIALOG_INITIAL_Y } : readVisibleValues(panel);
    const to = targetValues(isOpen);
    const transition = resolvedMotionTransition(panel, triggerRef?.current ?? originRef?.current, isOpen ? 'reveal' : 'exit', isOpen ? 'reveal' : 'interaction');
    phaseRef.current = isOpen ? 'entry' : 'exit';

    if (!transition) {
      panel.style.opacity = String(to.opacity);
      panel.style.removeProperty('transform');
      if (!isOpen) finishExit(animationId);
      return () => {
        if (phaseRef.current === (isOpen ? 'entry' : 'exit')) phaseRef.current = null;
      };
    }

    const controls = animate(panel, {
      opacity: [from.opacity, to.opacity],
      transform: [dialogTransform(from.y), dialogTransform(to.y)],
    }, {
      ...transition,
      onComplete: () => {
        if (!isOpen && animationId === animationIdRef.current) finishExit(animationId);
      },
    });
    controlsRef.current = controls;
    return () => {
      if (controlsRef.current === controls) settle(controls);
      if (phaseRef.current === (isOpen ? 'entry' : 'exit')) phaseRef.current = null;
    };
  }, [finishExit, isOpen, modalNode, originRef, settle, triggerRef]);

  const assignModalRef = React.useCallback((node) => {
    setModalNode(node);
  }, []);

  return React.createElement(AriaModal, { ref: assignModalRef, className: 'muxui-dialog-modal' }, children);
}
