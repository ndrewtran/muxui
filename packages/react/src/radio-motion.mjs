import React from 'react';
import { createPortal } from 'react-dom';
import { LayoutGroup, MotionConfig, motion } from 'motion/react';
import { observeReducedMotion, resolvedMotionSpring } from './motion.mjs';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;
const RADIO_INDICATOR_SELECTOR = '.muxui-radio-indicator, .muxui-radio-field__indicator';
const SELECTED_INDICATOR_SELECTOR = '.muxui-radio[data-selected] .muxui-radio-indicator, .muxui-radio-field[data-selected] .muxui-radio-field__indicator';

const RadioMotionContext = React.createContext({
  reduced: false,
  root: null,
});

function assignRef(ref, value) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

function selectedIndicator(root) {
  const checkedInput = [...root.querySelectorAll('input[type="radio"]:checked')]
    .find((input) => input.closest('[role="radiogroup"]') === root);
  const radio = checkedInput?.closest('.muxui-radio, .muxui-radio-field__button');
  const directIndicator = radio?.querySelector(RADIO_INDICATOR_SELECTOR);
  if (directIndicator) return directIndicator;
  return [...root.querySelectorAll(SELECTED_INDICATOR_SELECTOR)]
    .find((candidate) => candidate.closest('[role="radiogroup"]') === root) ?? null;
}

function motionTransition(value) {
  if (!value) return undefined;
  return {
    type: value.type,
    duration: value.duration,
    visualDuration: value.visualDuration,
    bounce: value.bounce,
  };
}

/**
 * Keeps RAC as the RadioGroup state owner while a single selected dot travels
 * between direct and compound radio indicators through one scoped layout ID.
 */
export function RadioGroupMotion({ children, rootRef }) {
  const [root, setRoot] = React.useState(null);
  const [indicator, setIndicator] = React.useState(null);
  const [reduced, setReduced] = React.useState(false);
  const [travelTransition, setTravelTransition] = React.useState({ duration: 0 });
  const groupId = React.useId();

  const setRootRef = React.useCallback((node) => {
    setRoot(node);
    assignRef(rootRef, node);
  }, [rootRef]);

  useIsomorphicLayoutEffect(() => {
    if (!root) return undefined;
    let active = true;
    const updateIndicator = () => {
      if (!active) return;
      const next = selectedIndicator(root);
      root.toggleAttribute('data-muxui-radio-motion', Boolean(next));
      setIndicator((current) => current === next ? current : next);
    };
    const observer = new MutationObserver(updateIndicator);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['aria-checked', 'checked', 'data-selected', 'disabled'],
      childList: true,
      subtree: true,
    });
    const onChange = () => queueMicrotask(updateIndicator);
    root.addEventListener('change', onChange, true);
    const form = root.closest('form');
    form?.addEventListener('reset', onChange, true);
    updateIndicator();
    const disconnectReduced = observeReducedMotion(root, null, (nextReduced) => {
      if (active) setReduced(nextReduced);
    });
    return () => {
      active = false;
      observer.disconnect();
      root.removeEventListener('change', onChange, true);
      form?.removeEventListener('reset', onChange, true);
      disconnectReduced();
      root.removeAttribute('data-muxui-radio-motion');
    };
  }, [root]);

  useIsomorphicLayoutEffect(() => {
    if (!root || reduced) {
      setTravelTransition({ duration: 0 });
      return undefined;
    }
    setTravelTransition(motionTransition(resolvedMotionSpring(root, null, 'state', 'interaction')) ?? { duration: 0 });
    return undefined;
  }, [indicator, reduced, root]);

  const context = React.useMemo(() => ({ reduced, root }), [reduced, root]);
  const group = React.cloneElement(children, { ref: setRootRef });
  const dot = indicator
    ? createPortal(reduced
      ? React.createElement('span', {
        'aria-hidden': 'true',
        className: 'muxui-radio-motion-dot',
      })
      : React.createElement(motion.span, {
        'aria-hidden': 'true',
        className: 'muxui-radio-motion-dot',
        layoutId: 'radio-dot',
        initial: false,
        transition: { layout: travelTransition },
      }), indicator)
    : null;

  return React.createElement(MotionConfig, { reducedMotion: reduced ? 'always' : 'never' },
    React.createElement(LayoutGroup, { id: groupId },
      React.createElement(RadioMotionContext.Provider, { value: context }, group, dot)));
}

export function RadioMotionIndicator({ children, renderProps }) {
  const { reduced, root } = React.useContext(RadioMotionContext);
  const pressed = Boolean(!reduced && renderProps?.isPressed && !renderProps.isDisabled && !renderProps.isReadOnly);
  const pressTransition = !reduced && root
    ? motionTransition(resolvedMotionSpring(root, null, 'interaction', 'interaction')) ?? { duration: 0 }
    : { duration: 0 };
  return React.createElement(motion.span, {
    'aria-hidden': 'true',
    animate: { scale: pressed ? 0.92 : 1 },
    className: 'muxui-radio-indicator',
    initial: false,
    transition: { scale: pressTransition },
  }, children);
}
