const MOTION_SCOPE_ATTRIBUTES = Object.freeze(['data-reduced-motion', 'data-muxui-motion']);
const CSS_EASINGS = Object.freeze({
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
  linear: [0, 0, 1, 1],
  'step-start': () => 1,
  'step-end': (progress) => (progress >= 1 ? 1 : 0),
});
const MAX_LINEAR_EASING_POINTS = 1000;

function parseTime(value) {
  const match = /^(-?(?:\d+\.?\d*|\.\d+))(ms|s)$/u.exec(String(value ?? '').trim());
  if (!match) return null;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds)) return null;
  return match[2] === 'ms' ? seconds / 1000 : seconds;
}

function parseEasing(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (Object.hasOwn(CSS_EASINGS, normalized)) return CSS_EASINGS[normalized];
  const match = /^cubic-bezier\(([^)]+)\)$/u.exec(normalized);
  if (match) {
    const parts = match[1].split(',').map((part) => part.trim());
    if (parts.length !== 4 || parts.some((part) => part === '')) return null;
    const values = parts.map(Number);
    return values.every(Number.isFinite) && values[0] >= 0 && values[0] <= 1 && values[2] >= 0 && values[2] <= 1
      ? values
      : null;
  }
  const linearMatch = /^linear\(([^)]+)\)$/u.exec(normalized);
  if (!linearMatch) return null;
  const parts = linearMatch[1].split(',').map((part) => part.trim());
  if (parts.some((part) => part === '')) return null;
  const points = parts.map(Number);
  if (points.length < 2 || points.length > MAX_LINEAR_EASING_POINTS || !points.every(Number.isFinite)) return null;
  return (progress) => {
    const position = Math.min(points.length - 1, Math.max(0, progress * (points.length - 1)));
    const index = Math.floor(position);
    const remainder = position - index;
    return index === points.length - 1 ? points[index] : points[index] + (points[index + 1] - points[index]) * remainder;
  };
}

function transitionRole(durationRole, easingRole) {
  if (durationRole === 'interaction' && easingRole === 'interaction') return 'interaction';
  if (durationRole === 'reveal' && easingRole === 'reveal') return 'reveal';
  if (durationRole === 'exit' && easingRole === 'dismiss') return 'dismiss';
  if (durationRole === 'state' && easingRole === 'interaction') return 'state';
  if (durationRole === 'content-resize' && easingRole === 'interaction') return 'content-resize';
  if (durationRole === 'modal-enter' && easingRole === 'modal') return 'modal';
  if (durationRole === 'exit' && easingRole === 'modal') return 'modal-dismiss';
  if (durationRole === 'progress' && easingRole === 'progress') return 'progress';
  return null;
}

function readSpringSettings(style, durationRole, easingRole) {
  const role = transitionRole(durationRole, easingRole);
  if (!role) return { visualDuration: null, bounce: 0 };
  const bounce = Number(style.getPropertyValue(`--muxui-semantic-motion-${role}-transition-spring-bounce`).trim());
  const visualDuration = parseTime(style.getPropertyValue(`--muxui-semantic-motion-${role}-transition-spring-visual-duration`));
  return {
    visualDuration: visualDuration !== null && visualDuration >= 0 ? visualDuration : null,
    bounce: Number.isFinite(bounce) && bounce >= 0 && bounce <= 1 ? bounce : 0,
  };
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
  const role = transitionRole(durationRole, easingRole);
  if (!role) return null;
  const style = window.getComputedStyle(node);
  const transitionPrefix = `--muxui-semantic-motion-${role}-transition`;
  const duration = parseTime(style.getPropertyValue(`${transitionPrefix}-duration`))
    ?? parseTime(style.getPropertyValue(`--muxui-semantic-motion-${durationRole}-duration`));
  const easing = parseEasing(style.getPropertyValue(`${transitionPrefix}-easing`))
    ?? parseEasing(style.getPropertyValue(`--muxui-semantic-motion-${easingRole}-easing`));
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
  const style = window.getComputedStyle(node);
  const spring = readSpringSettings(style, durationRole, easingRole);
  return {
    type: 'spring',
    duration: transition.duration,
    visualDuration: spring.visualDuration ?? transition.duration,
    bounce: spring.bounce,
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
