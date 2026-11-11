import { animate } from 'motion/react';
import { observeAncestorAttributes, sameGeometry } from './motion-geometry.mjs';
import { observeReducedMotion, resolvedMotionSpring } from './motion.mjs';

const HOVERED_ATTRIBUTE = 'data-muxui-state-hovered';
const REDUCED_ATTRIBUTE = 'data-muxui-hover-reduced';
const UNAVAILABLE_SELECTOR = '[data-muxui-state-disabled], [aria-disabled="true"], [disabled]';
// Everything that changes which item is hovered, or whether one may be.
const WATCHED_ATTRIBUTES = [HOVERED_ATTRIBUTE, 'aria-disabled', 'disabled', 'data-muxui-state-disabled'];

/** Where `item` sits inside `host`, in the coordinates an absolutely positioned child of `host` takes. */
function measure(host, item) {
  const hostRect = host.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  if (itemRect.width <= 0 || itemRect.height <= 0) return null;
  return {
    left: itemRect.left - hostRect.left + host.scrollLeft - host.clientLeft,
    top: itemRect.top - hostRect.top + host.scrollTop - host.clientTop,
    width: itemRect.width,
    height: itemRect.height,
  };
}

function interpolate(from, to, progress) {
  return {
    left: from.left + ((to.left - from.left) * progress),
    top: from.top + ((to.top - from.top) * progress),
    width: from.width + ((to.width - from.width) * progress),
    height: from.height + ((to.height - from.height) * progress),
  };
}

/**
 * One hover layer that follows the hovered item of a group. The caller owns the
 * `layer` element (absolutely positioned in `host`, at `opacity: 0` and a zero
 * box until used), the CSS that paints it, and the `items` it may land on.
 *
 * The hovered item is the one React Aria marks `data-muxui-state-hovered`, so
 * touch never hovers, and a forced preview of that state paints the layer like
 * a real pointer does. Only an unavailable (disabled) item is skipped. A selected
 * item is not: its own fill or shape paints over the layer, so the layer rides
 * under it and comes out the other side. Between items the layer travels on
 * the state spring from the geometry it is painted at, so an interruption
 * continues without a jump. When no item is hovered it fades out where it is,
 * and an item hovered before that fade ends brings it back and it travels there.
 * Once faded it gives up its box, and the next item it enters places it straight
 * there. Layout, resize and scroll re-measure it with no spring. Nothing runs
 * while idle: the observers wake a single animation frame, and a spring runs only
 * while the layer travels.
 *
 * Returns the function that stops it and restores the layer to its idle state.
 */
export function observeHoverLayer({ root, host = root, layer, items }) {
  const view = root.ownerDocument.defaultView;
  const observed = new Set();
  let active = true;
  let current = null;
  let painted = null;
  let destination = null;
  let animation = null;
  let run = 0;
  let cancelPending = null;

  const stopAnimation = () => {
    run += 1;
    animation?.stop();
    animation = null;
  };

  const place = (box) => {
    painted = box;
    Object.assign(layer.style, {
      left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`,
    });
  };

  // An idle layer keeps no box: its last one would widen a scrollable host after the items move.
  const park = () => {
    painted = null;
    destination = null;
    Object.assign(layer.style, { left: '0px', top: '0px', width: '0px', height: '0px' });
  };

  // A hidden layer or a zero duration runs no fade, and a cancelled one ends with no transitionend,
  // so the layer parks whenever no fade is left to wait for.
  const parkUnlessFading = () => {
    if (current) return;
    if (layer.getAnimations?.().some((fade) => fade.transitionProperty === 'opacity')) return;
    park();
  };

  const hide = () => {
    if (!current) return;
    current = null;
    stopAnimation();
    layer.style.opacity = '0';
    parkUnlessFading();
  };

  const show = (item) => {
    const target = measure(host, item);
    if (!target) {
      hide();
      return;
    }
    if (item === current && sameGeometry(destination, target)) return;
    // A move to another item travels from wherever the layer is painted, even mid-fade, so a pointer that slips out of
    // the items and straight back does not make it jump. A parked layer, or a re-measure of the same item, lands at once.
    // The spring is null under every reduced-motion source, so reduced motion jumps with no check of its own here.
    const from = item !== current ? painted : null;
    const transition = from ? resolvedMotionSpring(layer, item, 'state', 'interaction') : null;
    stopAnimation();
    current = item;
    destination = target;
    layer.style.opacity = '1';
    if (!transition || sameGeometry(from, target)) {
      place(target);
      return;
    }
    const id = run + 1;
    run = id;
    animation = animate(0, 1, {
      ...transition,
      onUpdate: (progress) => {
        if (active && id === run) place(interpolate(from, target, progress));
      },
      onComplete: () => {
        if (id !== run) return;
        animation = null;
        place(target);
      },
    });
  };

  const observeItems = () => {
    const present = new Set(items());
    for (const item of observed) {
      if (!present.has(item)) {
        resizeObserver?.unobserve(item);
        observed.delete(item);
      }
    }
    for (const item of present) {
      if (!observed.has(item)) {
        resizeObserver?.observe(item);
        observed.add(item);
      }
    }
  };

  const sync = () => {
    observeItems();
    const hovered = items().find((item) => item.hasAttribute(HOVERED_ATTRIBUTE) && !item.matches(UNAVAILABLE_SELECTOR));
    if (hovered) show(hovered);
    else hide();
  };

  // One frame coalesces a burst of changes, such as the leave and enter of a move between items.
  const schedule = () => {
    if (cancelPending || !active) return;
    const flush = () => {
      cancelPending = null;
      sync();
    };
    if (typeof view?.requestAnimationFrame === 'function') {
      const frame = view.requestAnimationFrame(flush);
      cancelPending = () => view.cancelAnimationFrame(frame);
    } else {
      const timer = setTimeout(flush, 0);
      cancelPending = () => clearTimeout(timer);
    }
  };

  const onFadeSettled = (event) => {
    if (event.target === layer && event.propertyName === 'opacity') parkUnlessFading();
  };

  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
  resizeObserver?.observe(root);
  if (host !== root) resizeObserver?.observe(host);

  const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(schedule);
  mutationObserver?.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: WATCHED_ATTRIBUTES });

  // A direction change moves the items with no resize or mutation inside the root.
  const stopWatchingDirection = observeAncestorAttributes([root], ['dir'], schedule);

  root.addEventListener('scroll', schedule, { capture: true, passive: true });
  layer.addEventListener('transitionend', onFadeSettled);
  layer.addEventListener('transitioncancel', onFadeSettled);

  const disconnectReduced = observeReducedMotion(root, null, (reduced) => {
    layer.toggleAttribute(REDUCED_ATTRIBUTE, reduced);
    if (!reduced) return;
    stopAnimation();
    if (current && destination) place(destination);
    else park();
  });

  sync();

  return () => {
    active = false;
    cancelPending?.();
    mutationObserver?.disconnect();
    resizeObserver?.disconnect();
    stopWatchingDirection();
    disconnectReduced();
    stopAnimation();
    root.removeEventListener('scroll', schedule, true);
    layer.removeEventListener('transitionend', onFadeSettled);
    layer.removeEventListener('transitioncancel', onFadeSettled);
    layer.removeAttribute(REDUCED_ATTRIBUTE);
    for (const property of ['left', 'top', 'width', 'height', 'opacity']) layer.style.removeProperty(property);
  };
}
