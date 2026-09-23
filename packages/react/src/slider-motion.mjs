import React from 'react';
import { animate, LazyMotion, domAnimation, useMotionValue, useTransform } from 'motion/react';
import { span as MotionSpan } from 'motion/react-m';
import { SliderFill, SliderThumb, SliderTrack } from 'react-aria-components';
import { observeReducedMotion, resolvedMotionSpring } from './motion.mjs';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;
const adjustmentKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

function SliderMotionThumb({ isDragging, isDisabled, orientation, readOnly, trackRef, thumbRef }) {
  const [reduced, setReduced] = React.useState(false);
  const [keyPressed, setKeyPressed] = React.useState(false);
  const [pointerCancelled, setPointerCancelled] = React.useState(false);
  const squish = useMotionValue(0);
  const scaleX = useTransform(() => orientation === 'vertical' ? 1 - squish.get() * 0.08 : 1 + squish.get() * 0.08);
  const scaleY = useTransform(() => orientation === 'vertical' ? 1 + squish.get() * 0.08 : 1 - squish.get() * 0.08);
  const blocked = isDisabled || readOnly;

  React.useEffect(() => {
    const node = thumbRef.current;
    if (!node) return undefined;
    return observeReducedMotion(node, null, (nextReduced) => {
      setReduced(nextReduced);
      if (nextReduced) squish.jump(0);
    });
  }, [squish, thumbRef]);

  React.useEffect(() => {
    if (blocked) setKeyPressed(false);
    const track = trackRef.current;
    if (!track) return undefined;
    // Keep the decorative press finite when a native pointer cancel outlives RAC's render state.
    const activePointer = { id: null };
    const pointerDown = (event) => {
      if (event.isPrimary && event.button === 0) {
        activePointer.id = event.pointerId;
        setPointerCancelled(false);
      }
    };
    const pointerEnd = (event) => {
      if (activePointer.id !== event.pointerId) return;
      activePointer.id = null;
      if (event.type === 'pointercancel') setPointerCancelled(true);
    };
    const keyDown = (event) => {
      if (!blocked && adjustmentKeys.has(event.key)) setKeyPressed(true);
    };
    const keyUp = () => setKeyPressed(false);
    track.addEventListener('pointerdown', pointerDown, true);
    track.addEventListener('keydown', keyDown, true);
    track.addEventListener('keyup', keyUp, true);
    track.addEventListener('blur', keyUp, true);
    track.ownerDocument.addEventListener('pointerup', pointerEnd, true);
    track.ownerDocument.addEventListener('pointercancel', pointerEnd, true);
    return () => {
      track.removeEventListener('pointerdown', pointerDown, true);
      track.removeEventListener('keydown', keyDown, true);
      track.removeEventListener('keyup', keyUp, true);
      track.removeEventListener('blur', keyUp, true);
      track.ownerDocument.removeEventListener('pointerup', pointerEnd, true);
      track.ownerDocument.removeEventListener('pointercancel', pointerEnd, true);
    };
  }, [blocked, trackRef]);

  useIsomorphicLayoutEffect(() => {
    const target = !blocked && !reduced && ((isDragging && !pointerCancelled) || keyPressed) ? 1 : 0;
    const transition = !blocked && !reduced ? resolvedMotionSpring(thumbRef.current) : null;
    if (!transition || squish.get() === target) {
      squish.jump(target);
      return undefined;
    }
    const controls = animate(squish, target, transition);
    return () => {
      controls.stop();
    };
  }, [blocked, isDragging, keyPressed, pointerCancelled, reduced, squish, thumbRef]);

  return React.createElement(MotionSpan, {
    className: 'muxui-slider-thumb-visual',
    'aria-hidden': true,
  }, React.createElement(MotionSpan, {
    className: 'muxui-slider-thumb-face',
    style: { scaleX, scaleY },
  }));
}

/** Keep React Aria's track, input, hit target, and positioning as the sole slider engine. */
export function SliderMotionTrack({ orientation, readOnly }) {
  const trackRef = React.useRef(null);
  const thumbRef = React.useRef(null);
  return React.createElement(LazyMotion, { features: domAnimation, strict: true },
    React.createElement(SliderTrack, { ref: trackRef, className: 'muxui-slider-track' },
      React.createElement(SliderFill, { className: 'muxui-slider-fill' }),
      React.createElement(SliderThumb, {
        ref: thumbRef,
        className: 'muxui-slider-thumb',
        'data-readonly': readOnly || undefined,
      }, (renderProps) => React.createElement(SliderMotionThumb, { ...renderProps, orientation, readOnly, trackRef, thumbRef })),
    ),
  );
}
