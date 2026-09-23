import React from 'react';
import { animate } from 'motion/react';
import { PopoverContext, RangeCalendarStateContext } from 'react-aria-components';
import { observeReducedMotion, resolvedMotionSpring, resolvedMotionTransition } from './motion.mjs';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;
const RANGE_CELL_SELECTOR = '.muxui-range-calendar-cell';

function dateKey(value) {
  return value ? String(value) : null;
}

function setGeometry(node, target) {
  node.style.left = `${target.left}px`;
  node.style.top = `${target.top}px`;
  node.style.width = `${target.width}px`;
  node.style.height = `${target.height}px`;
  node.style.opacity = '1';
}

function sameGeometry(previous, next) {
  return previous && Math.abs(previous.left - next.left) < 0.5
    && Math.abs(previous.top - next.top) < 0.5
    && Math.abs(previous.width - next.width) < 0.5
    && Math.abs(previous.height - next.height) < 0.5;
}

function clearRangeMarkers(root) {
  root.querySelectorAll(`${RANGE_CELL_SELECTOR}[data-muxui-range-anchor], ${RANGE_CELL_SELECTOR}[data-muxui-range-provisional-endpoint]`).forEach((cell) => {
    cell.removeAttribute('data-muxui-range-anchor');
    cell.removeAttribute('data-muxui-range-provisional-endpoint');
  });
  root.removeAttribute('data-muxui-range-selecting');
}

function measureSegments(root, selecting) {
  if (!selecting) return [];
  const rootRect = root.getBoundingClientRect();
  const rows = [...root.querySelectorAll(`${RANGE_CELL_SELECTOR}[data-muxui-date]`)].reduce((map, cell) => {
    const row = cell.closest('tr');
    if (!row) return map;
    if (!map.has(row)) map.set(row, []);
    map.get(row).push(cell);
    return map;
  }, new Map());
  const segments = [];
  let rowIndex = 0;
  for (const cells of rows.values()) {
    const ordered = cells.slice().sort((a, b) => {
      const position = a.compareDocumentPosition(b);
      if (position & 4) return -1;
      if (position & 2) return 1;
      return 0;
    });
    let rowSegmentIndex = 0;
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const rects = run.map((cell) => cell.getBoundingClientRect());
      const left = Math.min(...rects.map((rect) => rect.left)) - rootRect.left;
      const right = Math.max(...rects.map((rect) => rect.right)) - rootRect.left;
      const top = Math.min(...rects.map((rect) => rect.top)) - rootRect.top;
      const bottom = Math.max(...rects.map((rect) => rect.bottom)) - rootRect.top;
      let leftCap = false;
      let rightCap = false;
      run.forEach((cell, index) => {
        if (!cell.hasAttribute('data-selection-start')
          && !cell.hasAttribute('data-selection-end')
          && !cell.hasAttribute('data-muxui-range-provisional-endpoint')) return;
        const rect = rects[index];
        if (run.length === 1 || Math.abs(rect.left - rootRect.left - left) < 0.5) leftCap = true;
        if (run.length === 1 || Math.abs(rect.right - rootRect.left - right) < 0.5) rightCap = true;
      });
      const cap = leftCap && rightCap ? 'both' : leftCap ? 'left' : rightCap ? 'right' : undefined;
      segments.push({
        key: `${rowIndex}:${rowSegmentIndex}`,
        row: rowIndex,
        left,
        top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
        cap,
      });
      rowSegmentIndex += 1;
      run = [];
    };
    for (const cell of ordered) {
      if (cell.hasAttribute('data-selected') || cell.getAttribute('aria-selected') === 'true') run.push(cell);
      else flush();
    }
    flush();
    rowIndex += 1;
  }
  return segments;
}

function markProvisionalCells(root, state) {
  clearRangeMarkers(root);
  const anchor = dateKey(state?.anchorDate);
  const endpoint = dateKey(state?.focusedDate);
  const selecting = Boolean(anchor && state?.highlightedRange);
  if (!selecting) return false;
  const cells = [...root.querySelectorAll(`${RANGE_CELL_SELECTOR}[data-muxui-date]`)].reduce((map, cell) => {
    map.set(cell.getAttribute('data-muxui-date'), cell);
    return map;
  }, new Map());
  const isSelectable = (cell) => cell
    && !cell.hasAttribute('data-disabled')
    && !cell.hasAttribute('data-unavailable')
    && (cell.hasAttribute('data-selected') || cell.getAttribute('aria-selected') === 'true');
  const anchorCell = cells.get(anchor);
  if (!isSelectable(anchorCell)) return false;
  root.setAttribute('data-muxui-range-selecting', 'true');
  anchorCell.setAttribute('data-muxui-range-anchor', 'true');
  const endpointCell = cells.get(endpoint);
  if (endpoint && endpoint !== anchor && isSelectable(endpointCell)) endpointCell.setAttribute('data-muxui-range-provisional-endpoint', 'true');
  return true;
}

/**
 * Paints RAC's current provisional range as row-local bands. The calendar
 * state remains the only source of dates, selection, bounds, and availability.
 */
export function RangeSelectionMotion({ children }) {
  const state = React.useContext(RangeCalendarStateContext);
  const triggerRef = React.useContext(PopoverContext)?.triggerRef;
  const [root, setRoot] = React.useState(null);
  const layerRef = React.useRef(null);
  const stateRef = React.useRef(state);
  const syncRef = React.useRef(null);
  const bandsRef = React.useRef(new Map());
  const targetsRef = React.useRef(new Map());
  const controlsRef = React.useRef(new Map());
  const reducedRef = React.useRef(false);
  stateRef.current = state;

  const selectionKey = [
    dateKey(state?.value?.start),
    dateKey(state?.value?.end),
    dateKey(state?.anchorDate),
    dateKey(state?.focusedDate),
    dateKey(state?.highlightedRange?.start),
    dateKey(state?.highlightedRange?.end),
    state?.isReadOnly,
  ].join('|');

  useIsomorphicLayoutEffect(() => {
    if (!root || !layerRef.current) return undefined;
    const layer = layerRef.current;
    let active = true;
    const pointerModeAttribute = 'data-muxui-range-pointer-mode';
    const markPointerMode = () => {
      if (!root.hasAttribute(pointerModeAttribute)) root.setAttribute(pointerModeAttribute, 'true');
    };
    const clearPointerMode = () => root.removeAttribute(pointerModeAttribute);
    const triggerNode = triggerRef?.current ?? null;
    const exitingKeys = new Set();
    const settleFrames = new Map();

    const stopControls = (key) => {
      const controls = controlsRef.current.get(key);
      controlsRef.current.delete(key);
      controls?.stop();
      const frameId = settleFrames.get(key);
      if (frameId !== undefined) window.cancelAnimationFrame(frameId);
      settleFrames.delete(key);
    };

    const settleGeometry = (key, band, target) => {
      setGeometry(band, target);
      const previousFrame = settleFrames.get(key);
      if (previousFrame !== undefined) window.cancelAnimationFrame(previousFrame);
      const frameId = window.requestAnimationFrame(() => {
        settleFrames.delete(key);
        if (active && bandsRef.current.get(key) === band && sameGeometry(targetsRef.current.get(key), target) && !controlsRef.current.has(key)) {
          setGeometry(band, target);
        }
      });
      settleFrames.set(key, frameId);
    };

    const removeBand = (key, immediate = false) => {
      const band = bandsRef.current.get(key);
      if (!band) return;
      if (exitingKeys.has(key)) return;
      stopControls(key);
      if (immediate || reducedRef.current) {
        exitingKeys.delete(key);
        band.remove();
        bandsRef.current.delete(key);
        targetsRef.current.delete(key);
        return;
      }
      const transition = resolvedMotionTransition(band, triggerNode, 'exit', 'dismiss');
      if (!transition) {
        exitingKeys.delete(key);
        band.remove();
        bandsRef.current.delete(key);
        targetsRef.current.delete(key);
        return;
      }
      exitingKeys.add(key);
      const exitControls = animate(band, { opacity: 0 }, transition);
      controlsRef.current.set(key, exitControls);
      exitControls.then(() => {
        if (!active || !exitingKeys.has(key) || controlsRef.current.get(key) !== exitControls) return;
        exitingKeys.delete(key);
        controlsRef.current.delete(key);
        band.remove();
        bandsRef.current.delete(key);
        targetsRef.current.delete(key);
      });
    };

    const settle = () => {
      for (const [key, band] of bandsRef.current) {
        stopControls(key);
        const target = targetsRef.current.get(key);
        if (target) settleGeometry(key, band, target);
      }
      exitingKeys.clear();
    };

    const sync = () => {
      if (!active) return;
      const selecting = markProvisionalCells(root, stateRef.current);
      const nextSegments = measureSegments(root, selecting);
      const nextKeys = new Set(nextSegments.map((segment) => segment.key));
      for (const key of bandsRef.current.keys()) {
        if (!nextKeys.has(key)) removeBand(key);
      }
      for (const target of nextSegments) {
        const previous = targetsRef.current.get(target.key);
        let band = bandsRef.current.get(target.key);
        if (!band) {
          band = root.ownerDocument.createElement('div');
          band.className = 'muxui-range-selection-band';
          band.setAttribute('data-muxui-range-band', 'true');
          band.setAttribute('aria-hidden', 'true');
          layer.appendChild(band);
          bandsRef.current.set(target.key, band);
          if (target.cap) band.setAttribute('data-muxui-range-band-cap', target.cap);
          setGeometry(band, target);
          targetsRef.current.set(target.key, target);
          continue;
        }
        if (target.cap) band.setAttribute('data-muxui-range-band-cap', target.cap);
        else band.removeAttribute('data-muxui-range-band-cap');
        targetsRef.current.set(target.key, target);
        const returningFromExit = exitingKeys.has(target.key);
        if (returningFromExit) {
          stopControls(target.key);
          exitingKeys.delete(target.key);
          settleGeometry(target.key, band, target);
          continue;
        }
        if (!previous || sameGeometry(previous, target)) {
          if (reducedRef.current) {
            stopControls(target.key);
            settleGeometry(target.key, band, target);
          }
          continue;
        }
        if (reducedRef.current) {
          stopControls(target.key);
          settleGeometry(target.key, band, target);
          continue;
        }
        stopControls(target.key);
        const transition = resolvedMotionSpring(band, triggerNode, 'state', 'interaction');
        if (!transition) {
          settleGeometry(target.key, band, target);
          continue;
        }
        const controls = animate(band, {
          left: target.left,
          top: target.top,
          width: target.width,
          height: target.height,
          opacity: 1,
        }, transition);
        controlsRef.current.set(target.key, controls);
        controls.then(() => {
          if (active && controlsRef.current.get(target.key) === controls) controlsRef.current.delete(target.key);
        });
      }
    };

    syncRef.current = sync;
    const disconnectReduced = observeReducedMotion(root, triggerNode, (reduced) => {
      reducedRef.current = reduced;
      root.toggleAttribute('data-muxui-range-selection-reduced', reduced);
      if (reduced) {
        settle();
        sync();
      }
    });
    const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(sync);
    mutationObserver?.observe(root, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-selected', 'aria-selected', 'data-disabled', 'data-unavailable'],
    });
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
    resizeObserver?.observe(root);
    root.querySelector('.muxui-calendar-grid') && resizeObserver?.observe(root.querySelector('.muxui-calendar-grid'));
    root.addEventListener('pointerover', markPointerMode, true);
    root.addEventListener('pointerenter', markPointerMode, true);
    root.addEventListener('pointermove', markPointerMode, true);
    root.addEventListener('pointerdown', markPointerMode, true);
    root.ownerDocument.addEventListener('keydown', clearPointerMode, true);
    sync();

    return () => {
      active = false;
      syncRef.current = null;
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      root.removeEventListener('pointerover', markPointerMode, true);
      root.removeEventListener('pointerenter', markPointerMode, true);
      root.removeEventListener('pointermove', markPointerMode, true);
      root.removeEventListener('pointerdown', markPointerMode, true);
      root.ownerDocument.removeEventListener('keydown', clearPointerMode, true);
      clearPointerMode();
      disconnectReduced();
      for (const controls of controlsRef.current.values()) controls.stop();
      controlsRef.current.clear();
      for (const frameId of settleFrames.values()) window.cancelAnimationFrame(frameId);
      settleFrames.clear();
      exitingKeys.clear();
      for (const band of bandsRef.current.values()) band.remove();
      bandsRef.current.clear();
      targetsRef.current.clear();
      root.removeAttribute('data-muxui-range-selecting');
      root.removeAttribute('data-muxui-range-selection-reduced');
      clearRangeMarkers(root);
    };
  }, [root, triggerRef]);

  useIsomorphicLayoutEffect(() => {
    syncRef.current?.();
  }, [root, selectionKey]);

  return React.createElement('div', {
    ref: setRoot,
    className: 'muxui-range-selection-motion',
  }, React.createElement('div', {
    ref: layerRef,
    className: 'muxui-range-selection-bands',
    'aria-hidden': 'true',
  }), children);
}
