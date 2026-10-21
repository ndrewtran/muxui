import React from 'react';
import type { HTMLAttributes, KeyboardEvent, PointerEvent, ReactElement, ReactNode } from 'react';

/** The panel sizes as percentages of the container, by panel id. */
export type ResizableSizes = { readonly [panelId: string]: number };
/** The handle that changed the sizes, and whether a pointer or the keyboard did. */
export type ResizableChange = { handleId: string; source: 'pointer' | 'keyboard' };

/**
 * The props Mux UI defines for Resizable; the catalog's web.react API is derived from
 * this interface (Decision 0031). `sizes` and `defaultSizes` are exclusive, which
 * ResizableProps enforces with its two arms; here both read as optional.
 */
interface ResizableOwnProps {
  /** The panel sizes, when the caller controls them. Give sizes or defaultSizes, not both. A controlled value has a finite size for every panel id and no other keys, each within its panel's bounds, adding up to 100. */
  sizes?: ResizableSizes;
  /** The panel sizes at first, when Resizable controls them. Give sizes or defaultSizes, not both. Sizes that are missing, or that do not add up to 100, are adjusted to a valid layout. */
  defaultSizes?: ResizableSizes;
  /** Reports every change to the sizes, with the handle that made it and whether a pointer or the keyboard did. */
  onSizesChange?: (sizes: ResizableSizes, meta: ResizableChange) => void;
  /** Reports sizes worth saving: when a pointer gesture that changed the sizes ends normally, and after each keyboard change. */
  onSizesCommit?: (sizes: ResizableSizes, meta: ResizableChange) => void;
  /** Whether the panels sit side by side or stacked. */
  orientation?: 'horizontal' | 'vertical';
  /** How many percent an arrow key moves a handle. A finite number greater than 0. */
  keyboardStep?: number;
  /** How many percent Shift with an arrow key, Page Up, or Page Down moves a handle. A finite number greater than 0. */
  keyboardLargeStep?: number;
  /** How many decimal places sizes keep, from 0 to 10. */
  precision?: number;
  /** Makes every handle unavailable. */
  disabled?: boolean;
  /** Shows the sizes and ignores resizing. */
  readOnly?: boolean;
}

export type ResizableBaseProps = Omit<ResizableOwnProps, 'sizes' | 'defaultSizes'> & Omit<HTMLAttributes<HTMLDivElement>, keyof ResizableOwnProps>;
export type ResizableProps = ResizableBaseProps & (
  | { sizes: ResizableSizes; defaultSizes?: never }
  | { sizes?: never; defaultSizes?: ResizableSizes }
);
type ResizablePanelProps = HTMLAttributes<HTMLDivElement> & { id: string; minSize?: number; maxSize?: number };
type ResizableHandleProps = HTMLAttributes<HTMLDivElement> & { id: string; before: string; after: string; disabled?: boolean };

type Orientation = NonNullable<ResizableOwnProps['orientation']>;
type Panel = { id: string; min: number; max: number; domId: string };
type Handle = { id: string; before: string; after: string; domId: string };
type Graph = { panels: Panel[]; panelById: Map<string, Panel>; handleById: Map<string, Handle>; signature: string };
type PointerGesture = {
  handleId: string; source: 'pointer'; changed: boolean; lastProposal: ResizableSizes | null;
  origin: ResizableSizes; pointerId: number | null; captureElement: HTMLElement; lastPoint: number; span: number; direction: 1 | -1;
};
type KeyboardGesture = { handleId: string; source: 'keyboard'; changed: boolean; lastProposal: ResizableSizes | null; origin?: undefined };
type Gesture = PointerGesture | KeyboardGesture;
// What the callbacks read: the latest render's values, since the callbacks themselves are stable.
type State = {
  graph: Graph | null; current: ResizableSizes | null; axis: Orientation | null; disabled: boolean; readOnly: boolean;
  digits: number; controlled: boolean; keyboardStep: number; keyboardLargeStep: number;
};
type ResizableContext = {
  graph: Graph | null;
  current: ResizableSizes | null;
  axis: Orientation | null;
  disabled: boolean;
  beginPointer: (handleId: string, event: PointerEvent<HTMLDivElement>, element: HTMLDivElement) => boolean;
  movePointer: (handleId: string, event: PointerEvent<HTMLDivElement>) => void;
  endPointer: (handleId: string, pointerId: number) => void;
  cancel: (handleId: string, pointerId: number) => void;
  keyboard: (handleId: string, event: KeyboardEvent<HTMLDivElement>) => void;
};
// Props a child or a size map may carry before they are checked: callers can pass anything.
type Unchecked = Readonly<Record<string, unknown>>;

const Context = React.createContext<ResizableContext | null>(null);
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/u;
const cx = (...values: unknown[]) => values.filter(Boolean).join(' ');

function validId(value: unknown): value is string { return typeof value === 'string' && ID_PATTERN.test(value); }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function round(value: number, precision: number) {
  const factor = 10 ** precision;
  const result = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(result, -0) ? 0 : result;
}
function flatten(children: ReactNode): ReactNode[] {
  const result: ReactNode[] = [];
  React.Children.forEach(children, (child) => {
    if (child === null || child === undefined || typeof child === 'boolean') return;
    if (React.isValidElement<{ children?: ReactNode }>(child) && child.type === React.Fragment) result.push(...flatten(child.props.children));
    else result.push(child);
  });
  return result;
}

function topology(children: ReactNode, rootId: string): Graph | null {
  const content = flatten(children);
  if (!content.length || content.length % 2 === 0) return null;
  const panels: Panel[] = [];
  const handles: Handle[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < content.length; index += 1) {
    const child = content[index];
    if (!React.isValidElement<Unchecked>(child)) return null;
    if (index % 2 === 0) {
      if (child.type !== ResizablePanel) return null;
      const { id, minSize = 0, maxSize = 100 } = child.props;
      if (!validId(id) || ids.has(id) || !finite(minSize) || !finite(maxSize) || minSize < 0 || maxSize > 100 || minSize > maxSize) return null;
      ids.add(id);
      panels.push({ id, min: minSize, max: maxSize, domId: `${rootId}-panel-${panels.length}` });
    } else {
      if (child.type !== ResizableHandle) return null;
      const { id, before, after, 'aria-label': label, 'aria-labelledby': labelledBy } = child.props;
      const hasName = (typeof label === 'string' && label.trim().length > 0 && labelledBy === undefined)
        || (label === undefined && typeof labelledBy === 'string' && labelledBy.trim().length > 0);
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

function immutable(values: Record<string, number>, panels: Panel[]): ResizableSizes {
  const result: Record<string, number> = {};
  for (const panel of panels) result[panel.id] = values[panel.id];
  return Object.freeze(result);
}

function normalize(value: Unchecked | null | undefined, graph: Graph, precision: number): ResizableSizes | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const values: Record<string, number> = {};
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

function project(value: Unchecked | null | undefined, graph: Graph, precision: number): ResizableSizes | null {
  const values: Record<string, number> = {};
  for (const panel of graph.panels) {
    const candidate = value?.[panel.id];
    values[panel.id] = Math.min(panel.max, Math.max(panel.min, finite(candidate) ? candidate : panel.min));
  }
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

// Sizes compare only on a graph's panels. With no graph the layout is invalid and `left` is null as well.
function equal(left: ResizableSizes | null | undefined, right: ResizableSizes | null | undefined, graph: Graph | null, precision: number) {
  return Boolean(left && right && graph?.panels.every((panel) => round(left[panel.id], precision) === round(right[panel.id], precision)));
}

// A graph's handles name panels it holds, which topology checked.
function pairBounds(graph: Graph, handle: Handle, sizes: ResizableSizes): [lower: number, upper: number, total: number] {
  const before = graph.panelById.get(handle.before)!;
  const after = graph.panelById.get(handle.after)!;
  const total = sizes[before.id] + sizes[after.id];
  return [Math.max(before.min, total - after.max), Math.min(before.max, total - after.min), total];
}

function pairUpdate(graph: Graph, handle: Handle, sizes: ResizableSizes, nextBefore: number, precision: number) {
  const [lower, upper, total] = pairBounds(graph, handle, sizes);
  const before = round(Math.min(upper, Math.max(lower, nextBefore)), precision);
  return immutable({ ...sizes, [handle.before]: before, [handle.after]: round(total - before, precision) }, graph.panels);
}

function releaseCapture(gesture: Gesture) {
  // Only a pointer gesture captures the pointer.
  if (gesture.source !== 'pointer' || gesture.pointerId === null || !gesture.captureElement?.releasePointerCapture) return;
  try {
    if (!gesture.captureElement.hasPointerCapture || gesture.captureElement.hasPointerCapture(gesture.pointerId)) {
      gesture.captureElement.releasePointerCapture(gesture.pointerId);
    }
  } catch { /* capture may already have been released by the user agent */ }
}

// The sizes from before a gesture, if they still form a valid layout once rounded at the current precision.
function restorable(origin: ResizableSizes, graph: Graph, precision: number) {
  const sizes = normalize(origin, graph, precision);
  return sizes && graph.panels.every((panel) => sizes[panel.id] >= panel.min && sizes[panel.id] <= panel.max) ? sizes : null;
}

// Whether a pointer event from `pointerId` belongs to this pointer gesture on this handle.
function ownsPointer(gesture: Gesture | null, handleId: string, pointerId: number): gesture is PointerGesture {
  return gesture !== null && gesture.handleId === handleId && gesture.source === 'pointer' && (gesture.pointerId === null || gesture.pointerId === pointerId);
}

// Whether a controlled parent shows sizes other than the ones it was last given: the gesture's latest proposal, or its starting sizes before the first one.
function parentDiverged(gesture: Gesture, state: State) {
  const expected = gesture.lastProposal ?? gesture.origin;
  return Boolean(state.controlled && expected && !equal(state.current, expected, state.graph, state.digits));
}

function direction(root: HTMLElement | null, orientation: Orientation): 1 | -1 {
  if (orientation !== 'horizontal') return 1;
  try { return root?.ownerDocument.defaultView?.getComputedStyle(root).direction === 'rtl' ? -1 : 1; } catch { return 1; }
}

export function Resizable({ sizes, defaultSizes, onSizesChange, onSizesCommit, orientation = 'horizontal', keyboardStep = 1, keyboardLargeStep = 10, precision = 4, disabled = false, readOnly = false, children, className, ...props }: ResizableProps): ReactElement {
  const generatedId = React.useId().replace(/[^A-Za-z0-9_-]/gu, '') || 'muxui-resizable';
  const graph = React.useMemo(() => topology(children, generatedId), [children, generatedId]);
  const digits = Number.isInteger(precision) && precision >= 0 && precision <= 10 ? precision : 4;
  const axis: Orientation | null = orientation === 'vertical' ? 'vertical' : orientation === 'horizontal' ? 'horizontal' : null;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [local, setLocal] = React.useState(() => graph && axis ? project(defaultSizes, graph, digits) : null);
  const topologyRef = React.useRef(graph?.signature);
  const gestureRef = React.useRef<Gesture | null>(null);
  const propsRef = React.useRef({ onSizesChange, onSizesCommit });
  propsRef.current = { onSizesChange, onSizesCommit };
  const controlled = sizes !== undefined;
  const validConfiguration = Boolean(graph && axis && finite(keyboardStep) && keyboardStep > 0 && finite(keyboardLargeStep) && keyboardLargeStep > 0 && typeof disabled === 'boolean' && typeof readOnly === 'boolean' && !(controlled && defaultSizes !== undefined));
  const controlledValue = validConfiguration && graph ? normalize(sizes, graph, digits) : null;
  const displayedLocal = graph && axis && topologyRef.current === graph.signature ? local : graph && axis ? project(local, graph, digits) : null;
  const current = controlled ? controlledValue : displayedLocal;
  const stateRef = React.useRef<State>({ graph, current, axis, disabled, readOnly, digits, controlled, keyboardStep, keyboardLargeStep });
  stateRef.current = { graph, current, axis, disabled, readOnly, digits, controlled, keyboardStep, keyboardLargeStep };

  // Ends the gesture. With `rollback`, a pointer gesture that changed the sizes reports the sizes from before it through onSizesChange, once,
  // unless they no longer form a valid layout. It never commits. The gesture is cleared first so a lost-capture event from the release cannot restore twice.
  const finish = React.useCallback((rollback: boolean) => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    gestureRef.current = null;
    releaseCapture(gesture);
    if (!rollback || gesture.source !== 'pointer' || !gesture.lastProposal) return;
    const state = stateRef.current;
    if (parentDiverged(gesture, state)) return;
    const { graph } = state;
    const restored = graph && restorable(gesture.origin, graph, state.digits);
    if (!restored || equal(restored, gesture.lastProposal, graph, state.digits)) return;
    if (!state.controlled) setLocal(restored);
    propsRef.current.onSizesChange?.(restored, Object.freeze({ handleId: gesture.handleId, source: 'pointer' }));
  }, []);

  // Pointer cancel and lost pointer capture interrupt only the gesture of the pointer they report.
  const cancel = React.useCallback((handleId: string, pointerId: number) => {
    if (ownsPointer(gestureRef.current, handleId, pointerId)) finish(true);
  }, [finish]);

  React.useEffect(() => {
    if (!graph || topologyRef.current === graph.signature || controlled) return;
    const next = project(local, graph, digits);
    topologyRef.current = graph.signature;
    setLocal(next);
  }, [controlled, digits, graph, local]);

  React.useEffect(() => {
    const onResize = () => finish(true);
    const ownerWindow = rootRef.current?.ownerDocument?.defaultView;
    ownerWindow?.addEventListener('resize', onResize);
    return () => { ownerWindow?.removeEventListener('resize', onResize); finish(false); };
  }, [finish]);

  React.useEffect(() => {
    const gesture = gestureRef.current;
    const state = stateRef.current;
    if (!gesture) return;
    // An invalid layout, a removed handle, or a controlled parent showing other sizes ends the gesture silently; a mounted Resizable that stops accepting input restores.
    const usable = state.graph && state.current && state.axis && state.graph.handleById.has(gesture.handleId) && !parentDiverged(gesture, state);
    if (!usable) finish(false);
    else if (state.disabled || state.readOnly) finish(true);
  });

  const apply = React.useCallback((handleId: string, source: ResizableChange['source'], delta: number) => {
    const state = stateRef.current;
    const gesture = gestureRef.current;
    if (!gesture || gesture.handleId !== handleId || gesture.source !== source || !state.current || !state.graph || state.disabled || state.readOnly) return null;
    if (parentDiverged(gesture, state)) { finish(false); return null; }
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
  }, [finish]);

  const beginPointer = React.useCallback((handleId: string, event: PointerEvent<HTMLDivElement>, element: HTMLDivElement) => {
    const state = stateRef.current;
    if (!state.graph || !state.current || !state.axis || state.disabled || state.readOnly || gestureRef.current) return false;
    const handle = state.graph.handleById.get(handleId);
    if (!handle || event.button !== 0) return false;
    const rect = rootRef.current?.getBoundingClientRect();
    const span = state.axis === 'vertical' ? rect?.height : rect?.width;
    if (!finite(span) || span <= 0) return false;
    const point = state.axis === 'vertical' ? event.clientY : event.clientX;
    gestureRef.current = { handleId, source: 'pointer', changed: false, lastProposal: null, origin: state.current, pointerId: event.pointerId ?? null, captureElement: element, lastPoint: point, span, direction: direction(rootRef.current, state.axis) };
    try { element.setPointerCapture?.(event.pointerId); } catch { /* capture may be unavailable in a test DOM */ }
    return true;
  }, []);

  const movePointer = React.useCallback((handleId: string, event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    const state = stateRef.current;
    if (!ownsPointer(gesture, handleId, event.pointerId)) return;
    const point = state.axis === 'vertical' ? event.clientY : event.clientX;
    const delta = ((point - gesture.lastPoint) / gesture.span) * 100 * gesture.direction;
    gesture.lastPoint = point;
    apply(handleId, 'pointer', delta);
  }, [apply]);

  const endPointer = React.useCallback((handleId: string, pointerId: number) => {
    const gesture = gestureRef.current;
    const state = stateRef.current;
    if (!ownsPointer(gesture, handleId, pointerId)) return;
    const proposal = gesture.changed && gesture.lastProposal && !parentDiverged(gesture, state) ? gesture.lastProposal : null;
    // The gesture ends before the callback runs, so an update the callback makes synchronously cannot roll the committed sizes back.
    finish(false);
    if (proposal) propsRef.current.onSizesCommit?.(proposal, Object.freeze({ handleId, source: 'pointer' }));
  }, [finish]);

  const keyboard = React.useCallback((handleId: string, event: KeyboardEvent<HTMLDivElement>) => {
    const state = stateRef.current;
    if (!state.graph || !state.current || !state.axis || state.disabled || state.readOnly || gestureRef.current) return;
    const back = state.axis === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
    const forward = state.axis === 'vertical' ? 'ArrowDown' : 'ArrowRight';
    let amount: number;
    if (event.key === 'Home' || event.key === 'End') {
      const handle = state.graph.handleById.get(handleId);
      if (!handle) return;
      const [lower, upper] = pairBounds(state.graph, handle, state.current);
      amount = (event.key === 'Home' ? lower : upper) - state.current[handle.before];
    } else {
      // Page Up and Page Down are the large-step back and forward arrows, so they follow the same axis and direction.
      const large = event.shiftKey || event.key === 'PageUp' || event.key === 'PageDown';
      if (event.key === back || event.key === 'PageUp') amount = -(large ? state.keyboardLargeStep : state.keyboardStep);
      else if (event.key === forward || event.key === 'PageDown') amount = large ? state.keyboardLargeStep : state.keyboardStep;
      else return;
      if (state.axis === 'horizontal') amount *= direction(rootRef.current, state.axis);
    }
    gestureRef.current = { handleId, source: 'keyboard', changed: false, lastProposal: null } satisfies KeyboardGesture;
    event.preventDefault();
    apply(handleId, 'keyboard', amount);
    gestureRef.current = null;
  }, [apply]);

  const context = React.useMemo<ResizableContext>(() => ({ graph, current, axis, disabled: Boolean(disabled ? disabled : readOnly ? readOnly : !validConfiguration), beginPointer, movePointer, endPointer, cancel, keyboard }), [axis, beginPointer, cancel, current, disabled, endPointer, graph, keyboard, movePointer, readOnly, validConfiguration]);
  return React.createElement(Context.Provider, { value: context }, React.createElement('div', { ...props, ref: rootRef, className: cx('muxui-resizable', axis && `muxui-resizable--${axis}`, className), 'data-orientation': axis || undefined, 'data-disabled': disabled ? disabled : undefined, 'data-readonly': readOnly ? readOnly : undefined, 'data-invalid': !validConfiguration || !current || undefined }, children));
}

export function ResizablePanel({ id, minSize = 0, maxSize = 100, className, style, children, ...props }: ResizablePanelProps): ReactElement {
  const context = React.useContext(Context);
  const panel = context?.graph?.panelById.get(id);
  const current = context?.current;
  const size = panel && current ? Math.min(panel.max, Math.max(panel.min, current[id])) : undefined;
  return React.createElement('div', { ...props, id: panel?.domId, className: cx('muxui-resizable-panel', className), style: { ...style, ...(size === undefined ? {} : { flexBasis: `${size}%`, flexGrow: 0, flexShrink: 0 }) }, 'data-panel-id': validId(id) ? id : undefined, 'data-invalid': !panel || size === undefined || undefined }, children);
}

export function ResizableHandle({ id, before, after, disabled = false, className, onKeyDown, ...props }: ResizableHandleProps): ReactElement {
  const context = React.useContext(Context);
  const graph = context?.graph;
  const current = context?.current;
  const handle = graph?.handleById.get(id);
  const beforePanel = handle && graph?.panelById.get(before);
  const afterPanel = handle && graph?.panelById.get(after);
  const valid = handle && beforePanel && afterPanel && graph && current && context?.axis;
  const blocked = Boolean(disabled || context?.disabled || !valid);
  const bounds = valid ? pairBounds(graph, handle, current) : [0, 100, 0];
  const value = valid ? current[before] : 0;
  const orientation = context?.axis === 'horizontal' ? 'vertical' : 'horizontal';
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => { if (context?.beginPointer(id, event, event.currentTarget)) event.currentTarget.setPointerCapture?.(event.pointerId); };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => context?.movePointer(id, event);
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => context?.endPointer(id, event.pointerId);
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => { onKeyDown?.(event); if (!event.defaultPrevented && !blocked) context?.keyboard(id, event); };
  return React.createElement('div', { ...props, role: 'separator', ref: undefined, tabIndex: blocked ? -1 : 0, className: cx('muxui-resizable-handle', className), 'data-handle-id': validId(id) ? id : undefined, 'data-disabled': blocked || undefined, 'aria-disabled': blocked || undefined, 'aria-controls': valid ? `${beforePanel.domId} ${afterPanel.domId}` : undefined, 'aria-orientation': orientation, 'aria-valuemin': valid ? bounds[0] : undefined, 'aria-valuemax': valid ? bounds[1] : undefined, 'aria-valuenow': valid ? value : undefined, 'aria-valuetext': valid ? `${value}% / ${current[after]}%` : undefined, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: (event: PointerEvent<HTMLDivElement>) => context?.cancel(id, event.pointerId), onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => context?.cancel(id, event.pointerId), onKeyDown: onKey });
}

