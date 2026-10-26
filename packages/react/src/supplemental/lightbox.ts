import React from 'react';
import type { ButtonHTMLAttributes, ForwardRefExoticComponent, HTMLAttributes, KeyboardEvent as ReactKeyboardEvent, ReactElement, ReactNode, RefAttributes, RefObject, TouchEvent as ReactTouchEvent } from 'react';
import { animate } from 'motion/react';
import type { AnimationPlaybackControls, ValueAnimationTransition } from 'motion/react';
import { Dialog } from 'react-aria-components';
import { AriaModal as Modal, AriaModalOverlay as ModalOverlay } from '../substrate.ts';
import type { DialogProps } from 'react-aria-components';
import { Button } from '../button.ts';
import type { ButtonActivationEvent, ButtonProps } from '../button.ts';
import { IconButton } from './icon-button.ts';
import { observeReducedMotion, resolvedMotionSpring, resolvedMotionTransition } from '../motion.mjs';
import type { MotionSpring, MotionTransition } from '../motion.mjs';
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left.mjs';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right.mjs';
import X from 'lucide-react/dist/esm/icons/x.mjs';

/** The identity of an item in the collection: a string, or a finite number. */
export type LightboxKey = string | number;
/** One item of the collection: its key, and the label that names it. */
export type LightboxItem = { key: LightboxKey; label?: string };
/** Where the selected item sits in the collection: its key, its index, and the item count. */
export type LightboxRenderContext = { key: LightboxKey; index: number; count: number };
/** The facts LightboxContent's render function receives: the context and the selected item. */
export type LightboxContentRenderContext = LightboxRenderContext & { item: LightboxItem };
/** Renders the content of the selected item. */
export type LightboxRenderContent = (item: LightboxItem, context: LightboxRenderContext) => ReactNode;

// Only the root's props are derived, which is the block the catalog authored. The props of the parts
// (LightboxTrigger's itemKey, LightboxBackdrop's dismissable, LightboxContent's renderContent, and the
// disabled and onActivate of the trigger and the controls) are declared below and wait for per-part APIs.
/**
 * The props Mux UI defines for Lightbox; the catalog's web.react API is derived from this
 * interface (Decision 0031). It is an interface, as LightboxProps was before the move.
 */
interface LightboxOwnProps {
  /** The collection the Lightbox views, each item with a key that is a string or a finite number, and an optional label. If any key is invalid or repeated, the whole collection is empty, and an empty collection never opens. */
  items: readonly LightboxItem[];
  /** Renders the selected item's content, from the item and a context with its key, index, and count. LightboxContent's own render function takes precedence. */
  renderContent?: LightboxRenderContent;
  /** The key of the selected item, when the caller controls the selection. A null selectedKey means nothing is selected. */
  selectedKey?: LightboxKey | null;
  /** The key of the item selected at first, when the Lightbox controls the selection. Without it, or when no item has the key, the first item. */
  defaultSelectedKey?: LightboxKey | null;
  /** Reports the selection changing, with the key and its item, or null for both when nothing is selected. */
  onSelectedChange?: (key: LightboxKey | null, item?: LightboxItem | null) => void;
  /** Whether the Lightbox is open, when the caller controls it. */
  open?: boolean;
  /** Whether the Lightbox starts open, when it controls itself. */
  defaultOpen?: boolean;
  /** Reports the Lightbox opening or closing. */
  onOpenChange?: (open: boolean) => void;
  /** Whether Previous and Next wrap around at the first and last item. */
  loop?: boolean;
  /** Whether swiping moves between items. */
  swipeNavigation?: boolean;
}

export interface LightboxProps extends LightboxOwnProps, HTMLAttributes<HTMLDivElement> {}

// A mapped copy of Button's activation event: an interface is not assignable to Record<string, unknown>,
// and this type was an object literal type before it followed Button.
export type LightboxControlActivation = { [K in keyof ButtonActivationEvent]: ButtonActivationEvent[K] };
export type LightboxControlProps = ButtonHTMLAttributes<HTMLButtonElement> & { disabled?: boolean; onActivate?: (event: LightboxControlActivation) => void };

// ButtonProps follows Button, but its className and style are declared exactly (`?: string`),
// where React declares them `?: string | undefined`. Under exactOptionalPropertyTypes the exact form
// rejects a consumer's `className={undefined}`, which LightboxTrigger accepted before it followed Button,
// so those two come from React's attributes. onActivate is re-added as the mapped LightboxControlActivation,
// so its event keeps the object literal shape it had before (an interface would reject an index-signature
// handler). Omit and Pick keep the type assignable to Record<string, unknown>.
export type LightboxTriggerProps = Omit<ButtonProps, 'className' | 'style' | 'onActivate'>
  & Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'>
  & { itemKey: LightboxKey; onActivate?: (event: LightboxControlActivation) => void };

type Offset = Readonly<{ x: number; y: number }>;
type MotionValues = Offset & { opacity: number };
// A tween has no type; a spring says so, which is how progressTransition tells them apart.
type LightboxTransition = MotionSpring | (MotionTransition & { type?: undefined });
// The collection as the Lightbox keeps it: each item with its label settled.
type ResolvedItem = LightboxItem & { label: string };
type LightboxContextValue = {
  list: ResolvedItem[];
  selected: ResolvedItem | null;
  visible: boolean;
  present: boolean;
  isExiting: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  releaseExit: () => void;
  loop: boolean;
  swipeNavigation: boolean;
  renderContent: LightboxRenderContent | null;
  setTrigger: (node: HTMLElement | null) => void;
  openItem: (key: LightboxKey) => void;
  close: () => void;
  navigate: (delta: number) => void;
  top: () => boolean;
  popupLabel: string;
};

const Context = React.createContext<LightboxContextValue | null>(null);
const stacks = new WeakMap<Document, object[]>();
const cx = (...values: unknown[]) => values.filter(Boolean).join(' ');
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;
const LIGHTBOX_ENTRY_OFFSET = Object.freeze({ x: 0, y: 120 });
const LIGHTBOX_EXIT_OFFSET = Object.freeze({ x: 0, y: -120 });
const LIGHTBOX_ZERO_OFFSET = Object.freeze({ x: 0, y: 0 });
const validKey = (key: unknown): key is LightboxKey => typeof key === 'string' || (typeof key === 'number' && Number.isFinite(key));
const token = (key: unknown) => `${typeof key}:${typeof key === 'number' && Object.is(key, -0) ? 0 : String(key)}`;

function readTranslate(element: Element): Offset {
  const value = element.ownerDocument.defaultView?.getComputedStyle(element).translate;
  const match = /^\s*(-?(?:\d+\.?\d*|\.\d+))px(?:\s+(-?(?:\d+\.?\d*|\.\d+))px)?/u.exec(String(value ?? ''));
  return match ? { x: Number(match[1]), y: Number(match[2] ?? 0) } : LIGHTBOX_ZERO_OFFSET;
}

function readOpacity(element: Element): number {
  const value = Number(element.ownerDocument.defaultView?.getComputedStyle(element).opacity);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

function readMotionValues(element: Element): MotionValues {
  return { opacity: readOpacity(element), ...readTranslate(element) };
}

function writeMotionValues(element: HTMLElement, values: MotionValues) {
  element.style.opacity = String(values.opacity);
  element.style.translate = `${values.x}px ${values.y}px`;
}

function cancelAnimations(element: Element | null | undefined) {
  if (typeof element?.getAnimations !== 'function') return;
  element.getAnimations().forEach((animation) => animation.cancel());
}

function motionTarget(isOpen: boolean, exitOffset: Offset): MotionValues {
  return isOpen ? { opacity: 1, ...LIGHTBOX_ZERO_OFFSET } : { opacity: 0, ...exitOffset };
}

function progressTransition(transition: LightboxTransition | null): ValueAnimationTransition<number> | null {
  if (!transition) return null;
  return transition.type === 'spring'
    ? { type: 'spring', visualDuration: transition.visualDuration, bounce: transition.bounce }
    : transition;
}

/**
 * Keep the portaled RAC shell mounted while Motion owns its finite pixels.
 * The independent translate channel preserves Lightbox's existing centering transform.
 */
function useLightboxMotionLifecycle({ isOpen, triggerRef, entryOffset, exitOffset, onExitComplete }: {
  isOpen: boolean; triggerRef: RefObject<HTMLElement | null> | undefined; entryOffset: Offset; exitOffset: Offset; onExitComplete?: (() => void) | undefined;
}) {
  const [node, setNode] = React.useState<HTMLElement | null>(null);
  const isOpenRef = React.useRef(Boolean(isOpen));
  const animatedNodeRef = React.useRef<HTMLElement | null>(null);
  const controlsRef = React.useRef<AnimationPlaybackControls | null>(null);
  const phaseRef = React.useRef<'entry' | 'exit' | null>(null);
  const animationIdRef = React.useRef(0);
  const valuesRef = React.useRef<MotionValues | null>(null);
  const originalStyleRef = React.useRef<{ opacity: string; opacityPriority: string; translate: string; translatePriority: string } | null>(null);
  const onExitCompleteRef = React.useRef(onExitComplete);
  isOpenRef.current = Boolean(isOpen);
  onExitCompleteRef.current = onExitComplete;

  const setNodeRef = React.useCallback((element: HTMLElement | null) => {
    setNode(element);
    if (element && element !== animatedNodeRef.current) {
      originalStyleRef.current = {
        opacity: element.style.opacity,
        opacityPriority: element.style.getPropertyPriority('opacity'),
        translate: element.style.translate,
        translatePriority: element.style.getPropertyPriority('translate'),
      };
      valuesRef.current = null;
    }
  }, []);

  const restoreStyle = React.useCallback((element: HTMLElement) => {
    const original = originalStyleRef.current;
    if (!original) return;
    if (original.opacity) element.style.setProperty('opacity', original.opacity, original.opacityPriority);
    else element.style.removeProperty('opacity');
    if (original.translate) element.style.setProperty('translate', original.translate, original.translatePriority);
    else element.style.removeProperty('translate');
  }, []);

  const settle = React.useCallback((controls: AnimationPlaybackControls | null) => {
    controls?.stop();
    if (controlsRef.current === controls) controlsRef.current = null;
  }, []);

  const finishExit = React.useCallback((animationId: number) => {
    if (animationId !== animationIdRef.current || isOpenRef.current || phaseRef.current !== 'exit') return;
    phaseRef.current = null;
    controlsRef.current = null;
    onExitCompleteRef.current?.();
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (!node || node.nodeType !== 1) return undefined;
    const disconnect = observeReducedMotion(node, triggerRef?.current, (reduced) => {
      node.toggleAttribute('data-muxui-lightbox-reduced', reduced);
      if (!reduced) return;
      const controls = controlsRef.current;
      if (controls) settle(controls);
      const target = motionTarget(Boolean(isOpenRef.current), exitOffset);
      writeMotionValues(node, target);
      valuesRef.current = target;
      if (!isOpenRef.current && phaseRef.current === 'exit') finishExit(animationIdRef.current);
    });
    return () => {
      disconnect();
      node.removeAttribute('data-muxui-lightbox-reduced');
    };
  }, [exitOffset, finishExit, node, settle, triggerRef]);

  useIsomorphicLayoutEffect(() => {
    if (!node || node.nodeType !== 1) return undefined;
    const animationId = animationIdRef.current + 1;
    animationIdRef.current = animationId;
    const initialOpen = Boolean(isOpen) && animatedNodeRef.current !== node;
    animatedNodeRef.current = node;
    const from = initialOpen ? { opacity: 0, ...entryOffset } : readMotionValues(node);
    valuesRef.current = from;
    const to = motionTarget(Boolean(isOpen), exitOffset);
    const transition = isOpen
      ? resolvedMotionSpring(node, triggerRef?.current, 'reveal', 'reveal')
      : resolvedMotionTransition(node, triggerRef?.current, 'exit', 'dismiss');
    phaseRef.current = isOpen ? 'entry' : 'exit';

    const complete = () => {
      if (isOpen) {
        restoreStyle(node);
        valuesRef.current = { opacity: 1, ...LIGHTBOX_ZERO_OFFSET };
      } else {
        writeMotionValues(node, to);
        valuesRef.current = to;
        finishExit(animationId);
      }
    };

    if (!transition) {
      complete();
      return () => {
        if (phaseRef.current === (isOpen ? 'entry' : 'exit')) phaseRef.current = null;
      };
    }

    let active = true;
    const apply = (progress: number) => {
      const values = {
        opacity: from.opacity + ((to.opacity - from.opacity) * progress),
        x: from.x + ((to.x - from.x) * progress),
        y: from.y + ((to.y - from.y) * progress),
      };
      valuesRef.current = values;
      writeMotionValues(node, values);
    };
    apply(0);
    const controls = animate(0, 1, { ...progressTransition(transition), onUpdate: apply });
    controls.then(() => {
      if (!active || animationId !== animationIdRef.current) return;
      controlsRef.current = null;
      complete();
    });
    controlsRef.current = controls;
    return () => {
      active = false;
      const current = readMotionValues(node);
      valuesRef.current = current;
      settle(controls);
      cancelAnimations(node);
      writeMotionValues(node, current);
      if (phaseRef.current === (isOpen ? 'entry' : 'exit')) phaseRef.current = null;
    };
  }, [entryOffset, exitOffset, finishExit, isOpen, node, restoreStyle, settle, triggerRef]);

  React.useEffect(() => () => {
    controlsRef.current?.stop();
    controlsRef.current?.cancel?.();
    cancelAnimations(animatedNodeRef.current);
    controlsRef.current = null;
    animationIdRef.current += 1;
  }, []);

  return setNodeRef;
}

function renderContentBody(value: LightboxContextValue, selected: ResolvedItem | null, renderContent: ((context: LightboxContentRenderContext) => ReactNode) | undefined, children: ReactNode): ReactNode {
  const context = selected ? { key: selected.key, index: value.list.indexOf(selected), count: value.list.length } : null;
  return typeof renderContent === 'function' && selected && context
    ? renderContent({ item: selected, ...context })
    : typeof value.renderContent === 'function' && selected && context
      ? value.renderContent(selected, context)
      : children;
}

function collection(items: unknown): ResolvedItem[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const result: ResolvedItem[] = [];
  for (const item of items) {
    if (!item || !validKey(item.key)) return [];
    const itemToken = token(item.key);
    if (seen.has(itemToken)) return [];
    seen.add(itemToken);
    const label = typeof item.label === 'string' && item.label.trim() ? item.label.trim() : String(item.key);
    result.push({ ...item, label });
  }
  return result;
}

function direction(element: Element | null | undefined): 'rtl' | 'ltr' {
  try {
    if (element?.ownerDocument.defaultView?.getComputedStyle(element).direction === 'rtl') return 'rtl';
  } catch { /* use document direction below */ }
  return element?.ownerDocument.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';
}

function top(owner: object, document: Document): boolean {
  return stacks.get(document)?.at(-1) === owner;
}

/** A controlled or uncontrolled modal media viewer with finite Mux item keys. */
export function Lightbox({ items, renderContent, selectedKey, defaultSelectedKey, onSelectedChange, open, defaultOpen = false, onOpenChange, loop = false, swipeNavigation = true, children, className, ...props }: LightboxProps): ReactElement {
  const list = React.useMemo(() => collection(items), [items]);
  const initialKey = React.useMemo(() => {
    if (defaultSelectedKey !== undefined && defaultSelectedKey !== null && validKey(defaultSelectedKey)) {
      return list.find((item) => Object.is(item.key, defaultSelectedKey))?.key ?? list[0]?.key;
    }
    return defaultSelectedKey === null ? null : list[0]?.key;
  }, [defaultSelectedKey, list]);
  const [localOpen, setLocalOpen] = React.useState(() => Boolean(defaultOpen && initialKey !== undefined));
  const [localKey, setLocalKey] = React.useState<LightboxKey | null | undefined>(initialKey);
  const trigger = React.useRef<HTMLElement | null>(null);
  const owner = React.useRef<object>({});
  const openReconciliationProposal = React.useRef<boolean | null>(null);
  const selectionReconciliationProposal = React.useRef<string | null>(null);
  const previousSelectedKey = React.useRef(selectedKey);
  const controlledOpen = open !== undefined;
  const controlledSelection = selectedKey !== undefined;
  const selected = list.find((item) => Object.is(item.key, controlledSelection ? selectedKey : localKey)) ?? null;
  const requestedOpen = controlledOpen ? open === true : localOpen;
  const visible = requestedOpen && Boolean(selected);
  const [phase, setPhase] = React.useState({ open: requestedOpen, exiting: false });
  if (phase.open !== requestedOpen) setPhase({ open: requestedOpen, exiting: !requestedOpen });
  const present = Boolean(selected) && (requestedOpen || phase.exiting);
  const isExiting = present && !requestedOpen && phase.exiting;

  React.useEffect(() => {
    if (controlledOpen && openReconciliationProposal.current === open) openReconciliationProposal.current = null;
    if (controlledSelection && !Object.is(previousSelectedKey.current, selectedKey)) {
      selectionReconciliationProposal.current = null;
      previousSelectedKey.current = selectedKey;
    }
  }, [controlledOpen, controlledSelection, open, selectedKey]);

  const setOpen = React.useCallback((next: boolean, reconcile = false) => {
    const value = Boolean(next && list.length);
    if (controlledOpen) {
      if (open === value) return;
      if (reconcile) {
        if (openReconciliationProposal.current === value) return;
        openReconciliationProposal.current = value;
      }
      onOpenChange?.(value);
    } else {
      if (localOpen === value) return;
      setLocalOpen(value);
      onOpenChange?.(value);
    }
  }, [controlledOpen, list.length, localOpen, onOpenChange, open, selected]);

  const setSelection = React.useCallback((next: LightboxKey | null, allowNull = false) => {
    const record = list.find((item) => Object.is(item.key, next));
    if (!record && !(allowNull && next === null)) return false;
    if ((controlledSelection ? selectedKey : localKey) === next) return true;
    if (controlledSelection) {
      const nextToken = next === null ? 'null' : token(next);
      if (allowNull) {
        if (selectionReconciliationProposal.current === nextToken) return false;
        selectionReconciliationProposal.current = nextToken;
      }
      onSelectedChange?.(next, record ?? null);
    } else {
      setLocalKey(record?.key ?? null);
      onSelectedChange?.(record?.key ?? null, record ?? null);
    }
    return true;
  }, [controlledSelection, list, localKey, onSelectedChange, selectedKey]);

  React.useEffect(() => {
    if (!list.length) {
      if (requestedOpen) setOpen(false, true);
      return;
    }
    if (selected) return;
    if (!controlledSelection) {
      setLocalKey(list[0].key);
      if (requestedOpen) setOpen(false);
    } else {
      if (selectedKey !== null) setSelection(null, true);
      setOpen(false, true);
    }
  }, [controlledSelection, list, requestedOpen, selected, setOpen, setSelection]);

  React.useEffect(() => {
    if (!present || typeof document === 'undefined') return undefined;
    const stack = stacks.get(document) ?? [];
    stacks.set(document, stack);
    stack.push(owner.current);
    return () => {
      const index = stack.lastIndexOf(owner.current);
      if (index >= 0) stack.splice(index, 1);
      if (!stack.length) stacks.delete(document);
    };
  }, [present]);

  const navigate = React.useCallback((delta: number) => {
    if (!visible || typeof document === 'undefined' || !top(owner.current, document) || !selected || list.length < 2) return;
    const index = list.indexOf(selected);
    let next = index + delta;
    if (next < 0 || next >= list.length) {
      if (!loop) return;
      next = next < 0 ? list.length - 1 : 0;
    }
    setSelection(list[next].key);
  }, [list, loop, selected, setSelection, visible]);

  const previousVisible = React.useRef(visible);
  React.useEffect(() => {
    if (previousVisible.current && !visible) trigger.current?.focus?.();
    previousVisible.current = visible;
  }, [visible]);

  const close = React.useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  const releaseExit = React.useCallback(() => {
    setPhase((current) => current.open || !current.exiting ? current : { open: false, exiting: false });
  }, []);

  const value = React.useMemo((): LightboxContextValue => ({
    list, selected, visible, present, isExiting, triggerRef: trigger, releaseExit,
    loop: Boolean(loop), swipeNavigation: swipeNavigation !== false,
    renderContent: typeof renderContent === 'function' ? renderContent : null,
    setTrigger: (node) => { trigger.current = node; },
    openItem: (next) => { if (setSelection(next)) setOpen(true); },
    close, navigate,
    top: () => typeof document !== 'undefined' && top(owner.current, document),
    popupLabel: selected?.label ?? 'Lightbox',
  }), [close, isExiting, list, loop, navigate, present, releaseExit, renderContent, selected, setOpen, setSelection, swipeNavigation, visible]);

  return React.createElement(Context.Provider, { value }, React.createElement('div', { ...props, className: cx('muxui-lightbox', className) }, children));
}

export const LightboxTrigger: ForwardRefExoticComponent<LightboxTriggerProps & RefAttributes<HTMLButtonElement>> = React.forwardRef<HTMLButtonElement, LightboxTriggerProps>(function LightboxTrigger({
  itemKey,
  children,
  disabled = false,
  onActivate,
  className,
  ...props
}, forwardedRef) {
  const value = React.useContext(Context);
  const ref = React.useRef<HTMLButtonElement | null>(null);
  // The ref is set by the time the handle is read.
  React.useImperativeHandle(forwardedRef, () => ref.current!);
  const enabled = Boolean(value?.list.some((item) => Object.is(item.key, itemKey)));
  return React.createElement(Button, {
    ...props,
    ref,
    disabled: disabled || !enabled,
    className: cx('muxui-lightbox__trigger', className),
    onActivate: (event) => {
      onActivate?.(event);
      // An enabled trigger has the context, since its item is in the context's list.
      if (!disabled && enabled) { value!.setTrigger(ref.current); value!.openItem(itemKey); }
    },
  }, children);
});

export function LightboxBackdrop({ children, dismissable = true, className, ...props }: HTMLAttributes<HTMLDivElement> & { dismissable?: boolean }): ReactElement | null {
  const value = React.useContext(Context);
  const motionRef = useLightboxMotionLifecycle({
    isOpen: Boolean(value?.visible),
    triggerRef: value?.triggerRef,
    entryOffset: LIGHTBOX_ZERO_OFFSET,
    exitOffset: LIGHTBOX_ZERO_OFFSET,
  });
  if (!value?.present) return null;
  return React.createElement(ModalOverlay, {
    ...props,
    ref: motionRef,
    isOpen: value.visible,
    isExiting: value.isExiting,
    isDismissable: dismissable,
    className: cx('muxui-lightbox__backdrop', className),
    onOpenChange: (next) => { if (!next && value.top()) value.close(); },
  }, children);
}

export function LightboxPopup({ children, className, onKeyDown, onTouchStart, onTouchEnd, onTouchCancel, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, ...props }: HTMLAttributes<HTMLDivElement>): ReactElement | null {
  const value = React.useContext(Context);
  const touch = React.useRef<number | null>(null);
  const localRef = React.useRef<HTMLElement | null>(null);
  const motionRef = useLightboxMotionLifecycle({
    isOpen: Boolean(value?.visible),
    triggerRef: value?.triggerRef,
    entryOffset: LIGHTBOX_ENTRY_OFFSET,
    exitOffset: LIGHTBOX_EXIT_OFFSET,
    onExitComplete: value?.releaseExit,
  });
  const setRef = React.useCallback((node: HTMLElement | null) => {
    motionRef(node);
    localRef.current = node;
  }, [motionRef]);
  React.useEffect(() => {
    const popup = localRef.current;
    if (!popup || !value?.visible) return undefined;
    // The native listeners below hand the caller's handlers the native event, as they did before the move.
    const handleKeyDown = (event: KeyboardEvent) => {
      onKeyDown?.(event as unknown as ReactKeyboardEvent<HTMLDivElement>);
      if (event.defaultPrevented || !value.top()) return;
      const rtl = direction(popup) === 'rtl';
      if (event.key === 'ArrowLeft') { event.preventDefault(); value.navigate(rtl ? 1 : -1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); value.navigate(rtl ? -1 : 1); }
    };
    const handleTouchStart = (event: TouchEvent) => { onTouchStart?.(event as unknown as ReactTouchEvent<HTMLDivElement>); touch.current = event.touches[0]?.clientX ?? null; };
    const handleTouchEnd = (event: TouchEvent) => {
      onTouchEnd?.(event as unknown as ReactTouchEvent<HTMLDivElement>);
      const start = touch.current; touch.current = null;
      const delta = start === null ? 0 : (event.changedTouches[0]?.clientX ?? start) - start;
      if (value.swipeNavigation && value.top() && Math.abs(delta) >= 40) {
        const rtl = direction(popup) === 'rtl';
        value.navigate(rtl ? (delta < 0 ? -1 : 1) : (delta < 0 ? 1 : -1));
      }
    };
    const handleTouchCancel = (event: TouchEvent) => { onTouchCancel?.(event as unknown as ReactTouchEvent<HTMLDivElement>); touch.current = null; };
    popup.addEventListener('keydown', handleKeyDown);
    popup.addEventListener('touchstart', handleTouchStart, { passive: true });
    popup.addEventListener('touchend', handleTouchEnd, { passive: true });
    popup.addEventListener('touchcancel', handleTouchCancel, { passive: true });
    return () => {
      popup.removeEventListener('keydown', handleKeyDown);
      popup.removeEventListener('touchstart', handleTouchStart);
      popup.removeEventListener('touchend', handleTouchEnd);
      popup.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [onKeyDown, onTouchCancel, onTouchEnd, onTouchStart, value]);
  if (!value?.present) return null;
  return React.createElement(Modal, null,
    // A caller's role reaches React Aria as written; DialogProps types it as only dialog or alertdialog.
    React.createElement(Dialog, {
      ...props,
      ref: setRef,
      className: cx('muxui-dialog', 'muxui-lightbox__popup', className),
      'aria-label': ariaLabel ?? (ariaLabelledBy ? undefined : value.popupLabel),
      'aria-labelledby': ariaLabelledBy,
    } as DialogProps & RefAttributes<HTMLElement>, children),
  );
}

export function LightboxContent({ renderContent, children, className, ...props }: HTMLAttributes<HTMLDivElement> & { renderContent?: (context: LightboxContentRenderContext) => ReactNode }): ReactElement | null {
  const value = React.useContext(Context);
  const selected = value?.selected ?? null;
  const body = value?.present && selected ? renderContentBody(value, selected, renderContent, children) : children;
  const currentToken = selected ? token(selected.key) : null;
  const [layerTokens, setLayerTokens] = React.useState<string[]>([]);
  const bodyByTokenRef = React.useRef(new Map<string, ReactNode>());
  if (value?.present && currentToken !== null) bodyByTokenRef.current.set(currentToken, body);
  const renderedTokens = React.useMemo(() => {
    if (!value?.present || currentToken === null) return [];
    return [...new Set([...layerTokens.filter((layerToken) => layerToken !== currentToken), currentToken])];
  }, [currentToken, layerTokens, value?.present]);
  const renderedLayers = React.useMemo(() => renderedTokens.map((layerToken) => ({
    token: layerToken,
    body: layerToken === currentToken ? body : bodyByTokenRef.current.get(layerToken) ?? children,
  })), [body, children, currentToken, renderedTokens]);
  const layerSequence = JSON.stringify(renderedTokens);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const layerNodesRef = React.useRef(new Map<string, HTMLElement>());
  const layerRefCallbacks = React.useRef(new Map<string, (node: HTMLElement | null) => void>());
  const newlyMountedTokensRef = React.useRef(new Set<string>());
  const currentTokenRef = React.useRef(currentToken);
  currentTokenRef.current = currentToken;
  const getLayerRef = React.useCallback((layerToken: string) => {
    const existing = layerRefCallbacks.current.get(layerToken);
    if (existing) return existing;
    const callback = (node: HTMLElement | null) => {
      if (node) {
        if (!layerNodesRef.current.has(layerToken)) newlyMountedTokensRef.current.add(layerToken);
        layerNodesRef.current.set(layerToken, node);
      } else {
        layerNodesRef.current.delete(layerToken);
      }
    };
    layerRefCallbacks.current.set(layerToken, callback);
    return callback;
  }, []);
  const controlsRef = React.useRef<AnimationPlaybackControls | null>(null);
  const animationIdRef = React.useRef(0);
  const reducedRef = React.useRef(false);

  useIsomorphicLayoutEffect(() => {
    if (!value?.present || currentToken === null) {
      animationIdRef.current += 1;
      controlsRef.current?.stop();
      controlsRef.current?.cancel?.();
      controlsRef.current = null;
      bodyByTokenRef.current.clear();
      newlyMountedTokensRef.current.clear();
      setLayerTokens((current) => current.length ? [] : current);
      return undefined;
    }
    setLayerTokens((current) => current.includes(currentToken) ? current : [...current, currentToken]);
    return undefined;
  }, [currentToken, value?.present]);

  useIsomorphicLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || !value?.present) return undefined;
    return observeReducedMotion(content, value.triggerRef?.current, (reduced) => {
      reducedRef.current = reduced;
      content.toggleAttribute('data-muxui-lightbox-reduced', reduced);
      if (!reduced) return;
      animationIdRef.current += 1;
      controlsRef.current?.stop();
      controlsRef.current?.cancel?.();
      controlsRef.current = null;
      const selectedToken = currentTokenRef.current;
      layerNodesRef.current.forEach((node, layerToken) => {
        if (layerToken === selectedToken) node.style.opacity = '1';
        else {
          node.style.opacity = '0';
          layerNodesRef.current.delete(layerToken);
          layerRefCallbacks.current.delete(layerToken);
        }
      });
      setLayerTokens((current) => current.length === 1 && current[0] === selectedToken
        ? current
        : current.filter((layerToken) => layerToken === selectedToken));
      for (const layerToken of bodyByTokenRef.current.keys()) {
        if (layerToken !== selectedToken) bodyByTokenRef.current.delete(layerToken);
      }
    });
  }, [value?.present, value?.triggerRef]);

  useIsomorphicLayoutEffect(() => {
    const content = contentRef.current;
    if (!value?.present || currentToken === null || !content || !renderedTokens.length) return undefined;
    // The filter drops each layer that has no node yet.
    const layers = renderedTokens
      .map((layerToken) => ({ token: layerToken, node: layerNodesRef.current.get(layerToken) }))
      .filter(({ node }) => node) as { token: string; node: HTMLElement }[];
    if (!layers.length) return undefined;
    const animationId = animationIdRef.current + 1;
    animationIdRef.current = animationId;
    const transition = reducedRef.current
      ? null
      : resolvedMotionTransition(content, value.triggerRef?.current, 'interaction', 'interaction');
    const values = layers.map(({ token: layerToken, node }) => ({
      token: layerToken,
      node,
      from: newlyMountedTokensRef.current.has(layerToken) && layerToken === currentToken && layers.length > 1
        ? 0
        : readOpacity(node),
      to: layerToken === currentToken ? 1 : 0,
    }));
    values.forEach(({ token: layerToken, node, from }) => {
      newlyMountedTokensRef.current.delete(layerToken);
      if (from === 0) node.style.opacity = '0';
    });
    const apply = (progress: number) => {
      values.forEach(({ node, from, to }) => {
        node.style.opacity = String(from + ((to - from) * progress));
      });
    };
    const finish = () => {
      values.forEach(({ node, to }) => { node.style.opacity = String(to); });
      if (animationId !== animationIdRef.current || currentTokenRef.current !== currentToken) return;
      for (const { token: layerToken } of values) {
        if (layerToken !== currentToken) {
          bodyByTokenRef.current.delete(layerToken);
          layerNodesRef.current.delete(layerToken);
          layerRefCallbacks.current.delete(layerToken);
        }
      }
      setLayerTokens((current) => current.length === 1 && current[0] === currentToken
        ? current
        : current.filter((layerToken) => layerToken === currentToken));
    };
    if (!transition) {
      finish();
      return undefined;
    }
    let active = true;
    const controls = animate(0, 1, {
      ...transition,
      onUpdate: apply,
    });
    controlsRef.current = controls;
    controls.then(() => {
      if (!active || animationId !== animationIdRef.current) return;
      controlsRef.current = null;
      finish();
    });
    return () => {
      active = false;
      const current = values.map(({ node }) => ({ node, opacity: readOpacity(node) }));
      controls.stop();
      controls.cancel?.();
      current.forEach(({ node, opacity }) => { node.style.opacity = String(opacity); });
      if (controlsRef.current === controls) controlsRef.current = null;
    };
  }, [currentToken, layerSequence, renderedTokens, value?.present, value?.triggerRef]);

  React.useEffect(() => () => {
    controlsRef.current?.stop();
    controlsRef.current?.cancel?.();
    layerNodesRef.current.forEach((node) => cancelAnimations(node));
    controlsRef.current = null;
    layerNodesRef.current.clear();
    layerRefCallbacks.current.clear();
    bodyByTokenRef.current.clear();
    newlyMountedTokensRef.current.clear();
    animationIdRef.current += 1;
  }, []);

  if (!value?.present) return null;
  return React.createElement('div', { ...props, ref: contentRef, className: cx('muxui-lightbox__content', className) },
    renderedLayers.map(({ token: layerToken, body: layerBody }) => React.createElement('div', {
      key: `layer-${layerToken}`,
      ref: getLayerRef(layerToken),
      className: cx('muxui-lightbox__content-layer', layerToken === currentToken ? 'muxui-lightbox__content-layer--current' : 'muxui-lightbox__content-layer--outgoing'),
      'aria-hidden': layerToken === currentToken ? undefined : 'true',
      inert: layerToken === currentToken ? undefined : true,
    }, layerBody)),
  );
}

export const LightboxCaption: ForwardRefExoticComponent<HTMLAttributes<HTMLParagraphElement> & RefAttributes<HTMLParagraphElement>> = React.forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(function LightboxCaption({ className, children, ...props }, ref) {
  const value = React.useContext(Context);
  return React.createElement('p', { ...props, ref, className: cx('muxui-lightbox__caption', className) }, children === undefined ? value?.selected?.label : children);
});

function NavButton({ direction: delta, children, disabled = false, onActivate, className, ...props }: LightboxControlProps & { direction: number }): ReactElement {
  const value = React.useContext(Context);
  const index = value?.selected ? value.list.indexOf(value.selected) : -1;
  const unavailable = !value || !value.visible || (!value.loop && (delta < 0 ? index <= 0 : index >= value.list.length - 1));
  const controlProps = {
    ...props,
    disabled: disabled || unavailable,
    variant: 'ghost' as const,
    className: cx(delta < 0 ? 'muxui-lightbox__previous' : 'muxui-lightbox__next', className),
    'aria-label': props['aria-label'] ?? (delta < 0 ? 'Previous' : 'Next'),
    onActivate: (event: LightboxControlActivation) => { onActivate?.(event); value?.navigate(delta); },
  };
  return children === undefined || children === null
    ? React.createElement(IconButton, controlProps, React.createElement(delta < 0 ? ChevronLeft : ChevronRight, { size: 24, 'aria-hidden': 'true', focusable: 'false' }))
    : React.createElement(Button, controlProps, children);
}
export function LightboxPrevious(props: LightboxControlProps): ReactElement { return React.createElement(NavButton, { ...props, direction: -1 }); }
export function LightboxNext(props: LightboxControlProps): ReactElement { return React.createElement(NavButton, { ...props, direction: 1 }); }
export function LightboxClose({ onActivate, className, children, ...props }: LightboxControlProps): ReactElement {
  const value = React.useContext(Context);
  const controlProps = {
    ...props,
    size: 'sm' as const,
    variant: 'ghost' as const,
    className: cx('muxui-dialog__close', 'muxui-lightbox__close', className),
    'aria-label': props['aria-label'] ?? 'Close',
    disabled: props.disabled || !value?.visible,
    onActivate: (event: LightboxControlActivation) => { onActivate?.(event); value?.close(); },
  };
  return children === undefined || children === null
    ? React.createElement(IconButton, controlProps, React.createElement(X, { size: 16, 'aria-hidden': 'true', focusable: 'false' }))
    : React.createElement(Button, controlProps, children);
}
