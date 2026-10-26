import React from 'react';
import type { Dispatch, ForwardRefExoticComponent, ForwardedRef, HTMLAttributes, InputHTMLAttributes, RefAttributes, SetStateAction } from 'react';
import { Label as AriaLabel } from 'react-aria-components';
import { AriaInput } from '../substrate.ts';
import type { InputProps as AriaInputProps } from 'react-aria-components';
import { h, cx } from './part-utils.ts';
import type { PartProps } from './part-utils.ts';
import { fieldText } from './field-utils.ts';
import { InputAssociationContext, renderFieldRoot } from './field-root.ts';

/**
 * The props Mux UI defines for Input.Root, the compound's root; the catalog's web.react API is
 * derived from this type (Decision 0031). The members every field shares are written out, because
 * the catalog's grammar reads only the members a type lists itself. The input's native attributes,
 * such as type and placeholder, belong to Input.Input.
 */
type InputOwnProps = {
  /** The text, when the caller controls it. */
  value?: string;
  /** The starting text, when the field controls itself. */
  defaultValue?: string;
  /** Called with the new text each time it changes. */
  onChange?: (value: string) => void;
  /** Marks the field disabled. */
  disabled?: boolean;
  /** Marks the field invalid. */
  invalid?: boolean;
  /** Marks the field required. */
  required?: boolean;
  /** Marks the field read-only. */
  readOnly?: boolean;
  /** The field's size. */
  size?: 'sm' | 'md' | 'lg';
};

export type InputRootProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue'> & InputOwnProps;
export type InputControlProps = InputHTMLAttributes<HTMLInputElement>;
export type InputProps = InputControlProps;
export type InputLabelProps = PartProps<HTMLLabelElement>;
export type InputDescriptionProps = PartProps<HTMLElement>;
export type InputErrorProps = PartProps<HTMLElement>;

function associatedFieldText(slot: string, className: string, props: PartProps<HTMLElement>, ref: ForwardedRef<HTMLElement>, register: Dispatch<SetStateAction<string | undefined>> | undefined) {
  const association = React.useContext(InputAssociationContext);
  const nodeRef = React.useRef<HTMLElement | null>(null);
  const setRef = React.useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
    register?.(node?.id);
  }, [ref, register]);
  React.useLayoutEffect(() => {
    register?.(nodeRef.current?.id);
  }, [props.id, register]);
  React.useEffect(() => {
    return () => register?.(undefined);
  }, [register]);
  return fieldText(slot, className, props, setRef);
}

const InputRoot = /*#__PURE__*/ React.forwardRef<HTMLDivElement, InputRootProps>(function InputRoot({ value, defaultValue, onChange, disabled, invalid, required, readOnly, size = 'md', className, children, ...props }, ref) {
  return renderFieldRoot('muxui-input__root', 'Input', { disabled, invalid, required, readOnly, size, className, children, value, defaultValue, onChange, ...props }, ref);
});
const InputInput = /*#__PURE__*/ React.forwardRef<HTMLInputElement, InputControlProps>(function InputInput({ disabled, className, 'aria-describedby': ariaDescribedby, ...props }, ref) {
  const association = React.useContext(InputAssociationContext);
  const visualSize = association?.size ?? 'md';
  const describedby = [ariaDescribedby, association?.descriptionId, association?.errorId]
    .filter(Boolean)
    .join(' ') || undefined;
  const inputProps: AriaInputProps & RefAttributes<HTMLInputElement> = { ...(props as AriaInputProps), ref, disabled, className: cx('muxui-input', visualSize !== 'md' && `muxui-input--${visualSize}`, className) };
  if (describedby !== undefined) inputProps['aria-describedby'] = describedby;
  return h(AriaInput, inputProps);
});
const InputLabel = /*#__PURE__*/ React.forwardRef<HTMLLabelElement, InputLabelProps>(function InputLabel(props, ref) { return h(AriaLabel, { ...props, ref, className: cx('muxui-input__label', props.className) }); });
const InputDescription = /*#__PURE__*/ React.forwardRef<HTMLElement, InputDescriptionProps>(function InputDescription(props, ref) {
  const association = React.useContext(InputAssociationContext);
  return associatedFieldText('description', 'muxui-input__description', props, ref, association?.setDescriptionId);
});
const InputError = /*#__PURE__*/ React.forwardRef<HTMLElement, InputErrorProps>(function InputError(props, ref) {
  const association = React.useContext(InputAssociationContext);
  return associatedFieldText('errorMessage', 'muxui-input__error', props, ref, association?.setErrorId);
});

export const Input: {
  Root: ForwardRefExoticComponent<InputRootProps & RefAttributes<HTMLDivElement>>;
  Input: ForwardRefExoticComponent<InputControlProps & RefAttributes<HTMLInputElement>>;
  Label: ForwardRefExoticComponent<InputLabelProps & RefAttributes<HTMLLabelElement>>;
  Description: ForwardRefExoticComponent<InputDescriptionProps & RefAttributes<HTMLElement>>;
  Error: ForwardRefExoticComponent<InputErrorProps & RefAttributes<HTMLElement>>;
} = /*#__PURE__*/ Object.freeze({
  Root: InputRoot,
  Input: InputInput,
  Label: InputLabel,
  Description: InputDescription,
  Error: InputError,
});
