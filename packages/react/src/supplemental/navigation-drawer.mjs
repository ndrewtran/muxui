import React from 'react';

// The focus helpers from here through SidebarDrawerExit also serve HeaderNav's drawer.
// Focus that folding would hide: a display:none or visibility:hidden control.
export const sidebarUnreachable = (node) => node.getClientRects().length === 0 || getComputedStyle(node).visibility === 'hidden';
/** Focuses the first candidate that is rendered and really takes focus, and says whether one did; a Root reached this way gets a tabindex only then. */
export function sidebarFocusFirst(candidates, roots) {
  for (const candidate of candidates) {
    if (!candidate?.isConnected || sidebarUnreachable(candidate)) continue;
    if (roots.has(candidate) && !candidate.hasAttribute('tabindex')) candidate.tabIndex = -1;
    candidate.focus({ preventScroll: true });
    if (candidate.getRootNode().activeElement === candidate) return true;
  }
  return false;
}

/**
 * Hands lost focus over to the first candidate that takes it, retrying on animation frames for about half a second:
 * an overlay that is still closing keeps the target inert. It only acts while focus is lost, on nothing, on the body,
 * or on `stale` content, so a newer deliberate focus is never overwritten.
 */
export function sidebarHandoff(candidates, roots, stale) {
  const started = performance.now();
  const attempt = () => {
    const active = document.activeElement;
    if (active && active !== document.body && !stale(active)) return;
    if (!sidebarFocusFirst(candidates(), roots) && performance.now() - started < 500) requestAnimationFrame(attempt);
  };
  attempt();
}
/** Runs `exit` once the drawer content unmounts, after any exit animation. */
export function SidebarDrawerExit({ exit }) {
  const latest = React.useRef(exit);
  latest.current = exit;
  React.useEffect(() => () => latest.current(), []);
  return null;
}
