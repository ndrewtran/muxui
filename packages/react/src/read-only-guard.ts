import React from 'react';
import type { ForwardedRef, KeyboardEvent as ReactKeyboardEvent } from 'react';

const readOnlyInteractionEvents = [
  'beforeinput', 'change', 'click', 'input', 'keydown', 'mousedown', 'mousemove',
  'pointerdown', 'pointermove', 'touchstart', 'touchmove',
];
const readOnlyTargetGuards = new WeakMap<Element, EventListener>();

// Read-only controls stay focusable and navigable. Keys that change the value are
// blocked with any modifier, because React Aria acts on them regardless; Tab and
// Escape are never blocked.
const READ_ONLY_ADJUSTMENT_KEYS: ReadonlySet<string> = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);
// Swatch pickers move focus with arrows, so only the selection keys are blocked.
export const READ_ONLY_SELECTION_KEYS: ReadonlySet<string> = new Set(['Enter', ' ']);

function readOnlyBlocksKey(event: { key: string }, keys: ReadonlySet<string>) {
  return keys.has(event.key);
}

export function readOnlyKeyGuard(readOnly: boolean, keys: ReadonlySet<string> = READ_ONLY_ADJUSTMENT_KEYS) {
  return (event: ReactKeyboardEvent) => {
    if (readOnly && readOnlyBlocksKey(event, keys)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
}

function setReadOnlyTargetGuard(target: Element, readOnly: boolean) {
  const existingGuard = readOnlyTargetGuards.get(target);
  if (readOnly && !existingGuard) {
    const keys = target.getAttribute('role') === 'listbox' ? READ_ONLY_SELECTION_KEYS : READ_ONLY_ADJUSTMENT_KEYS;
    const guard = (event: Event) => {
      // A keydown listener receives a KeyboardEvent; the other events carry no key to test.
      if (event.type === 'keydown' && !readOnlyBlocksKey(event as KeyboardEvent, keys)) return;
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

function updateReadOnlyTargets(scope: Element | null, readOnly: boolean, selector: string) {
  if (!scope) return;
  const targets = [
    ...(scope.matches(selector) ? [scope] : []),
    ...scope.querySelectorAll(selector),
  ];
  for (const target of targets) {
    if (readOnly) {
      target.setAttribute('aria-readonly', 'true');
      target.setAttribute('data-muxui-state-read-only', 'true');
    } else {
      target.removeAttribute('aria-readonly');
      target.removeAttribute('data-muxui-state-read-only');
    }
    setReadOnlyTargetGuard(target, readOnly);
  }
}

export function useReadOnlyTargets<T extends Element>(forwardedRef: ForwardedRef<T>, readOnly: boolean, selector: string) {
  const scopeRef = React.useRef<T | null>(null);
  const assignRef = React.useCallback((node: T | null) => {
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
