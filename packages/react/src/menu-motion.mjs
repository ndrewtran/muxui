import React from 'react';
import { animate } from 'motion/react';
import { PopoverContext } from 'react-aria-components';
import { observeReducedMotion, resolvedMotionSpring } from './motion.mjs';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;
const MENU_ITEM_SELECTOR = '.muxui-menu-item';

function assignRef(ref, value) {
  if (typeof ref === 'function') return ref(value);
  if (ref) ref.current = value;
  return undefined;
}

function directMenuItems(root) {
  return [...root.querySelectorAll(MENU_ITEM_SELECTOR)]
    .filter((item) => item.closest('.muxui-menu') === root);
}

function activeMenuItem(root) {
  const items = directMenuItems(root).filter((item) => (
    !item.hasAttribute('data-disabled')
    && item.getAttribute('aria-disabled') !== 'true'
    && !item.matches(':disabled')
  ));
  return items.find((item) => item.hasAttribute('data-focused'))
    ?? items.find((item) => item.hasAttribute('data-hovered'))
    ?? items.find((item) => item.matches(':hover'))
    ?? null;
}

function geometry(root, node) {
  if (!node) return null;
  const rootRect = root.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  if (!nodeRect.width || !nodeRect.height) return null;
  return {
    left: nodeRect.left - rootRect.left + root.scrollLeft - root.clientLeft,
    top: nodeRect.top - rootRect.top + root.scrollTop - root.clientTop,
    width: nodeRect.width,
    height: nodeRect.height,
  };
}

function ancestorNodes(...nodes) {
  const ancestors = new Set();
  for (let node of nodes) {
    while (node) {
      ancestors.add(node);
      node = node.parentElement;
    }
  }
  return ancestors;
}

function hasReducedPopoverMotion(root, triggerNode) {
  return [...ancestorNodes(root, triggerNode)].some((node) => node.hasAttribute('data-muxui-motion-reduced'));
}

function observeReducedPopoverMotion(root, triggerNode, onChange) {
  if (typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver(onChange);
  for (const node of ancestorNodes(root, triggerNode)) {
    observer.observe(node, { attributes: true, attributeFilter: ['data-muxui-motion-reduced'] });
  }
  return () => observer.disconnect();
}

function sameGeometry(first, second) {
  return first && second
    && Math.abs(first.left - second.left) <= 0.5
    && Math.abs(first.top - second.top) <= 0.5
    && Math.abs(first.width - second.width) <= 0.5
    && Math.abs(first.height - second.height) <= 0.5;
}

function setDestination(node, target) {
  node.hidden = false;
  node.style.left = `${target.left}px`;
  node.style.top = `${target.top}px`;
  node.style.width = `${target.width}px`;
  node.style.height = `${target.height}px`;
  node.style.transform = 'none';
}

function transformFrom(current, target) {
  const scaleX = target.width > 0 ? current.width / target.width : 1;
  const scaleY = target.height > 0 ? current.height / target.height : 1;
  return `translate3d(${current.left - target.left}px, ${current.top - target.top}px, 0) scale(${scaleX}, ${scaleY})`;
}

function createFocusNode(root) {
  const node = root.ownerDocument.createElement('span');
  node.className = 'muxui-menu-focus';
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('data-muxui-menu-focus', 'true');
  node.hidden = true;
  root.appendChild(node);
  return node;
}

function observeMenuFocus(root, triggerNode) {
  if (!root) return undefined;

  const indicator = createFocusNode(root);
  let active = true;
  let controls = null;
  let pendingFrame = null;
  let currentItem = null;
  let currentTarget = null;
  let scopeReduced = false;
  let reduced = false;
  const observedItems = new Set();
  const view = root.ownerDocument.defaultView;

  const stop = () => {
    controls?.stop();
    controls = null;
  };

  const settle = (target) => {
    stop();
    if (target) {
      setDestination(indicator, target);
      currentTarget = target;
    } else {
      indicator.hidden = true;
      indicator.style.transform = 'none';
      currentTarget = null;
    }
  };

  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => scheduleSync());
  const updateObservedItems = () => {
    const items = new Set(directMenuItems(root));
    for (const item of observedItems) {
      if (!items.has(item)) {
        resizeObserver?.unobserve(item);
        observedItems.delete(item);
      }
    }
    for (const item of items) {
      if (!observedItems.has(item)) {
        resizeObserver?.observe(item);
        observedItems.add(item);
      }
    }
  };

  const sync = () => {
    pendingFrame = null;
    if (!active) return;
    updateObservedItems();

    const item = activeMenuItem(root);
    const target = geometry(root, item);
    if (!target) {
      currentItem = null;
      settle(null);
      return;
    }

    if (!currentTarget) {
      currentItem = item;
      settle(target);
      return;
    }

    const itemChanged = item !== currentItem;
    const targetChanged = !sameGeometry(currentTarget, target);
    if (!itemChanged && !targetChanged) return;

    const current = geometry(root, indicator);
    currentItem = item;
    currentTarget = target;
    if (reduced || !itemChanged || !current || sameGeometry(current, target)) {
      settle(target);
      return;
    }

    stop();
    setDestination(indicator, target);
    const transition = resolvedMotionSpring(indicator, triggerNode ?? root, 'state', 'interaction');
    if (!transition) {
      indicator.style.transform = 'none';
      return;
    }

    const fromTransform = transformFrom(current, target);
    const toTransform = 'translate3d(0px, 0px, 0px) scale(1, 1)';
    indicator.style.transform = fromTransform;
    const nextControls = animate(indicator, { transform: [fromTransform, toTransform] }, transition);
    controls = nextControls;
    nextControls.then?.(() => {
      if (controls === nextControls) controls = null;
    });
  };

  const scheduleSync = () => {
    if (!active) return;
    if (pendingFrame !== null) return;
    pendingFrame = typeof view?.requestAnimationFrame === 'function'
      ? view.requestAnimationFrame(sync)
      : setTimeout(sync, 0);
  };

  const onInteraction = () => scheduleSync();
  const onScroll = () => scheduleSync();
  const onResize = () => scheduleSync();
  const syncReducedMotion = () => {
    const nextReduced = scopeReduced || hasReducedPopoverMotion(root, triggerNode);
    if (nextReduced === reduced) return;
    reduced = nextReduced;
    if (reduced) {
      const item = activeMenuItem(root);
      currentItem = item;
      settle(geometry(root, item));
    }
  };
  const disconnectReduced = observeReducedMotion(root, triggerNode, (nextReduced) => {
    scopeReduced = nextReduced;
    syncReducedMotion();
  });
  const disconnectPopoverReduced = observeReducedPopoverMotion(root, triggerNode, syncReducedMotion);

  const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => scheduleSync());
  mutationObserver?.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-disabled', 'data-disabled', 'data-focused', 'data-hovered'],
  });

  resizeObserver?.observe(root);
  updateObservedItems();
  root.addEventListener('pointerover', onInteraction);
  root.addEventListener('pointerout', onInteraction);
  root.addEventListener('focusin', onInteraction);
  root.addEventListener('focusout', onInteraction);
  root.addEventListener('scroll', onScroll, { passive: true });
  view?.addEventListener('resize', onResize, { passive: true });
  sync();

  return () => {
    active = false;
    if (pendingFrame !== null) {
      if (typeof view?.cancelAnimationFrame === 'function') view.cancelAnimationFrame(pendingFrame);
      clearTimeout(pendingFrame);
    }
    mutationObserver?.disconnect();
    resizeObserver?.disconnect();
    disconnectReduced();
    disconnectPopoverReduced();
    root.removeEventListener('pointerover', onInteraction);
    root.removeEventListener('pointerout', onInteraction);
    root.removeEventListener('focusin', onInteraction);
    root.removeEventListener('focusout', onInteraction);
    root.removeEventListener('scroll', onScroll);
    view?.removeEventListener('resize', onResize);
    stop();
    indicator.remove();
  };
}

export function MenuMotion({ children, rootRef }) {
  const [root, setRoot] = React.useState(null);
  const popoverContext = React.useContext(PopoverContext);
  const triggerNode = popoverContext?.triggerRef?.current ?? null;
  const setRootRef = React.useCallback((node) => {
    setRoot(node);
    const cleanup = assignRef(rootRef, node);
    if (typeof cleanup !== 'function') return undefined;
    return () => {
      setRoot(null);
      cleanup();
    };
  }, [rootRef]);

  useIsomorphicLayoutEffect(() => observeMenuFocus(root, triggerNode), [root, triggerNode]);

  return React.cloneElement(children, { ref: setRootRef });
}
