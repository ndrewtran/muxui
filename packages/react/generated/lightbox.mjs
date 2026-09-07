// @generated-from: packages/react/src/supplemental/lightbox.mjs
// @generated-content-sha256: sha256:1d3976b9cdda04f475c0d86d5a501e6c0857f4c466fec61254632d7cca6854f7
import React from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from './button.mjs';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

const Context = React.createContext(null);
const stacks = new WeakMap();
const cx = (...values) => values.filter(Boolean).join(' ');
const validKey = (key) => typeof key === 'string' || (typeof key === 'number' && Number.isFinite(key));
const token = (key) => `${typeof key}:${typeof key === 'number' && Object.is(key, -0) ? 0 : String(key)}`;

function collection(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const result = [];
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

function direction(element) {
  try {
    if (element?.ownerDocument.defaultView?.getComputedStyle(element).direction === 'rtl') return 'rtl';
  } catch { /* use document direction below */ }
  return element?.ownerDocument.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';
}

function top(owner, document) {
  return stacks.get(document)?.at(-1) === owner;
}

/** A controlled or uncontrolled modal media viewer with finite Mux item keys. */
export function Lightbox({ items = [], renderContent, selectedKey, defaultSelectedKey, onSelectedChange, open, defaultOpen = false, onOpenChange, loop = false, swipeNavigation = true, children, className, ...props }) {
  const list = React.useMemo(() => collection(items), [items]);
  const initialKey = React.useMemo(() => {
    if (defaultSelectedKey !== undefined && defaultSelectedKey !== null && validKey(defaultSelectedKey)) {
      return list.find((item) => Object.is(item.key, defaultSelectedKey))?.key ?? list[0]?.key;
    }
    return defaultSelectedKey === null ? null : list[0]?.key;
  }, [defaultSelectedKey, list]);
  const [localOpen, setLocalOpen] = React.useState(() => Boolean(defaultOpen && initialKey !== undefined));
  const [localKey, setLocalKey] = React.useState(initialKey);
  const trigger = React.useRef(null);
  const owner = React.useRef({});
  const openReconciliationProposal = React.useRef(null);
  const selectionReconciliationProposal = React.useRef(null);
  const previousSelectedKey = React.useRef(selectedKey);
  const controlledOpen = open !== undefined;
  const controlledSelection = selectedKey !== undefined;
  const selected = list.find((item) => Object.is(item.key, controlledSelection ? selectedKey : localKey)) ?? null;
  const requestedOpen = controlledOpen ? open === true : localOpen;
  const visible = requestedOpen && Boolean(selected);

  React.useEffect(() => {
    if (controlledOpen && openReconciliationProposal.current === open) openReconciliationProposal.current = null;
    if (controlledSelection && !Object.is(previousSelectedKey.current, selectedKey)) {
      selectionReconciliationProposal.current = null;
      previousSelectedKey.current = selectedKey;
    }
  }, [controlledOpen, controlledSelection, open, selectedKey]);

  const setOpen = React.useCallback((next, reconcile = false) => {
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

  const setSelection = React.useCallback((next, allowNull = false) => {
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
    if (!visible || typeof document === 'undefined') return undefined;
    const stack = stacks.get(document) ?? [];
    stacks.set(document, stack);
    stack.push(owner.current);
    return () => {
      const index = stack.lastIndexOf(owner.current);
      if (index >= 0) stack.splice(index, 1);
      if (!stack.length) stacks.delete(document);
    };
  }, [visible]);

  const navigate = React.useCallback((delta) => {
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

  const value = React.useMemo(() => ({
    list, selected, visible, loop: Boolean(loop), swipeNavigation: swipeNavigation !== false,
    renderContent: typeof renderContent === 'function' ? renderContent : null,
    setTrigger: (node) => { trigger.current = node; },
    openItem: (next) => { if (setSelection(next)) setOpen(true); },
    close, navigate,
    top: () => typeof document !== 'undefined' && top(owner.current, document),
    popupLabel: selected?.label ?? 'Lightbox',
  }), [close, list, loop, navigate, renderContent, selected, setOpen, setSelection, swipeNavigation, visible]);

  return React.createElement(Context.Provider, { value }, React.createElement('div', { ...props, className: cx('muxui-lightbox', className) }, children));
}

export const LightboxTrigger = React.forwardRef(function LightboxTrigger({
  itemKey,
  children,
  disabled = false,
  onActivate,
  className,
  ...props
}, forwardedRef) {
  const value = React.useContext(Context);
  const ref = React.useRef(null);
  React.useImperativeHandle(forwardedRef, () => ref.current);
  const enabled = Boolean(value?.list.some((item) => Object.is(item.key, itemKey)));
  return React.createElement(Button, {
    ...props,
    ref,
    disabled: disabled || !enabled,
    className: cx('muxui-lightbox-trigger', className),
    onActivate: (event) => {
      onActivate?.(event);
      if (!disabled && enabled) { value.setTrigger(ref.current); value.openItem(itemKey); }
    },
  }, children);
});

export function LightboxBackdrop({ children, dismissable = true, className, ...props }) {
  const value = React.useContext(Context);
  if (!value?.visible) return null;
  return React.createElement(ModalOverlay, { ...props, isOpen: true, isDismissable: dismissable, className: cx('muxui-lightbox-backdrop', className), onOpenChange: (next) => { if (!next && value.top()) value.close(); } }, children);
}

export function LightboxPopup({ children, className, onKeyDown, onTouchStart, onTouchEnd, onTouchCancel, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, ...props }) {
  const value = React.useContext(Context);
  const touch = React.useRef(null);
  const localRef = React.useRef(null);
  React.useEffect(() => {
    const popup = localRef.current;
    if (!popup || !value?.visible) return undefined;
    const handleKeyDown = (event) => {
      onKeyDown?.(event);
      if (event.defaultPrevented || !value.top()) return;
      const rtl = direction(popup) === 'rtl';
      if (event.key === 'ArrowLeft') { event.preventDefault(); value.navigate(rtl ? 1 : -1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); value.navigate(rtl ? -1 : 1); }
    };
    const handleTouchStart = (event) => { onTouchStart?.(event); touch.current = event.touches[0]?.clientX ?? null; };
    const handleTouchEnd = (event) => {
      onTouchEnd?.(event);
      const start = touch.current; touch.current = null;
      const delta = start === null ? 0 : (event.changedTouches[0]?.clientX ?? start) - start;
      if (value.swipeNavigation && value.top() && Math.abs(delta) >= 40) {
        const rtl = direction(popup) === 'rtl';
        value.navigate(rtl ? (delta < 0 ? -1 : 1) : (delta < 0 ? 1 : -1));
      }
    };
    const handleTouchCancel = (event) => { onTouchCancel?.(event); touch.current = null; };
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
  if (!value?.visible) return null;
  return React.createElement(Modal, null,
    React.createElement(Dialog, {
      ...props,
      ref: localRef,
      className: cx('muxui-dialog', 'muxui-lightbox-popup', className),
      'aria-label': ariaLabel ?? (ariaLabelledBy ? undefined : value.popupLabel),
      'aria-labelledby': ariaLabelledBy,
    }, children),
  );
}

export function LightboxContent({ renderContent, children, className, ...props }) {
  const value = React.useContext(Context);
  if (!value?.visible) return null;
  const context = value.selected ? { key: value.selected.key, index: value.list.indexOf(value.selected), count: value.list.length } : null;
  const body = typeof renderContent === 'function' && value.selected && context
    ? renderContent({ item: value.selected, ...context })
    : typeof value.renderContent === 'function' && value.selected && context
      ? value.renderContent(value.selected, context)
      : children;
  return React.createElement('div', { ...props, className: cx('muxui-lightbox-content', className) }, body);
}

export const LightboxCaption = React.forwardRef(function LightboxCaption({ className, children, ...props }, ref) {
  const value = React.useContext(Context);
  return React.createElement('p', { ...props, ref, className: cx('muxui-lightbox-caption', className) }, children === undefined ? value?.selected?.label : children);
});

function NavButton({ direction: delta, children, disabled = false, onActivate, className, ...props }) {
  const value = React.useContext(Context);
  const index = value?.selected ? value.list.indexOf(value.selected) : -1;
  const unavailable = !value || !value.visible || (!value.loop && (delta < 0 ? index <= 0 : index >= value.list.length - 1));
  return React.createElement(Button, {
    ...props,
    disabled: disabled || unavailable,
    variant: 'ghost',
    className: cx(delta < 0 ? 'muxui-lightbox-previous' : 'muxui-lightbox-next', className),
    'aria-label': props['aria-label'] ?? (delta < 0 ? 'Previous' : 'Next'),
    onActivate: (event) => { onActivate?.(event); value?.navigate(delta); },
  }, children ?? React.createElement(delta < 0 ? ChevronLeft : ChevronRight, { size: 24, 'aria-hidden': 'true', focusable: 'false' }));
}
export function LightboxPrevious(props) { return React.createElement(NavButton, { ...props, direction: -1 }); }
export function LightboxNext(props) { return React.createElement(NavButton, { ...props, direction: 1 }); }
export function LightboxClose({ onActivate, className, children, ...props }) {
  const value = React.useContext(Context);
  return React.createElement(Button, {
    ...props,
    size: 'sm',
    variant: 'ghost',
    className: cx('muxui-dialog-close', 'muxui-lightbox-close', className),
    'aria-label': props['aria-label'] ?? 'Close',
    disabled: props.disabled || !value?.visible,
    onActivate: (event) => { onActivate?.(event); value?.close(); },
  }, children ?? React.createElement(X, { size: 16, 'aria-hidden': 'true', focusable: 'false' }));
}
