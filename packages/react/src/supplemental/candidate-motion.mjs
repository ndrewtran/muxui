import React from 'react';
import { animateMini, spring } from 'motion/react';
import { observeReducedMotion, resolvedMotionSpring } from '../motion.mjs';

const useLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

/** Finite feedback for owned candidate content. Initial SSR content stays still. */
export function useCandidateMotion(ref, value, { active = true, reveal = false, angle, triggerRef } = {}) {
  const previous = React.useRef(value);
  const interrupted = React.useRef(null);

  useLayoutEffect(() => {
    const changed = !Object.is(previous.current, value);
    const prior = previous.current;
    previous.current = value;
    const node = ref.current;
    if (!changed || !active || !node?.isConnected) {
      interrupted.current = null;
      return undefined;
    }
    const role = reveal ? 'reveal' : angle === undefined ? 'state' : 'interaction';
    const transition = resolvedMotionSpring(node, triggerRef?.current, role, reveal ? 'reveal' : 'interaction');
    if (!transition) {
      interrupted.current = null;
      return undefined;
    }
    const original = { transform: node.style.transform, opacity: node.style.opacity };
    const restore = () => {
      for (const property of ['transform', 'opacity']) {
        if (original[property]) node.style[property] = original[property];
        else node.style.removeProperty(property);
      }
    };
    const from = interrupted.current;
    interrupted.current = null;
    const values = angle === undefined
      ? { opacity: [from?.opacity ?? 0.65, 1], transform: [from?.transform ?? 'translateY(2px)', 'translateY(0px)'] }
      : { transform: [from?.transform ?? `rotate(${prior}deg)`, `rotate(${angle}deg)`] };
    // Native WAAPI avoids a cached MotionValue render reapplying an inline
    // transform after the component has restored its CSS-owned resting state.
    let controls = animateMini(node, values, {
      ...transition,
      type: spring,
      opacity: { duration: transition.opacity.duration, ease: transition.opacity.ease },
    });
    let finished = false;
    let disconnect;
    const settle = () => {
      finished = true;
      controls?.cancel();
      controls = null;
      interrupted.current = null;
      restore();
      disconnect?.();
    };
    // Observe only while feedback is active. A runtime reduction cancels and
    // restores the CSS-owned final state in the same observer turn.
    disconnect = observeReducedMotion(node, triggerRef?.current, (reduced) => {
      if (reduced) settle();
    });
    if (finished) disconnect();
    else controls.then(() => { if (!finished) settle(); });
    return () => {
      if (!finished) {
        const style = node.ownerDocument.defaultView.getComputedStyle(node);
        interrupted.current = { transform: style.transform, opacity: Number(style.opacity) };
        finished = true;
        controls?.cancel();
        controls = null;
        restore();
      }
      disconnect();
    };
  }, [active, angle, ref, reveal, triggerRef, value]);
}
