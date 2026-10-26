import React from 'react';
import type { ButtonHTMLAttributes, ForwardRefExoticComponent, HTMLAttributes, ReactElement, ReactNode, RefAttributes } from 'react';
import { Dialog as AriaDialog, DialogTrigger as AriaDialogTrigger, Heading as AriaHeading, Text as AriaText } from 'react-aria-components';
import { AriaButton } from '../substrate.ts';
import type { ButtonProps as AriaButtonProps, DialogProps as AriaDialogProps, DialogTriggerProps as AriaDialogTriggerProps } from 'react-aria-components';
import XIcon from 'lucide-react/dist/esm/icons/x.mjs';
import { Button as MuxUIButton } from '../button.ts';
import { IconButton } from './icon-button.ts';
import { h, cx, nativePart, pressHandler } from './part-utils.ts';
import type { PartProps, SupplementalActivation } from './part-utils.ts';
import { MotionModalBackdropForwardRef, MotionModalPopupForwardRef } from './modal-parts.ts';

/**
 * The props Mux UI defines for AlertDialog.Root, the compound's root; the catalog's web.react API is derived from
 * this type (Decision 0031). Trigger and Close own the props below; the other parts take native attributes.
 */
type AlertDialogOwnProps = {
  /** Whether the dialog is open, when the caller controls it. */
  open?: boolean;
  /** Whether the dialog starts open, when it controls itself. */
  defaultOpen?: boolean;
  /** Called with the new open state each time the dialog opens or closes. */
  onOpenChange?: (open: boolean) => void;
};

/** The props Mux UI defines for AlertDialog.Trigger; its API is the trigger entry in the catalog's partApis. */
type AlertDialogTriggerOwnProps = {
  /** Marks the trigger disabled. */
  disabled?: boolean;
  /** Called when the trigger is pressed, which opens the dialog. */
  onActivate?: (event: SupplementalActivation) => void;
};

/** The props Mux UI defines for AlertDialog.Close; its API is the close entry in the catalog's partApis. */
type AlertDialogCloseOwnProps = {
  /** Marks the close control disabled. */
  disabled?: boolean;
  /** Called when the control is pressed, which closes the dialog. */
  onActivate?: (event: SupplementalActivation) => void;
};

export type AlertDialogRootProps = AlertDialogOwnProps & { children?: ReactNode };
export type AlertDialogActionsProps = PartProps<HTMLDivElement>;
export type AlertDialogTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & { className?: string } & AlertDialogTriggerOwnProps;
export type AlertDialogCloseProps = ButtonHTMLAttributes<HTMLButtonElement> & { className?: string } & AlertDialogCloseOwnProps;

/* AlertDialog */
const AlertDialogDescription = /*#__PURE__*/ React.forwardRef<HTMLParagraphElement, PartProps<HTMLParagraphElement>>(function AlertDialogDescription({ className, ...props }, ref) {
  return h(AriaText, { ...props, ref, slot: 'description', elementType: 'p', className: cx('muxui-alert-dialog__description', className) });
});

function findAlertDialogDescriptionId(children: ReactNode): string | undefined {
  let descriptionId: string | undefined;
  React.Children.forEach(children, (child) => {
    if (descriptionId || !React.isValidElement<{ id?: unknown; children?: ReactNode }>(child)) return;
    if (child.type === AlertDialogDescription) {
      if (typeof child.props.id === 'string' && child.props.id) descriptionId = child.props.id;
      return;
    }
    descriptionId = findAlertDialogDescriptionId(child.props.children);
  });
  return descriptionId;
}

const AlertDialogRoot = /*#__PURE__*/ React.forwardRef<HTMLElement, AlertDialogRootProps>(function AlertDialogRoot({ open, defaultOpen = false, onOpenChange, children, ...props }, ref) {
  // React Aria's props type has no ref, which the root has always passed along with the rest.
  return h(AriaDialogTrigger, { ...props, ref, isOpen: open, defaultOpen, onOpenChange } as AriaDialogTriggerProps & RefAttributes<HTMLElement>, children);
});
const AlertDialogBackdrop = /*#__PURE__*/ React.forwardRef<HTMLDivElement, PartProps<HTMLDivElement>>(function AlertDialogBackdrop({ className, ...props }, ref) {
  return h(MotionModalBackdropForwardRef, { ...props, ref, className: cx('muxui-alert-dialog__backdrop', className) });
});
const AlertDialogPopup = /*#__PURE__*/ React.forwardRef<HTMLDivElement, PartProps<HTMLDivElement>>(function AlertDialogPopup({ className, ...props }, ref) {
  return h(MotionModalPopupForwardRef, { ...props, ref, className: cx('muxui-alert-dialog__popup', className) });
});
const AlertDialogContent = /*#__PURE__*/ React.forwardRef<HTMLElement, PartProps<HTMLElement>>(function AlertDialogContent({ className, children, 'aria-describedby': ariaDescribedby, ...props }, ref) {
  // Keep RAC's description slot lifecycle, then add caller-owned context IDs.
  return h(AriaDialog, { ...(props as AriaDialogProps), ref, role: 'alertdialog', 'aria-describedby': findAlertDialogDescriptionId(children),
    className: cx('muxui-alert-dialog__content', className),
    render: (dialogProps) => h('section', { ...dialogProps,
      'aria-describedby': [...new Set([ariaDescribedby, dialogProps['aria-describedby']].filter(Boolean).join(' ').split(/\s+/u))].filter(Boolean).join(' ') || undefined,
    }),
  }, children);
});
const AlertDialogTitle = /*#__PURE__*/ React.forwardRef<HTMLHeadingElement, PartProps<HTMLHeadingElement>>(function AlertDialogTitle({ className, ...props }, ref) {
  return h(AriaHeading, { ...props, ref, slot: 'title', className: cx('muxui-alert-dialog__title', className) });
});
const AlertDialogTrigger = /*#__PURE__*/ React.forwardRef<HTMLButtonElement, AlertDialogTriggerProps>(function AlertDialogTrigger({ disabled = false, onActivate, className, ...props }, ref) {
  return h(AriaButton, { ...(props as AriaButtonProps), ref, isDisabled: disabled, onPress: pressHandler(onActivate), className: cx('muxui-alert-dialog__trigger', className) });
});
const AlertDialogActions = /*#__PURE__*/ React.forwardRef<HTMLDivElement, AlertDialogActionsProps>(function AlertDialogActions({ className, ...props }, ref) {
  return nativePart('div', 'muxui-alert-dialog__actions', props, ref);
});
const AlertDialogClose = /*#__PURE__*/ React.forwardRef<HTMLButtonElement, AlertDialogCloseProps>(function AlertDialogClose({ disabled, onActivate, className, children, ...props }, ref) {
  const usesDefaultIcon = children === null || children === undefined;
  const buttonProps = {
    ...props,
    ref,
    slot: 'close',
    disabled,
    size: usesDefaultIcon ? 'sm' as const : 'md' as const,
    variant: usesDefaultIcon ? 'ghost' as const : 'neutral' as const,
    onActivate,
    className: cx('muxui-alert-dialog__close', className),
  };
  return usesDefaultIcon
    ? h(IconButton, { ...buttonProps, 'aria-label': props['aria-label'] ?? 'Close' }, h(XIcon, { size: 16, 'aria-hidden': true, focusable: 'false' }))
    : h(MuxUIButton, buttonProps, children);
});

export const AlertDialog: {
  Root: ForwardRefExoticComponent<AlertDialogRootProps & RefAttributes<HTMLElement>>;
  Backdrop: ForwardRefExoticComponent<PartProps<HTMLDivElement> & RefAttributes<HTMLDivElement>>;
  Popup: ForwardRefExoticComponent<PartProps<HTMLDivElement> & RefAttributes<HTMLDivElement>>;
  Content: ForwardRefExoticComponent<PartProps<HTMLElement> & RefAttributes<HTMLElement>>;
  Title: ForwardRefExoticComponent<PartProps<HTMLHeadingElement> & RefAttributes<HTMLHeadingElement>>;
  Description: ForwardRefExoticComponent<PartProps<HTMLParagraphElement> & RefAttributes<HTMLParagraphElement>>;
  Trigger: ForwardRefExoticComponent<AlertDialogTriggerProps & RefAttributes<HTMLButtonElement>>;
  Actions: ForwardRefExoticComponent<AlertDialogActionsProps & RefAttributes<HTMLDivElement>>;
  Close: ForwardRefExoticComponent<AlertDialogCloseProps & RefAttributes<HTMLButtonElement>>;
} = /*#__PURE__*/ Object.freeze({
  Root: AlertDialogRoot,
  Backdrop: AlertDialogBackdrop,
  Popup: AlertDialogPopup,
  Content: AlertDialogContent,
  Title: AlertDialogTitle,
  Description: AlertDialogDescription,
  Trigger: AlertDialogTrigger,
  Actions: AlertDialogActions,
  Close: AlertDialogClose,
});
