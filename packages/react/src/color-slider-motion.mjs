import React from 'react';
import { animate, LazyMotion, domAnimation, useMotionValue, useTransform } from 'motion/react';
import { span as MotionSpan } from 'motion/react-m';
import { ColorSliderStateContext, ColorThumb, SliderFill, SliderTrack } from 'react-aria-components';
import { observeReducedMotion, resolvedMotionSpring } from './motion.mjs';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;
const adjustmentKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

function PreciseColorThumb({ color, isHovered, isDragging, isDisabled, readOnly, trackRef, thumbRef }) {
  const state = React.useContext(ColorSliderStateContext);
  const percent = state.getThumbPercent(0);
  const faceRef = React.useRef(null);
  const pointerRef = React.useRef(null);
  const clickOriginRef = React.useRef(null);
  const [reduced, setReduced] = React.useState(false);
  const [keyPressed, setKeyPressed] = React.useState(false);
  const hover = useMotionValue(0);
  const press = useMotionValue(0);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useTransform(() => 1 + hover.get() * 0.045 - press.get() * 0.07);
  const haloOpacity = useTransform(() => hover.get() * 0.2 + press.get() * 0.38);
  const haloScale = useTransform(() => 1 + hover.get() * 0.2 + press.get() * 0.32);
  const blocked = isDisabled || readOnly;

  React.useEffect(() => observeReducedMotion(thumbRef.current, null, (next) => {
    setReduced(next);
    if (next) {
      clickOriginRef.current = null;
      hover.jump(0);
      press.jump(0);
      x.jump(0);
      y.jump(0);
    }
  }), [hover, press, thumbRef, x, y]);

  React.useEffect(() => {
    if (blocked) setKeyPressed(false);
    const track = trackRef.current;
    const thumb = thumbRef.current;
    const document = track.ownerDocument;
    const clearTravel = () => {
      clickOriginRef.current = null;
      x.jump(0);
      y.jump(0);
    };
    const down = (event) => {
      if (blocked || event.button !== 0 || !event.isPrimary || pointerRef.current) return;
      pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      if (!thumb.contains(event.target)) {
        const rect = faceRef.current.getBoundingClientRect();
        clickOriginRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      } else clearTravel();
    };
    const move = (event) => {
      const pointer = pointerRef.current;
      if (pointer?.id === event.pointerId && (pointer.x !== event.clientX || pointer.y !== event.clientY)) clearTravel();
    };
    const up = (event) => {
      if (pointerRef.current?.id !== event.pointerId) return;
      pointerRef.current = null;
      clickOriginRef.current = null;
      if (event.type === 'pointercancel') clearTravel();
    };
    const keyDown = (event) => {
      if (!blocked && adjustmentKeys.has(event.key)) {
        clearTravel();
        setKeyPressed(true);
      }
    };
    const keyUp = () => setKeyPressed(false);
    track.addEventListener('pointerdown', down, true);
    track.addEventListener('keydown', keyDown, true);
    track.addEventListener('keyup', keyUp, true);
    track.addEventListener('blur', keyUp, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    return () => {
      track.removeEventListener('pointerdown', down, true);
      track.removeEventListener('keydown', keyDown, true);
      track.removeEventListener('keyup', keyUp, true);
      track.removeEventListener('blur', keyUp, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
      pointerRef.current = null;
      clearTravel();
    };
  }, [blocked, trackRef, thumbRef, x, y]);

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

  useIsomorphicLayoutEffect(() => {
    const origin = clickOriginRef.current;
    clickOriginRef.current = null;
    const transition = origin && !blocked && !reduced && resolvedMotionSpring(thumbRef.current);
    x.jump(0);
    y.jump(0);
    if (!transition) return undefined;
    const rect = thumbRef.current.getBoundingClientRect();
    // RAC moves the real thumb/input immediately. Only its decorative face
    // compensates for that jump, and any direct drag cancels the compensation.
    if (state.orientation === 'vertical') y.jump(origin.y - (rect.top + rect.height / 2));
    else x.jump(origin.x - (rect.left + rect.width / 2));
    const controls = [animate(x, 0, transition), animate(y, 0, transition)];
    return () => controls.forEach((control) => control.stop());
  }, [blocked, percent, reduced, state.orientation, thumbRef, x, y]);

  return React.createElement(MotionSpan, { className: 'muxui-color-slider-thumb-visual', 'aria-hidden': true, style: { x, y } },
    React.createElement(MotionSpan, { className: 'muxui-color-slider-thumb-halo', style: { opacity: haloOpacity, scale: haloScale } }),
    React.createElement(MotionSpan, { ref: faceRef, className: 'muxui-color-slider-thumb-face', style: { scale, backgroundColor: color.toString('css') } }),
  );
}

/** Keep React Aria's track, input, hit target, and positioning as the sole slider engine. */
export function ColorSliderMotionTrack({ readOnly }) {
  const trackRef = React.useRef(null);
  const thumbRef = React.useRef(null);
  return React.createElement(LazyMotion, { features: domAnimation, strict: true },
    React.createElement(SliderTrack, { ref: trackRef, className: 'muxui-color-slider-track' },
      React.createElement(SliderFill, { className: 'muxui-color-slider-fill' }),
      React.createElement(ColorThumb, {
        ref: thumbRef,
        className: 'muxui-color-slider-thumb',
        'data-readonly': readOnly || undefined,
        style: { backgroundColor: 'transparent' },
      }, (renderProps) => React.createElement(PreciseColorThumb, { ...renderProps, readOnly, trackRef, thumbRef })),
    ),
  );
}
