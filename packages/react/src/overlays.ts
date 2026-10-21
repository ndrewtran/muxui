import React from 'react';
import type {
  FC,
  FocusEvent,
  ForwardRefExoticComponent,
  ForwardedRef,
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  ReactElement,
  ReactNode,
  RefAttributes,
  RefObject,
  TouchEvent,
} from 'react';
import XIcon from 'lucide-react/dist/esm/icons/x.mjs';
import { FocusScope } from 'react-aria/FocusScope';
import { mergeRefs } from 'react-aria/mergeRefs';
import { useInteractOutside } from 'react-aria/useInteractOutside';
import type { DropEvent } from 'react-aria/useDrop';
// The modality useToastRegion uses; React Aria exports it only from this subpath.
import { getInteractionModality } from 'react-aria/private/interactions/useFocusVisible';
import { isFocusable } from 'react-aria/private/utils/isFocusable';
import { runAfterTransition } from 'react-aria/private/utils/runAfterTransition';
import { Button as MuxUIButton } from './button.ts';
import { overlayGeometry, normalizeBoolean, normalizeNonNegativeFinite } from './overlay-positioning.mjs';
import type { OverlayGeometry } from './overlay-positioning.mjs';
import {
  ButtonContext as AriaButtonContext,
  DEFAULT_SLOT as ARIA_DEFAULT_SLOT,
  Dialog as AriaDialog,
  DialogContext as AriaDialogContext,
  DialogTrigger as AriaDialogTrigger,
  DropZone as AriaDropZone,
  FileTrigger as AriaFileTrigger,
  Heading as AriaHeading,
  ModalOverlay as AriaModalOverlay,
  OverlayTriggerStateContext as AriaOverlayTriggerStateContext,
  Popover as AriaPopover,
  PopoverContext as AriaPopoverContext,
  Pressable as AriaPressable,
  PreviewTrigger as AriaPreviewTrigger,
  Text as AriaText,
  Tooltip as AriaTooltip,
  TooltipContext as AriaTooltipContext,
  TooltipTrigger as AriaTooltipTrigger,
  UNSTABLE_Toast as AriaToast,
  UNSTABLE_ToastContent as AriaToastContent,
  UNSTABLE_ToastQueue,
  UNSTABLE_ToastRegion,
} from 'react-aria-components';
import type { DropItem, ModalOverlayProps, QueuedToast, TooltipProps as AriaTooltipProps } from 'react-aria-components';
import { DialogMotion } from './dialog-motion.mjs';
import { PopoverMotion } from './popover-motion.mjs';
import { observeReducedMotion } from './motion.mjs';
import { useMotionLayout, useMotionLifecycle } from './motion-components.mjs';
import { IconButton } from './supplemental/icon-button.ts';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

function classNames(base: string | undefined, className?: string) {
  return [base, className].filter(Boolean).join(' ');
}

// The geometry each anchored overlay falls back to. A parameter default and the geometry
// helper's fallback both read these records, so the default a block states is the one that runs.
const POPOVER_GEOMETRY = Object.freeze({ placement: 'bottom', offset: 8, crossOffset: 0, shouldFlip: true, containerPadding: 12 } as const);
const PREVIEW_GEOMETRY = Object.freeze({ placement: 'top', offset: 8, crossOffset: 0, shouldFlip: true, containerPadding: 12 } as const);
const TOOLTIP_GEOMETRY = Object.freeze({ placement: 'top', offset: 0, crossOffset: 0, shouldFlip: true, containerPadding: 12 } as const);
// How long a toast stays, in milliseconds, unless it says otherwise.
const TOAST_DURATION = 5000;
// React Aria's types make the children of its triggers a required prop. createElement sets that
// prop from the children it takes after the props, so the props carry only this placeholder.
const CHILDREN_FOLLOW = undefined;

function normalizeMaxVisible(value: number | undefined) {
  const normalized = Math.floor(normalizeNonNegativeFinite(value, 5, 'Toast maxVisible'));
  if (normalized < 1) throw new TypeError('Toast maxVisible must be at least 1');
  return normalized;
}

// setTimeout converts delays above 2^31 - 1 ms to an immediate timeout.
// 2 ** 31 - 1, the setTimeout maximum, as a literal so the module does no import-time work.
const MAX_TIMEOUT = 2147483647;

function normalizeToastDuration(value: number | undefined) {
  const normalized = normalizeNonNegativeFinite(value, TOAST_DURATION, 'Toast duration');
  if (normalized > MAX_TIMEOUT) throw new TypeError(`Toast duration must not exceed ${MAX_TIMEOUT} ms`);
  return normalized;
}

// What the overlays read from an element a consumer supplies, whatever its type.
interface LabelledElementProps {
  'aria-label'?: unknown;
  'aria-labelledby'?: unknown;
  title?: unknown;
  children?: unknown;
}

function hasRenderableLabel(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return true;
  if (value === undefined || value === null || typeof value === 'boolean') return false;
  if (Array.isArray(value)) return value.some(hasRenderableLabel);
  if (React.isValidElement<LabelledElementProps>(value)) {
    if (value.type === React.Fragment) return hasRenderableLabel(value.props.children);
    // Custom React elements are opaque until React renders them; browser accessibility validation owns their output.
    if (typeof value.type !== 'string') return true;
    if (hasAccessibleName(value.props['aria-label']) || hasAccessibleName(value.props['aria-labelledby']) || hasAccessibleName(value.props.title)) return true;
    return hasRenderableLabel(value.props.children);
  }
  return true;
}

function hasAccessibleName(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function fileList(files: FileList | null) {
  return files ? [...files] : [];
}

/** What a drop does with what it carries: copies, links, or moves it, or is cancelled. */
export type MuxUIDropOperation = 'copy' | 'link' | 'move' | 'cancel';

/** A dropped file. */
export interface MuxUIFileDropItem {
  readonly kind: 'file';
  readonly type: string;
  readonly name: string;
  readonly getFile: () => Promise<File>;
  readonly getText: () => Promise<string>;
}

/** A dropped directory. */
export interface MuxUIDirectoryDropItem {
  readonly kind: 'directory';
  readonly name: string;
  readonly getEntries: () => AsyncIterable<MuxUIDropItem>;
}

/** Dropped text, in each of the formats it carries. */
export interface MuxUITextDropItem {
  readonly kind: 'text';
  readonly types: ReadonlySet<string>;
  readonly getText: (type: string) => Promise<string>;
}

/** One item a drop carries. */
export type MuxUIDropItem = MuxUIFileDropItem | MuxUIDirectoryDropItem | MuxUITextDropItem;

/** What a drop reports. */
export interface MuxUIDropEvent {
  readonly type: 'drop';
  readonly x: number;
  readonly y: number;
  readonly dropOperation: MuxUIDropOperation;
  readonly items: MuxUIDropItem[];
}

/** What an activation of the drop target reports. */
export interface MuxUIDropActivateEvent {
  readonly type: 'activate';
  readonly x: number;
  readonly y: number;
}

// The members a dropped item carries, whichever kind it is: each kind has some and lacks the rest.
interface DropItemMembers {
  name?: string;
  type?: string;
  types?: Iterable<string>;
  getFile?(): Promise<File>;
  getText?(type?: string): Promise<string>;
  getEntries?(): AsyncIterable<DropItem>;
}

function hasEntries(members: DropItemMembers): members is DropItemMembers & Required<Pick<DropItemMembers, 'getEntries'>> {
  return typeof members.getEntries === 'function';
}

// The copy takes each member the item has, so it is built member by member and then typed as the item it copies.
interface DropItemCopy {
  kind: DropItem['kind'];
  name?: string;
  type?: string;
  types?: Set<string>;
  getFile?: () => Promise<File>;
  getText?: (type?: string) => Promise<string>;
  getEntries?: () => AsyncIterable<MuxUIDropItem>;
}

function normalizeDropItem(item: DropItem): MuxUIDropItem {
  const members: DropItemMembers = item;
  const normalized: DropItemCopy = { kind: item.kind };
  if (members.name !== undefined) normalized.name = members.name;
  if (members.type !== undefined) normalized.type = members.type;
  if (members.types !== undefined) normalized.types = new Set(members.types);
  if (typeof members.getFile === 'function') normalized.getFile = members.getFile.bind(item);
  if (typeof members.getText === 'function') normalized.getText = members.getText.bind(item);
  if (hasEntries(members)) {
    normalized.getEntries = async function* getEntries() {
      for await (const child of members.getEntries()) yield normalizeDropItem(child);
    };
  }
  return normalized as MuxUIDropItem;
}

function normalizeDropEvent(event: DropEvent): MuxUIDropEvent {
  return {
    type: 'drop',
    x: event.x,
    y: event.y,
    dropOperation: event.dropOperation,
    items: (event.items ?? []).map(normalizeDropItem),
  };
}

function composeEventHandlers<Event extends { defaultPrevented: boolean }>(first?: (event: Event) => void, second?: (event: Event) => void) {
  if (!first) return second;
  if (!second) return first;
  return (event: Event) => {
    first(event);
    if (!event.defaultPrevented) second(event);
  };
}

// What the overlays read from, or add to, the trigger element a consumer supplies.
interface TriggerElementProps {
  className?: string;
  disabled?: boolean;
  'aria-disabled'?: boolean;
  onKeyDown?: (event: KeyboardEvent) => void;
  onPointerEnter?: (event: PointerEvent) => void;
  onPointerDown?: (event: PointerEvent) => void;
  onMouseEnter?: (event: MouseEvent) => void;
  onTouchStart?: (event: TouchEvent) => void;
  onFocus?: (event: FocusEvent) => void;
  onPointerLeave?: (event: PointerEvent) => void;
  onMouseLeave?: (event: MouseEvent) => void;
  onBlur?: (event: FocusEvent) => void;
}

const isDomElement = (element: ReactElement<TriggerElementProps>): element is ReactElement<TriggerElementProps, string> => typeof element.type === 'string';

function pressableTrigger(trigger: ReactNode, disabled = false, className?: string) {
  if (!React.isValidElement<TriggerElementProps>(trigger)) return trigger;
  const normalizedTrigger = className
    ? React.cloneElement(trigger, { className: classNames(trigger.props.className, className) })
    : trigger;
  // RAC trigger components (including MuxUI Button) consume DialogTrigger's
  // PressResponder context directly. Wrapping them in a second Pressable
  // shadows that context and prevents keyboard-triggered opening.
  if (!isDomElement(normalizedTrigger)) return normalizedTrigger;
  return React.createElement(AriaPressable, { isDisabled: disabled, children: normalizedTrigger });
}

/**
 * The props Mux UI defines for DropZone; the catalog's web.react API is derived from
 * this interface (Decision 0031). The children are the area's content, and the accessible
 * name is the native aria-label or aria-labelledby.
 */
export interface DropZoneOwnProps {
  /** Disables the DropZone: it accepts no drop and reports no activation. */
  disabled?: boolean;
  /** Reports the items a drop, a paste, or a keyboard selection supplies. The items are file, directory, and text items rather than a File array, and they are read asynchronously. */
  onDrop?: (event: MuxUIDropEvent) => void;
  /** Reports an activation of the DropZone's own hidden button. A click on a control inside it, such as a FileTrigger, reports none. */
  onActivate?: (event: MuxUIDropActivateEvent) => void;
}

export interface DropZoneProps extends DropZoneOwnProps {
  children?: ReactNode;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

/**
 * MuxUI owns the public callback shape while RAC owns drop, clipboard, hover, and focus semantics.
 */
export const DropZone: ForwardRefExoticComponent<DropZoneProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, DropZoneProps>(function DropZone({
  children = 'Drop files here',
  disabled = false,
  onDrop,
  onActivate,
  className,
  ...props
}, ref) {
  const disabledRef = React.useRef(disabled);
  disabledRef.current = disabled;
  const handleDrop = React.useCallback((event: DropEvent) => {
    if (disabledRef.current) return;
    onDrop?.(normalizeDropEvent(event));
  }, [onDrop]);
  const handleActivate = React.useCallback((event: MouseEvent<HTMLDivElement>) => {
    // RAC's visually hidden drop button is the root's only own control; clicks
    // from consumer content, such as a nested FileTrigger, are not activation.
    const dropButton = event.currentTarget.firstElementChild?.firstElementChild;
    if (event.target !== dropButton || dropButton.tagName !== 'BUTTON' || disabledRef.current) return;
    onActivate?.({ type: 'activate', x: event.clientX ?? 0, y: event.clientY ?? 0 });
  }, [onActivate]);
  // RAC sets data-disabled on the root but does not forward aria-disabled, so the render function adds it.
  return React.createElement(AriaDropZone, {
    ...props,
    ref,
    isDisabled: disabled,
    render: (domProps) => React.createElement('div', { ...domProps, 'aria-disabled': disabled ? disabled : undefined }),
    onDrop: handleDrop,
    onClickCapture: handleActivate,
    className: classNames('muxui-drop-zone', className),
  }, children);
});

DropZone.displayName = 'DropZone';

/**
 * The props Mux UI defines for FileTrigger; the catalog's web.react API is derived from
 * this interface (Decision 0031). The children are the trigger: text, which becomes a Button,
 * or an element, which keeps its own styling.
 */
export interface FileTriggerOwnProps {
  /** The MIME types or extensions the picker offers. It sets the native accept attribute and narrows the picker without validating the choice. */
  acceptedFileTypes?: readonly string[];
  /** Lets the picker select more than one file. */
  allowsMultiple?: boolean;
  /** Lets the picker select a directory instead of files, through the native webkitdirectory attribute. */
  acceptDirectory?: boolean;
  /** Picks the camera a capture uses, the front one for user or the rear one for environment, through the native capture attribute. */
  defaultCamera?: 'user' | 'environment';
  /** Disables the trigger: the picker does not open, and onSelect is not called. */
  disabled?: boolean;
  /** Reports the chosen files as an array of File objects. */
  onSelect?: (files: File[]) => void;
}

export interface FileTriggerProps extends FileTriggerOwnProps {
  children?: ReactNode;
  className?: string;
}

/** RAC resets the native input before each press, preserving same-file selection behavior. */
export const FileTrigger: ForwardRefExoticComponent<FileTriggerProps & RefAttributes<HTMLInputElement>> = React.forwardRef<HTMLInputElement, FileTriggerProps>(function FileTrigger({
  children = 'Choose files',
  acceptedFileTypes,
  allowsMultiple = false,
  acceptDirectory = false,
  defaultCamera,
  disabled = false,
  onSelect,
  className,
  ...props
}, ref) {
  const disabledRef = React.useRef(disabled);
  disabledRef.current = disabled;
  const trigger = React.isValidElement<TriggerElementProps>(children)
    ? React.cloneElement(children, { className: classNames('muxui-file-trigger', classNames(children.props.className, className)), disabled: disabled ? disabled : children.props.disabled, 'aria-disabled': disabled ? disabled : undefined })
    : React.createElement(MuxUIButton, { className: classNames('muxui-file-trigger', className), disabled }, children);
  return React.createElement(AriaFileTrigger, {
    ...props,
    ref,
    acceptedFileTypes,
    allowsMultiple,
    defaultCamera,
    acceptDirectory,
    onSelect: (files) => {
      if (disabledRef.current) return;
      onSelect?.(fileList(files));
    },
  }, pressableTrigger(trigger, disabled));
});

FileTrigger.displayName = 'FileTrigger';

// React Aria restores focus to the element focused when an overlay opened, one
// frame after the overlay unmounts; if that opener has left the DOM, focus
// falls to the body. Record the opener's ancestors on open, while they are
// still connected, so the nearest one that remains connected and focusable can
// take focus instead. With none, focus stays on the body. Call this from a
// component inside the overlay's FocusScope: React runs unmount cleanups
// parent first, so this frame runs after React Aria's own restore frame.
function useOpenerFocusFallback() {
  const [opener] = React.useState(() => {
    const element = typeof document === 'undefined' ? null : document.activeElement;
    if (!element || element === element.ownerDocument.body) return null;
    const ancestors: HTMLElement[] = [];
    for (let node = element.parentElement; node && node !== element.ownerDocument.body; node = node.parentElement) ancestors.push(node);
    return { element, ancestors };
  });
  useIsomorphicLayoutEffect(() => {
    if (!opener) return undefined;
    return () => {
      const { element, ancestors } = opener;
      const ownerDocument = element.ownerDocument;
      const fallback = () => {
        // Leave a connected opener, and any focus React Aria or the app placed, alone.
        const active = ownerDocument.activeElement;
        if (element.isConnected || (active && active !== ownerDocument.body)) return;
        ancestors.find((node) => node.isConnected && isFocusable(node))?.focus({ preventScroll: true });
      };
      ownerDocument.defaultView?.requestAnimationFrame(() => {
        // Under a virtual cursor React Aria defers its restore until running
        // transitions end; queueing here keeps the fallback behind it.
        if (getInteractionModality() === 'virtual') runAfterTransition(fallback);
        else fallback();
      });
    };
  }, [opener]);
}

interface DialogContentProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  ariaLabel?: string;
  dismissable: boolean;
  explicitClose: () => void;
  className?: string;
  panelClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  contentClassName?: string;
  actionsClassName?: string;
  closeClassName?: string;
  contentRef: ForwardedRef<HTMLElement>;
  'aria-describedby'?: string;
  'aria-labelledby'?: string;
}

function DialogContent({ title, description, actions, children, ariaLabel, dismissable, explicitClose, className, panelClassName, titleClassName, descriptionClassName, contentClassName, actionsClassName, closeClassName, contentRef, 'aria-describedby': ariaDescribedby, ...props }: DialogContentProps) {
  const descriptionId = React.useId();
  const describedby = [ariaDescribedby, description !== undefined && description !== null ? descriptionId : undefined].filter(Boolean).join(' ') || undefined;
  const triggerState = React.useContext(AriaOverlayTriggerStateContext);
  useOpenerFocusFallback();
  // RAC routes slot="close" buttons through this state's close; those
  // explicit actions still close a non-dismissable Dialog.
  const explicitCloseState = React.useMemo(() => triggerState && { ...triggerState, close: explicitClose }, [triggerState, explicitClose]);
  const dialog = React.createElement(AriaDialog, { ...props, ref: contentRef, className: classNames(classNames('muxui-dialog', className), panelClassName), 'aria-label': ariaLabel, 'aria-describedby': describedby },
    hasRenderableLabel(title) ? React.createElement(AriaHeading, { slot: 'title', className: classNames('muxui-dialog-title', titleClassName) }, title) : null,
    description !== undefined && description !== null ? React.createElement('p', { id: descriptionId, className: classNames('muxui-dialog-description', descriptionClassName) }, description) : null,
    React.createElement('div', { className: classNames('muxui-dialog-content', contentClassName) }, children),
    actions !== undefined && actions !== null ? React.createElement('div', { className: classNames('muxui-dialog-actions', actionsClassName) }, actions) : null,
    dismissable ? React.createElement(IconButton, { slot: 'close', size: 'sm', className: classNames('muxui-dialog-close', closeClassName), 'aria-label': 'Close dialog' }, React.createElement(XIcon, { 'aria-hidden': 'true', focusable: 'false', size: 16 })) : null);
  return React.createElement(AriaOverlayTriggerStateContext.Provider, { value: explicitCloseState }, dialog);
}

/** The open state a Dialog or Popover keeps for itself or hands back to its caller. */
interface DialogTriggerState {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  close: () => void;
}

interface DialogOverlayProps {
  dismissable: boolean;
  backdropClassName?: string;
  children?: ReactNode;
  state: DialogTriggerState;
  insideTrigger: boolean;
  originRef: RefObject<Element | null>;
}

function DialogOverlay({ dismissable, backdropClassName, children, state, insideTrigger, originRef }: DialogOverlayProps) {
  const isOpen = Boolean(state.isOpen);
  const [phase, setPhase] = React.useState({ open: isOpen, exiting: false });
  if (phase.open !== isOpen) setPhase({ open: isOpen, exiting: !isOpen });
  const backdropRef = React.useRef<HTMLDivElement>(null);

  const releaseExit = React.useCallback(() => {
    setPhase((current) => current.open || !current.exiting ? current : { ...current, exiting: false });
  }, []);
  const markReduced = React.useCallback((reduced: boolean) => {
    const backdrop = backdropRef.current;
    if (!backdrop) return;
    backdrop.toggleAttribute('data-muxui-dialog-reduced', reduced);
    if (!reduced || typeof backdrop.getAnimations !== 'function') return;
    const CSSTransition = backdrop.ownerDocument.defaultView?.CSSTransition;
    if (!CSSTransition) return;
    for (const animation of backdrop.getAnimations()) {
      if (animation instanceof CSSTransition && animation.transitionProperty === 'opacity') animation.cancel();
    }
  }, []);
  const overlayProps: ModalOverlayProps & RefAttributes<HTMLDivElement> = {
    ref: backdropRef,
    isDismissable: dismissable,
    isKeyboardDismissDisabled: !dismissable,
    className: classNames('muxui-dialog-backdrop', backdropClassName),
    isExiting: !isOpen && phase.exiting,
  };
  if (!insideTrigger) {
    overlayProps.isOpen = isOpen;
    overlayProps.onOpenChange = state.onOpenChange;
  }
  return React.createElement(AriaModalOverlay, overlayProps,
    React.createElement(DialogMotion, { originRef, onExitComplete: releaseExit, onReducedChange: markReduced }, children));
}

function useDialogTriggerState({ open, defaultOpen, dismissable, onOpenChange }: { open?: boolean; defaultOpen: boolean; dismissable: boolean; onOpenChange?: (open: boolean) => void }): DialogTriggerState {
  const controlled = open !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const close = React.useCallback(() => {
    if (!controlled) setUncontrolledOpen(false);
    onOpenChange?.(false);
  }, [controlled, onOpenChange]);
  // RAC sends Escape, outside press, hidden dismiss buttons, and trigger
  // toggles here; dismissable false rejects those accidental close requests.
  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      if (dismissable) close();
      return;
    }
    if (!controlled) setUncontrolledOpen(true);
    onOpenChange?.(true);
  }, [close, controlled, dismissable, onOpenChange]);
  return {
    isOpen: controlled ? open : uncontrolledOpen,
    onOpenChange: handleOpenChange,
    close,
  };
}

/** How a floating overlay is placed beside its trigger. */
export type MuxUIPlacement = 'top' | 'bottom' | 'start' | 'end' | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end' | 'start-top' | 'start-bottom' | 'end-top' | 'end-bottom';

/** An overlay's accessible name: an aria-label, or the id of the element that labels it, but not both. */
export type OverlayAccessibleName = { 'aria-label': string; 'aria-labelledby'?: never } | { 'aria-label'?: never; 'aria-labelledby': string };

/**
 * The props Mux UI defines for Dialog; the catalog's web.react API is derived from this
 * interface (Decision 0031). The children fill the content, and the accessible name is
 * the title, or else the native aria-label or aria-labelledby.
 */
export interface DialogOwnProps {
  /** The heading, which also names the Dialog. Without one, the Dialog needs an aria-label or aria-labelledby, and a blank title does not count. */
  title?: Exclude<ReactNode, null | undefined | boolean>;
  /** Supporting text under the title, which also describes the Dialog. */
  description?: ReactNode;
  /** The buttons under the content. */
  actions?: ReactNode;
  /** Whether the Dialog is open, when the caller controls it. */
  open?: boolean;
  /** Whether the Dialog starts open, when it controls itself. */
  defaultOpen?: boolean;
  /** Whether Escape, an outside press, the trigger, and the built-in close button close the Dialog. When false, the Dialog renders no close button of its own, and only a button in the close slot closes it. */
  dismissable?: boolean;
  /** The element that opens the Dialog. Without one, only open or defaultOpen opens it. */
  trigger?: ReactElement;
  /** A class added to the backdrop beside Mux UI's own. */
  backdropClassName?: string;
  /** A class added to the dialog panel beside Mux UI's own. */
  panelClassName?: string;
  /** A class added to the title beside Mux UI's own. */
  titleClassName?: string;
  /** A class added to the description beside Mux UI's own. */
  descriptionClassName?: string;
  /** A class added to the content beside Mux UI's own. */
  contentClassName?: string;
  /** A class added to the actions beside Mux UI's own. */
  actionsClassName?: string;
  /** A class added to the built-in close button beside Mux UI's own. */
  closeClassName?: string;
  /** Reports the Dialog opening or closing. A Dialog that is not dismissable reports no close from Escape, an outside press, or the trigger. */
  onOpenChange?: (open: boolean) => void;
}

// A title names the Dialog, or the Dialog takes an aria-label or aria-labelledby of its own: the
// public type is the union of those arms, with the title's own type in the first.
type DialogArms =
  | { title: Exclude<ReactNode, null | undefined | boolean>; 'aria-label'?: string; 'aria-labelledby'?: string }
  | ({ title?: never } & OverlayAccessibleName);

export type DialogProps = Omit<DialogOwnProps, 'title'> & { 'aria-describedby'?: string; children?: ReactNode; className?: string } & DialogArms;

/** RAC Modal/ModalOverlay provide topmost overlay arbitration, inertness, focus scope, and portal lifecycle. */
export const Dialog: ForwardRefExoticComponent<DialogProps & RefAttributes<HTMLElement>> = /*#__PURE__*/ (() => {
  const component = React.forwardRef<HTMLElement, DialogProps>(function Dialog({
    children,
    title,
    open,
    defaultOpen = false,
    dismissable = true,
    description,
    actions,
    backdropClassName,
    panelClassName,
    titleClassName,
    descriptionClassName,
    contentClassName,
    actionsClassName,
    closeClassName,
    trigger,
    onOpenChange,
    className,
    'aria-label': ariaLabel,
    ...props
  }, ref) {
    const hasTitle = hasRenderableLabel(title);
    if (!hasTitle && !hasAccessibleName(ariaLabel) && !hasAccessibleName(props['aria-labelledby'])) throw new Error('Dialog requires a title or accessible name');
    const triggerState = useDialogTriggerState({ open, defaultOpen, dismissable, onOpenChange });
    const hasTrigger = React.isValidElement(trigger);
    const motionOriginRef = React.useRef<HTMLSpanElement>(null);
    const content = React.createElement(DialogOverlay, { dismissable, backdropClassName, state: triggerState, insideTrigger: hasTrigger, originRef: motionOriginRef },
      React.createElement(DialogContent, { ...props, contentRef: ref, title, description, actions, ariaLabel, dismissable, explicitClose: triggerState.close, className, panelClassName, titleClassName, descriptionClassName, contentClassName, actionsClassName, closeClassName }, children));
    if (hasTrigger) {
      return React.createElement(AriaDialogTrigger, { isOpen: triggerState.isOpen, onOpenChange: triggerState.onOpenChange, children: CHILDREN_FOLLOW }, pressableTrigger(trigger, false, 'muxui-dialog-trigger'), content);
    }
    return React.createElement(React.Fragment, null,
      React.createElement('span', { ref: motionOriginRef, hidden: true, 'aria-hidden': 'true' }),
      content);
  });
  component.displayName = 'Dialog';
  return component;
})();

interface PopoverSurfaceProps {
  modal: boolean;
  children?: ReactNode;
  onPointerDownCapture: () => void;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className: string;
}

function PopoverSurface({ modal, children, onPointerDownCapture, ...props }: PopoverSurfaceProps) {
  const surfaceRef = React.useRef<HTMLElement>(null);
  useOpenerFocusFallback();
  React.useEffect(() => {
    const surface = surfaceRef.current;
    if (modal && surface && !surface.contains(surface.ownerDocument.activeElement)) {
      surface.focus({ preventScroll: true });
    }
  }, [modal]);
  // A stable scope releases containment without resetting consumer content.
  // The enclosing RAC Popover remains the focus-restoration owner.
  return React.createElement(FocusScope, {
    contain: modal,
    children: React.createElement('section', { ...props, ref: surfaceRef, role: 'dialog', tabIndex: -1, onPointerDownCapture }, children),
  });
}

interface PopupContentProps {
  children?: ReactNode;
  className?: string;
  geometry: OverlayGeometry;
  dismissable: boolean;
  anchorRef?: RefObject<Element | null>;
  modal?: boolean;
  onDismissOutside?: () => void;
  explicitClose: () => void;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

const PopupContent = /*#__PURE__*/ React.forwardRef<HTMLElement, PopupContentProps>(function PopupContent({ children, className, geometry, dismissable, anchorRef, modal = true, onDismissOutside, explicitClose, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
  const dialogContext = React.useContext(AriaDialogContext);
  const popoverContext = React.useContext(AriaPopoverContext);
  const triggerRef = popoverContext && 'triggerRef' in popoverContext ? popoverContext.triggerRef : undefined;
  const positionerRef = React.useRef<HTMLElement | null>(null);
  const setRef = React.useMemo(() => mergeRefs(positionerRef, ref), [ref]);
  // RAC never dismisses a non-modal popover on outside press. Presses inside
  // this popover's React tree, including portaled descendants, are not outside;
  // trigger presses are left to the trigger's own toggle.
  const pressedInsideRef = React.useRef(false);
  // Like RAC Dialog, a slot="close" button in the content closes the popover,
  // even when dismissable is false; it also stops an enclosing overlay's close
  // slot from leaking in.
  const buttonSlots = React.useMemo(() => ({ slots: { [ARIA_DEFAULT_SLOT]: {}, close: { onPress: explicitClose } } }), [explicitClose]);
  useInteractOutside({
    ref: positionerRef,
    isDisabled: !onDismissOutside,
    onInteractOutsideStart: () => {
      pressedInsideRef.current = false;
    },
    onInteractOutside: (event) => {
      if (pressedInsideRef.current || triggerRef?.current?.contains(event.target as Node)) return;
      onDismissOutside?.();
    },
  });
  return React.createElement(PopoverMotion, {
    ...props,
    ref: setRef,
    triggerRef: anchorRef,
    placement: geometry.placement,
    offset: geometry.offset,
    crossOffset: geometry.crossOffset,
    shouldFlip: geometry.shouldFlip,
    containerPadding: geometry.containerPadding,
    isNonModal: !modal,
    'data-modal': modal,
    className: 'muxui-popover-positioner',
    isKeyboardDismissDisabled: !dismissable,
    shouldCloseOnInteractOutside: dismissable ? undefined : () => false,
  }, React.createElement(PopoverSurface, {
    modal,
    // Capture phase: RAC's usePress stops pointerdown propagation.
    onPointerDownCapture: () => {
      pressedInsideRef.current = true;
    },
    id: dialogContext && 'id' in dialogContext ? dialogContext.id : undefined,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
    className: classNames('muxui-popover', className),
  }, React.createElement(AriaButtonContext.Provider, { value: buttonSlots }, children)));
});

/**
 * The props Mux UI defines for Popover; the catalog's web.react API is derived from this
 * type (Decision 0031). The children fill the popover, and the accessible name is
 * the native aria-label or aria-labelledby.
 * It is a type literal, not an interface, so the public props type stays assignable to
 * Record<string, unknown>, as it was before the move.
 */
export type PopoverOwnProps = {
  /** The focusable element that opens the Popover. Pressing it toggles the Popover. */
  trigger: ReactElement;
  /** Whether the Popover is open, when the caller controls it. */
  open?: boolean;
  /** Whether the Popover starts open, when it controls itself. */
  defaultOpen?: boolean;
  /** Whether Escape, an outside press, and the trigger close the Popover. When false, only a button in the close slot closes it, in modal and non-modal mode alike. */
  dismissable?: boolean;
  /** Where the Popover opens against its trigger or anchorRef. start and end follow the locale direction. */
  placement?: MuxUIPlacement;
  /** The distance in pixels between the Popover and its trigger, along the placement's side. */
  offset?: number;
  /** The shift in pixels along the side the Popover is placed against. */
  crossOffset?: number;
  /** Whether the Popover moves to the opposite side when the placed side has no room. */
  shouldFlip?: boolean;
  /** The least distance in pixels between the Popover and the edge of the viewport. Must not be negative. */
  containerPadding?: number;
  /** Whether the Popover contains focus until it closes. When false, it is non-blocking: it has no focus containment, outside-content exclusion, or scroll locking. */
  modal?: boolean;
  /** Reports the Popover opening or closing. */
  onOpenChange?: (open: boolean) => void;
};

export type PopoverProps = PopoverOwnProps & { children: ReactNode; className?: string; anchorRef?: RefObject<Element | null> } & OverlayAccessibleName;

/** RAC Popover owns positioning and dismissal; FocusScope controls optional focus containment. */
export const Popover: ForwardRefExoticComponent<PopoverProps & RefAttributes<HTMLDivElement>> = /*#__PURE__*/ React.forwardRef<HTMLDivElement, PopoverProps>(function Popover({
  children,
  trigger,
  open,
  defaultOpen = false,
  dismissable = true,
  placement = POPOVER_GEOMETRY.placement,
  offset = POPOVER_GEOMETRY.offset,
  crossOffset = POPOVER_GEOMETRY.crossOffset,
  shouldFlip = POPOVER_GEOMETRY.shouldFlip,
  containerPadding = POPOVER_GEOMETRY.containerPadding,
  anchorRef,
  modal = true,
  onOpenChange,
  className,
  ...props
}, ref) {
  if (!React.isValidElement<TriggerElementProps>(trigger)) throw new Error('Popover requires a focusable React element as trigger');
  if (!hasAccessibleName(props['aria-label']) && !hasAccessibleName(props['aria-labelledby'])) throw new Error('Popover requires an accessible name');
  const geometry = overlayGeometry({ placement, offset, crossOffset, shouldFlip, containerPadding }, POPOVER_GEOMETRY, 'Popover');
  const normalizedModal = normalizeBoolean(modal, true, 'Popover modal');
  const triggerState = useDialogTriggerState({ open, defaultOpen, dismissable, onOpenChange });
  // Focus stays on the trigger of a non-modal popover, outside RAC's Escape handling.
  const dismissNonModal = triggerState.isOpen && !normalizedModal && dismissable ? triggerState.close : undefined;
  const onTriggerKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !dismissNonModal) return;
    event.preventDefault();
    event.stopPropagation();
    dismissNonModal();
  };
  const dismissibleTrigger = React.cloneElement(trigger, { onKeyDown: composeEventHandlers(trigger.props.onKeyDown, onTriggerKeyDown) });
  const content = React.createElement(PopupContent, { ...props, ref, geometry, className, dismissable, anchorRef, modal: normalizedModal, onDismissOutside: dismissNonModal, explicitClose: triggerState.close }, children);
  return React.createElement(AriaDialogTrigger, { isOpen: triggerState.isOpen, onOpenChange: triggerState.onOpenChange, children: CHILDREN_FOLLOW }, pressableTrigger(dismissibleTrigger, false, 'muxui-overlay-pop-trigger'), content);
});

function useDisabledTimedOverlay({ disabled, open, defaultOpen, onOpenChange }: { disabled: boolean; open?: boolean; defaultOpen: boolean; onOpenChange?: (open: boolean) => void }) {
  const controlled = open !== undefined;
  const disabledRef = React.useRef(disabled);
  const openRef = React.useRef(controlled ? open === true : defaultOpen);
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(controlled || disabled ? false : defaultOpen);
  const pendingRef = React.useRef(false);
  // Initial disabled state masks the trigger without representing a transition.
  const previousDisabledRef = React.useRef(disabled);
  const suppressStaleOpenRef = React.useRef(false);
  disabledRef.current = disabled;
  if (controlled) openRef.current = open === true;

  const markPending = React.useCallback(() => {
    if (!disabledRef.current) {
      pendingRef.current = true;
      suppressStaleOpenRef.current = false;
    }
  }, []);
  const clearPending = React.useCallback(() => {
    pendingRef.current = false;
  }, []);
  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    if (disabledRef.current) return;
    if (nextOpen && suppressStaleOpenRef.current && !pendingRef.current) {
      suppressStaleOpenRef.current = false;
      return;
    }
    suppressStaleOpenRef.current = false;
    openRef.current = nextOpen;
    if (!nextOpen) pendingRef.current = false;
    if (!controlled) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [controlled, onOpenChange]);

  React.useEffect(() => {
    const wasDisabled = previousDisabledRef.current;
    if (disabled && !wasDisabled) {
      const wasOpen = controlled ? open === true : openRef.current;
      const shouldRequestClose = wasOpen || pendingRef.current;
      openRef.current = false;
      pendingRef.current = false;
      suppressStaleOpenRef.current = true;
      if (!controlled) setUncontrolledOpen(false);
      if (shouldRequestClose) onOpenChange?.(false);
    } else if (!disabled && wasDisabled) {
      // The adapter-owned uncontrolled state remains closed after a disable cycle.
      pendingRef.current = false;
    }
    previousDisabledRef.current = disabled;
  }, [controlled, disabled, onOpenChange, open]);

  return {
    controlled,
    disabledRef,
    isOpen: disabled ? false : controlled ? open === true : uncontrolledOpen,
    markPending,
    clearPending,
    handleOpenChange,
  };
}

// Disabling a timed overlay only suppresses the overlay; the consumer's
// trigger keeps working, so it is never marked disabled.
function overlayTrigger(trigger: ReactNode, { disabled, className, markPending, clearPending }: { disabled: boolean; className?: string; markPending: () => void; clearPending: () => void }) {
  if (!React.isValidElement<TriggerElementProps>(trigger)) return trigger;
  return React.cloneElement(trigger, {
    className: classNames(trigger.props.className, className),
    onPointerEnter: composeEventHandlers(trigger.props.onPointerEnter, disabled ? undefined : markPending),
    onPointerDown: composeEventHandlers(trigger.props.onPointerDown, disabled ? undefined : markPending),
    onMouseEnter: composeEventHandlers(trigger.props.onMouseEnter, disabled ? undefined : markPending),
    onTouchStart: composeEventHandlers(trigger.props.onTouchStart, disabled ? undefined : markPending),
    onFocus: composeEventHandlers(trigger.props.onFocus, disabled ? undefined : markPending),
    onKeyDown: composeEventHandlers(trigger.props.onKeyDown, disabled ? undefined : markPending),
    onPointerLeave: composeEventHandlers(trigger.props.onPointerLeave, clearPending),
    onMouseLeave: composeEventHandlers(trigger.props.onMouseLeave, clearPending),
    onBlur: composeEventHandlers(trigger.props.onBlur, clearPending),
  });
}

/**
 * The props Mux UI defines for PreviewTrigger; the catalog's web.react API is derived from
 * this type (Decision 0031). The children fill the preview, and the accessible name is
 * the native aria-label or aria-labelledby.
 * It is a type literal, not an interface, so the public props type stays assignable to
 * Record<string, unknown>, as it was before the move.
 */
export type PreviewTriggerOwnProps = {
  /** The focusable element that opens the preview. Disabling the preview leaves it operable. */
  trigger: ReactElement;
  /** How long a hover waits before the preview opens, in milliseconds. */
  delay?: number;
  /** How long the preview stays open after the pointer leaves, in milliseconds. */
  closeDelay?: number;
  /** Whether the preview is open, when the caller controls it. */
  open?: boolean;
  /** Whether the preview starts open, when it controls itself. */
  defaultOpen?: boolean;
  /** Disables the preview: it does not open, and an open one closes. The trigger stays operable. */
  disabled?: boolean;
  /** Where the preview opens against its trigger. start and end follow the locale direction. */
  placement?: MuxUIPlacement;
  /** The distance in pixels between the preview and its trigger, along the placement's side. */
  offset?: number;
  /** The shift in pixels along the side the preview is placed against. */
  crossOffset?: number;
  /** Whether the preview moves to the opposite side when the placed side has no room. */
  shouldFlip?: boolean;
  /** The least distance in pixels between the preview and the edge of the viewport. Must not be negative. */
  containerPadding?: number;
  /** Reports the preview opening or closing. */
  onOpenChange?: (open: boolean) => void;
};

export type PreviewTriggerProps = PreviewTriggerOwnProps & { children: ReactNode; className?: string } & OverlayAccessibleName;

/** RAC PreviewTrigger owns long press, warmup/cooldown timers, focus, Escape, and safe-area positioning. */
export const PreviewTrigger: ForwardRefExoticComponent<PreviewTriggerProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, PreviewTriggerProps>(function PreviewTrigger({
  children,
  trigger,
  delay = 600,
  closeDelay = 200,
  open,
  defaultOpen = false,
  disabled = false,
  onOpenChange,
  placement = PREVIEW_GEOMETRY.placement,
  offset = PREVIEW_GEOMETRY.offset,
  crossOffset = PREVIEW_GEOMETRY.crossOffset,
  shouldFlip = PREVIEW_GEOMETRY.shouldFlip,
  containerPadding = PREVIEW_GEOMETRY.containerPadding,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  ...props
}, ref) {
  if (!React.isValidElement(trigger)) throw new Error('PreviewTrigger requires a focusable React element as trigger');
  if (!hasAccessibleName(ariaLabel) && !hasAccessibleName(ariaLabelledby)) throw new Error('PreviewTrigger requires an accessible name');
  const normalizedDelay = normalizeNonNegativeFinite(delay, 600, 'PreviewTrigger delay');
  const normalizedCloseDelay = normalizeNonNegativeFinite(closeDelay, 200, 'PreviewTrigger closeDelay');
  const geometry = overlayGeometry({ placement, offset, crossOffset, shouldFlip, containerPadding }, PREVIEW_GEOMETRY, 'PreviewTrigger');
  const adapter = useDisabledTimedOverlay({ disabled, open, defaultOpen, onOpenChange });
  const normalizedTrigger = overlayTrigger(trigger, { disabled, className: undefined, markPending: adapter.markPending, clearPending: adapter.clearPending });
  return React.createElement(AriaPreviewTrigger, {
    delay: normalizedDelay,
    closeDelay: normalizedCloseDelay,
    isOpen: adapter.isOpen,
    onOpenChange: adapter.handleOpenChange,
    children: CHILDREN_FOLLOW,
  },
  pressableTrigger(normalizedTrigger),
  React.createElement(AriaPopover, {
    ...props,
    ref,
    isNonModal: true,
    trigger: 'PreviewTrigger',
    placement: geometry.placement,
    offset: geometry.offset,
    crossOffset: geometry.crossOffset,
    shouldFlip: geometry.shouldFlip,
    containerPadding: geometry.containerPadding,
    className: classNames('muxui-preview-trigger', className),
    // RAC names its own role="dialog" popover without auto-focusing it, so
    // focus stays on the trigger until Tab moves into the preview.
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  }, React.createElement('div', { className: 'muxui-preview-content' }, children)));
});

PreviewTrigger.displayName = 'PreviewTrigger';

const TooltipMotion = React.forwardRef<HTMLDivElement, AriaTooltipProps>(function TooltipMotion({ children, triggerRef: requestedTriggerRef, ...props }, ref) {
  const triggerContext = React.useContext(AriaTooltipContext);
  const contextTriggerRef = triggerContext && 'triggerRef' in triggerContext ? triggerContext.triggerRef : undefined;
  const triggerRef = requestedTriggerRef ?? contextTriggerRef;
  const reducedMotionTriggerRef = contextTriggerRef ?? triggerRef;
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const setRef = React.useMemo(() => mergeRefs<HTMLDivElement>(setNode, ref), [ref]);

  useIsomorphicLayoutEffect(() => {
    if (!node || node.nodeType !== 1 || !node.isConnected) return undefined;
    const settle = (reduced: boolean) => {
      node.toggleAttribute('data-muxui-motion-reduced', reduced);
      if (reduced && typeof node.getAnimations === 'function') {
        node.getAnimations().forEach((animation) => animation.cancel());
      }
    };
    const disconnect = observeReducedMotion(node, reducedMotionTriggerRef?.current, settle);
    return () => {
      disconnect();
      node.removeAttribute('data-muxui-motion-reduced');
    };
  }, [node, reducedMotionTriggerRef]);

  return React.createElement(AriaTooltip, {
    ...props,
    ref: setRef,
    triggerRef,
    children,
  });
});

/**
 * The props Mux UI defines for Tooltip; the catalog's web.react API is derived from this
 * type (Decision 0031). The tooltip describes its trigger and does not name it.
 * It is a type literal, not an interface, so the public props type stays assignable to
 * Record<string, unknown>, as it was before the move.
 */
export type TooltipOwnProps = {
  /** What the tooltip says. It is required, and a blank string does not count. */
  content: Exclude<ReactNode, null | undefined | boolean>;
  /** The focusable element the tooltip describes. */
  trigger: ReactElement;
  /** How long a hover waits before the tooltip opens, in milliseconds. Keyboard focus opens it at once. */
  delay?: number;
  /** How long the tooltip stays open after the pointer leaves, in milliseconds. */
  closeDelay?: number;
  /** Where the tooltip opens against its trigger or anchorRef. start and end follow the locale direction. */
  placement?: MuxUIPlacement;
  /** The distance in pixels between the tooltip and its trigger, along the placement's side. */
  offset?: number;
  /** The shift in pixels along the side the tooltip is placed against. */
  crossOffset?: number;
  /** Whether the tooltip moves to the opposite side when the placed side has no room. */
  shouldFlip?: boolean;
  /** The least distance in pixels between the tooltip and the edge of the viewport. Must not be negative. */
  containerPadding?: number;
  /** Whether the tooltip is open, when the caller controls it. */
  open?: boolean;
  /** Whether the tooltip starts open, when it controls itself. */
  defaultOpen?: boolean;
  /** Disables the tooltip: it does not open, and an open one closes. The trigger stays operable. */
  disabled?: boolean;
  /** Reports the tooltip opening or closing. */
  onOpenChange?: (open: boolean) => void;
};

export type TooltipProps = TooltipOwnProps & { className?: string; anchorRef?: RefObject<Element | null> };

/** RAC TooltipTrigger owns global hover/focus timing and keyboard modality semantics. */
export const Tooltip: ForwardRefExoticComponent<TooltipProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, TooltipProps>(function Tooltip({
  content,
  trigger,
  delay = 500,
  closeDelay = 0,
  placement = TOOLTIP_GEOMETRY.placement,
  offset = TOOLTIP_GEOMETRY.offset,
  crossOffset = TOOLTIP_GEOMETRY.crossOffset,
  shouldFlip = TOOLTIP_GEOMETRY.shouldFlip,
  containerPadding = TOOLTIP_GEOMETRY.containerPadding,
  anchorRef,
  open,
  defaultOpen = false,
  disabled = false,
  onOpenChange,
  className,
  ...props
}, ref) {
  if (!React.isValidElement(trigger)) throw new Error('Tooltip requires a focusable React element as trigger');
  if (!hasRenderableLabel(content)) throw new Error('Tooltip requires content');
  const normalizedDelay = normalizeNonNegativeFinite(delay, 500, 'Tooltip delay');
  const normalizedCloseDelay = normalizeNonNegativeFinite(closeDelay, 0, 'Tooltip closeDelay');
  const geometry = overlayGeometry({ placement, offset, crossOffset, shouldFlip, containerPadding }, TOOLTIP_GEOMETRY, 'Tooltip');
  const adapter = useDisabledTimedOverlay({ disabled, open, defaultOpen, onOpenChange });
  const normalizedTrigger = overlayTrigger(trigger, { disabled, className: undefined, markPending: adapter.markPending, clearPending: adapter.clearPending });
  return React.createElement(AriaTooltipTrigger, {
    delay: normalizedDelay,
    closeDelay: normalizedCloseDelay,
    isOpen: adapter.isOpen,
    onOpenChange: adapter.handleOpenChange,
    children: CHILDREN_FOLLOW,
  }, pressableTrigger(normalizedTrigger), React.createElement(TooltipMotion, {
    ...props,
    ref,
    triggerRef: anchorRef,
    placement: geometry.placement,
    offset: geometry.offset,
    crossOffset: geometry.crossOffset,
    shouldFlip: geometry.shouldFlip,
    containerPadding: geometry.containerPadding,
    className: classNames('muxui-tooltip', className),
  }, content));
});

Tooltip.displayName = 'Tooltip';

/** A toast's content, which a declarative Toast updates in place. */
interface ToastContent {
  message: ReactNode;
  title?: ReactNode;
  variant?: ToastOwnProps['variant'];
  className?: string;
}

// React Aria's timer keeps its pending timeout in a private field, and the queue's records carry a flag for an exit.
interface ToastRecord extends QueuedToast<ToastContent> {
  isExiting?: boolean;
}

const ToastContext = React.createContext<{
  manager: ToastManager;
  addDeclarative: (content: ToastContent, options: { duration: number; onDismiss?: () => void }) => string;
  dispose: (id: string, settle?: boolean) => void;
  refresh: () => void;
} | null>(null);
const TOAST_FALLBACK_TITLE = 'Notification';
const TOAST_PLACEMENTS = new Set(['top-start', 'top-end', 'bottom-start', 'bottom-end']);

function createAnimatedToastQueue(queue: UNSTABLE_ToastQueue<ToastContent>, closingKeys: Set<string>) {
  let baseSnapshot: ToastRecord[] = [...queue.visibleToasts];
  let snapshot = baseSnapshot;
  const retained = new Map<string, { record: ToastRecord; index: number; sequence: number }>();
  const skipRetention = new Set<string>();
  const listeners = new Set<() => void>();
  let suppressRetention = false;
  // Timers pause while the region is hovered or focused and while a toast
  // enters. Resume only a stopped timer once neither applies: RAC's Timer
  // starts a second, unpausable timeout if resumed while running.
  let regionPaused = false;
  const entryHolds = new Set<string>();
  const resumeTimer = (record: ToastRecord | undefined) => {
    if (record?.timer && Reflect.get(record.timer, 'timerId') == null && !regionPaused && !entryHolds.has(record.key)) record.timer.resume();
  };
  const visibleRecord = (key: string) => queue.visibleToasts.find((toast) => toast.key === key);
  const sameRecords = (first: ToastRecord[], second: ToastRecord[]) => first.length === second.length && first.every((record, index) => record === second[index]);
  const rebuild = () => {
    const nextSnapshot = [...baseSnapshot];
    [...retained.values()]
      .sort((first, second) => first.index - second.index || first.sequence - second.sequence)
      .forEach(({ record, index }) => {
        nextSnapshot.splice(Math.min(index, nextSnapshot.length), 0, record);
      });
    if (sameRecords(snapshot, nextSnapshot)) return;
    snapshot = nextSnapshot;
    listeners.forEach((listener) => listener());
  };
  const onQueueChange = () => {
    const nextBase: ToastRecord[] = [...queue.visibleToasts];
    const nextKeys = new Set(nextBase.map((toast) => toast.key));
    for (const [index, record] of baseSnapshot.entries()) {
      if (nextKeys.has(record.key)) continue;
      // A visible record can leave the base snapshot because a newer toast
      // displaced it into RAC's private queue. Retain only records whose
      // queue-owned onClose callback marked an actual dismissal.
      if (suppressRetention || skipRetention.delete(record.key) || !closingKeys.delete(record.key)) continue;
      retained.set(record.key, { record: { ...record, isExiting: true }, index, sequence: retained.size });
    }
    for (const key of nextKeys) retained.delete(key);
    baseSnapshot = nextBase;
    rebuild();
  };
  queue.subscribe(onQueueChange);
  const animatedQueue = {
    get visibleToasts() {
      return snapshot;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    add(content: ToastContent, options?: { timeout?: number; onClose?: () => void }) {
      return queue.add(content, options);
    },
    close(key: string) {
      if (retained.has(key)) return;
      const wasVisible = baseSnapshot.some((record) => record.key === key);
      queue.visibleToasts.find((toast) => toast.key === key)?.timer?.pause();
      queue.close(key);
      if (!wasVisible) closingKeys.delete(key);
    },
    commitClose(key: string) {
      if (!retained.delete(key)) return;
      rebuild();
    },
    dispose(key: string, settle = true) {
      if (settle) return animatedQueue.close(key);
      skipRetention.add(key);
      retained.delete(key);
      const wasVisible = baseSnapshot.some((record) => record.key === key);
      queue.close(key);
      skipRetention.delete(key);
      if (!wasVisible) closingKeys.delete(key);
      rebuild();
    },
    holdTimer(key: string) {
      entryHolds.add(key);
      visibleRecord(key)?.timer?.pause();
    },
    releaseTimer(key: string) {
      if (entryHolds.delete(key)) resumeTimer(visibleRecord(key));
    },
    pauseAll() {
      regionPaused = true;
      queue.pauseAll();
    },
    resumeAll() {
      regionPaused = false;
      queue.visibleToasts.forEach(resumeTimer);
    },
    clear() {
      suppressRetention = true;
      retained.clear();
      closingKeys.clear();
      queue.clear();
      suppressRetention = false;
      rebuild();
    },
  };
  return animatedQueue;
}

// Exiting toasts become inert, which drops focus to the body. Move focus out
// first: keyboard users go to the next (else previous) toast, pointer users
// and the last toast return to the element focused before the region.
function moveFocusFromExitingToast(node: HTMLElement, returnFocus: Element | null) {
  const active = node.ownerDocument.activeElement;
  if (!active || !node.contains(active)) return;
  const region = node.closest('.muxui-toast-region');
  const remaining = region ? [...region.querySelectorAll('.muxui-toast:not([data-muxui-toast-exiting])')] : [];
  const next = remaining.find((candidate) => node.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING) ?? remaining.at(-1);
  const target = getInteractionModality() !== 'pointer' && next ? next : returnFocus;
  if (target?.isConnected) (target as HTMLElement).focus({ preventScroll: true });
  else (active as HTMLElement).blur();
}

interface ToastViewProps {
  toast: ToastRecord;
  queue: ReturnType<typeof createAnimatedToastQueue>;
  placement: NonNullable<ToastProviderProps['placement']>;
  layoutVersion: number;
  onExitComplete: (key: string) => void;
  originRef: RefObject<Element | null>;
  returnFocusRef: RefObject<Element | null>;
}

function ToastView({ toast, queue, placement, layoutVersion, onExitComplete, originRef, returnFocusRef }: ToastViewProps) {
  const value = toast.content;
  const hasTitle = hasRenderableLabel(value.title);
  const nodeRef = React.useRef<HTMLElement | null>(null);
  const entryFinishedRef = React.useRef(false);
  const finishEntry = React.useCallback(() => {
    entryFinishedRef.current = true;
    queue.releaseTimer(toast.key);
  }, [queue, toast.key]);
  const lifecycleRef = useMotionLifecycle({
    isOpen: !toast.isExiting,
    placement: placement.startsWith('bottom') ? 'bottom' : 'top',
    triggerRef: originRef,
    property: 'transform',
    onEntryComplete: finishEntry,
    onExitComplete: () => onExitComplete(toast.key),
  });
  React.useEffect(() => {
    if (toast.isExiting || !toast.timer || entryFinishedRef.current) return undefined;
    queue.holdTimer(toast.key);
    return () => queue.releaseTimer(toast.key);
  }, [queue, toast.isExiting, toast.key, toast.timer]);
  useIsomorphicLayoutEffect(() => {
    if (toast.isExiting && nodeRef.current) moveFocusFromExitingToast(nodeRef.current, returnFocusRef.current);
  }, [toast.isExiting, returnFocusRef]);
  useMotionLayout(nodeRef, layoutVersion, originRef);
  const setRef = React.useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
    lifecycleRef(node);
  }, [lifecycleRef]);
  return React.createElement(AriaToast, { ref: setRef, toast, className: classNames('muxui-toast', value.className), ...{ 'data-variant': value.variant, 'data-muxui-toast-exiting': toast.isExiting || undefined, 'aria-hidden': toast.isExiting || undefined, inert: toast.isExiting || undefined } },
    React.createElement(AriaToastContent, { className: 'muxui-toast-content' },
      React.createElement(AriaText, { slot: 'title', className: classNames('muxui-toast-title', hasTitle ? undefined : 'muxui-toast-title-fallback') }, hasTitle ? value.title : TOAST_FALLBACK_TITLE),
      React.createElement(AriaText, { slot: 'description', className: 'muxui-toast-message' }, value.message)),
    React.createElement(IconButton, { slot: 'close', size: 'sm', className: 'muxui-toast-dismiss', 'aria-label': 'Dismiss notification' }, React.createElement(XIcon, { 'aria-hidden': 'true', focusable: 'false', size: 16 })));
}

/** What a notification added through the manager can say and do. */
export interface ToastOptions {
  title?: ReactNode;
  variant?: 'neutral' | 'success' | 'warning' | 'danger';
  duration?: number;
  onDismiss?: () => void;
  className?: string;
}

/** What useToast returns: add a notification, and close one by the key add returned. */
export interface ToastManager {
  add: (message: Exclude<ReactNode, null | undefined | boolean>, options?: ToastOptions) => string;
  remove: (key: string) => void;
}

export interface ToastProviderProps {
  children?: ReactNode;
  maxVisible?: number;
  placement?: 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end';
  className?: string;
}

/** Stable MuxUI facade over RAC's unstable queue/region implementation. */
export const ToastProvider: FC<ToastProviderProps> = function ToastProvider({ children, maxVisible = 5, className, placement = 'top-end' }) {
  if (!TOAST_PLACEMENTS.has(placement)) throw new TypeError('Toast placement must be one of top-start, top-end, bottom-start, or bottom-end');
  const queueRef = React.useRef<UNSTABLE_ToastQueue<ToastContent> | null>(null);
  if (!queueRef.current) queueRef.current = new UNSTABLE_ToastQueue({ maxVisibleToasts: normalizeMaxVisible(maxVisible) });
  const queue = queueRef.current;
  const closingKeysRef = React.useRef<Set<string> | null>(null);
  if (!closingKeysRef.current) closingKeysRef.current = new Set();
  const closingKeys = closingKeysRef.current;
  const animatedQueueRef = React.useRef<ReturnType<typeof createAnimatedToastQueue> | null>(null);
  if (!animatedQueueRef.current) animatedQueueRef.current = createAnimatedToastQueue(queue, closingKeys);
  const animatedQueue = animatedQueueRef.current;
  const motionOriginRef = React.useRef<HTMLSpanElement>(null);
  const [layoutVersion, setLayoutVersion] = React.useState(0);
  React.useEffect(() => animatedQueue.subscribe(() => setLayoutVersion((version) => version + 1)), [animatedQueue]);
  // The element focused before focus entered the region, for focus restoration.
  const returnFocusRef = React.useRef<Element | null>(null);
  const trackRegionFocus = React.useCallback((node: HTMLDivElement | null) => {
    node?.addEventListener('focusin', (event) => {
      if (!node.contains(event.relatedTarget as Node | null)) returnFocusRef.current = event.relatedTarget as Element | null;
    });
  }, []);
  const callbacksRef = React.useRef(new Map<string, (() => void) | undefined>());
  const activeRef = React.useRef(true);
  const teardownRequestedRef = React.useRef(false);
  const notifyDismissed = React.useCallback((key: string) => {
    if (!activeRef.current || teardownRequestedRef.current) return;
    if (!callbacksRef.current.has(key)) return;
    const callback = callbacksRef.current.get(key);
    callbacksRef.current.delete(key);
    callback?.();
  }, []);
  const enqueue = React.useCallback((content: ToastContent, { duration, onDismiss }: { duration: number; onDismiss?: () => void }, allowDuringTeardown: boolean) => {
    if (!activeRef.current || (teardownRequestedRef.current && !allowDuringTeardown)) return '';
    let key: string;
    key = animatedQueue.add(content, {
      timeout: duration,
      onClose: () => {
        closingKeys.add(key);
        notifyDismissed(key);
      },
    });
    callbacksRef.current.set(key, onDismiss);
    return key;
  }, [animatedQueue, notifyDismissed]);
  const add = React.useCallback((message: ToastContent['message'], options: ToastOptions = {}) => {
    if (!hasRenderableLabel(message)) throw new Error('Toast requires a message');
    const { duration, onDismiss, ...content } = options;
    return enqueue({ ...content, message }, { duration: normalizeToastDuration(duration), onDismiss }, false);
  }, [enqueue]);
  const remove = React.useCallback((id: string) => {
    if (!activeRef.current || teardownRequestedRef.current) return;
    animatedQueue.close(id);
  }, [animatedQueue]);
  const dispose = React.useCallback((id: string, settle = true) => {
    if (!activeRef.current || teardownRequestedRef.current) return;
    animatedQueue.visibleToasts.find((toast) => toast.key === id)?.timer?.pause();
    if (!settle) callbacksRef.current.delete(id);
    animatedQueue.dispose(id, settle);
  }, [animatedQueue]);
  // Declarative Toasts own a mutable content record; refresh re-renders it in place.
  const addDeclarative = React.useCallback((content: ToastContent, options: { duration: number; onDismiss?: () => void }) => enqueue(content, options, true), [enqueue]);
  const refresh = React.useCallback(() => setLayoutVersion((version) => version + 1), []);
  const lifecycleRef = React.useRef(0);
  React.useEffect(() => {
    activeRef.current = true;
    teardownRequestedRef.current = false;
    const generation = ++lifecycleRef.current;
    return () => {
      teardownRequestedRef.current = true;
      queueMicrotask(() => {
        if (lifecycleRef.current !== generation) return;
        activeRef.current = false;
        animatedQueue.pauseAll();
        animatedQueue.clear();
        callbacksRef.current.clear();
      });
    };
  }, [queue]);
  const manager = React.useMemo(() => ({ add, remove }), [add, remove]);
  const value = React.useMemo(() => ({ manager, addDeclarative, dispose, refresh }), [addDeclarative, dispose, manager, refresh]);
  return React.createElement(ToastContext.Provider, { value }, children,
    React.createElement('span', { ref: motionOriginRef, hidden: true, 'aria-hidden': 'true' }),
    // The region reads the queue only through its subscribe, visibleToasts, add, close, pauseAll, resumeAll, and clear;
    // React Aria types it as the ToastQueue class, whose private members no other object has.
    React.createElement(UNSTABLE_ToastRegion<ToastContent>, { ref: trackRegionFocus, queue: animatedQueue as unknown as UNSTABLE_ToastQueue<ToastContent>, className: classNames('muxui-toast-region', className), 'aria-label': 'Notifications', ...{ placement, 'data-placement': placement },
      children: ({ toast }) => React.createElement(ToastView, { toast, queue: animatedQueue, placement, layoutVersion, originRef: motionOriginRef, returnFocusRef, onExitComplete: animatedQueue.commitClose }) }));
};

export function useToast(): ToastManager {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context.manager;
}

/**
 * The props Mux UI defines for Toast; the catalog's web.react API is derived from this
 * interface (Decision 0031). A Toast renders nothing where it is mounted: it enqueues one
 * notification in the nearest ToastProvider.
 */
export interface ToastOwnProps {
  /** What the notification says, in one short sentence. It is required, and a blank string does not count. */
  message: Exclude<ReactNode, null | undefined | boolean>;
  /** Says what the message is about. Without one, the notification shows Notification. */
  title?: ReactNode;
  /** How the notification looks, by what happened. It does not change how long the notification stays. */
  variant?: 'neutral' | 'success' | 'warning' | 'danger';
  /** How long the notification stays, in milliseconds. 0 keeps it until it is dismissed or removed. Must be finite, not negative, and at most 2147483647. Changing it replaces the notification with a new one. */
  duration?: number;
  /** Reports the notification being dismissed, by a person or a timeout, at most once. An unmount does not call it. */
  onDismiss?: () => void;
}

export interface ToastProps extends ToastOwnProps {
  className?: string;
}

export const Toast: FC<ToastProps> = function Toast({
  message,
  title,
  variant = 'neutral',
  duration = TOAST_DURATION,
  onDismiss,
  className,
}) {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error('Toast must be used within ToastProvider');
  if (!hasRenderableLabel(message)) throw new Error('Toast requires a message');
  const normalizedDuration = normalizeToastDuration(duration);
  const { addDeclarative, dispose, refresh } = context;
  const contentRef = React.useRef<ToastContent | null>(null);
  const onDismissRef = React.useRef(onDismiss);
  // Enqueue once; later renders update the same record in place, so inline
  // callbacks or JSX never re-announce the toast or reset its timer.
  useIsomorphicLayoutEffect(() => {
    onDismissRef.current = onDismiss;
    const content = contentRef.current;
    if (!content) {
      contentRef.current = { message, title, variant, className };
      return;
    }
    if (content.message === message && content.title === title && content.variant === variant && content.className === className) return;
    Object.assign(content, { message, title, variant, className });
    refresh();
  });
  React.useEffect(() => {
    let dismissed = false;
    const content = contentRef.current;
    // The layout effect above has always filled the record by now.
    if (!content) return undefined;
    const key = addDeclarative(content, {
      duration: normalizedDuration,
      onDismiss: () => {
        dismissed = true;
        onDismissRef.current?.();
      },
    });
    return () => queueMicrotask(() => {
      // An accepted dismissal keeps its exit animation, even if onDismiss
      // unmounts this Toast. Other declarative teardown is silent.
      if (!dismissed) dispose(key, false);
    });
  }, [addDeclarative, dispose, normalizedDuration]);
  return null;
};
