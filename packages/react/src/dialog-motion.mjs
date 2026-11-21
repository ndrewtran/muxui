import React from 'react';
import { animate } from 'motion/react';
import { OverlayTriggerStateContext, PopoverContext } from 'react-aria-components';
import { AriaModal } from './substrate.ts';
import { observeReducedMotion, resolvedMotionSpring, resolvedMotionTransition } from './motion.mjs';

const DIALOG_REDUCED_ATTRIBUTE = 'data-muxui-dialog-reduced';
const MODAL_INITIAL_Y = -8;
const MODAL_EXIT_Y = -8;
const MODAL_SETTLED_Y = 0;
const MODAL_INITIAL_SCALE = 0.97;
const MODAL_SETTLED_SCALE = 1;
const MODAL_Y_VARIABLE = '--muxui-modal-y';
const MODAL_SCALE_VARIABLE = '--muxui-modal-scale';
const SHEET_DRAGGING_ATTRIBUTE = 'data-muxui-state-dragging';
// A drag dismisses a sheet when it is released lower than the smaller of this distance and this share of the sheet's
// height, or when it is flung down at least the flick distance at the flick speed or faster, in CSS pixels a second
// over the last 100 ms of the drag.
const SHEET_DISMISS_DISTANCE = 96;
const SHEET_DISMISS_SHARE = 0.5;
const SHEET_FLICK_DISTANCE = 16;
const SHEET_FLICK_SPEED = 800;
const SHEET_SPEED_WINDOW = 100;
// A drag starts on the grip, or on the title or description above the content; a control inside them keeps its own press.
const SHEET_DRAG_ZONES = '.muxui-dialog__grip, .muxui-dialog__title, .muxui-dialog__description';
const SHEET_OWN_PRESS = 'a[href], area[href], button, input, select, textarea, label, summary, [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])';
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

function parseTranslate(value) {
  const match = /^\s*(-?(?:\d+\.?\d*|\.\d+))px(?:\s+(-?(?:\d+\.?\d*|\.\d+))px)?/u.exec(String(value ?? ''));
  return match ? Number(match[2] ?? match[1]) : MODAL_SETTLED_Y;
}

function parseScale(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized === 'none') return MODAL_SETTLED_SCALE;
  const scale = Number(normalized.split(/\s+/u)[0]);
  return Number.isFinite(scale) && scale > 0 ? scale : MODAL_SETTLED_SCALE;
}

function readModalValues(node) {
  if (typeof window === 'undefined') return { opacity: 1, y: MODAL_SETTLED_Y, scale: MODAL_SETTLED_SCALE };
  const style = window.getComputedStyle(node);
  const opacity = Number(style.opacity);
  return {
    opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1,
    y: parseTranslate(style.getPropertyValue(MODAL_Y_VARIABLE)),
    scale: parseScale(style.getPropertyValue(MODAL_SCALE_VARIABLE)),
  };
}

function modalHiddenValues(fade = true) {
  return { opacity: fade ? 0 : 1, y: MODAL_EXIT_Y, scale: MODAL_INITIAL_SCALE };
}

function modalTargetValues(isOpen, fade) {
  return isOpen
    ? { opacity: 1, y: MODAL_SETTLED_Y, scale: MODAL_SETTLED_SCALE }
    : modalHiddenValues(fade);
}

// The panel runs the modal spring and exits on the modal-dismiss composite; the
// backdrop reads the same two composites in CSS, so both move in step.
function modalTransition(node, triggerNode, isOpen) {
  if (!isOpen) return resolvedMotionTransition(node, triggerNode, 'exit', 'modal');
  const spring = resolvedMotionSpring(node, triggerNode, 'modal-enter', 'modal');
  return spring && { type: 'spring', visualDuration: spring.visualDuration, bounce: spring.bounce };
}

function styleValues(node, values) {
  node.style.opacity = String(values.opacity);
  node.style.setProperty(MODAL_Y_VARIABLE, `${values.y}px`);
  node.style.setProperty(MODAL_SCALE_VARIABLE, String(values.scale));
}

function originalStyles(node) {
  return {
    opacity: node.style.opacity,
    opacityPriority: node.style.getPropertyPriority('opacity'),
    y: node.style.getPropertyValue(MODAL_Y_VARIABLE),
    yPriority: node.style.getPropertyPriority(MODAL_Y_VARIABLE),
    scale: node.style.getPropertyValue(MODAL_SCALE_VARIABLE),
    scalePriority: node.style.getPropertyPriority(MODAL_SCALE_VARIABLE),
  };
}

function restoreStyles(node, original) {
  if (!original) return;
  if (original.opacity) node.style.setProperty('opacity', original.opacity, original.opacityPriority);
  else node.style.removeProperty('opacity');
  if (original.y) node.style.setProperty(MODAL_Y_VARIABLE, original.y, original.yPriority);
  else node.style.removeProperty(MODAL_Y_VARIABLE);
  if (original.scale) node.style.setProperty(MODAL_SCALE_VARIABLE, original.scale, original.scalePriority);
  else node.style.removeProperty(MODAL_SCALE_VARIABLE);
}

/**
 * Own the pixels of a finite modal open/close cycle while RAC retains portal,
 * focus, dismissal, and inertness ownership. Modal-only CSS variables compose
 * the panel's y/scale motion with each surface's existing centering transform.
 * `fade: false` keeps the panel at full opacity while it slides and scales, for
 * a panel with a backdrop filter: any fade shows the unfiltered page through it.
 */
export function useModalMotion({ node, isOpen, triggerRef, reducedAttribute = 'data-muxui-motion-reduced', fade = true, onExitComplete, onReducedChange }) {
  const isOpenRef = React.useRef(Boolean(isOpen));
  const controlsRef = React.useRef(null);
  const valuesRef = React.useRef(null);
  const originalStylesRef = React.useRef(null);
  const animatedNodeRef = React.useRef(null);
  const phaseRef = React.useRef(null);
  const animationIdRef = React.useRef(0);
  const onExitCompleteRef = React.useRef(onExitComplete);
  const onReducedChangeRef = React.useRef(onReducedChange);
  onExitCompleteRef.current = onExitComplete;
  onReducedChangeRef.current = onReducedChange;
  isOpenRef.current = Boolean(isOpen);

  const finishExit = React.useCallback((animationId) => {
    if (animationId !== animationIdRef.current || isOpenRef.current || phaseRef.current !== 'exit') return;
    phaseRef.current = null;
    controlsRef.current = null;
    onExitCompleteRef.current?.();
  }, []);

  const stopControls = React.useCallback((controls) => {
    controls?.stop();
    controls?.cancel?.();
    if (controlsRef.current === controls) controlsRef.current = null;
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (!node || node.nodeType !== 1 || !node.isConnected) return undefined;
    originalStylesRef.current = originalStyles(node);
    valuesRef.current = null;
    return () => {
      animationIdRef.current += 1;
      stopControls(controlsRef.current);
      valuesRef.current = null;
      originalStylesRef.current = null;
      animatedNodeRef.current = null;
    };
  }, [node, stopControls]);

  useIsomorphicLayoutEffect(() => {
    if (!node || node.nodeType !== 1 || !node.isConnected) return undefined;
    const disconnect = observeReducedMotion(node, triggerRef?.current, (reduced) => {
      node.toggleAttribute(reducedAttribute, reduced);
      onReducedChangeRef.current?.(reduced);
      if (!reduced) return;
      animationIdRef.current += 1;
      stopControls(controlsRef.current);
      if (!node.isConnected) return;
      // A reduced close hides the panel at once, so it takes the faded values whether or not the panel fades.
      const target = modalTargetValues(Boolean(isOpenRef.current));
      styleValues(node, target);
      valuesRef.current = target;
      if (!isOpenRef.current && phaseRef.current === 'exit') finishExit(animationIdRef.current);
    });
    return () => {
      disconnect();
      node.removeAttribute(reducedAttribute);
      onReducedChangeRef.current?.(false);
    };
  }, [finishExit, node, reducedAttribute, stopControls, triggerRef]);

  useIsomorphicLayoutEffect(() => {
    if (!node || node.nodeType !== 1 || !node.isConnected) return undefined;
    const animationId = animationIdRef.current + 1;
    animationIdRef.current = animationId;
    const initialOpen = Boolean(isOpen) && animatedNodeRef.current !== node;
    animatedNodeRef.current = node;
    const from = initialOpen ? modalHiddenValues(fade) : valuesRef.current ?? readModalValues(node);
    const to = modalTargetValues(Boolean(isOpen), fade);
    const transition = modalTransition(node, triggerRef?.current, Boolean(isOpen));
    let controls = null;
    let active = true;
    let completed = false;
    phaseRef.current = isOpen ? 'entry' : 'exit';

    const complete = () => {
      if (completed || !active || animationId !== animationIdRef.current || !node.isConnected) return;
      completed = true;
      if (controlsRef.current === controls) controlsRef.current = null;
      valuesRef.current = to;
      if (isOpen) restoreStyles(node, originalStylesRef.current);
      else styleValues(node, to);
      if (!isOpen) finishExit(animationId);
    };

    if (!transition) {
      complete();
      return () => {
        if (phaseRef.current === (isOpen ? 'entry' : 'exit')) phaseRef.current = null;
      };
    }

    const values = { opacity: from.opacity, y: from.y, scale: from.scale };
    const apply = (progress) => {
      if (!active || animationId !== animationIdRef.current || !node.isConnected) return;
      values.opacity = from.opacity + ((to.opacity - from.opacity) * progress);
      values.y = from.y + ((to.y - from.y) * progress);
      values.scale = from.scale + ((to.scale - from.scale) * progress);
      valuesRef.current = values;
      styleValues(node, values);
    };
    apply(0);
    controls = animate(0, 1, { ...transition, onUpdate: apply, onComplete: complete });
    controlsRef.current = controls;
    controls.then(() => {
      if (!active || animationId !== animationIdRef.current) return;
      complete();
    });
    return () => {
      active = false;
      if (node.isConnected) valuesRef.current = readModalValues(node);
      stopControls(controls);
      if (phaseRef.current === (isOpen ? 'entry' : 'exit')) phaseRef.current = null;
    };
  }, [fade, finishExit, isOpen, node, stopControls, triggerRef]);

  React.useEffect(() => () => {
    animationIdRef.current += 1;
    stopControls(controlsRef.current);
  }, [stopControls]);

  return null;
}

// The drag zone a press starts in, when it starts a drag of this sheet: a zone of this panel, and no control inside it.
function sheetDragZone(target, panel) {
  if (!target || target.nodeType !== 1) return null;
  const zone = target.closest(SHEET_DRAG_ZONES);
  if (!zone || zone.closest('.muxui-dialog') !== panel) return null;
  for (let node = target; node && node !== zone; node = node.parentElement) {
    if (node.matches(SHEET_OWN_PRESS)) return null;
  }
  return zone;
}

// How far down the sheet moves to leave: its resting top edge to the bottom of the viewport box it is fixed in.
function sheetHiddenY(node, y) {
  const rect = node.getBoundingClientRect();
  const box = node.closest('.muxui-dialog__backdrop')?.getBoundingClientRect();
  const bottom = box ? box.bottom : node.ownerDocument.documentElement.clientHeight;
  return Math.max(rect.height, bottom - (rect.top - y));
}

// The pointer's speed down the screen over the samples, in pixels a second; none without elapsed time.
function sheetSpeed(samples) {
  const first = samples[0];
  const last = samples[samples.length - 1];
  const elapsed = last.time - first.time;
  return elapsed > 0 ? ((last.y - first.y) / elapsed) * 1000 : 0;
}

/**
 * The pixels and the drag of a sheet. The sheet rests at --muxui-modal-y 0 and slides up from below its box on the
 * modal spring and out on the modal-dismiss composite, without fading; the backdrop fades its scrim colour in CSS.
 * A primary pointer pressed on a drag zone moves it down one for one (never above rest), and the release dismisses it
 * through onDismiss or returns it to rest. Reduced motion places it at once and turns the drag off. `optionsRef`
 * holds the latest triggerRef, draggable, onDismiss, onExitComplete and onReducedChange.
 */
function createSheetMotion(node, optionsRef) {
  const view = node.ownerDocument.defaultView;
  let y = null;
  let open = false;
  let exiting = false;
  let reduced = false;
  let controls = null;
  let animationId = 0;
  let drag = null;
  let settleFrame = 0;

  const write = (value) => {
    y = Math.max(0, value);
    node.style.setProperty(MODAL_Y_VARIABLE, `${y}px`);
  };
  const rest = () => {
    y = 0;
    node.style.removeProperty(MODAL_Y_VARIABLE);
  };
  const stop = () => {
    animationId += 1;
    const running = controls;
    controls = null;
    running?.stop();
  };
  const cancelSettle = () => {
    if (settleFrame) view?.cancelAnimationFrame(settleFrame);
    settleFrame = 0;
  };
  const finishExit = () => {
    if (!exiting) return;
    exiting = false;
    optionsRef.current.onExitComplete?.();
  };
  // Moves the sheet to rest, or out of view when leaving, or puts it there at once when no motion resolves.
  const move = (leaving) => {
    stop();
    const id = animationId;
    const to = leaving ? sheetHiddenY(node, y ?? 0) : 0;
    const from = y ?? to;
    const trigger = optionsRef.current.triggerRef?.current;
    let transition = null;
    if (!reduced && from !== to) {
      if (leaving) {
        transition = resolvedMotionTransition(node, trigger, 'exit', 'modal');
      } else {
        const spring = resolvedMotionSpring(node, trigger, 'modal-enter', 'modal');
        transition = spring && { type: 'spring', visualDuration: spring.visualDuration, bounce: spring.bounce };
      }
    }
    const complete = () => {
      if (id !== animationId) return;
      controls = null;
      if (!leaving) {
        rest();
        return;
      }
      write(to);
      finishExit();
    };
    if (!transition) {
      complete();
      return;
    }
    write(from);
    controls = animate(from, to, {
      ...transition,
      onUpdate: (value) => {
        if (id === animationId) write(value);
      },
      onComplete: complete,
    });
  };
  const endDrag = () => {
    if (!drag) return;
    const { pointerId } = drag;
    drag = null;
    node.removeAttribute(SHEET_DRAGGING_ATTRIBUTE);
    if (node.hasPointerCapture?.(pointerId)) node.releasePointerCapture(pointerId);
  };
  const canDrag = () => open && !exiting && !reduced && Boolean(optionsRef.current.draggable);
  const track = (event) => {
    drag.samples.push({ time: event.timeStamp, y: event.clientY });
    while (drag.samples.length > 2 && event.timeStamp - drag.samples[0].time > SHEET_SPEED_WINDOW) drag.samples.shift();
  };

  // A drag whose release never arrived, as when a mouse button is let go outside the window, returns to rest.
  const dropStaleDrag = () => {
    endDrag();
    move(false);
  };

  const onPointerDown = (event) => {
    if (event.isPrimary === false) return;
    if (drag) dropStaleDrag();
    if (!canDrag() || event.button !== 0 || !sheetDragZone(event.target, node)) return;
    // The press keeps focus, and the selection of a focused field, where they are, and selects no text.
    event.preventDefault();
    cancelSettle();
    stop();
    drag = { pointerId: event.pointerId, startY: event.clientY, origin: y ?? 0, samples: [{ time: event.timeStamp, y: event.clientY }] };
    node.setAttribute(SHEET_DRAGGING_ATTRIBUTE, '');
    try {
      node.setPointerCapture(event.pointerId);
    } catch {
      // A pointer that is no longer active cannot be captured; its pointerup or pointercancel still ends the drag.
    }
  };
  const onPointerMove = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (event.pointerType === 'mouse' && event.buttons === 0) {
      dropStaleDrag();
      return;
    }
    track(event);
    write(drag.origin + event.clientY - drag.startY);
  };
  const onPointerUp = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    track(event);
    const speed = sheetSpeed(drag.samples);
    endDrag();
    const offset = y ?? 0;
    const height = node.getBoundingClientRect().height;
    const dismiss = offset >= Math.min(SHEET_DISMISS_DISTANCE, height * SHEET_DISMISS_SHARE)
      || (offset >= SHEET_FLICK_DISTANCE && speed >= SHEET_FLICK_SPEED);
    if (!dismiss) {
      move(false);
      return;
    }
    optionsRef.current.onDismiss?.();
    // An owner that keeps the Dialog open has rejected the close by the next frame, so the sheet then returns to rest.
    if (open && !exiting && view) {
      settleFrame = view.requestAnimationFrame(() => {
        settleFrame = 0;
        if (open && !exiting) move(false);
      });
    }
  };
  const onPointerCancel = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    endDrag();
    move(false);
  };
  // A press that would start a drag moves neither focus nor the text selection, in engines that still send mousedown.
  const onMouseDown = (event) => {
    if (event.button === 0 && canDrag() && sheetDragZone(event.target, node)) event.preventDefault();
  };
  const listeners = [
    ['pointerdown', onPointerDown],
    ['pointermove', onPointerMove],
    ['pointerup', onPointerUp],
    ['pointercancel', onPointerCancel],
    ['lostpointercapture', onPointerCancel],
    ['mousedown', onMouseDown],
  ];
  for (const [type, listener] of listeners) node.addEventListener(type, listener);

  const disconnect = observeReducedMotion(node, optionsRef.current.triggerRef?.current, (value) => {
    reduced = value;
    node.toggleAttribute(DIALOG_REDUCED_ATTRIBUTE, value);
    optionsRef.current.onReducedChange?.(value);
    if (!value) return;
    // A reduction ends a drag and puts the sheet where it is going at once.
    cancelSettle();
    endDrag();
    stop();
    if (open) {
      rest();
    } else if (exiting) {
      write(sheetHiddenY(node, y ?? 0));
      finishExit();
    }
  });

  return {
    setOpen(next) {
      open = next;
      cancelSettle();
      if (next) {
        exiting = false;
        if (y === null && !reduced) write(sheetHiddenY(node, 0));
        move(false);
        return;
      }
      endDrag();
      exiting = true;
      move(true);
    },
    destroy() {
      cancelSettle();
      endDrag();
      stop();
      for (const [type, listener] of listeners) node.removeEventListener(type, listener);
      disconnect();
      node.removeAttribute(DIALOG_REDUCED_ATTRIBUTE);
      optionsRef.current.onReducedChange?.(false);
    },
  };
}

// Runs a sheet's motion on its panel node; inert while node is null.
function useSheetMotion({ node, isOpen, triggerRef, draggable, onDismiss, onExitComplete, onReducedChange }) {
  const optionsRef = React.useRef(null);
  optionsRef.current = { triggerRef, draggable, onDismiss, onExitComplete, onReducedChange };
  const motionRef = React.useRef(null);
  useIsomorphicLayoutEffect(() => {
    if (!node || node.nodeType !== 1 || !node.isConnected) return undefined;
    const motion = createSheetMotion(node, optionsRef);
    motionRef.current = motion;
    return () => {
      motion.destroy();
      if (motionRef.current === motion) motionRef.current = null;
    };
  }, [node]);
  useIsomorphicLayoutEffect(() => {
    motionRef.current?.setOpen(Boolean(isOpen));
  }, [isOpen, node]);
}

/**
 * Motion owns the panel pixels while RAC owns the modal lifecycle and focus behavior.
 * The parent supplies isExiting so RAC retains the portal until onExitComplete fires.
 * A sheet runs the sheet motion instead of the modal one, and `draggable` lets a drag dismiss it.
 */
export function DialogMotion({ children, originRef, sheet = false, draggable = true, onExitComplete, onReducedChange }) {
  const state = React.useContext(OverlayTriggerStateContext);
  const popoverContext = React.useContext(PopoverContext);
  const triggerRef = popoverContext?.triggerRef;
  const isOpen = Boolean(state?.isOpen);
  const [modalNode, setModalNode] = React.useState(null);
  const panel = modalNode?.querySelector('.muxui-dialog') ?? null;
  useModalMotion({
    node: sheet ? null : panel,
    isOpen,
    triggerRef: triggerRef ?? originRef,
    reducedAttribute: DIALOG_REDUCED_ATTRIBUTE,
    onExitComplete,
    onReducedChange,
  });
  // A drag dismisses through the overlay's own close, the path Escape and an outside press take.
  useSheetMotion({
    node: sheet ? panel : null,
    isOpen,
    triggerRef: triggerRef ?? originRef,
    draggable,
    onDismiss: state?.close,
    onExitComplete,
    onReducedChange,
  });

  const assignModalRef = React.useCallback((node) => {
    setModalNode(node);
  }, []);

  return React.createElement(AriaModal, { ref: assignModalRef, className: 'muxui-dialog__modal' }, children);
}
