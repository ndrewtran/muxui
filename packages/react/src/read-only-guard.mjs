import React from 'react';

const readOnlyInteractionEvents = [
  'beforeinput', 'change', 'click', 'input', 'keydown', 'mousedown', 'mousemove',
  'pointerdown', 'pointermove', 'touchstart', 'touchmove',
];
const readOnlyTargetGuards = new WeakMap();

// Read-only controls stay focusable and navigable. Keys that change the value are
// blocked with any modifier, because React Aria acts on them regardless; Tab and
// Escape are never blocked.
const READ_ONLY_ADJUSTMENT_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);
// Swatch pickers move focus with arrows, so only the selection keys are blocked.
export const READ_ONLY_SELECTION_KEYS = new Set(['Enter', ' ']);

function readOnlyBlocksKey(event, keys) {
  return keys.has(event.key);
}

export function readOnlyKeyGuard(readOnly, keys = READ_ONLY_ADJUSTMENT_KEYS) {
  return (event) => {
    if (readOnly && readOnlyBlocksKey(event, keys)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
}

function setReadOnlyTargetGuard(target, readOnly) {
  const existingGuard = readOnlyTargetGuards.get(target);
  if (readOnly && !existingGuard) {
    const keys = target.getAttribute('role') === 'listbox' ? READ_ONLY_SELECTION_KEYS : READ_ONLY_ADJUSTMENT_KEYS;
    const guard = (event) => {
      if (event.type === 'keydown' && !readOnlyBlocksKey(event, keys)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    for (const eventName of readOnlyInteractionEvents) target.addEventListener(eventName, guard, true);
    readOnlyTargetGuards.set(target, guard);
  } else if (!readOnly && existingGuard) {
    for (const eventName of readOnlyInteractionEvents) target.removeEventListener(eventName, existingGuard, true);
    readOnlyTargetGuards.delete(target);
  }
}

function updateReadOnlyTargets(scope, readOnly, selector) {
  if (!scope) return;
  const targets = [
    ...(scope.matches(selector) ? [scope] : []),
    ...scope.querySelectorAll(selector),
  ];
  for (const target of targets) {
    if (readOnly) {
      target.setAttribute('aria-readonly', 'true');
      target.setAttribute('data-readonly', 'true');
    } else {
      target.removeAttribute('aria-readonly');
      target.removeAttribute('data-readonly');
    }
    setReadOnlyTargetGuard(target, readOnly);
  }
}

export function useReadOnlyTargets(forwardedRef, readOnly, selector) {
  const scopeRef = React.useRef(null);
  const assignRef = React.useCallback((node) => {
    scopeRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
    // SSR can carry owned root/thumb data markers. RAC-private range inputs are
    // decorated by this callback during commit, so no private internals/imports
    // are needed to expose readOnly semantics on the actual targets.
    updateReadOnlyTargets(node, readOnly, selector);
  }, [forwardedRef, readOnly, selector]);
  const useReadOnlyLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;
  useReadOnlyLayoutEffect(() => {
    updateReadOnlyTargets(scopeRef.current, readOnly, selector);
  }, [readOnly, selector]);
  return assignRef;
}
