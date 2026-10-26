import React from 'react';
import type { ForwardRefExoticComponent, HTMLAttributes, RefAttributes, TextareaHTMLAttributes } from 'react';
import { FieldError as AriaFieldError, Label as AriaLabel } from 'react-aria-components';
import { AriaTextArea } from '../substrate.ts';
import type { TextAreaProps as AriaTextAreaProps } from 'react-aria-components';
import { h, cx } from './part-utils.ts';
import type { PartProps } from './part-utils.ts';
import { fieldText } from './field-utils.ts';
import { renderFieldRoot } from './field-root.ts';

/**
 * The props Mux UI defines for TextArea.Root, the compound's root; the catalog's web.react API is
 * derived from this type (Decision 0031). The members every field shares are written out, because
 * the catalog's grammar reads only the members a type lists itself. The textarea's native attributes,
 * such as rows, maxLength and placeholder, belong to TextArea.TextArea.
 */
type TextAreaOwnProps = {
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

export type TextAreaRootProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue'> & TextAreaOwnProps;
export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;
export type TextAreaLabelProps = PartProps<HTMLLabelElement>;
export type TextAreaDescriptionProps = PartProps<HTMLElement>;
export type TextAreaErrorProps = PartProps<HTMLElement>;

const TextAreaRoot = /*#__PURE__*/ React.forwardRef<HTMLDivElement, TextAreaRootProps>(function TextAreaRoot({ value, defaultValue, onChange, disabled, invalid, required, readOnly, size = 'md', className, children, ...props }, ref) {
  return renderFieldRoot('muxui-text-area', 'TextArea', { disabled, invalid, required, readOnly, size, className, children, value, defaultValue, onChange, ...props }, ref);
});
const TextAreaInput = /*#__PURE__*/ React.forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextAreaInput({ disabled, className, ...props }, ref) { return h(AriaTextArea, { ...(props as AriaTextAreaProps), ref, disabled, className: cx('muxui-text-area__textarea', className) }); });
const TextAreaLabel = /*#__PURE__*/ React.forwardRef<HTMLLabelElement, TextAreaLabelProps>(function TextAreaLabel(props, ref) { return h(AriaLabel, { ...props, ref, className: cx('muxui-text-area__label', props.className) }); });
const TextAreaDescription = /*#__PURE__*/ React.forwardRef<HTMLElement, TextAreaDescriptionProps>(function TextAreaDescription(props, ref) { return fieldText('description', 'muxui-text-area__description', props, ref); });
const TextAreaError = /*#__PURE__*/ React.forwardRef<HTMLElement, TextAreaErrorProps>(function TextAreaError(props, ref) { return h(AriaFieldError, { ...props, ref, className: cx('muxui-text-area__error', props.className) }); });

export const TextArea: {
  Root: ForwardRefExoticComponent<TextAreaRootProps & RefAttributes<HTMLDivElement>>;
  TextArea: ForwardRefExoticComponent<TextAreaProps & RefAttributes<HTMLTextAreaElement>>;
  Label: ForwardRefExoticComponent<TextAreaLabelProps & RefAttributes<HTMLLabelElement>>;
  Description: ForwardRefExoticComponent<TextAreaDescriptionProps & RefAttributes<HTMLElement>>;
  Error: ForwardRefExoticComponent<TextAreaErrorProps & RefAttributes<HTMLElement>>;
} = /*#__PURE__*/ Object.freeze({
  Root: TextAreaRoot,
  TextArea: TextAreaInput,
  Label: TextAreaLabel,
  Description: TextAreaDescription,
  Error: TextAreaError,
});
