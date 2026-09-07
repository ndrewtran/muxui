import React from 'react';

const Context = React.createContext(null);
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/u;
const cx = (...values) => values.filter(Boolean).join(' ');

function validId(value) { return typeof value === 'string' && ID_PATTERN.test(value); }
function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function round(value, precision) {
  const factor = 10 ** precision;
  const result = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(result, -0) ? 0 : result;
}
function flatten(children) {
  const result = [];
  React.Children.forEach(children, (child) => {
    if (child === null || child === undefined || typeof child === 'boolean') return;
    if (React.isValidElement(child) && child.type === React.Fragment) result.push(...flatten(child.props.children));
    else result.push(child);
  });
  return result;
}

function topology(children, rootId) {
  const content = flatten(children);
  if (!content.length || content.length % 2 === 0) return null;
  const panels = [];
  const handles = [];
  const ids = new Set();
  for (let index = 0; index < content.length; index += 1) {
    const child = content[index];
    if (!React.isValidElement(child)) return null;
    if (index % 2 === 0) {
      if (child.type !== ResizablePanel) return null;
      const { id, minSize = 0, maxSize = 100 } = child.props;
      if (!validId(id) || ids.has(id) || !finite(minSize) || !finite(maxSize) || minSize < 0 || maxSize > 100 || minSize > maxSize) return null;
      ids.add(id);
      panels.push({ id, min: minSize, max: maxSize, domId: `${rootId}-panel-${panels.length}` });
    } else {
      if (child.type !== ResizableHandle) return null;
      const { id, before, after } = child.props;
      const hasName = (typeof child.props['aria-label'] === 'string' && child.props['aria-label'].trim().length > 0 && child.props['aria-labelledby'] === undefined)
        || (child.props['aria-label'] === undefined && typeof child.props['aria-labelledby'] === 'string' && child.props['aria-labelledby'].trim().length > 0);
      if (!validId(id) || !validId(before) || !validId(after) || before === after || ids.has(id) || !hasName) return null;
      ids.add(id);
      handles.push({ id, before, after, domId: `${rootId}-handle-${handles.length}` });
    }
  }
  if (handles.length !== panels.length - 1) return null;
  for (let index = 0; index < handles.length; index += 1) {
    if (handles[index].before !== panels[index].id || handles[index].after !== panels[index + 1].id) return null;
  }
  const minTotal = panels.reduce((sum, panel) => sum + panel.min, 0);
  const maxTotal = panels.reduce((sum, panel) => sum + panel.max, 0);
  if (minTotal > 100 || maxTotal < 100) return null;
  return {
    panels,
    panelById: new Map(panels.map((panel) => [panel.id, panel])),
    handleById: new Map(handles.map((handle) => [handle.id, handle])),
    signature: JSON.stringify([panels.map(({ id, min, max }) => [id, min, max]), handles.map(({ id, before, after }) => [id, before, after])]),
  };
}

function immutable(values, panels) {
  const result = {};
  for (const panel of panels) result[panel.id] = values[panel.id];
  return Object.freeze(result);
}

function normalize(value, graph, precision) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const values = {};
  let total = 0;
  if (Object.keys(value).length !== graph.panels.length) return null;
  for (const panel of graph.panels) {
    const candidate = value[panel.id];
    if (!finite(candidate) || candidate < panel.min || candidate > panel.max) return null;
    values[panel.id] = round(candidate, precision);
    total += values[panel.id];
  }
  if (Math.abs(total - 100) > 10 ** -precision) return null;
  const residual = round(100 - total, precision);
  if (residual !== 0) {
    const panel = graph.panels.find((candidate) => residual > 0 ? candidate.max - values[candidate.id] >= residual : values[candidate.id] - candidate.min >= -residual);
    if (!panel) return null;
    values[panel.id] = round(values[panel.id] + residual, precision);
  }
  return immutable(values, graph.panels);
}

function project(value, graph, precision) {
  const values = {};
  for (const panel of graph.panels) values[panel.id] = Math.min(panel.max, Math.max(panel.min, finite(value?.[panel.id]) ? value[panel.id] : panel.min));
  for (let pass = 0; pass <= graph.panels.length; pass += 1) {
    const total = graph.panels.reduce((sum, panel) => sum + values[panel.id], 0);
    const delta = 100 - total;
    if (Math.abs(delta) <= 10 ** -precision / 2) break;
    const candidates = graph.panels.filter((panel) => delta > 0 ? values[panel.id] < panel.max : values[panel.id] > panel.min);
    if (!candidates.length) return null;
    const share = delta / candidates.length;
    let changed = false;
    for (const panel of candidates) {
      const next = delta > 0 ? Math.min(panel.max, values[panel.id] + share) : Math.max(panel.min, values[panel.id] + share);
      changed ||= next !== values[panel.id];
      values[panel.id] = next;
    }
    if (!changed) return null;
  }
  return normalize(values, graph, precision);
}

function equal(left, right, graph, precision) {
  return Boolean(left && right && graph.panels.every((panel) => round(left[panel.id], precision) === round(right[panel.id], precision)));
}

function pairBounds(graph, handle, sizes) {
  const before = graph.panelById.get(handle.before);
  const after = graph.panelById.get(handle.after);
  const total = sizes[before.id] + sizes[after.id];
  return [Math.max(before.min, total - after.max), Math.min(before.max, total - after.min), total];
}

function pairUpdate(graph, handle, sizes, nextBefore, precision) {
  const [lower, upper, total] = pairBounds(graph, handle, sizes);
  const before = round(Math.min(upper, Math.max(lower, nextBefore)), precision);
  return immutable({ ...sizes, [handle.before]: before, [handle.after]: round(total - before, precision) }, graph.panels);
}

function releaseCapture(gesture) {
  if (!gesture || gesture.pointerId === null || !gesture.captureElement?.releasePointerCapture) return;
  try {
    if (!gesture.captureElement.hasPointerCapture || gesture.captureElement.hasPointerCapture(gesture.pointerId)) {
      gesture.captureElement.releasePointerCapture(gesture.pointerId);
    }
  } catch { /* capture may already have been released by the user agent */ }
}

function direction(root, orientation) {
  if (orientation !== 'horizontal') return 1;
  try { return root.ownerDocument.defaultView?.getComputedStyle(root).direction === 'rtl' ? -1 : 1; } catch { return 1; }
}

function Resizable({ sizes, defaultSizes, onSizesChange, onSizesCommit, orientation = 'horizontal', keyboardStep = 1, keyboardLargeStep = 10, precision = 4, disabled = false, readOnly = false, children, className, ...props }) {
  const generatedId = React.useId().replace(/[^A-Za-z0-9_-]/gu, '') || 'muxui-resizable';
  const graph = React.useMemo(() => topology(children, generatedId), [children, generatedId]);
  const digits = Number.isInteger(precision) && precision >= 0 && precision <= 10 ? precision : 4;
  const axis = orientation === 'vertical' ? 'vertical' : orientation === 'horizontal' ? 'horizontal' : null;
  const rootRef = React.useRef(null);
  const [local, setLocal] = React.useState(() => graph && axis ? project(defaultSizes, graph, digits) : null);
  const topologyRef = React.useRef(graph?.signature);
  const gestureRef = React.useRef(null);
  const propsRef = React.useRef({ onSizesChange, onSizesCommit });
  propsRef.current = { onSizesChange, onSizesCommit };
  const controlled = sizes !== undefined;
  const validConfiguration = Boolean(graph && axis && finite(keyboardStep) && keyboardStep > 0 && finite(keyboardLargeStep) && keyboardLargeStep > 0 && typeof disabled === 'boolean' && typeof readOnly === 'boolean' && !(controlled && defaultSizes !== undefined));
  const controlledValue = validConfiguration && graph ? normalize(sizes, graph, digits) : null;
  const displayedLocal = graph && axis && topologyRef.current === graph.signature ? local : graph && axis ? project(local, graph, digits) : null;
  const current = controlled ? controlledValue : displayedLocal;
  const stateRef = React.useRef({ graph, current, axis, disabled, readOnly, digits, controlled, keyboardStep, keyboardLargeStep });
  stateRef.current = { graph, current, axis, disabled, readOnly, digits, controlled, keyboardStep, keyboardLargeStep };

  const cancel = React.useCallback((handleId) => {
    if (handleId !== undefined && gestureRef.current?.handleId !== handleId) return;
    releaseCapture(gestureRef.current);
    gestureRef.current = null;
  }, []);

  React.useEffect(() => {
    if (!graph || topologyRef.current === graph.signature || controlled) return;
    const next = project(local, graph, digits);
    topologyRef.current = graph.signature;
    setLocal(next);
  }, [controlled, digits, graph, local]);

  React.useEffect(() => {
    const onResize = () => cancel();
    const ownerWindow = rootRef.current?.ownerDocument?.defaultView;
    ownerWindow?.addEventListener('resize', onResize);
    return () => { ownerWindow?.removeEventListener('resize', onResize); cancel(); };
  }, [cancel]);

  React.useEffect(() => {
    const gesture = gestureRef.current;
    const state = stateRef.current;
    if (!gesture || !state.graph || !state.current || !state.axis || state.disabled || state.readOnly || !state.graph.handleById.has(gesture.handleId) || (state.controlled && gesture.lastProposal && !equal(state.current, gesture.lastProposal, state.graph, state.digits))) cancel();
  });

  const apply = React.useCallback((handleId, source, delta) => {
    const state = stateRef.current;
    const gesture = gestureRef.current;
    if (!gesture || gesture.handleId !== handleId || gesture.source !== source || !state.current || !state.graph || state.disabled || state.readOnly) return null;
    if (state.controlled && gesture.lastProposal && !equal(state.current, gesture.lastProposal, state.graph, state.digits)) { cancel(handleId); return null; }
    const handle = state.graph.handleById.get(handleId);
    if (!handle) return null;
    const next = pairUpdate(state.graph, handle, state.current, state.current[handle.before] + delta, state.digits);
    if (equal(state.current, next, state.graph, state.digits)) return next;
    if (!state.controlled) setLocal(next);
    gesture.changed = true;
    gesture.lastProposal = next;
    const meta = Object.freeze({ handleId, source });
    propsRef.current.onSizesChange?.(next, meta);
    if (source === 'keyboard') propsRef.current.onSizesCommit?.(next, meta);
    return next;
  }, [cancel]);

  const beginPointer = React.useCallback((handleId, event, element) => {
    const state = stateRef.current;
    if (!state.graph || !state.current || !state.axis || state.disabled || state.readOnly || gestureRef.current) return false;
    const handle = state.graph.handleById.get(handleId);
    if (!handle || event.button !== 0) return false;
    const rect = rootRef.current?.getBoundingClientRect();
    const span = state.axis === 'vertical' ? rect?.height : rect?.width;
    if (!Number.isFinite(span) || span <= 0) return false;
    const point = state.axis === 'vertical' ? event.clientY : event.clientX;
    gestureRef.current = { handleId, source: 'pointer', changed: false, lastProposal: null, pointerId: event.pointerId ?? null, captureElement: element, lastPoint: point, span, direction: direction(rootRef.current, state.axis) };
    try { element.setPointerCapture?.(event.pointerId); } catch { /* capture may be unavailable in a test DOM */ }
    return true;
  }, []);

  const movePointer = React.useCallback((handleId, event) => {
    const gesture = gestureRef.current;
    const state = stateRef.current;
    if (!gesture || gesture.handleId !== handleId || gesture.source !== 'pointer' || (gesture.pointerId !== null && event.pointerId !== gesture.pointerId)) return;
    const point = state.axis === 'vertical' ? event.clientY : event.clientX;
    const delta = ((point - gesture.lastPoint) / gesture.span) * 100 * gesture.direction;
    gesture.lastPoint = point;
    apply(handleId, 'pointer', delta);
  }, [apply]);

  const endPointer = React.useCallback((handleId, element) => {
    const gesture = gestureRef.current;
    const state = stateRef.current;
    if (!gesture || gesture.handleId !== handleId || gesture.source !== 'pointer') return;
    if (gesture.changed && gesture.lastProposal && (!state.controlled || (state.current && state.graph && equal(state.current, gesture.lastProposal, state.graph, state.digits)))) propsRef.current.onSizesCommit?.(gesture.lastProposal, Object.freeze({ handleId, source: 'pointer' }));
    releaseCapture(gesture);
    gestureRef.current = null;
  }, []);

  const keyboard = React.useCallback((handleId, event) => {
    const state = stateRef.current;
    if (!state.graph || !state.current || !state.axis || state.disabled || state.readOnly || gestureRef.current) return;
    const back = state.axis === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
    const forward = state.axis === 'vertical' ? 'ArrowDown' : 'ArrowRight';
    let amount;
    if (event.key === 'Home' || event.key === 'End' || event.key === 'PageUp' || event.key === 'PageDown') {
      const handle = state.graph.handleById.get(handleId);
      if (!handle) return;
      const [lower, upper] = pairBounds(state.graph, handle, state.current);
      const currentValue = state.current[handle.before];
      const target = event.key === 'Home' ? lower : event.key === 'End' ? upper : currentValue + (event.key === 'PageUp' ? 1 : -1) * state.keyboardLargeStep;
      gestureRef.current = { handleId, source: 'keyboard', changed: false, lastProposal: null };
      event.preventDefault();
      apply(handleId, 'keyboard', target - currentValue);
      gestureRef.current = null;
      return;
    }
    if (event.key === back) amount = -(event.shiftKey ? state.keyboardLargeStep : state.keyboardStep);
    else if (event.key === forward) amount = event.shiftKey ? state.keyboardLargeStep : state.keyboardStep;
    else return;
    if (state.axis === 'horizontal') amount *= direction(rootRef.current, state.axis);
    gestureRef.current = { handleId, source: 'keyboard', changed: false, lastProposal: null };
    event.preventDefault();
    apply(handleId, 'keyboard', amount);
    gestureRef.current = null;
  }, [apply]);

  const context = React.useMemo(() => ({ graph, current, axis, disabled: Boolean(disabled || readOnly || !validConfiguration), beginPointer, movePointer, endPointer, cancel, keyboard }), [axis, beginPointer, cancel, current, disabled, endPointer, graph, keyboard, movePointer, readOnly, validConfiguration]);
  return React.createElement(Context.Provider, { value: context }, React.createElement('div', { ...props, ref: rootRef, className: cx('muxui-resizable', axis && `muxui-resizable--${axis}`, className), 'data-orientation': axis || undefined, 'data-disabled': disabled || undefined, 'data-readonly': readOnly || undefined, 'data-invalid': !validConfiguration || !current || undefined }, children));
}

function ResizablePanel({ id, minSize = 0, maxSize = 100, className, style, children, ...props }) {
  const context = React.useContext(Context);
  const panel = context?.graph?.panelById.get(id);
  const size = panel && context.current ? Math.min(panel.max, Math.max(panel.min, context.current[id])) : undefined;
  return React.createElement('div', { ...props, id: panel?.domId, className: cx('muxui-resizable-panel', className), style: { ...style, ...(size === undefined ? {} : { flexBasis: `${size}%`, flexGrow: 0, flexShrink: 0 }) }, 'data-panel-id': validId(id) ? id : undefined, 'data-invalid': !panel || size === undefined || undefined }, children);
}

function ResizableHandle({ id, before, after, disabled = false, className, onKeyDown, ...props }) {
  const context = React.useContext(Context);
  const handle = context?.graph?.handleById.get(id);
  const beforePanel = handle && context.graph.panelById.get(before);
  const afterPanel = handle && context.graph.panelById.get(after);
  const valid = Boolean(handle && beforePanel && afterPanel && context.current && context.axis);
  const blocked = Boolean(disabled || context?.disabled || !valid);
  const bounds = valid ? pairBounds(context.graph, handle, context.current) : [0, 100, 0];
  const value = valid ? context.current[before] : 0;
  const orientation = context?.axis === 'horizontal' ? 'vertical' : 'horizontal';
  const onPointerDown = (event) => { if (context?.beginPointer(id, event, event.currentTarget)) event.currentTarget.setPointerCapture?.(event.pointerId); };
  const onPointerMove = (event) => context?.movePointer(id, event);
  const onPointerUp = (event) => context?.endPointer(id, event.currentTarget);
  const onKey = (event) => { onKeyDown?.(event); if (!event.defaultPrevented && !blocked) context?.keyboard(id, event); };
  return React.createElement('div', { ...props, role: 'separator', ref: undefined, tabIndex: blocked ? -1 : 0, className: cx('muxui-resizable-handle', className), 'data-handle-id': validId(id) ? id : undefined, 'data-disabled': blocked || undefined, 'aria-disabled': blocked || undefined, 'aria-controls': valid ? `${beforePanel.domId} ${afterPanel.domId}` : undefined, 'aria-orientation': orientation, 'aria-valuemin': valid ? bounds[0] : undefined, 'aria-valuemax': valid ? bounds[1] : undefined, 'aria-valuenow': valid ? value : undefined, 'aria-valuetext': valid ? `${value}% / ${context.current[after]}%` : undefined, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: () => context?.cancel(id), onLostPointerCapture: () => context?.cancel(id), onKeyDown: onKey });
}

export { Resizable, ResizablePanel, ResizableHandle };
