import React from 'react';
import { animate, LazyMotion, domAnimation, useMotionValue, useTransform } from 'motion/react';
import { span as MotionSpan } from 'motion/react-m';
import { ColorThumb, ColorWheelTrack } from 'react-aria-components';
import { observeReducedMotion, resolvedMotionSpring } from './motion.mjs';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;
const adjustmentKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

function ColorWheelMotionThumb({ color, isHovered, isDragging, isDisabled, readOnly, thumbRef }) {
  const [reduced, setReduced] = React.useState(false);
  const [keyPressed, setKeyPressed] = React.useState(false);
  const hover = useMotionValue(0);
  const press = useMotionValue(0);
  const scale = useTransform(() => 1 + hover.get() * 0.045 - press.get() * 0.07);
  const haloOpacity = useTransform(() => hover.get() * 0.2 + press.get() * 0.38);
  const haloScale = useTransform(() => 1 + hover.get() * 0.2 + press.get() * 0.32);
  const blocked = isDisabled || readOnly;

  React.useEffect(() => observeReducedMotion(thumbRef.current, null, (next) => {
    setReduced(next);
    if (next) {
      hover.jump(0);
      press.jump(0);
    }
  }), [hover, press, thumbRef]);

  React.useEffect(() => {
    if (blocked) setKeyPressed(false);
    const thumb = thumbRef.current;
    if (!thumb) return undefined;
    const keyDown = (event) => {
      if (!blocked && adjustmentKeys.has(event.key)) setKeyPressed(true);
    };
    const keyUp = () => setKeyPressed(false);
    thumb.addEventListener('keydown', keyDown, true);
    thumb.addEventListener('keyup', keyUp, true);
    thumb.addEventListener('blur', keyUp, true);
    return () => {
      thumb.removeEventListener('keydown', keyDown, true);
      thumb.removeEventListener('keyup', keyUp, true);
      thumb.removeEventListener('blur', keyUp, true);
    };
  }, [blocked, thumbRef]);

  useIsomorphicLayoutEffect(() => {
    const transition = !blocked && !reduced && resolvedMotionSpring(thumbRef.current);
    const targets = [[hover, transition && isHovered ? 1 : 0], [press, transition && (isDragging || keyPressed) ? 1 : 0]];
    if (!transition) {
      for (const [value, target] of targets) value.jump(target);
      return undefined;
    }
    const controls = targets.map(([value, target]) => animate(value, target, transition));
    return () => controls.forEach((control) => control.stop());
  }, [blocked, hover, isDragging, isHovered, keyPressed, press, reduced, thumbRef]);

  return React.createElement(MotionSpan, { className: 'muxui-color-wheel-thumb-visual', 'aria-hidden': true },
    React.createElement(MotionSpan, { className: 'muxui-color-wheel-thumb-halo', style: { opacity: haloOpacity, scale: haloScale } }),
    React.createElement(MotionSpan, { className: 'muxui-color-wheel-thumb-face', style: { scale, backgroundColor: color.toString('css') } }),
  );
}

/** Keep React Aria's wheel track, range input, hit target, and positioning as the sole wheel engine. */
export function ColorWheelMotionTrack({ readOnly }) {
  const thumbRef = React.useRef(null);
  return React.createElement(LazyMotion, { features: domAnimation, strict: true },
    React.createElement(React.Fragment, null,
      React.createElement(ColorWheelTrack, { className: 'muxui-color-wheel-track' }),
      React.createElement(ColorThumb, {
        ref: thumbRef,
        className: 'muxui-color-wheel-thumb',
        'data-readonly': readOnly || undefined,
        style: { backgroundColor: 'transparent' },
      }, (renderProps) => React.createElement(ColorWheelMotionThumb, { ...renderProps, readOnly, thumbRef })),
    ),
  );
}
