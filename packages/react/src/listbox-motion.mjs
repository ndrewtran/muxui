import React from 'react';
import { animate } from 'motion/react';
import { observeReducedMotion, resolvedMotionSpring } from './motion.mjs';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;
const SELECTED_OPTION_SELECTOR = '[role="option"][aria-selected="true"], [role="option"][data-selected]';
const READY_ATTRIBUTE = 'data-muxui-list-box-selection-ready';
const REDUCED_ATTRIBUTE = 'data-muxui-list-box-reduced';

function assignRef(ref, value) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

function directOptions(root) {
  return [...root.querySelectorAll('[role="option"]')]
    .filter((option) => option.closest('[role="listbox"]') === root);
}

function selectedOption(root) {
  return directOptions(root).find((option) => option.matches(SELECTED_OPTION_SELECTOR)) ?? null;
}

function optionKey(option) {
  return option?.getAttribute('data-key') ?? option?.id ?? option?.textContent?.trim() ?? null;
}

function geometry(root, node) {
  if (!node) return null;
  const rootRect = root.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  return {
    left: nodeRect.left - rootRect.left + root.scrollLeft - root.clientLeft,
    top: nodeRect.top - rootRect.top + root.scrollTop - root.clientTop,
    width: nodeRect.width,
    height: nodeRect.height,
  };
}

function sameGeometry(first, second) {
  if (!first || !second) return false;
  return Math.abs(first.left - second.left) <= 0.5
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

function createSelectionNode(root) {
  const node = root.ownerDocument.createElement('span');
  node.className = 'muxui-list-box-selection';
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('data-muxui-list-box-selection', 'true');
  root.appendChild(node);
  root.setAttribute(READY_ATTRIBUTE, 'true');
  return node;
}

function observeListBoxSelection(root, selectionMode) {
  if (!root || selectionMode !== 'single') return undefined;

  const indicator = createSelectionNode(root);
  let active = true;
  let controls = null;
  let pendingFrame = null;
  let currentKey = null;
  let currentTarget = null;
  let reduced = false;
  const observedOptions = new Set();

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

  const updateObservedOptions = () => {
    const options = new Set(directOptions(root));
    for (const option of observedOptions) {
      if (!options.has(option)) {
        resizeObserver?.unobserve(option);
        observedOptions.delete(option);
      }
    }
    for (const option of options) {
      if (!observedOptions.has(option)) {
        resizeObserver?.observe(option);
        observedOptions.add(option);
      }
    }
  };

  const sync = () => {
    pendingFrame = null;
    if (!active) return;
    updateObservedOptions();
    const option = selectedOption(root);
    const nextKey = optionKey(option);
    const target = geometry(root, option);
    if (!target) {
      currentKey = nextKey;
      settle(null);
      return;
    }

    if (!currentTarget) {
      currentKey = nextKey;
      settle(target);
      return;
    }

    if (nextKey === currentKey && sameGeometry(currentTarget, target)) return;

    const selectionChanged = nextKey !== currentKey;
    const current = geometry(root, indicator);
    currentKey = nextKey;
    currentTarget = target;
    if (!selectionChanged || reduced) {
      settle(target);
      return;
    }

    stop();
    setDestination(indicator, target);
    const transition = resolvedMotionSpring(root, null, 'state', 'interaction');
    if (!transition || sameGeometry(current, target)) {
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
    if (pendingFrame !== null || !active) return;
    const view = root.ownerDocument.defaultView;
    pendingFrame = typeof view?.requestAnimationFrame === 'function'
      ? view.requestAnimationFrame(sync)
      : setTimeout(sync, 0);
  };

  const disconnectReduced = observeReducedMotion(root, null, (nextReduced) => {
    reduced = nextReduced;
    root.toggleAttribute(REDUCED_ATTRIBUTE, nextReduced);
    if (nextReduced) {
      root.removeAttribute(READY_ATTRIBUTE);
      const option = selectedOption(root);
      currentKey = optionKey(option);
      controls?.complete?.();
      settle(geometry(root, option));
    } else {
      root.setAttribute(READY_ATTRIBUTE, 'true');
      scheduleSync();
    }
  });

  const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(scheduleSync);
  mutationObserver?.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-selected', 'data-selected', 'disabled', 'aria-disabled'],
  });

  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleSync);
  resizeObserver?.observe(root);
  updateObservedOptions();

  sync();

  return () => {
    active = false;
    if (pendingFrame !== null) {
      const view = root.ownerDocument.defaultView;
      if (typeof view?.cancelAnimationFrame === 'function') view.cancelAnimationFrame(pendingFrame);
      clearTimeout(pendingFrame);
    }
    mutationObserver?.disconnect();
    resizeObserver?.disconnect();
    disconnectReduced();
    stop();
    indicator.remove();
    root.removeAttribute(READY_ATTRIBUTE);
    root.removeAttribute(REDUCED_ATTRIBUTE);
  };
}

export function ListBoxMotion({ children, selectionMode = 'single', rootRef }) {
  const [root, setRoot] = React.useState(null);

  const setRootRef = React.useCallback((node) => {
    setRoot(node);
    assignRef(rootRef, node);
  }, [rootRef]);

  useIsomorphicLayoutEffect(() => observeListBoxSelection(root, selectionMode), [root, selectionMode]);

  return React.cloneElement(children, { ref: setRootRef });
}
