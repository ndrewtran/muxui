import React from 'react';
import { animate } from 'motion/react';
import { observeReducedMotion, resolvedMotionSpring, resolvedMotionTransition } from './motion.mjs';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;
const ENTRY_DISTANCE = 4;

function placementOffset(placement) {
  const side = String(placement ?? 'bottom').split('-')[0];
  if (side === 'top') return { x: 0, y: ENTRY_DISTANCE };
  if (side === 'left') return { x: ENTRY_DISTANCE, y: 0 };
  if (side === 'right') return { x: -ENTRY_DISTANCE, y: 0 };
  return { x: 0, y: -ENTRY_DISTANCE };
}

function transform(x, y) {
  return `translate3d(${x}px, ${y}px, 0)`;
}

function readVisibleValues(node) {
  if (typeof window === 'undefined') return { opacity: 1, x: 0, y: 0 };
  const style = window.getComputedStyle(node);
  const opacity = Number(style.opacity);
  const Matrix = node.ownerDocument.defaultView?.DOMMatrixReadOnly;
  let x = 0;
  let y = 0;
  if (Matrix && style.transform !== 'none') {
    const matrix = new Matrix(style.transform);
    if (Number.isFinite(matrix.m41)) x = matrix.m41;
    if (Number.isFinite(matrix.m42)) y = matrix.m42;
  }
  return {
    opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1,
    x,
    y,
  };
}

function readTranslate(node) {
  const value = node.ownerDocument.defaultView?.getComputedStyle(node).translate;
  const match = /^\s*(-?(?:\d+\.?\d*|\.\d+))px(?:\s+(-?(?:\d+\.?\d*|\.\d+))px)?/u.exec(String(value ?? ''));
  return match ? { x: Number(match[1]), y: Number(match[2] ?? 0) } : { x: 0, y: 0 };
}

function measureMotionContentHeight(node) {
  return Math.max(node.scrollHeight, node.getBoundingClientRect().height);
}

function targetValues(isOpen, placement, exitOffset) {
  if (isOpen) return { opacity: 1, x: 0, y: 0 };
  const offset = exitOffset ?? placementOffset(placement);
  return { opacity: 0, ...offset };
}

function progressTransition(transition) {
  if (!transition) return null;
  return transition.type === 'spring'
    ? { type: 'spring', visualDuration: transition.visualDuration, bounce: transition.bounce }
    : transition;
}

/**
 * Own the pixels of a finite open/close cycle for either a child wrapper or
 * the RAC popup itself. `property: translate` composes with RAC's placement
 * transform without replacing it.
 */
export function useMotionLifecycle({ isOpen, placement, triggerRef, property = 'transform', entryOffset, exitOffset, onEntryComplete, onExitComplete }) {
  const [node, setNode] = React.useState(null);
  const isOpenRef = React.useRef(Boolean(isOpen));
  const animatedNodeRef = React.useRef(null);
  const controlsRef = React.useRef(null);
  const phaseRef = React.useRef(null);
  const animationIdRef = React.useRef(0);
  const valuesRef = React.useRef(null);
  const originalStyleRef = React.useRef(null);
  const completedAnimationRef = React.useRef(0);
  const onEntryCompleteRef = React.useRef(onEntryComplete);
  const onExitCompleteRef = React.useRef(onExitComplete);
  onEntryCompleteRef.current = onEntryComplete;
  onExitCompleteRef.current = onExitComplete;
  isOpenRef.current = Boolean(isOpen);

  const setNodeRef = React.useCallback((element) => {
    setNode(element);
    if (element && element !== animatedNodeRef.current) {
      originalStyleRef.current = {
        opacity: element.style.opacity,
        opacityPriority: element.style.getPropertyPriority('opacity'),
        property: element.style[property],
        propertyPriority: element.style.getPropertyPriority(property),
      };
      valuesRef.current = null;
    }
  }, [property]);

  const restoreStyle = React.useCallback((element) => {
    const original = originalStyleRef.current;
    if (!original) return;
    if (original.opacity) element.style.setProperty('opacity', original.opacity, original.opacityPriority);
    else element.style.removeProperty('opacity');
    if (original.property) element.style.setProperty(property, original.property, original.propertyPriority);
    else element.style.removeProperty(property);
  }, [property]);

  const settle = React.useCallback((controls) => {
    controls?.stop();
    if (controlsRef.current === controls) controlsRef.current = null;
  }, []);

  const finishExit = React.useCallback((animationId) => {
    if (animationId !== animationIdRef.current || isOpenRef.current || phaseRef.current !== 'exit') return;
    phaseRef.current = null;
    controlsRef.current = null;
    onExitCompleteRef.current?.();
  }, []);

  useIsomorphicLayoutEffect(() => {
    // RAC builds collections in a disconnected template copy. That copy must
    // not animate or complete the visible component's retained exit.
    if (!node || node.nodeType !== 1 || !node.isConnected) return undefined;
    const disconnect = observeReducedMotion(node, triggerRef?.current, (reduced) => {
      node.toggleAttribute('data-muxui-motion-reduced', reduced);
      if (!reduced) return;
      const controls = controlsRef.current;
      if (controls) {
        settle(controls);
        const target = targetValues(Boolean(isOpenRef.current), placement, exitOffset);
        node.style.opacity = String(target.opacity);
        node.style[property] = property === 'translate' ? `${target.x}px ${target.y}px` : transform(target.x, target.y);
        valuesRef.current = target;
        if (!isOpenRef.current && phaseRef.current === 'exit') finishExit(animationIdRef.current);
      } else if (phaseRef.current === 'exit') {
        finishExit(animationIdRef.current);
      }
    });
    return () => {
      disconnect();
      node.removeAttribute('data-muxui-motion-reduced');
    };
  }, [exitOffset, finishExit, node, placement, property, settle, triggerRef]);

  useIsomorphicLayoutEffect(() => {
    if (!node || node.nodeType !== 1 || !node.isConnected) return undefined;
    const animationId = animationIdRef.current + 1;
    animationIdRef.current = animationId;
    const initialOpen = Boolean(isOpen) && animatedNodeRef.current !== node;
    animatedNodeRef.current = node;
    const resolvedPlacement = node.getAttribute('data-placement') ?? placement;
    const from = initialOpen
      ? { opacity: 0, ...(entryOffset ?? placementOffset(resolvedPlacement)) }
      : valuesRef.current ?? (property === 'translate' ? readTranslate(node) : readVisibleValues(node));
    const visible = property === 'translate' ? readVisibleValues(node) : null;
    if (!initialOpen && visible && valuesRef.current?.opacity === undefined) from.opacity = visible.opacity;
    const to = targetValues(Boolean(isOpen), resolvedPlacement, exitOffset);
    const transition = progressTransition(isOpen
      ? resolvedMotionSpring(node, triggerRef?.current, 'reveal', 'reveal')
      : resolvedMotionTransition(node, triggerRef?.current, 'exit', 'dismiss'));
    phaseRef.current = isOpen ? 'entry' : 'exit';
    completedAnimationRef.current = 0;

    const apply = (progress) => {
      const values = {
        opacity: from.opacity + ((to.opacity - from.opacity) * progress),
        x: from.x + ((to.x - from.x) * progress),
        y: from.y + ((to.y - from.y) * progress),
      };
      valuesRef.current = values;
      node.style.opacity = String(values.opacity);
      node.style[property] = property === 'translate' ? `${values.x}px ${values.y}px` : transform(values.x, values.y);
    };
    const complete = () => {
      if (completedAnimationRef.current === animationId) return;
      completedAnimationRef.current = animationId;
      if (isOpen) {
        restoreStyle(node);
        valuesRef.current = { opacity: 1, x: 0, y: 0 };
        onEntryCompleteRef.current?.();
      } else {
        apply(1);
        finishExit(animationId);
      }
    };

    if (!transition) {
      complete();
      return () => {
        if (phaseRef.current === (isOpen ? 'entry' : 'exit')) phaseRef.current = null;
      };
    }

    let active = true;
    apply(0);
    const controls = animate(0, 1, { ...transition, onUpdate: apply });
    controls.then(() => {
      if (!active || animationId !== animationIdRef.current) return;
      controlsRef.current = null;
      complete();
    });
    controlsRef.current = controls;
    return () => {
      active = false;
      settle(controls);
      if (phaseRef.current === (isOpen ? 'entry' : 'exit')) phaseRef.current = null;
    };
  }, [entryOffset, exitOffset, finishExit, isOpen, node, placement, property, restoreStyle, settle, triggerRef]);

  React.useEffect(() => () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    animationIdRef.current += 1;
  }, []);

  return setNodeRef;
}

/** Animate list reflow on the independent translate channel. */
export function useMotionLayout(nodeRef, layoutKey, triggerRef) {
  const previousRectRef = React.useRef(null);
  const controlsRef = React.useRef(null);
  const reducedRef = React.useRef(false);

  useIsomorphicLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node || node.nodeType !== 1) return undefined;
    const settle = () => {
      controlsRef.current?.stop();
      controlsRef.current = null;
      node.style.removeProperty('translate');
      previousRectRef.current = node.getBoundingClientRect();
    };
    return observeReducedMotion(node, triggerRef?.current, (reduced) => {
      reducedRef.current = reduced;
      if (reduced) settle();
      else previousRectRef.current = node.getBoundingClientRect();
    });
  }, [nodeRef, triggerRef]);

  useIsomorphicLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node || node.nodeType !== 1) return undefined;
    const nextRect = node.getBoundingClientRect();
    const previousRect = previousRectRef.current;
    previousRectRef.current = nextRect;
    if (!previousRect || reducedRef.current) return undefined;
    const x = previousRect.left - nextRect.left;
    const y = previousRect.top - nextRect.top;
    if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) return undefined;
    controlsRef.current?.stop();
    const transition = progressTransition(resolvedMotionSpring(node, triggerRef?.current, 'interaction', 'interaction'));
    if (!transition) return undefined;
    let active = true;
    const controls = animate(0, 1, {
      ...transition,
      onUpdate: (progress) => {
        if (active) node.style.translate = `${x * (1 - progress)}px ${y * (1 - progress)}px`;
      },
    });
    controlsRef.current = controls;
    controls.then(() => {
      if (!active) return;
      node.style.removeProperty('translate');
      if (controlsRef.current === controls) controlsRef.current = null;
    });
    return () => {
      active = false;
      controls.stop();
      if (controlsRef.current === controls) controlsRef.current = null;
      node.style.removeProperty('translate');
    };
  }, [layoutKey, nodeRef, triggerRef]);

  React.useEffect(() => () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    nodeRef.current?.style.removeProperty('translate');
  }, [nodeRef]);
}

/** Keep the grouped chevron on the semantic interaction spring, including reversals. */
export function useDisclosureIconMotion(ref, isOpen) {
  const angleRef = React.useRef(isOpen ? 180 : 0);
  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node?.isConnected) return undefined;
    const target = isOpen ? 180 : 0;
    let active = true;
    let controls = null;
    const apply = (angle) => {
      if (!active) return;
      angleRef.current = angle;
      node.style.transform = `rotate(${angle}deg)`;
    };
    const disconnect = observeReducedMotion(node, null, (reduced) => {
      if (reduced) {
        controls?.stop();
        controls = null;
        apply(target);
      }
    });
    const transition = resolvedMotionSpring(node, null);
    if (!transition || angleRef.current === target) apply(target);
    else controls = animate(angleRef.current, target, { ...transition, onUpdate: apply });
    return () => {
      active = false;
      controls?.stop();
      disconnect();
    };
  }, [ref, isOpen]);
}

/** Animate a disclosure's measured content height without scaling its contents. */
export function MotionHeight({ children, isOpen, triggerRef, hostRef, className, ...props }) {
  const panelRef = React.useRef(null);
  const contentRef = React.useRef(null);
  const controlsRef = React.useRef(null);
  const isOpenRef = React.useRef(Boolean(isOpen));
  const reducedRef = React.useRef(false);
  const contentControlsRef = React.useRef(null);
  const contentMountedRef = React.useRef(false);
  const targetHeightRef = React.useRef(null);
  const animateTargetRef = React.useRef(null);
  const animationIdRef = React.useRef(0);
  const mountedRef = React.useRef(false);
  const closedSettledRef = React.useRef(!isOpen);
  const initialClosedRef = React.useRef(!isOpen);
  const [initialClosedStyle, setInitialClosedStyle] = React.useState(initialClosedRef.current);
  const [reduced, setReduced] = React.useState(false);
  isOpenRef.current = Boolean(isOpen);
  reducedRef.current = reduced;

  useIsomorphicLayoutEffect(() => {
    if (initialClosedRef.current) setInitialClosedStyle(false);
  }, []);

  const animateTarget = React.useCallback((targetHeight) => {
    const panel = panelRef.current;
    const content = contentRef.current;
    if (!panel || !content) return;
    const animationId = animationIdRef.current + 1;
    animationIdRef.current = animationId;
    const host = hostRef?.current ?? panel.parentElement;
    if (host && (isOpenRef.current || mountedRef.current)) host.removeAttribute('hidden');
    const activeControls = controlsRef.current;
    const measuredHeight = panel.getBoundingClientRect().height;
    // A cleared control after an open spring can still be followed by a late
    // content resize. Keep the measured natural height in that case; zero is
    // only the true closed-to-open starting point.
    const currentHeight = activeControls
      ? measuredHeight
      : isOpenRef.current && closedSettledRef.current
        ? 0
        : targetHeightRef.current ?? (measuredHeight || measureMotionContentHeight(content));
    targetHeightRef.current = targetHeight;
    controlsRef.current?.stop();
    controlsRef.current = null;
    panel.style.overflow = 'hidden';
    panel.style.height = `${currentHeight}px`;
    closedSettledRef.current = false;
    const settle = () => {
      if (animationId !== animationIdRef.current) return;
      if (isOpenRef.current) {
        // Let natural height resume after the spring so dynamic children and
        // focus rings are not clipped once the panel has settled.
        panel.style.removeProperty('height');
        panel.style.removeProperty('overflow');
        host?.removeAttribute('hidden');
        closedSettledRef.current = false;
      } else {
        panel.style.height = '0px';
        panel.style.overflow = 'hidden';
        host?.setAttribute('hidden', 'until-found');
        closedSettledRef.current = true;
      }
    };
    if (!isOpenRef.current && !mountedRef.current) {
      panel.style.height = '0px';
      panel.style.overflow = 'hidden';
      host?.setAttribute('hidden', 'until-found');
      closedSettledRef.current = true;
      mountedRef.current = true;
      return;
    }
    mountedRef.current = true;
    if (reducedRef.current) {
      settle();
      return;
    }
    const transition = resolvedMotionSpring(panel, triggerRef?.current, 'content-resize', 'interaction');
    if (!transition || Math.abs(currentHeight - targetHeight) < 0.5) {
      settle();
      return;
    }
    const controls = animate(currentHeight, targetHeight, {
      ...transition,
      onUpdate: (value) => {
        if (animationId === animationIdRef.current) panel.style.height = `${value}px`;
      },
    });
    controlsRef.current = controls;
    controls.then(() => {
      if (controlsRef.current === controls) controlsRef.current = null;
      if (animationId !== animationIdRef.current) return;
      const latestTarget = isOpenRef.current ? measureMotionContentHeight(content) : 0;
      if (latestTarget !== targetHeight) {
        animateTarget(latestTarget);
        return;
      }
      settle();
    });
  }, [hostRef, triggerRef]);

  const animateTargetRefCallback = React.useCallback(animateTarget, [animateTarget]);
  useIsomorphicLayoutEffect(() => {
    animateTargetRef.current = animateTargetRefCallback;
    return () => {
      if (animateTargetRef.current === animateTargetRefCallback) animateTargetRef.current = null;
    };
  }, [animateTargetRefCallback]);

  useIsomorphicLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return undefined;
    return observeReducedMotion(panel, triggerRef?.current, (nextReduced) => {
      reducedRef.current = nextReduced;
      // Settle the active imperative animation in the same observer turn. The
      // state update below still re-runs the target effect, but it must not be
      // the first thing that stops a spring after a runtime preference change.
      if (nextReduced) {
        contentControlsRef.current?.stop();
        contentControlsRef.current = null;
        contentRef.current?.style.removeProperty('opacity');
        contentRef.current?.style.removeProperty('transform');
        const targetHeight = isOpenRef.current && contentRef.current
          ? measureMotionContentHeight(contentRef.current)
          : 0;
        animateTargetRef.current?.(targetHeight);
      }
      setReduced(nextReduced);
    });
  }, [triggerRef]);

  useIsomorphicLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return undefined;
    const initial = !contentMountedRef.current;
    contentMountedRef.current = true;
    const transition = isOpen
      ? resolvedMotionTransition(content, triggerRef?.current, 'reveal', 'reveal')
      : resolvedMotionTransition(content, triggerRef?.current, 'exit', 'dismiss');
    const settle = () => {
      if (isOpen || !transition) {
        content.style.removeProperty('opacity');
        content.style.removeProperty('transform');
      } else {
        content.style.opacity = '0.82';
        content.style.transform = 'translateY(3px)';
      }
    };
    // Initial expanded content is already readable in SSR. Only subsequent
    // state changes get the soft reveal; content resizes do not replay it.
    if (initial || !transition) {
      settle();
      return undefined;
    }
    const from = readVisibleValues(content);
    let active = true;
    const controls = animate(content, {
      opacity: [from.opacity, isOpen ? 1 : 0.82],
      transform: [`translateY(${from.y}px)`, `translateY(${isOpen ? 0 : 3}px)`],
    }, transition);
    contentControlsRef.current = controls;
    controls.then(() => {
      if (!active || contentControlsRef.current !== controls) return;
      contentControlsRef.current = null;
      settle();
    });
    return () => {
      active = false;
      controls.stop();
      if (contentControlsRef.current === controls) contentControlsRef.current = null;
    };
  }, [isOpen, reduced, triggerRef]);

  useIsomorphicLayoutEffect(() => {
    const panel = panelRef.current;
    const content = contentRef.current;
    if (!panel || !content) return undefined;
    if (!isOpen && panel.contains(panel.ownerDocument.activeElement)) triggerRef?.current?.focus();
    animateTarget(isOpen ? measureMotionContentHeight(content) : 0);
    return undefined;
  }, [animateTarget, isOpen, reduced]);

  useIsomorphicLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      if (!isOpenRef.current) return;
      const nextHeight = measureMotionContentHeight(content);
      // Ignore the observer's initial delivery and unchanged sizes. Restarting
      // an in-flight spring for either would discard its current trajectory.
      if (Math.abs(nextHeight - targetHeightRef.current) >= 0.5) animateTargetRef.current?.(nextHeight);
    });
    // Padding changes alter the wrapper's border box without necessarily
    // changing its content box, so observe the measured box explicitly.
    observer.observe(content, { box: 'border-box' });
    return () => observer.disconnect();
  }, []);

  useIsomorphicLayoutEffect(() => {
    // Child layout effects can run before RAC attaches the parent's ref.
    const host = hostRef?.current ?? panelRef.current?.parentElement;
    if (!host || typeof MutationObserver === 'undefined') return undefined;
    const observer = new MutationObserver(() => {
      if ((isOpenRef.current || !closedSettledRef.current) && host.hasAttribute('hidden')) host.removeAttribute('hidden');
    });
    observer.observe(host, { attributes: true, attributeFilter: ['hidden'] });
    return () => observer.disconnect();
  }, [hostRef]);

  useIsomorphicLayoutEffect(() => () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    animationIdRef.current += 1;
  }, []);

  return React.createElement('div', {
    ...props,
    ref: panelRef,
    className,
    // This is only emitted for the first closed render. Subsequent open/close
    // cycles leave height ownership to the interruption-safe imperative loop.
    style: initialClosedStyle ? { ...props.style, height: '0px', overflow: 'hidden' } : props.style,
    'aria-hidden': !isOpen || undefined,
    inert: !isOpen || undefined,
  }, React.createElement('div', { ref: contentRef, className: 'muxui-disclosure-panel muxui-disclosure-motion-content' }, children));
}
