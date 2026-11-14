import React from 'react';
import type { HTMLAttributes, Ref } from 'react';
import { animate } from 'motion/react';
import { attachRef } from './motion-geometry.mjs';
import { observeReducedMotion, resolvedMotionSpring } from './motion.mjs';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

function readTransform(node: Element) {
  if (typeof window === 'undefined') return 'none';
  return window.getComputedStyle(node).transform || 'none';
}

/**
 * @internal
 * The switch state the thumb follows, and the native props of its span.
 */
export interface SwitchMotionIndicatorProps extends HTMLAttributes<HTMLSpanElement> {
  isSelected: boolean;
  isPressed: boolean;
  isDisabled: boolean;
  isReadOnly: boolean;
  ref?: Ref<HTMLSpanElement>;
}

/**
 * @internal
 * The thumb of a Switch and of a SwitchField: it slides between the two ends of the track and squashes while pressed,
 * and settles at once under reduced motion. Both families draw it with the `muxui-switch__indicator` class, so one
 * stylesheet block owns what it looks like and this component owns how it moves.
 */
export function SwitchMotionIndicator({ isSelected, isPressed, isDisabled, isReadOnly, className, ref, ...props }: SwitchMotionIndicatorProps) {
  const indicatorRef = React.useRef<HTMLSpanElement | null>(null);
  // The indicator reads its own node, and the caller's ref gets it too.
  const setIndicator = React.useCallback((node: HTMLSpanElement | null) => {
    indicatorRef.current = node;
    const detach = attachRef(ref, node);
    return () => {
      detach();
      indicatorRef.current = null;
    };
  }, [ref]);
  const controlsRef = React.useRef<ReturnType<typeof animate> | null>(null);
  const settledTransformRef = React.useRef<string | null>(null);
  const previousStateRef = React.useRef<{ isSelected: boolean; isPressed: boolean; blocked: boolean } | null>(null);
  const [reduced, setReduced] = React.useState(false);
  const blocked = isDisabled || isReadOnly;

  useIsomorphicLayoutEffect(() => () => {
    const controls = controlsRef.current;
    controlsRef.current = null;
    controls?.stop();
    indicatorRef.current?.style.removeProperty('transform');
  }, []);

  React.useEffect(() => {
    const node = indicatorRef.current;
    if (!node) return undefined;
    return observeReducedMotion(node, node.parentElement, (nextReduced) => {
      setReduced(nextReduced);
      if (!nextReduced) return;
      const controls = controlsRef.current;
      controlsRef.current = null;
      controls?.cancel();
      node.style.removeProperty('transform');
      settledTransformRef.current = readTransform(node);
    });
  }, []);

  useIsomorphicLayoutEffect(() => {
    const node = indicatorRef.current;
    if (!node) return undefined;
    const nextState = {
      isSelected: Boolean(isSelected),
      isPressed: Boolean(isPressed),
      blocked: Boolean(blocked),
    };
    const previousState = previousStateRef.current;
    previousStateRef.current = nextState;
    if (!previousState) {
      settledTransformRef.current = readTransform(node);
      return undefined;
    }

    const controls = controlsRef.current;
    const interruptedTransform = controls ? readTransform(node) : settledTransformRef.current;
    controlsRef.current = null;
    controls?.stop();
    node.style.removeProperty('transform');

    if (reduced || blocked) {
      settledTransformRef.current = readTransform(node);
      return undefined;
    }

    const targetTransform = readTransform(node);
    const fromTransform = interruptedTransform || targetTransform;
    settledTransformRef.current = targetTransform;
    if (fromTransform === targetTransform) return undefined;

    const transition = resolvedMotionSpring(node, node.parentElement, 'state', 'interaction');
    if (!transition) return undefined;

    node.style.transform = fromTransform;
    let active = true;
    const complete = () => {
      if (!active || controlsRef.current !== nextControls) return;
      requestAnimationFrame(() => {
        if (!active || controlsRef.current !== nextControls) return;
        controlsRef.current = null;
        node.style.removeProperty('transform');
        settledTransformRef.current = targetTransform;
      });
    };
    const nextControls = animate(node, { transform: [fromTransform, targetTransform] }, transition);
    controlsRef.current = nextControls;
    nextControls.then(() => {
      complete();
    });

    return () => {
      active = false;
      if (controlsRef.current !== nextControls) return;
      settledTransformRef.current = readTransform(node);
      controlsRef.current = null;
      nextControls.stop();
    };
  }, [blocked, isPressed, isSelected, reduced]);

  return React.createElement('span', {
    'aria-hidden': 'true',
    ...props,
    ref: setIndicator,
    className: className ? `muxui-switch__indicator ${className}` : 'muxui-switch__indicator',
    'data-muxui-state-selected': isSelected || undefined,
    'data-muxui-motion-pressed': isPressed && !blocked && !reduced ? '' : undefined,
  });
}
