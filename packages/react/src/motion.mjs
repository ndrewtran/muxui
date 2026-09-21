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

export function resolvedMotionTransition(node, triggerNode, durationRole = 'interaction', easingRole = 'interaction') {
  if (typeof window === 'undefined' || !node || isReducedMotion(node, triggerNode)) return null;
  const style = window.getComputedStyle(node);
  const duration = parseTime(style.getPropertyValue(`--muxui-semantic-motion-${durationRole}-duration`));
  const easing = parseEasing(style.getPropertyValue(`--muxui-semantic-motion-${easingRole}-easing`));
  if (duration === null || duration <= 0 || !easing) return null;
  return { duration, ease: easing };
}

/**
 * Resolve a restrained duration-based spring for physical values while keeping
 * opacity on the semantic easing curve. `visualDuration` coordinates the bulk
 * of the spring with token-timed siblings; bounce zero keeps utility surfaces
 * from overshooting.
 */
export function resolvedMotionSpring(node, triggerNode, durationRole = 'interaction', easingRole = 'interaction') {
  const transition = resolvedMotionTransition(node, triggerNode, durationRole, easingRole);
  if (!transition) return null;
  return {
    type: 'spring',
    visualDuration: transition.duration,
    bounce: 0,
    opacity: { type: 'tween', duration: transition.duration, ease: transition.ease },
  };
}

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
