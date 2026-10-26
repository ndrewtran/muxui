import React from 'react';
import { LayoutGroup, motion } from 'motion/react';
import { PopoverContext } from 'react-aria-components';
import { useRootRef } from './motion-geometry.mjs';
import { observeReducedMotion, resolvedMotionSpring } from './motion.mjs';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;
const CalendarSelectionContext = React.createContext(null);
const CIRCLE_SCALE = { scaleX: 1, scaleY: 1 };
const TRAVEL_SCALE = { scaleX: [1, 1.07, 1], scaleY: [1, 0.93, 1] };
const SQUISH_TIMES = [0, 0.12, 1];

/** Keeps RAC in control while one selected date background travels within a month. */
export function CalendarSelectionMotion({ children, rootRef }) {
  const [root, setRootRef] = useRootRef(rootRef);
  const [reduced, setReduced] = React.useState(false);
  const [spring, setSpring] = React.useState(null);
  // The selection travels on the state spring and squishes on its composite curve.
  const travelTransition = React.useMemo(() => spring
    ? { type: spring.type, visualDuration: spring.visualDuration, bounce: spring.bounce }
    : { duration: 0 }, [spring]);
  const squishTransition = React.useMemo(() => ({
    duration: spring?.duration ?? 0,
    times: SQUISH_TIMES,
    ease: spring?.opacity.ease,
  }), [spring]);
  const groupId = React.useId();
  const triggerRef = React.useContext(PopoverContext)?.triggerRef;

  useIsomorphicLayoutEffect(() => {
    if (!root) return undefined;
    const disconnectReduced = observeReducedMotion(root, triggerRef?.current, setReduced);
    return () => {
      disconnectReduced();
    };
  }, [root, triggerRef]);

  useIsomorphicLayoutEffect(() => {
    setSpring(!root || reduced ? null : resolvedMotionSpring(root, triggerRef?.current, 'state', 'interaction'));
    return undefined;
  }, [root, reduced, triggerRef]);

  const renderChildren = children.props.children;
  const calendar = React.cloneElement(children, {
    ref: setRootRef,
    children: (renderProps) => {
      const content = typeof renderChildren === 'function' ? renderChildren(renderProps) : renderChildren;
      return React.createElement(CalendarSelectionContext.Provider, {
        value: {
          pageKey: `${renderProps.state.visibleRange.start.year}-${renderProps.state.visibleRange.start.month}`,
          reduced,
          travelTransition,
          squishTransition,
        },
      }, content);
    },
  });

  return React.createElement(LayoutGroup, { id: groupId }, calendar);
}

export function CalendarSelectionCell({ date, formattedDate, isSelected }) {
  const motionContext = React.useContext(CalendarSelectionContext);
  const pageKey = motionContext?.pageKey ?? 'initial';
  const dateKey = date.toString();
  const layoutId = `calendar-selection-${pageKey}-${date.year}-${date.month}`;
  const [traveling, setTraveling] = React.useState(null);
  const isTraveling = isSelected && !motionContext?.reduced
    && traveling?.pageKey === pageKey && traveling?.dateKey === dateKey;

  useIsomorphicLayoutEffect(() => {
    if (traveling === null || (isSelected && !motionContext?.reduced && traveling.pageKey === pageKey)) return;
    setTraveling(null);
  }, [isSelected, motionContext?.reduced, pageKey, traveling]);

  const paint = React.createElement(motion.span, {
    className: 'muxui-calendar-selection-paint',
    animate: isTraveling ? TRAVEL_SCALE : CIRCLE_SCALE,
    transition: motionContext?.squishTransition ?? { duration: 0 },
  });
  const indicator = isSelected
    ? motionContext?.reduced
      ? React.createElement('span', {
        'aria-hidden': 'true',
        className: 'muxui-calendar-selection',
      }, React.createElement('span', { className: 'muxui-calendar-selection-paint' }))
      : React.createElement(motion.span, {
        'aria-hidden': 'true',
        className: 'muxui-calendar-selection',
        'data-muxui-selection-traveling': isTraveling || undefined,
        layoutId,
        initial: false,
        transition: { layout: motionContext?.travelTransition ?? { duration: 0 } },
        onLayoutAnimationStart: () => setTraveling({ pageKey, dateKey }),
        onLayoutAnimationComplete: () => setTraveling((current) => current?.pageKey === pageKey && current?.dateKey === dateKey ? null : current),
      }, paint)
    : null;

  return React.createElement(React.Fragment, null,
    indicator,
    React.createElement('span', {
      className: 'muxui-calendar-date',
    }, formattedDate));
}
