import React from 'react';
import { animate } from 'motion/react';
import { observeReducedMotion, resolvedMotionSpring } from './motion.mjs';

const BUTTON_SELECTOR = '.muxui-toggle-button';
const SELECTED_SELECTOR = '[data-selected], [aria-checked="true"], [aria-pressed="true"]';
const READY_ATTRIBUTE = 'data-muxui-toggle-motion-ready';
const REDUCED_ATTRIBUTE = 'data-muxui-toggle-motion-reduced';
const INTERNAL_ATTRIBUTE = 'data-muxui-toggle-motion-internal';

function assignRef(ref, value) {
  if (typeof ref === 'function') return ref(value);
  if (ref) ref.current = value;
  return undefined;
}

function directButtons(root) {
  if (!root) return [];
  return [...root.querySelectorAll(BUTTON_SELECTOR)]
    .filter((button) => button.closest('.muxui-toggle-button-group') === root
      && !button.closest(`[${INTERNAL_ATTRIBUTE}]`));
}

function selectedButton(root) {
  return directButtons(root).find((button) => button.matches(SELECTED_SELECTOR)) ?? null;
}

function buttonKey(button) {
  return button?.getAttribute('data-key') ?? button?.id ?? button?.getAttribute('aria-label') ?? button?.textContent?.trim() ?? null;
}

function geometry(root, button) {
  if (!root || !button) return null;
  const rootRect = root.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  if (!buttonRect.width || !buttonRect.height) return null;
  return {
    left: buttonRect.left - rootRect.left + root.scrollLeft - root.clientLeft,
    top: buttonRect.top - rootRect.top + root.scrollTop - root.clientTop,
    width: buttonRect.width,
    height: buttonRect.height,
  };
}

function sameGeometry(first, second) {
  if (!first || !second) return false;
  return Math.abs(first.left - second.left) <= 0.5
    && Math.abs(first.top - second.top) <= 0.5
    && Math.abs(first.width - second.width) <= 0.5
    && Math.abs(first.height - second.height) <= 0.5;
}

function readGeometry(node, fallback) {
  if (!node) return fallback;
  const values = ['left', 'top', 'width', 'height'].map((property) => Number.parseFloat(node.style[property]));
  return values.every(Number.isFinite)
    ? { left: values[0], top: values[1], width: values[2], height: values[3] }
    : fallback;
}

function setGeometry(node, target) {
  if (!node || !target) return;
  Object.assign(node.style, {
    left: `${target.left}px`,
    top: `${target.top}px`,
    width: `${target.width}px`,
    height: `${target.height}px`,
  });
}

function applyClip(foreground, target) {
  if (!foreground || !target) return;
  const right = `calc(100% - ${target.left + target.width}px)`;
  const bottom = `calc(100% - ${target.top + target.height}px)`;
  foreground.style.clipPath = `inset(${target.top}px ${right} ${bottom} ${target.left}px round 0px)`;
  foreground.style.opacity = '1';
}

function interpolateTrailingGeometry(from, target, progress, vertical) {
  const value = Math.min(1, Math.max(0, progress));
  if (value >= 0.9999) return target;
  const left = from.left + ((target.left - from.left) * value);
  const top = from.top + ((target.top - from.top) * value);
  const width = from.width + ((target.width - from.width) * value);
  const height = from.height + ((target.height - from.height) * value);
  const distance = vertical ? target.top - from.top : target.left - from.left;
  const sizeDelta = vertical ? target.height - from.height : target.width - from.width;
  const direction = Math.sign(distance) || Math.sign(sizeDelta);
  const stretch = Math.sin(Math.PI * value) * Math.min(12, Math.max(Math.abs(distance) * 0.12, Math.abs(sizeDelta) * 0.2));
  if (!direction || stretch < 0.01) return { left, top, width, height };
  if (vertical) {
    return {
      left,
      top: top - (direction > 0 ? stretch * 0.3 : stretch * 0.7),
      width,
      height: height + stretch,
    };
  }
  return {
    left: left - (direction > 0 ? stretch * 0.3 : stretch * 0.7),
    top,
    width: width + stretch,
    height,
  };
}

function removeIds(node) {
  node.removeAttribute('id');
  for (const child of node.querySelectorAll('[id]')) child.removeAttribute('id');
}

function refreshForeground(foreground, root) {
  const buttons = directButtons(root);
  const rootRect = root.getBoundingClientRect();
  foreground.replaceChildren(...buttons.map((button) => {
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    const copy = button.cloneNode(true);
    removeIds(copy);
    copy.removeAttribute('role');
    copy.removeAttribute('tabindex');
    copy.removeAttribute('data-selected');
    copy.removeAttribute('aria-checked');
    copy.removeAttribute('aria-pressed');
    copy.removeAttribute('data-focused');
    copy.removeAttribute('data-hovered');
    copy.removeAttribute('data-pressed');
    copy.removeAttribute('disabled');
    copy.removeAttribute('aria-disabled');
    copy.classList.add('muxui-toggle-button-group-motion-label');
    copy.setAttribute('aria-hidden', 'true');
    copy.setAttribute('inert', '');
    Object.assign(copy.style, {
      left: `${rect.left - rootRect.left + root.scrollLeft - root.clientLeft}px`,
      top: `${rect.top - rootRect.top + root.scrollTop - root.clientTop}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      font: style.font,
      letterSpacing: style.letterSpacing,
      lineHeight: style.lineHeight,
      opacity: style.opacity,
    });
    return copy;
  }));
}

function observeToggleButtonSelection(root, selectionMode) {
  if (!root || selectionMode !== 'single') return undefined;

  const document = root.ownerDocument;
  const view = document.defaultView;
  const indicator = document.createElement('span');
  const foreground = document.createElement('span');
  indicator.className = 'muxui-toggle-button-group-motion-indicator';
  foreground.className = 'muxui-toggle-button-group-motion-foreground';
  indicator.setAttribute('aria-hidden', 'true');
  foreground.setAttribute('aria-hidden', 'true');
  foreground.setAttribute('inert', '');
  indicator.setAttribute(INTERNAL_ATTRIBUTE, 'true');
  foreground.setAttribute(INTERNAL_ATTRIBUTE, 'true');
  indicator.style.opacity = '0';
  foreground.style.opacity = '0';
  foreground.style.clipPath = 'inset(100%)';
  root.append(indicator, foreground);
  root.setAttribute('data-muxui-toggle-motion', 'single');

  let active = true;
  let reduced = false;
  let controls = null;
  let pendingFrame = null;
  let currentKey = null;
  let currentTarget = null;
  let visible = false;
  const observedButtons = new Set();

  const vertical = () => root.getAttribute('aria-orientation') === 'vertical'
    || root.getAttribute('data-orientation') === 'vertical';

  const stop = () => {
    const previousControls = controls;
    controls = null;
    previousControls?.stop();
    root.removeAttribute('data-muxui-toggle-motion-trailing');
  };

  const setLayers = (target, opacity = 1) => {
    setGeometry(indicator, target);
    indicator.style.opacity = String(opacity);
    if (target) applyClip(foreground, target);
    foreground.style.opacity = String(opacity);
  };

  const settle = (target) => {
    stop();
    if (!target) {
      indicator.style.opacity = '0';
      foreground.style.opacity = '0';
      foreground.style.clipPath = 'inset(100%)';
      root.removeAttribute(READY_ATTRIBUTE);
      visible = false;
      currentTarget = null;
      return;
    }
    setLayers(target);
    root.setAttribute(READY_ATTRIBUTE, 'true');
    visible = true;
    currentTarget = target;
  };

  const updateObservedButtons = () => {
    const buttons = new Set(directButtons(root));
    for (const button of observedButtons) {
      if (!buttons.has(button)) {
        resizeObserver?.unobserve(button);
        observedButtons.delete(button);
      }
    }
    for (const button of buttons) {
      if (!observedButtons.has(button)) {
        resizeObserver?.observe(button);
        observedButtons.add(button);
      }
    }
  };

  const sync = (immediate = false, forceRefresh = false) => {
    pendingFrame = null;
    if (!active) return;
    updateObservedButtons();
    const button = selectedButton(root);
    const nextKey = buttonKey(button);
    const target = geometry(root, button);
    const selectedIsDisabled = button?.matches('[data-disabled], [aria-disabled="true"], [disabled]');
    if (selectedIsDisabled) {
      currentKey = nextKey;
      settle(null);
      return;
    }
    if (!target) {
      currentKey = nextKey;
      settle(null);
      return;
    }

    if (!currentTarget || !visible) {
      currentKey = nextKey;
      refreshForeground(foreground, root);
      settle(target);
      return;
    }

    const changed = nextKey !== currentKey || !sameGeometry(currentTarget, target);
    if (!changed && !forceRefresh) return;
    if (!changed && forceRefresh) {
      refreshForeground(foreground, root);
      settle(target);
      currentKey = nextKey;
      return;
    }

    const from = readGeometry(indicator, currentTarget ?? target);
    currentKey = nextKey;
    currentTarget = target;
    refreshForeground(foreground, root);
    stop();
    const transition = !immediate && !reduced && !sameGeometry(from, target)
      ? resolvedMotionSpring(indicator, button, 'state', 'interaction')
      : null;
    if (!transition) {
      settle(target);
      return;
    }

    root.setAttribute(READY_ATTRIBUTE, 'true');
    visible = true;
    setLayers(from);
    root.setAttribute('data-muxui-toggle-motion-trailing', 'true');
    let nextControls = null;
    nextControls = animate(0, 1, {
      ...transition,
      onUpdate: (progress) => {
        if (!active || controls !== nextControls) return;
        const frame = interpolateTrailingGeometry(from, target, progress, vertical());
        setGeometry(indicator, frame);
        indicator.style.opacity = '1';
        applyClip(foreground, frame);
      },
      onComplete: () => {
        if (controls !== nextControls) return;
        controls = null;
        root.removeAttribute('data-muxui-toggle-motion-trailing');
        settle(target);
      },
    });
    controls = nextControls;
    nextControls.then?.(() => {
      if (controls === nextControls) {
        controls = null;
        root.removeAttribute('data-muxui-toggle-motion-trailing');
        settle(target);
      }
    });
  };

  const scheduleSync = (immediate = false, forceRefresh = false) => {
    if (immediate) {
      sync(true, forceRefresh);
      return;
    }
    if (pendingFrame !== null || !active) return;
    pendingFrame = typeof view?.requestAnimationFrame === 'function'
      ? view.requestAnimationFrame(() => sync(false, forceRefresh))
      : setTimeout(() => sync(false, forceRefresh), 0);
  };

  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => scheduleSync(true, true));
  const disconnectReduced = observeReducedMotion(root, null, (nextReduced) => {
    reduced = nextReduced;
    root.toggleAttribute(REDUCED_ATTRIBUTE, nextReduced);
    if (nextReduced) stop();
    scheduleSync(true, true);
  });
  const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver((records) => {
    const meaningfulRecords = records.filter((record) => !record.target.closest?.(`[${INTERNAL_ATTRIBUTE}]`));
    if (!meaningfulRecords.length) return;
    if (meaningfulRecords.some((record) => record.type === 'childList' || record.type === 'characterData')) {
      refreshForeground(foreground, root);
    }
    scheduleSync();
  });
  mutationObserver?.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-checked', 'aria-pressed', 'data-selected', 'data-disabled', 'disabled', 'aria-disabled', 'dir'],
  });
  resizeObserver?.observe(root);
  updateObservedButtons();
  const onResize = () => scheduleSync(true, true);
  const onScroll = () => scheduleSync(true, true);
  view?.addEventListener('resize', onResize);
  root.addEventListener('scroll', onScroll, { passive: true });
  sync(true, true);

  return () => {
    active = false;
    if (pendingFrame !== null) {
      if (typeof view?.cancelAnimationFrame === 'function') view.cancelAnimationFrame(pendingFrame);
      clearTimeout(pendingFrame);
    }
    mutationObserver?.disconnect();
    resizeObserver?.disconnect();
    disconnectReduced();
    stop();
    view?.removeEventListener('resize', onResize);
    root.removeEventListener('scroll', onScroll);
    indicator.remove();
    foreground.remove();
    root.removeAttribute('data-muxui-toggle-motion');
    root.removeAttribute(READY_ATTRIBUTE);
    root.removeAttribute(REDUCED_ATTRIBUTE);
    root.removeAttribute('data-muxui-toggle-motion-trailing');
  };
}

export const ToggleButtonGroupMotion = /*#__PURE__*/ (() => {
  const component = function ToggleButtonGroupMotion({ children, selectionMode = 'single', disabled = false, rootRef }) {
    const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;
    const [root, setRoot] = React.useState(null);
    const setRootRef = React.useCallback((node) => {
      setRoot(node);
      return assignRef(rootRef, node);
    }, [rootRef]);

    useIsomorphicLayoutEffect(() => {
      if (disabled) return undefined;
      return observeToggleButtonSelection(root, selectionMode);
    }, [root, selectionMode, disabled]);

    return React.cloneElement(children, { ref: setRootRef });
  };
  component.displayName = 'ToggleButtonGroupMotion';
  return component;
})();
