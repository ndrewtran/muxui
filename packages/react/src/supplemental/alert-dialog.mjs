import React from 'react';
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Heading as AriaHeading,
  Text as AriaText,
} from 'react-aria-components';
import XIcon from 'lucide-react/dist/esm/icons/x.mjs';
import { Button as MuxUIButton } from '../button.ts';
import { IconButton } from './icon-button.ts';
import { h, cx, nativePart, pressHandler } from './part-utils.mjs';
import { MotionModalBackdropForwardRef, MotionModalPopupForwardRef } from './modal-parts.mjs';

function AlertDialogRoot({ open, defaultOpen = false, onOpenChange, children, ...props }) {
  return h(AriaDialogTrigger, {
    ...props,
    isOpen: open,
    defaultOpen,
    onOpenChange,
  }, children);
}

const AlertDialogDescription = React.forwardRef(function AlertDialogDescription({ className, ...props }, ref) {
  return h(AriaText, { ...props, ref, slot: 'description', elementType: 'p', className: cx('muxui-alert-dialog__description', className) });
});

function findAlertDialogDescriptionId(children) {
  let descriptionId;
  React.Children.forEach(children, (child) => {
    if (descriptionId || !React.isValidElement(child)) return;
    if (child.type === AlertDialogDescription) {
      if (typeof child.props.id === 'string' && child.props.id) descriptionId = child.props.id;
      return;
    }
    descriptionId = findAlertDialogDescriptionId(child.props.children);
  });
  return descriptionId;
}

export const AlertDialog = /*#__PURE__*/ (() => ({
  Root: React.forwardRef(function AlertDialogRootRef(props, ref) {
    return h(AlertDialogRoot, { ...props, ref });
  }),
  Backdrop: React.forwardRef(function AlertDialogBackdrop({ className, ...props }, ref) {
    return h(MotionModalBackdropForwardRef, { ...props, ref, className: cx('muxui-alert-dialog__backdrop', className) });
  }),
  Popup: React.forwardRef(function AlertDialogPopup({ className, ...props }, ref) {
    return h(MotionModalPopupForwardRef, { ...props, ref, className: cx('muxui-alert-dialog__popup', className) });
  }),
  Content: React.forwardRef(function AlertDialogContent({ className, children, 'aria-describedby': ariaDescribedby, ...props }, ref) {
    // Keep RAC's description slot lifecycle, then add caller-owned context IDs.
    return h(AriaDialog, { ...props, ref, role: 'alertdialog', 'aria-describedby': findAlertDialogDescriptionId(children),
      className: cx('muxui-alert-dialog__content', className),
      render: (dialogProps) => h('section', { ...dialogProps,
        'aria-describedby': [...new Set([ariaDescribedby, dialogProps['aria-describedby']].filter(Boolean).join(' ').split(/\s+/u))].filter(Boolean).join(' ') || undefined,
      }),
    }, children);
  }),
  Title: React.forwardRef(function AlertDialogTitle({ className, ...props }, ref) {
    return h(AriaHeading, { ...props, ref, slot: 'title', className: cx('muxui-alert-dialog__title', className) });
  }),
  Description: AlertDialogDescription,
  Trigger: React.forwardRef(function AlertDialogTrigger({ disabled = false, onActivate, className, ...props }, ref) {
    return h(AriaButton, { ...props, ref, isDisabled: disabled, onPress: pressHandler(onActivate), className: cx('muxui-alert-dialog__trigger', className) });
  }),
  Actions: React.forwardRef(function AlertDialogActions({ className, ...props }, ref) {
    return nativePart('div', 'muxui-alert-dialog__actions', props, ref);
  }),
  Close: React.forwardRef(function AlertDialogClose({ disabled, onActivate, className, children, ...props }, ref) {
    const usesDefaultIcon = children === null || children === undefined;
    const buttonProps = {
      ...props,
      ref,
      slot: 'close',
      disabled,
      size: usesDefaultIcon ? 'sm' : 'md',
      variant: usesDefaultIcon ? 'ghost' : 'neutral',
      onActivate,
      className: cx('muxui-alert-dialog__close', className),
    };
    return usesDefaultIcon
      ? h(IconButton, { ...buttonProps, 'aria-label': props['aria-label'] ?? 'Close' }, h(XIcon, { size: 16, 'aria-hidden': true, focusable: 'false' }))
      : h(MuxUIButton, buttonProps, children);
  }),
}))();
