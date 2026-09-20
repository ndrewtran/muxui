import React from 'react';
import { animate } from 'motion/react';
import { OverlayTriggerStateContext, Popover as AriaPopover, PopoverContext } from 'react-aria-components';
import { observeReducedMotion, resolvedMotionTransition } from './motion.mjs';

const DATE_POPOVER_ENTER = Object.freeze({
  opacity: [0, 1],
  transform: ['translateY(-4px)', 'translateY(0px)'],
});
const DATE_POPOVER_INITIAL_STYLE = Object.freeze({ opacity: 0, transform: 'translateY(-4px)' });
const DATE_POPOVER_REDUCED_ATTRIBUTE = 'data-muxui-date-popover-reduced';
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

/**
 * React Aria owns the popup lifecycle. Motion only animates its mounted entry.
 */
export function DatePopoverMotion({ children }) {
  const overlayState = React.useContext(OverlayTriggerStateContext);
  const popoverContext = React.useContext(PopoverContext);
  const triggerRef = popoverContext?.triggerRef;
  const isOpen = Boolean(overlayState?.isOpen);
  const [node, setNode] = React.useState(null);
  const controlsRef = React.useRef(null);
  const entryAttemptedRef = React.useRef(false);
  const settle = React.useCallback((controls = controlsRef.current, complete = false) => {
    if (complete) controls?.complete();
    controls?.stop();
    if (controlsRef.current === controls) controlsRef.current = null;
  }, []);

  // Keep the reduced marker and mode listeners alive until RAC removes the DOM node,
  // including the interval where its CSS exit lifecycle is holding the popup.
  useIsomorphicLayoutEffect(() => {
    if (!node || node.nodeType !== 1) return undefined;
    const triggerNode = triggerRef?.current;
    const disconnect = observeReducedMotion(node, triggerNode, (reduced) => {
      node.toggleAttribute(DATE_POPOVER_REDUCED_ATTRIBUTE, reduced);
      if (reduced) settle(undefined, true);
    });
    return () => {
      disconnect();
      node.removeAttribute(DATE_POPOVER_REDUCED_ATTRIBUTE);
    };
  }, [node, settle, triggerRef]);

  // A mode change never replays an entry on an already mounted popup. A new
  // open cycle can start one after the prior cycle's cleanup resets this ref.
  useIsomorphicLayoutEffect(() => {
    if (!node || node.nodeType !== 1 || !isOpen || entryAttemptedRef.current) return undefined;
    entryAttemptedRef.current = true;
    const transition = resolvedMotionTransition(node, triggerRef?.current);
    if (!transition) {
      return () => { entryAttemptedRef.current = false; };
    }
    node.style.opacity = String(DATE_POPOVER_INITIAL_STYLE.opacity);
    node.style.transform = DATE_POPOVER_INITIAL_STYLE.transform;
    const controls = animate(node, DATE_POPOVER_ENTER, transition);
    controlsRef.current = controls;
    return () => {
      if (controlsRef.current === controls) settle(controls);
      entryAttemptedRef.current = false;
    };
  }, [isOpen, node, settle, triggerRef]);

  return React.createElement(AriaPopover, {
    ref: setNode,
    className: 'muxui-date-popover',
  }, children);
}
