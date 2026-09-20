import React from 'react';
import { animate } from 'motion/react';
import { OverlayTriggerStateContext, Popover as AriaPopover, PopoverContext } from 'react-aria-components';

const DATE_POPOVER_ENTER = Object.freeze({
  opacity: [0, 1],
  transform: ['translateY(-4px)', 'translateY(0px)'],
});
const DATE_POPOVER_INITIAL_STYLE = Object.freeze({ opacity: 0, transform: 'translateY(-4px)' });
const DATE_POPOVER_REDUCED_ATTRIBUTE = 'data-muxui-date-popover-reduced';
const MOTION_SCOPE_ATTRIBUTES = Object.freeze(['data-reduced-motion', 'data-muxui-motion']);
const CSS_EASINGS = Object.freeze({
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
  linear: [0, 0, 1, 1],
});

function parseTime(value) {
  const match = /^(-?(?:\d+\.?\d*|\.\d+))(ms|s)$/u.exec(String(value ?? '').trim());
  if (!match) return null;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds)) return null;
  return match[2] === 'ms' ? seconds / 1000 : seconds;
}

function parseEasing(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized in CSS_EASINGS) return CSS_EASINGS[normalized];
  const match = /^cubic-bezier\(([^)]+)\)$/u.exec(normalized);
  if (!match) return null;
  const values = match[1].split(',').map((part) => Number(part.trim()));
  return values.length === 4 && values.every(Number.isFinite) ? values : null;
}

function collectAncestors(...elements) {
  const ancestors = new Set();
  for (const element of elements) {
    let current = element;
    while (current) {
      ancestors.add(current);
      current = current.parentElement;
    }
  }
  return [...ancestors];
}

function hasReducedScope(node) {
  let current = node;
  while (current) {
    if (current.hasAttribute('data-reduced-motion') || current.getAttribute('data-muxui-motion') === 'reduced') return true;
    current = current.parentElement;
  }
  return false;
}

function isReducedMotion(node, triggerNode) {
  const systemReduced = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return systemReduced || hasReducedScope(node) || hasReducedScope(triggerNode);
}

export function resolvedMotionTransition(node, triggerNode, durationRole = 'interaction') {
  if (typeof window === 'undefined' || !node || isReducedMotion(node, triggerNode)) return null;
  const style = window.getComputedStyle(node);
  const duration = parseTime(style.getPropertyValue(`--muxui-semantic-motion-${durationRole}-duration`));
  const easing = parseEasing(style.getPropertyValue('--muxui-semantic-motion-interaction-easing'));
  if (duration === null || duration <= 0 || !easing) return null;
  return { duration, ease: easing };
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

export function observeReducedMotion(node, triggerNode, onChange) {
  const update = () => onChange(isReducedMotion(node, triggerNode));
  update();
  const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(update);
  collectAncestors(node, triggerNode).forEach((ancestor) => {
    observer?.observe(ancestor, { attributes: true, attributeFilter: MOTION_SCOPE_ATTRIBUTES });
  });
  const media = node.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)');
  media?.addEventListener?.('change', update);
  if (!media?.addEventListener) media?.addListener?.(update);
  return () => {
    observer?.disconnect();
    media?.removeEventListener?.('change', update);
    if (!media?.removeEventListener) media?.removeListener?.(update);
  };
}

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
