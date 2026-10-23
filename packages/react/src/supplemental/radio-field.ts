import React from 'react';
import type { Dispatch, ForwardRefExoticComponent, HTMLAttributes, LabelHTMLAttributes, RefObject, RefAttributes, SetStateAction } from 'react';
import {
  RadioField as AriaRadioField,
  RadioButton as AriaRadioButton,
  RadioGroupStateContext as AriaRadioGroupStateContext,
} from 'react-aria-components';
import type { RadioButtonProps as AriaRadioButtonProps, RadioFieldProps as AriaRadioFieldProps } from 'react-aria-components';
import { normalizeChoiceControlSize, ChoiceControlSizeContext } from '../choice-context.mjs';
import { h, cx, nativePart } from './part-utils.ts';
import type { PartProps } from './part-utils.ts';
import { fieldText, mappedFieldProps } from './field-utils.ts';

/**
 * The props Mux UI defines for RadioField.Root, the compound's root; the catalog's web.react
 * API is derived from this type (Decision 0031). The members every field shares are written out,
 * because the catalog's grammar reads only the members a type lists itself. The size follows
 * the enclosing RadioGroup, so it has no default here.
 */
type RadioFieldOwnProps = {
  /** The option's value, which the enclosing RadioGroup selects by. */
  value: string;
  /** Marks the option disabled. */
  disabled?: boolean;
  /** Marks the option invalid. */
  invalid?: boolean;
  /** Marks the option required. */
  required?: boolean;
  /** The option's size, in place of the enclosing RadioGroup's. */
  size?: 'sm' | 'md' | 'lg';
};

/** The props Mux UI defines for RadioField.Button; its API is the button entry in the catalog's partApis. */
type RadioFieldButtonOwnProps = {
  /** Marks the option disabled, whatever its field says. */
  disabled?: boolean;
};

export type RadioFieldRootProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> & RadioFieldOwnProps;
export type RadioFieldButtonProps = LabelHTMLAttributes<HTMLLabelElement> & RadioFieldButtonOwnProps;
export type RadioFieldIndicatorProps = PartProps<HTMLSpanElement>;
export type RadioFieldDotProps = PartProps<HTMLSpanElement>;
export type RadioFieldDescriptionProps = PartProps<HTMLElement>;
export type RadioFieldErrorProps = PartProps<HTMLElement>;

interface RadioFieldAssociation {
  effectiveInvalid: boolean;
  errorId: string | undefined;
  fallbackErrorId: string;
  inputRef: RefObject<HTMLInputElement | null>;
  setErrorId: Dispatch<SetStateAction<string | undefined>>;
}

const RadioFieldContext = React.createContext<RadioFieldAssociation | undefined>(undefined);

function useRadioGroupState() {
  const state = React.useContext(AriaRadioGroupStateContext);
  if (!state) throw new Error('RadioField must be used inside RadioGroup');
  return state;
}

function splitIds(value: unknown) {
  return typeof value === 'string' ? value.trim().split(/\s+/u).filter(Boolean) : [];
}

function makeRadioField() {
  // The root swallows onChange: the enclosing RadioGroup owns it, so the public type leaves it out and this one names it to discard it.
  const Root = /*#__PURE__*/ React.forwardRef<HTMLDivElement, RadioFieldRootProps & { onChange?: unknown }>(function RadioFieldRoot({ onChange: _onChange, value, disabled, invalid, required, size: sizeProp, className, ...props }, ref) {
    const inheritedSize = React.useContext(ChoiceControlSizeContext);
    const radioGroupState = useRadioGroupState();
    const size = normalizeChoiceControlSize(sizeProp === undefined || sizeProp === null ? inheritedSize : sizeProp, 'RadioField');
    const fallbackErrorId = React.useId();
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const [errorId, setErrorId] = React.useState<string | undefined>(undefined);
    const effectiveInvalid = Boolean(invalid ? invalid : radioGroupState.isInvalid);
    const context = React.useMemo(() => ({ effectiveInvalid, errorId, fallbackErrorId, inputRef, setErrorId }), [effectiveInvalid, errorId, fallbackErrorId]);
    // React Aria's props type the handlers on Element, and these on the div; the rest is the div's native attributes.
    return h(RadioFieldContext.Provider, { value: context }, h(AriaRadioField, { ...mappedFieldProps({ disabled, invalid, required, ...(props as Omit<AriaRadioFieldProps, 'value'>) }), value, ref, inputRef, ...{ 'data-size': size }, className: cx('muxui-radio-field', size !== 'md' && `muxui-radio-field--${size}`, className) }));
  });
  const Button = /*#__PURE__*/ React.forwardRef<HTMLLabelElement, RadioFieldButtonProps>(function RadioFieldButton({ disabled, className, 'aria-describedby': ariaDescribedBy, 'aria-errormessage': ariaErrorMessage, ...props }, ref) {
    const field = React.useContext(RadioFieldContext);
    const priorCallerIds = React.useRef<string[]>([]);
    React.useEffect(() => {
      const input = field?.inputRef.current;
      if (!input) return;
      const callerIds = splitIds(ariaDescribedBy);
      const baseIds = splitIds(input.getAttribute('aria-describedby')).filter((id) => !priorCallerIds.current.includes(id));
      const describedBy = [...new Set([...baseIds, ...callerIds])].join(' ');
      if (describedBy) input.setAttribute('aria-describedby', describedBy);
      else input.removeAttribute('aria-describedby');
      priorCallerIds.current = callerIds;
      const errorMessage = ariaErrorMessage ?? field?.errorId;
      if (errorMessage) input.setAttribute('aria-errormessage', errorMessage);
      else input.removeAttribute('aria-errormessage');
    }, [ariaDescribedBy, ariaErrorMessage, field?.errorId, field?.inputRef]);
    return h(AriaRadioButton, { ...(props as AriaRadioButtonProps), ref, ...{ isDisabled: disabled }, className: cx('muxui-radio-field__button', className) });
  });
  const Indicator = /*#__PURE__*/ React.forwardRef<HTMLSpanElement, RadioFieldIndicatorProps>(function RadioFieldIndicator(props, ref) { return nativePart('span', 'muxui-radio-field__indicator', props, ref); });
  const Dot = /*#__PURE__*/ React.forwardRef<HTMLSpanElement, RadioFieldDotProps>(function RadioFieldDot(props, ref) { return nativePart('span', 'muxui-radio-field__dot', props, ref); });
  const Description = /*#__PURE__*/ React.forwardRef<HTMLElement, RadioFieldDescriptionProps>(function RadioFieldDescription(props, ref) { return fieldText('description', 'muxui-radio-field__description', props, ref); });
  const Error = /*#__PURE__*/ React.forwardRef<HTMLElement, RadioFieldErrorProps>(function RadioFieldError({ className, id, role, ...props }, ref) {
    const field = React.useContext(RadioFieldContext);
    const errorId = id ?? field?.fallbackErrorId;
    const effectiveInvalid = field?.effectiveInvalid;
    const setErrorId = field?.setErrorId;
    React.useEffect(() => {
      if (!effectiveInvalid || !errorId || !setErrorId) return undefined;
      setErrorId((current) => current === errorId ? current : errorId);
      return () => setErrorId((current) => current === errorId ? undefined : current);
    }, [effectiveInvalid, errorId, setErrorId]);
    if (!effectiveInvalid || !errorId) return null;
    return nativePart('span', 'muxui-radio-field__error', { ...props, id: errorId, className, role: role ?? 'alert' }, ref);
  });
  return /*#__PURE__*/ Object.freeze({ Root, Button, Indicator, Dot, Description, Error });
}

export const RadioField: {
  Root: ForwardRefExoticComponent<RadioFieldRootProps & RefAttributes<HTMLDivElement>>;
  Button: ForwardRefExoticComponent<RadioFieldButtonProps & RefAttributes<HTMLLabelElement>>;
  Indicator: ForwardRefExoticComponent<RadioFieldIndicatorProps & RefAttributes<HTMLSpanElement>>;
  Dot: ForwardRefExoticComponent<RadioFieldDotProps & RefAttributes<HTMLSpanElement>>;
  Description: ForwardRefExoticComponent<RadioFieldDescriptionProps & RefAttributes<HTMLElement>>;
  Error: ForwardRefExoticComponent<RadioFieldErrorProps & RefAttributes<HTMLElement>>;
} = /*#__PURE__*/ makeRadioField();
