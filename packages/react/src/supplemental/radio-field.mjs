import React from 'react';
import {
  RadioField as AriaRadioField,
  RadioButton as AriaRadioButton,
  RadioGroupStateContext as AriaRadioGroupStateContext,
} from 'react-aria-components';
import { normalizeChoiceControlSize, ChoiceControlSizeContext } from '../choice-context.mjs';
import { h, cx, nativePart } from './part-utils.ts';
import { fieldText, mappedFieldProps } from './field-utils.mjs';

const RadioFieldContext = React.createContext(undefined);

function useRadioGroupState() {
  const state = React.useContext(AriaRadioGroupStateContext);
  if (!state) throw new Error('RadioField must be used inside RadioGroup');
  return state;
}

function splitIds(value) {
  return typeof value === 'string' ? value.trim().split(/\s+/u).filter(Boolean) : [];
}

function makeRadioField() {
  const Root = React.forwardRef(function RadioFieldRoot({ onChange: _onChange, disabled, invalid, required, size: sizeProp, className, ...props }, ref) {
    const inheritedSize = React.useContext(ChoiceControlSizeContext);
    const radioGroupState = useRadioGroupState();
    const size = normalizeChoiceControlSize(sizeProp ?? inheritedSize, 'RadioField');
    const fallbackErrorId = React.useId();
    const inputRef = React.useRef(null);
    const [errorId, setErrorId] = React.useState(undefined);
    const effectiveInvalid = Boolean(invalid || radioGroupState.isInvalid);
    const context = React.useMemo(() => ({ effectiveInvalid, errorId, fallbackErrorId, inputRef, setErrorId }), [effectiveInvalid, errorId, fallbackErrorId]);
    return h(RadioFieldContext.Provider, { value: context }, h(AriaRadioField, { ...mappedFieldProps({ disabled, invalid, required, ...props }), ref, inputRef, 'data-size': size, className: cx('muxui-radio-field', size !== 'md' && `muxui-radio-field--${size}`, className) }));
  });
  const Button = React.forwardRef(function RadioFieldButton({ disabled, className, 'aria-describedby': ariaDescribedBy, 'aria-errormessage': ariaErrorMessage, ...props }, ref) {
    const field = React.useContext(RadioFieldContext);
    const priorCallerIds = React.useRef([]);
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
    return h(AriaRadioButton, { ...props, ref, isDisabled: disabled, className: cx('muxui-radio-field__button', className) });
  });
  const Indicator = React.forwardRef(function RadioFieldIndicator(props, ref) { return nativePart('span', 'muxui-radio-field__indicator', props, ref); });
  const Dot = React.forwardRef(function RadioFieldDot(props, ref) { return nativePart('span', 'muxui-radio-field__dot', props, ref); });
  const Description = React.forwardRef(function RadioFieldDescription(props, ref) { return fieldText('description', 'muxui-radio-field__description', props, ref); });
  const Error = React.forwardRef(function RadioFieldError({ className, id, role, ...props }, ref) {
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
  return Object.freeze({ Root, Button, Indicator, Dot, Description, Error });
}

export const RadioField = /*#__PURE__*/ makeRadioField();
