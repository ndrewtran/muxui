import React from 'react';
import { animate } from 'motion/react';
import { OverlayTriggerStateContext, PopoverContext } from 'react-aria-components';
import { observeReducedMotion, resolvedMotionTransition } from './date-popover-motion.mjs';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

/** Measure the unconstrained grid; resize its body without scaling dates or text. */
export function CalendarHeightMotion({ children }) {
  const bodyRef = React.useRef(null);
  const triggerRef = React.useContext(PopoverContext)?.triggerRef;
  const overlayState = React.useContext(OverlayTriggerStateContext);
  const isOpen = overlayState?.isOpen ?? true;

  useIsomorphicLayoutEffect(() => {
    const body = bodyRef.current;
    const grid = body?.firstElementChild;
    const calendar = body?.parentElement;
    if (!grid || !calendar || !isOpen || typeof ResizeObserver === 'undefined') return undefined;
    let targetHeight = grid.getBoundingClientRect().height;
    let controls = null;
    const overflow = calendar.style.getPropertyValue('overflow');
    const overflowPriority = calendar.style.getPropertyPriority('overflow');
    const restore = () => {
      body.style.removeProperty('height');
      if (overflow) calendar.style.setProperty('overflow', overflow, overflowPriority);
      else calendar.style.removeProperty('overflow');
    };
    const settle = () => {
      controls?.stop();
      controls = null;
      restore();
    };
    const disconnectMode = observeReducedMotion(body, triggerRef?.current, (reduced) => {
      if (reduced) settle();
    });
    const observer = new ResizeObserver(() => {
      const nextHeight = grid.getBoundingClientRect().height;
      if (Math.abs(nextHeight - targetHeight) < 0.5) return;
      const from = controls ? body.getBoundingClientRect().height : targetHeight;
      targetHeight = nextHeight;
      settle();
      const transition = resolvedMotionTransition(body, triggerRef?.current, 'content-resize');
      if (!transition || from <= 0 || nextHeight <= 0) return;
      body.style.height = `${from}px`;
      calendar.style.overflow = 'clip';
      // Animate a number so cleanup owns every height write, including interruption.
      controls = animate(from, nextHeight, {
        ...transition,
        onUpdate: (height) => { body.style.height = `${height}px`; },
        onComplete: () => {
          controls = null;
          restore();
        },
      });
    });
    observer.observe(grid);
    return () => {
      observer.disconnect();
      disconnectMode();
      settle();
    };
  }, [isOpen, triggerRef]);

  return React.createElement('div', { ref: bodyRef }, children);
}
