import React from 'react';
import { animate } from 'motion/react';
import { observeReducedMotion, resolvedMotionSpring, resolvedMotionTransition } from './motion.mjs';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;
const ROW_SELECTOR = '.muxui-tree-item[role="row"]';
const READY_ATTRIBUTE = 'data-muxui-tree-motion-ready';
const REDUCED_ATTRIBUTE = 'data-muxui-tree-motion-reduced';

function assignRef(ref, value) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

function treeRows(root) {
  return [...root.querySelectorAll(ROW_SELECTOR)].filter((row) => (
    row.closest('.muxui-tree') === root && !row.closest('[data-muxui-tree-exit]')
  ));
}

function rowKey(row) {
  return row?.getAttribute('data-key') ?? row?.id ?? null;
}

function rowLevel(row) {
  return Number(row.getAttribute('aria-level')) || 1;
}

function geometry(root, row) {
  const rootRect = root.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  return {
    left: rowRect.left - rootRect.left + root.scrollLeft - root.clientLeft,
    top: rowRect.top - rootRect.top + root.scrollTop - root.clientTop,
    width: rowRect.width,
    height: rowRect.height,
  };
}

function sameGeometry(previous, next) {
  return previous && Math.abs(previous.left - next.left) < 0.5
    && Math.abs(previous.top - next.top) < 0.5
    && Math.abs(previous.width - next.width) < 0.5
    && Math.abs(previous.height - next.height) < 0.5;
}

function setGeometry(node, target) {
  Object.assign(node.style, {
    left: `${target.left}px`,
    top: `${target.top}px`,
    width: `${target.width}px`,
    height: `${target.height}px`,
  });
}

function geometryTransform(from, to) {
  const scaleX = to.width > 0 ? from.width / to.width : 1;
  const scaleY = to.height > 0 ? from.height / to.height : 1;
  return `translate3d(${from.left - to.left}px, ${from.top - to.top}px, 0) scale(${scaleX}, ${scaleY})`;
}

function clearRowReveal(row) {
  row.style.removeProperty('height');
  row.style.removeProperty('overflow');
  row.removeAttribute('data-muxui-tree-revealing');
}

function sanitizeSnapshot(row, height, paddingInlineStart) {
  // RAC removes flattened descendants immediately, so inert copies preserve only their normal-flow exit pixels.
  const clone = row.cloneNode(true);
  const key = rowKey(row);
  clone.removeAttribute('id');
  clone.removeAttribute('role');
  clone.removeAttribute('data-key');
  if (key) clone.setAttribute('data-muxui-tree-ghost-key', key);
  clone.removeAttribute('data-muxui-tree-revealing');
  clone.removeAttribute('data-hovered');
  clone.removeAttribute('data-focused');
  clone.removeAttribute('data-focus-visible');
  clone.removeAttribute('data-pressed');
  clone.setAttribute('aria-hidden', 'true');
  clone.inert = true;
  Object.assign(clone.style, {
    height: `${height}px`,
    overflow: 'hidden',
    flex: '0 0 auto',
    paddingInlineStart,
  });

  for (const element of [clone, ...clone.querySelectorAll('*')]) {
    element.removeAttribute('id');
    element.removeAttribute('role');
    element.removeAttribute('name');
    element.removeAttribute('for');
    element.removeAttribute('form');
    for (const attribute of [...element.attributes]) {
      if (attribute.name.startsWith('aria-')) element.removeAttribute(attribute.name);
    }
    if (element.matches('button,input,select,textarea,fieldset,object,output')) {
      element.disabled = true;
    }
    if (element.matches('a,[tabindex]')) element.setAttribute('tabindex', '-1');
  }

  clone.setAttribute('aria-hidden', 'true');
  clone.inert = true;
  return clone;
}

function makeExitPlaceholder(root, parent, rows, entries, nestedRuns, totalHeight) {
  const wrapper = root.ownerDocument.createElement('div');
  wrapper.className = 'muxui-tree-motion-exit';
  wrapper.setAttribute('data-muxui-tree-exit', 'true');
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.inert = true;
  Object.assign(wrapper.style, { height: `${totalHeight}px`, overflow: 'hidden' });

  for (const row of rows) {
    const entry = entries.get(rowKey(row));
    if (!entry) continue;
    const key = rowKey(row);
    wrapper.appendChild(sanitizeSnapshot(row, entry.rect.height, entry.paddingInlineStart));
    const nestedRun = nestedRuns.get(key);
    if (nestedRun) wrapper.appendChild(nestedRun.node.cloneNode(true));
  }

  parent.appendChild(wrapper);
  return wrapper;
}

function directHoveredRow(root, rows) {
  return rows.find((row) => row.hasAttribute('data-hovered')
    && !row.hasAttribute('data-disabled')
    && row.getAttribute('aria-disabled') !== 'true') ?? null;
}

function observeTreeMotion(root) {
  if (!root) return undefined;

  const view = root.ownerDocument.defaultView;
  const hover = root.ownerDocument.createElement('span');
  hover.className = 'muxui-tree-hover';
  hover.setAttribute('aria-hidden', 'true');
  hover.hidden = true;
  root.appendChild(hover);
  root.setAttribute(READY_ATTRIBUTE, 'true');

  let active = true;
  let reduced = false;
  let pendingFrame = null;
  let hoverControls = null;
  let hoverKey = null;
  let hoverTarget = null;
  let nextRunId = 0;
  let activeReveal = new Map();
  let exitRuns = new Map();
  let observedRows = new Set();
  let entries = new Map();

  const stopHover = () => {
    hoverControls?.stop();
    hoverControls = null;
  };

  const stopReveal = (key) => {
    const reveal = activeReveal.get(key);
    reveal?.controls?.stop();
    if (reveal?.row.isConnected) clearRowReveal(reveal.row);
    activeReveal.delete(key);
  };

  const stopExit = (run, remove = true) => {
    run.controls?.stop();
    run.controls = null;
    if (remove) run.node.remove();
    if (exitRuns.get(run.parentKey) === run) exitRuns.delete(run.parentKey);
  };

  const measureRows = () => {
    const rows = treeRows(root);
    const nextEntries = new Map();
    rows.forEach((row, index) => {
      const key = rowKey(row);
      if (!key) return;
      nextEntries.set(key, {
        row,
        parent: row.parentElement,
        index,
        level: rowLevel(row),
        expanded: row.getAttribute('aria-expanded') === 'true',
        rect: geometry(root, row),
        paddingInlineStart: view?.getComputedStyle(row).paddingInlineStart ?? '',
      });
    });
    return { rows, nextEntries };
  };

  const updateObservedRows = (rows) => {
    const nextRows = new Set(rows);
    for (const row of observedRows) {
      if (!nextRows.has(row)) resizeObserver?.unobserve(row);
    }
    for (const row of nextRows) {
      if (!observedRows.has(row)) resizeObserver?.observe(row);
    }
    observedRows = nextRows;
  };

  const settleHover = (target) => {
    stopHover();
    if (!target) {
      hover.hidden = true;
      hover.style.transform = 'none';
      hoverTarget = null;
      hoverKey = null;
      return;
    }
    setGeometry(hover, target);
    hover.style.transform = 'none';
    hover.style.opacity = '1';
    hover.hidden = false;
    hoverTarget = target;
  };

  const syncHover = (rows) => {
    const row = directHoveredRow(root, rows);
    const key = rowKey(row);
    const target = row ? geometry(root, row) : null;
    if (!target) {
      settleHover(null);
      return;
    }
    if (key === hoverKey && sameGeometry(hoverTarget, target)) return;
    const current = hover.hidden ? null : geometry(root, hover);
    hoverKey = key;
    hoverTarget = target;
    if (!current || reduced) {
      settleHover(target);
      hoverKey = key;
      return;
    }

    stopHover();
    setGeometry(hover, target);
    hover.hidden = false;
    const transition = resolvedMotionSpring(root, row, 'state', 'interaction');
    if (!transition || sameGeometry(current, target)) {
      hover.style.transform = 'none';
      return;
    }
    const from = geometryTransform(current, target);
    const to = 'translate3d(0px, 0px, 0px) scale(1, 1)';
    hover.style.transform = from;
    const controls = animate(hover, { transform: [from, to] }, transition);
    hoverControls = controls;
    controls.then?.(() => {
      if (hoverControls === controls) hoverControls = null;
    });
  };

  const parentForNewRow = (row, rows, currentEntries, previousEntries) => {
    const index = rows.indexOf(row);
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const candidate = rows[cursor];
      if (rowLevel(candidate) >= rowLevel(row)) continue;
      const key = rowKey(candidate);
      const old = previousEntries.get(key);
      const current = currentEntries.get(key);
      if (old && current && !old.expanded && current.expanded) return key;
      const ancestor = parentForNewRow(candidate, rows, currentEntries, previousEntries);
      if (ancestor) return ancestor;
      return null;
    }
    return null;
  };

  const animateEntering = (rows, startRatio = 0) => {
    if (!rows.length) return;
    const targets = rows.map((row) => ({ row, key: rowKey(row), height: row.getBoundingClientRect().height }));
    const transition = resolvedMotionTransition(root, null, 'interaction', 'interaction');
    if (!transition || reduced) return;
    const safeStartRatio = Number.isFinite(startRatio) ? Math.max(0, startRatio) : 0;
    for (const { row, key, height } of targets) {
      if (!key || height <= 0) continue;
      stopReveal(key);
      const startHeight = height * safeStartRatio;
      Object.assign(row.style, { height: `${startHeight}px`, overflow: 'hidden' });
      row.setAttribute('data-muxui-tree-revealing', 'true');
      const controls = animate(row, { height: [startHeight, height] }, transition);
      activeReveal.set(key, { row, controls });
      controls.then?.(() => {
        if (activeReveal.get(key)?.controls !== controls) return;
        clearRowReveal(row);
        activeReveal.delete(key);
      });
    }
  };

  const animateExiting = (rows, parentKey, currentEntries, previousEntries) => {
    if (!rows.length) return;
    const parent = currentEntries.get(parentKey)?.row;
    const parentEntry = previousEntries.get(parentKey);
    const firstEntry = previousEntries.get(rowKey(rows[0]));
    const lastEntry = previousEntries.get(rowKey(rows.at(-1)));
    const rowKeys = new Set(rows.map(rowKey));
    const nestedRuns = new Map([...exitRuns.entries()].filter(([key]) => rowKeys.has(key)));
    const nestedHeight = [...nestedRuns.values()].reduce((total, nestedRun) => total + nestedRun.node.getBoundingClientRect().height, 0);
    const startHeight = rows.reduce((total, row) => total + (previousEntries.get(rowKey(row))?.rect.height ?? 0), nestedHeight);
    const transition = resolvedMotionTransition(root, parent, 'interaction', 'interaction');
    if (!parent || !parentEntry || !firstEntry || !lastEntry || startHeight <= 0 || !transition || reduced) return;

    const run = exitRuns.get(parentKey);
    if (run) stopExit(run);

    const placeholder = makeExitPlaceholder(root, firstEntry.parent, rows, previousEntries, nestedRuns, startHeight);
    const nextRow = [...previousEntries.values()]
      .filter((entry) => entry.index > lastEntry.index)
      .sort((a, b) => a.index - b.index)
      .map((entry) => currentEntries.get(rowKey(entry.row))?.row)
      .find((row) => row?.parentElement === firstEntry.parent);
    if (nextRow?.parentElement === firstEntry.parent) firstEntry.parent.insertBefore(placeholder, nextRow);

    for (const row of rows) stopReveal(rowKey(row));
    for (const nestedRun of nestedRuns.values()) stopExit(nestedRun);
    const controls = animate(placeholder, { height: [startHeight, 0] }, transition);
    const nextRun = { id: ++nextRunId, parentKey, node: placeholder, controls };
    exitRuns.set(parentKey, nextRun);
    controls.then?.(() => {
      if (exitRuns.get(parentKey) !== nextRun) return;
      stopExit(nextRun);
    });
  };

  const settleAll = () => {
    stopHover();
    for (const [key] of activeReveal) stopReveal(key);
    for (const run of [...exitRuns.values()]) stopExit(run);
    for (const row of treeRows(root)) clearRowReveal(row);
    const { rows } = measureRows();
    syncHover(rows);
  };

  const sync = () => {
    pendingFrame = null;
    if (!active) return;
    const previousEntries = entries;
    const { rows, nextEntries } = measureRows();
    updateObservedRows(rows);

    if (previousEntries.size) {
      const removed = [...previousEntries.values()]
        .filter((entry) => !nextEntries.has(rowKey(entry.row)) && !entry.row.isConnected)
        .sort((a, b) => a.index - b.index);
      const added = rows.filter((row) => !previousEntries.has(rowKey(row)));

      const exitGroups = [];
      for (const entry of removed) {
        const group = exitGroups.at(-1);
        if (group && group.at(-1).index + 1 === entry.index) group.push(entry);
        else exitGroups.push([entry]);
      }
      for (const group of exitGroups) {
        const first = group[0];
        const parentEntry = [...previousEntries.values()]
          .filter((candidate) => candidate.index < first.index && candidate.level < first.level)
          .sort((a, b) => b.index - a.index)[0];
        if (!parentEntry?.expanded) continue;
        const parentKey = rowKey(parentEntry.row);
        const parent = nextEntries.get(parentKey);
        if (!parent || parent.expanded) continue;
        animateExiting(group.map((entry) => entry.row), parentKey, nextEntries, previousEntries);
      }
      for (const run of [...exitRuns.values()]) {
        if (!nextEntries.has(run.parentKey)) stopExit(run);
      }

      const enterGroups = new Map();
      for (const row of added) {
        const parentKey = parentForNewRow(row, rows, nextEntries, previousEntries);
        if (!parentKey) continue;
        const group = enterGroups.get(parentKey) ?? [];
        group.push(row);
        enterGroups.set(parentKey, group);
      }
      for (const [parentKey, group] of enterGroups) {
        const run = exitRuns.get(parentKey);
        let startRatio = 0;
        if (run) {
          const currentHeight = run.node.getBoundingClientRect().height;
          const targetHeight = group.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);
          startRatio = targetHeight > 0 ? currentHeight / targetHeight : 0;
          stopExit(run);
        }
        group.sort((a, b) => nextEntries.get(rowKey(a)).index - nextEntries.get(rowKey(b)).index);
        animateEntering(group, startRatio);
      }
    }

    entries = nextEntries;
    syncHover(rows);
  };

  const scheduleSync = () => {
    if (pendingFrame !== null || !active) return;
    pendingFrame = typeof view?.requestAnimationFrame === 'function'
      ? view.requestAnimationFrame(sync)
      : setTimeout(sync, 0);
  };

  const prepareExpandedChange = () => {
    if (!active) return;
    const { rows, nextEntries } = measureRows();
    updateObservedRows(rows);
    entries = nextEntries;
  };

  const onPointerLeave = (event) => {
    if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return;
    settleHover(null);
  };

  const disconnectReduced = observeReducedMotion(root, null, (nextReduced) => {
    reduced = nextReduced;
    root.toggleAttribute(REDUCED_ATTRIBUTE, nextReduced);
    if (nextReduced) settleAll();
    else scheduleSync();
  });

  const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(scheduleSync);
  mutationObserver?.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-expanded', 'aria-disabled', 'data-hovered', 'data-disabled', 'data-key'],
  });

  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleSync);
  resizeObserver?.observe(root);
  updateObservedRows(treeRows(root));
  root.addEventListener('scroll', scheduleSync, true);
  root.addEventListener('pointerleave', onPointerLeave);
  sync();

  return {
    beforeExpandedChange: prepareExpandedChange,
    dispose() {
      active = false;
      if (pendingFrame !== null) {
        if (typeof view?.cancelAnimationFrame === 'function') view.cancelAnimationFrame(pendingFrame);
        clearTimeout(pendingFrame);
      }
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      disconnectReduced();
      root.removeEventListener('scroll', scheduleSync, true);
      root.removeEventListener('pointerleave', onPointerLeave);
      stopHover();
      for (const [key] of activeReveal) stopReveal(key);
      for (const run of [...exitRuns.values()]) stopExit(run);
      for (const row of treeRows(root)) clearRowReveal(row);
      hover.remove();
      root.removeAttribute(READY_ATTRIBUTE);
      root.removeAttribute(REDUCED_ATTRIBUTE);
    },
  };
}

export function TreeMotion({ children, rootRef, controllerRef }) {
  const [root, setRoot] = React.useState(null);

  const setRootRef = React.useCallback((node) => {
    setRoot(node);
    assignRef(rootRef, node);
  }, [rootRef]);

  useIsomorphicLayoutEffect(() => {
    const controller = observeTreeMotion(root);
    if (controllerRef) controllerRef.current = controller;
    return () => {
      if (controllerRef?.current === controller) controllerRef.current = null;
      controller?.dispose();
    };
  }, [root, controllerRef]);

  return React.cloneElement(children, { ref: setRootRef });
}
