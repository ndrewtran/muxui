import React from 'react';
import { animate } from 'motion/react';
import { observeReducedMotion, resolvedMotionSpring } from './motion.mjs';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;
const ROW_SELECTOR = '[role="row"]';
const READY_ATTRIBUTE = 'data-muxui-grid-list-motion-ready';
const REDUCED_ATTRIBUTE = 'data-muxui-grid-list-motion-reduced';
const RIPPLE_READY_ATTRIBUTE = 'data-muxui-grid-list-ripple-ready';
const RIPPLE_HOST_CLASS = 'muxui-grid-list-ripple-host';
const RIPPLE_CLASS = 'muxui-grid-list-ripple';
const RIPPLE_BLOCKED_SELECTOR = '[data-disabled], [aria-disabled="true"], [data-dragging], [data-drop-target]';
const RIPPLE_CONTROL_SELECTOR = 'button, a[href], input, select, textarea, [contenteditable="true"], [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"]';
const INELIGIBLE_SELECTOR = /*#__PURE__*/ [
  '[data-selected]', '[aria-selected="true"]', '[data-disabled]', '[aria-disabled="true"]',
  '[data-dragging]', '[data-drop-target]', '[data-pressed]', '[aria-pressed="true"]',
  '[data-focus-visible]', ':focus-visible',
].join(', ');

function assignRef(ref, value) {
  if (typeof ref === 'function') return ref(value);
  if (ref) ref.current = value;
  return undefined;
}

function directRows(root) {
  return [...root.querySelectorAll(ROW_SELECTOR)].filter((row) => row.closest('[role="grid"]') === root);
}

function rowFromTarget(root, target) {
  const row = target?.closest?.(ROW_SELECTOR);
  return row?.closest('[role="grid"]') === root ? row : null;
}

function isHoverable(root, row) {
  return Boolean(row && root.contains(row)
    && !root.matches('[data-disabled], [aria-disabled="true"]')
    && !row.matches(INELIGIBLE_SELECTOR));
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

function sameGeometry(previous, next) {
  return previous && next
    && Math.abs(previous.left - next.left) < 0.5
    && Math.abs(previous.top - next.top) < 0.5
    && Math.abs(previous.width - next.width) < 0.5
    && Math.abs(previous.height - next.height) < 0.5;
}

function geometryStyle(target) {
  return {
    left: `${target.left}px`,
    top: `${target.top}px`,
    width: `${target.width}px`,
    height: `${target.height}px`,
  };
}

function transformFrom(current, target) {
  const scaleX = target.width > 0 ? current.width / target.width : 1;
  const scaleY = target.height > 0 ? current.height / target.height : 1;
  return `translate3d(${current.left - target.left}px, ${current.top - target.top}px, 0) scale(${scaleX}, ${scaleY})`;
}

function createHoverLayer(root) {
  const layer = root.ownerDocument.createElement('span');
  layer.className = 'muxui-grid-list-hover';
  layer.setAttribute('aria-hidden', 'true');
  layer.setAttribute('data-muxui-grid-list-hover', 'true');
  root.appendChild(layer);
  return layer;
}

function observeGridListHover(root) {
  if (!root) return undefined;

  const layer = createHoverLayer(root);
  let active = true;
  let controls = null;
  let pendingFrame = null;
  let pointerRow = null;
  let visibleRow = null;
  let currentTarget = null;
  let reduced = false;
  const observedRows = new Set();

  const stop = () => {
    controls?.stop();
    controls = null;
  };

  const hide = () => {
    const current = currentTarget ? geometry(root, layer) : null;
    visibleRow = null;
    stop();
    if (current) {
      Object.assign(layer.style, geometryStyle(current));
      layer.style.transform = 'none';
      currentTarget = current;
    }
    layer.style.opacity = '0';
  };

  // An idle layer keeps no box: its last geometry would otherwise widen the
  // root's scrollable overflow after the grid reflows.
  const park = () => {
    currentTarget = null;
    Object.assign(layer.style, { left: '0px', top: '0px', width: '0px', height: '0px', transform: 'none' });
  };

  const onTransitionEnd = (event) => {
    if (event.target === layer && event.propertyName === 'opacity' && !visibleRow) park();
  };

  const show = (row, immediate = false) => {
    const target = geometry(root, row);
    if (!target || target.width <= 0 || target.height <= 0) {
      hide();
      return;
    }

    if (visibleRow === row && sameGeometry(currentTarget, target)) return;

    const current = currentTarget ? geometry(root, layer) : null;
    stop();
    Object.assign(layer.style, geometryStyle(target));
    layer.style.opacity = '1';
    currentTarget = target;
    const transition = !immediate && !reduced
      ? resolvedMotionSpring(root, row, 'state', 'interaction')
      : null;
    visibleRow = row;

    if (!current || !transition || sameGeometry(current, target)) {
      layer.style.transform = 'none';
      return;
    }

    const fromTransform = transformFrom(current, target);
    layer.style.transform = fromTransform;
    controls = animate(layer, {
      transform: [fromTransform, 'translate3d(0px, 0px, 0px) scale(1, 1)'],
    }, transition);
  };

  const sync = (immediate = false) => {
    pendingFrame = null;
    if (!active || reduced) return;
    if (pointerRow && !root.contains(pointerRow)) pointerRow = null;
    if (isHoverable(root, pointerRow)) show(pointerRow, immediate);
    else hide();
  };

  const scheduleSync = () => {
    if (pendingFrame !== null || !active) return;
    const view = root.ownerDocument.defaultView;
    pendingFrame = typeof view?.requestAnimationFrame === 'function'
      ? view.requestAnimationFrame(() => sync())
      : setTimeout(() => sync(), 0);
  };

  const updateObservedRows = () => {
    const rows = new Set(directRows(root));
    for (const row of observedRows) {
      if (!rows.has(row)) {
        resizeObserver?.unobserve(row);
        observedRows.delete(row);
      }
    }
    for (const row of rows) {
      if (!observedRows.has(row)) {
        resizeObserver?.observe(row);
        observedRows.add(row);
      }
    }
  };

  const onPointerOver = (event) => {
    if (event.pointerType === 'touch') return;
    const nextRow = rowFromTarget(root, event.target);
    if (nextRow === pointerRow) return;
    pointerRow = nextRow;
    scheduleSync();
  };

  const onPointerOut = (event) => {
    if (event.pointerType === 'touch') return;
    const nextRow = rowFromTarget(root, event.relatedTarget);
    if (nextRow === pointerRow) return;
    pointerRow = nextRow;
    scheduleSync();
  };

  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleSync);
  resizeObserver?.observe(root);
  updateObservedRows();

  const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver((records) => {
    if (records.some((record) => record.type === 'childList')) updateObservedRows();
    scheduleSync();
  });
  mutationObserver?.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      'aria-disabled', 'aria-pressed', 'aria-selected', 'data-disabled', 'data-dragging',
      'data-drop-target', 'data-focus-visible', 'data-pressed', 'data-selected', 'disabled',
    ],
  });

  root.addEventListener('pointerover', onPointerOver);
  root.addEventListener('pointerout', onPointerOut);
  root.addEventListener('focusin', scheduleSync);
  root.addEventListener('focusout', scheduleSync);
  root.addEventListener('scroll', scheduleSync, { capture: true, passive: true });
  layer.addEventListener('transitionend', onTransitionEnd);

  root.setAttribute(READY_ATTRIBUTE, 'true');

  const disconnectReduced = observeReducedMotion(root, null, (nextReduced) => {
    reduced = nextReduced;
    root.toggleAttribute(REDUCED_ATTRIBUTE, nextReduced);
    if (nextReduced) {
      root.removeAttribute(READY_ATTRIBUTE);
      visibleRow = null;
      stop();
      layer.style.opacity = '0';
      park();
    } else {
      root.setAttribute(READY_ATTRIBUTE, 'true');
      if (pointerRow && isHoverable(root, pointerRow)) show(pointerRow, true);
      else hide();
    }
  });

  const initialHover = directRows(root).find((row) => row.hasAttribute('data-hovered')) ?? null;
  if (initialHover) {
    pointerRow = initialHover;
    sync(true);
  }

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
    root.removeEventListener('pointerover', onPointerOver);
    root.removeEventListener('pointerout', onPointerOut);
    root.removeEventListener('focusin', scheduleSync);
    root.removeEventListener('focusout', scheduleSync);
    root.removeEventListener('scroll', scheduleSync, true);
    layer.removeEventListener('transitionend', onTransitionEnd);
    layer.remove();
    root.removeAttribute(READY_ATTRIBUTE);
    root.removeAttribute(REDUCED_ATTRIBUTE);
  };
}

function isRippleEligible(root, row) {
  return Boolean(row && root.contains(row)
    && !root.matches(RIPPLE_BLOCKED_SELECTOR)
    && !row.matches(RIPPLE_BLOCKED_SELECTOR));
}

function isIndependentControl(row, target) {
  const element = target?.nodeType === 1 ? target : target?.parentElement;
  const control = element?.closest?.(RIPPLE_CONTROL_SELECTOR);
  if (control && row.contains(control)) return true;
  const label = element?.closest?.('label');
  return Boolean(label && row.contains(label) && label.control && row.contains(label.control));
}

function observeGridListRipple(root) {
  if (!root) return undefined;

  const view = root.ownerDocument.defaultView;
  const active = new Set();
  const byRow = new Map();
  const byPointer = new Map();
  const byKeyboard = new Map();
  let reduced = false;
  let mounted = true;

  const now = () => view?.performance?.now?.() ?? Date.now();
  const delay = (callback, duration) => view ? view.setTimeout(callback, duration) : setTimeout(callback, duration);
  const cancelDelay = (timer) => view ? view.clearTimeout(timer) : clearTimeout(timer);

  const remove = (record) => {
    if (record.done) return;
    record.done = true;
    if (record.releaseTimer !== null) cancelDelay(record.releaseTimer);
    if (record.fadeTimer !== null) cancelDelay(record.fadeTimer);
    record.controls?.stop();
    record.ripple.remove();
    if (record.host.childElementCount === 0) record.host.remove();
    if (byRow.get(record.row) === record) byRow.delete(record.row);
    if (record.pointerId !== null && byPointer.get(record.pointerId) === record) byPointer.delete(record.pointerId);
    if (record.keyboard && byKeyboard.get(record.row) === record) byKeyboard.delete(record.row);
    active.delete(record);
  };

  const clearAll = () => {
    for (const record of [...active]) remove(record);
  };

  const finish = (record) => {
    if (!record || record.done || record.releasing) return;
    record.releasing = true;
    const wait = Math.max(record.minimumVisibleMs - (now() - record.startedAt), 0);
    record.releaseTimer = delay(() => {
      record.releaseTimer = null;
      if (record.done || !record.ripple.isConnected) {
        remove(record);
        return;
      }
      record.ripple.style.opacity = '0';
      record.fadeTimer = delay(() => remove(record), record.fadeDurationMs);
    }, wait);
  };

  const begin = (row, { pointerId = null, keyboard = false, key = null, clientX, clientY } = {}) => {
    if (!mounted || !isRippleEligible(root, row)) return;
    const rect = row.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const previous = byRow.get(row);
    if (previous) remove(previous);

    const ripple = root.ownerDocument.createElement('span');
    ripple.className = RIPPLE_CLASS;
    const motion = reduced ? null : resolvedMotionSpring(root, row, 'state', 'interaction');
    const isStatic = !motion;
    // The selected 300/180/120ms profile scales with Mux's state timing token.
    const minimumVisibleMs = motion ? motion.duration * 1000 : 0;
    const fadeDurationMs = motion ? motion.duration * 1500 : (reduced ? 80 : 0);
    if (isStatic) {
      ripple.setAttribute('data-static', 'true');
    } else {
      const x = Number.isFinite(clientX) ? Math.max(0, Math.min(rect.width, clientX - rect.left)) : rect.width / 2;
      const y = Number.isFinite(clientY) ? Math.max(0, Math.min(rect.height, clientY - rect.top)) : rect.height / 2;
      const diameter = 2 * Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y));
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      ripple.style.width = `${diameter}px`;
      ripple.style.height = `${diameter}px`;
      ripple.style.transform = 'translate(-50%, -50%) scale(0)';
    }
    ripple.style.opacity = '0.08';
    ripple.style.setProperty('--muxui-grid-list-ripple-fade-duration', `${fadeDurationMs}ms`);

    let host = [...row.children].find((child) => child.classList.contains(RIPPLE_HOST_CLASS));
    if (!host) {
      host = root.ownerDocument.createElement('span');
      host.className = RIPPLE_HOST_CLASS;
      host.setAttribute('aria-hidden', 'true');
      row.appendChild(host);
    }
    host.appendChild(ripple);

    const record = {
      row, host, ripple, pointerId, keyboard, key, startedAt: now(), static: isStatic,
      minimumVisibleMs, fadeDurationMs,
      controls: null, releaseTimer: null, fadeTimer: null, releasing: false, done: false,
    };
    active.add(record);
    byRow.set(row, record);
    if (pointerId !== null) byPointer.set(pointerId, record);
    if (keyboard) byKeyboard.set(row, record);

    if (motion) {
      const transition = {
        ...motion,
        duration: motion.duration * 2.5,
        visualDuration: (motion.visualDuration ?? motion.duration) * 2.5,
      };
      const controls = animate(ripple, {
        transform: ['translate(-50%, -50%) scale(0)', 'translate(-50%, -50%) scale(1)'],
      }, transition);
      record.controls = controls;
      controls.then?.(() => {
        if (record.controls === controls) record.controls = null;
      });
    }
  };

  const pointerDown = (event) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    const row = rowFromTarget(root, event.target);
    if (!isRippleEligible(root, row) || isIndependentControl(row, event.target)) return;
    begin(row, {
      pointerId: event.pointerId ?? 1,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  };

  const pointerUp = (event) => finish(byPointer.get(event.pointerId ?? 1));

  const pointerOut = (event) => {
    if (event.pointerType === 'touch') return;
    const row = rowFromTarget(root, event.target);
    const nextRow = rowFromTarget(root, event.relatedTarget);
    if (!row || nextRow === row) return;
    for (const record of active) {
      if (record.row === row && record.pointerId !== null) finish(record);
    }
  };

  const keyDown = (event) => {
    if ((event.key !== 'Enter' && event.key !== ' ') || event.repeat) return;
    const row = rowFromTarget(root, event.target);
    if (!isRippleEligible(root, row) || isIndependentControl(row, event.target)) return;
    begin(row, { keyboard: true, key: event.key });
  };

  const keyUp = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = rowFromTarget(root, event.target);
    const record = byKeyboard.get(row);
    if (record?.key === event.key) finish(record);
  };

  const focusOut = (event) => {
    const row = rowFromTarget(root, event.target);
    const record = byKeyboard.get(row);
    if (!record || (event.relatedTarget && row.contains(event.relatedTarget))) return;
    remove(record);
  };

  const onDragStart = (event) => {
    const row = rowFromTarget(root, event.target);
    const record = byRow.get(row);
    if (record) remove(record);
  };

  const onBlur = () => clearAll();

  const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => {
    for (const record of [...active]) {
      if (!root.contains(record.row) || !isRippleEligible(root, record.row)) {
        remove(record);
      } else if (record.controls && !resolvedMotionSpring(root, record.row, 'state', 'interaction')) {
        remove(record);
      }
    }
  });
  mutationObserver?.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-disabled', 'data-disabled', 'data-dragging', 'data-drop-target', 'data-muxui-motion', 'data-reduced-motion'],
  });

  root.addEventListener('pointerdown', pointerDown);
  root.addEventListener('pointerup', pointerUp);
  root.addEventListener('pointercancel', pointerUp);
  root.addEventListener('pointerout', pointerOut);
  root.addEventListener('keydown', keyDown);
  root.addEventListener('keyup', keyUp);
  root.addEventListener('focusout', focusOut);
  root.addEventListener('dragstart', onDragStart);
  view?.addEventListener('blur', onBlur);
  root.setAttribute(RIPPLE_READY_ATTRIBUTE, 'true');

  const disconnectReduced = observeReducedMotion(root, null, (nextReduced) => {
    reduced = nextReduced;
    if (nextReduced) clearAll();
  });

  return () => {
    mounted = false;
    disconnectReduced();
    mutationObserver?.disconnect();
    root.removeEventListener('pointerdown', pointerDown);
    root.removeEventListener('pointerup', pointerUp);
    root.removeEventListener('pointercancel', pointerUp);
    root.removeEventListener('pointerout', pointerOut);
    root.removeEventListener('keydown', keyDown);
    root.removeEventListener('keyup', keyUp);
    root.removeEventListener('focusout', focusOut);
    root.removeEventListener('dragstart', onDragStart);
    view?.removeEventListener('blur', onBlur);
    clearAll();
    root.removeAttribute(RIPPLE_READY_ATTRIBUTE);
  };
}

export function GridListMotion({ children, rootRef }) {
  const [root, setRoot] = React.useState(null);

  const setRootRef = React.useCallback((node) => {
    setRoot(node);
    const cleanup = assignRef(rootRef, node);
    return () => {
      if (typeof cleanup === 'function') cleanup();
      else assignRef(rootRef, null);
      setRoot(null);
    };
  }, [rootRef]);

  useIsomorphicLayoutEffect(() => {
    const stopHover = observeGridListHover(root);
    const stopRipple = observeGridListRipple(root);
    return () => {
      stopRipple?.();
      stopHover?.();
    };
  }, [root]);

  return React.cloneElement(children, { ref: setRootRef });
}
