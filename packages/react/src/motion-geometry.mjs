import React from 'react';

// Helpers the motion modules share: a forwarded-ref bridge, the geometry
// comparison and FLIP transform behind their travelling indicators, and the
// ancestor watching behind their reduced-motion scopes.

/**
 * Hands `node` to a forwarded ref and returns the function that detaches it, for
 * the caller's own callback ref to return. React 19 runs a returned function in
 * place of calling the ref with null, so the caller also resets its own state
 * there. A callback ref that returned a cleanup gets that cleanup and no null
 * call; any other callback ref gets null, and an object ref gets `current = null`.
 */
export function attachRef(ref, node) {
  const cleanup = typeof ref === 'function' ? ref(node) : undefined;
  if (ref && typeof ref !== 'function') ref.current = node;
  return () => {
    if (typeof cleanup === 'function') cleanup();
    else if (typeof ref === 'function') ref(null);
    else if (ref) ref.current = null;
  };
}

/**
 * Tracks a motion host's root node in state while forwarding it to `rootRef`.
 * Returns the node and the callback ref to place on the host.
 */
export function useRootRef(rootRef) {
  const [root, setRoot] = React.useState(null);
  const setRootRef = React.useCallback((node) => {
    setRoot(node);
    const detach = attachRef(rootRef, node);
    return () => {
      detach();
      setRoot(null);
    };
  }, [rootRef]);
  return [root, setRootRef];
}

const GEOMETRY_TOLERANCE = 0.5;

/** True when both boxes exist and no edge or size differs by half a pixel or more. */
export function sameGeometry(first, second) {
  if (!first || !second) return false;
  return Math.abs(first.left - second.left) < GEOMETRY_TOLERANCE
    && Math.abs(first.top - second.top) < GEOMETRY_TOLERANCE
    && Math.abs(first.width - second.width) < GEOMETRY_TOLERANCE
    && Math.abs(first.height - second.height) < GEOMETRY_TOLERANCE;
}

/** The transform that draws `target` where `current` is, for animating to identity. */
export function transformFrom(current, target) {
  const scaleX = target.width > 0 ? current.width / target.width : 1;
  const scaleY = target.height > 0 ? current.height / target.height : 1;
  return `translate3d(${current.left - target.left}px, ${current.top - target.top}px, 0) scale(${scaleX}, ${scaleY})`;
}

/** Each element and every ancestor of it, once, nearest first. */
export function collectAncestors(...elements) {
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

/**
 * Calls `onChange` when any of `attributes` changes on the elements or their
 * ancestors. Returns the function that stops watching.
 */
export function observeAncestorAttributes(elements, attributes, onChange) {
  if (typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver(onChange);
  for (const ancestor of collectAncestors(...elements)) {
    observer.observe(ancestor, { attributes: true, attributeFilter: attributes });
  }
  return () => observer.disconnect();
}
