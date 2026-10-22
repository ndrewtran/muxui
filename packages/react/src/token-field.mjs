import React from 'react';
import {
  TokenField as AriaTokenField,
  TokenInput as AriaTokenInput,
  Token as AriaToken,
  Label as AriaLabel,
  TokenFieldValue,
} from 'react-aria-components';
import { classNames, accessibleName } from './control-utils.mjs';

function toTokenValue(values = [], text = '') {
  const segments = values.map((value) => ({ type: 'token', text: String(value), value: String(value) }));
  if (text) segments.push({ type: 'text', text });
  return new TokenFieldValue(segments);
}

function tokenValues(fieldValue) {
  return fieldValue.segments.filter((segment) => segment.type === 'token').map((segment) => String(segment.value ?? segment.text));
}

function draftText(fieldValue) {
  return fieldValue.segments.filter((segment) => segment.type === 'text').map((segment) => segment.text).join('');
}

// Enter commits each trimmed text run as a token in place; blank runs are dropped.
// Duplicate tokens are kept, matching the token array contract.
function commitDraftText(fieldValue) {
  const segments = fieldValue.segments.flatMap((segment) => {
    if (segment.type !== 'text') return [segment];
    const text = segment.text.trim();
    return text ? [{ type: 'token', text, value: text }] : [];
  });
  return new TokenFieldValue(segments, { caretPosition: { index: segments.length, offset: 0 } });
}

function sameTokens(left, right) {
  return left.length === right.length && left.every((token, index) => token === String(right[index]));
}

function useTokenFieldFormReset(onReset) {
  const callbackRef = React.useRef(onReset);
  const formRef = React.useRef(null);
  const listenerRef = React.useRef(null);
  const resetTokenRef = React.useRef(0);
  callbackRef.current = onReset;
  return React.useCallback((node) => {
    const nextForm = node?.form ?? null;
    if (nextForm === formRef.current) return;
    if (formRef.current && listenerRef.current) formRef.current.removeEventListener('reset', listenerRef.current, true);
    formRef.current = nextForm;
    listenerRef.current = null;
    if (!nextForm) return;
    const listener = (event) => {
      const resetToken = ++resetTokenRef.current;
      Promise.resolve().then(() => {
        if (resetTokenRef.current !== resetToken || formRef.current !== nextForm || listenerRef.current !== listener || event.defaultPrevented) return;
        callbackRef.current();
      });
    };
    listenerRef.current = listener;
    nextForm.addEventListener('reset', listener, true);
  }, []);
}

// The public value is the token array; typed text stays an internal draft beside
// the tokens until Enter commits it. React Aria ends IME composition whenever the
// value object changes, so the field value keeps its identity until the tokens or
// the text change.
export const TokenField = React.forwardRef(function TokenField({ label, value, defaultValue = [], onChange, disabled = false, readOnly = false, name, placeholder, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
  accessibleName({ label, ariaLabel, ariaLabelledby }, 'TokenField');
  const controlled = value !== undefined;
  const initialDefaultValueRef = React.useRef(null);
  if (initialDefaultValueRef.current === null) initialDefaultValueRef.current = [...defaultValue];
  const initialDefaultValue = initialDefaultValueRef.current;
  const [fieldValue, setFieldValue] = React.useState(() => toTokenValue(controlled ? value : initialDefaultValue));
  const [resetVersion, setResetVersion] = React.useState(0);
  let currentFieldValue = fieldValue;
  // Controlled tokens that differ from the field (an outside change or a rejected
  // edit) replace the field tokens and keep the draft text.
  if (controlled && !sameTokens(tokenValues(fieldValue), value)) {
    currentFieldValue = toTokenValue(value, draftText(fieldValue));
    setFieldValue(currentFieldValue);
  }
  const currentValue = tokenValues(currentFieldValue);
  const inputRef = React.useRef(null);
  const showPlaceholder = Boolean(placeholder) && currentFieldValue.toString() === '';
  React.useLayoutEffect(() => {
    if (showPlaceholder) inputRef.current?.setAttribute('aria-placeholder', placeholder);
    else inputRef.current?.removeAttribute('aria-placeholder');
  }, [showPlaceholder, placeholder]);
  const resetAnchorRef = useTokenFieldFormReset(() => {
    if (!controlled) {
      setFieldValue(toTokenValue(initialDefaultValue));
      setResetVersion((version) => version + 1);
    }
  });
  const handleChange = (next) => {
    if (disabled || readOnly) return;
    const nextValue = tokenValues(next);
    // A controlled consumer that keeps its tokens rejects the change on the next render.
    setFieldValue(next);
    if (!sameTokens(nextValue, currentValue)) onChange?.(nextValue);
  };
  // React Aria calls onSubmit for Enter (insertParagraph), never mid-composition.
  const handleSubmit = () => {
    if (disabled || readOnly || !draftText(currentFieldValue).trim()) return;
    handleChange(commitDraftText(currentFieldValue));
  };
  return React.createElement(AriaTokenField, { key: resetVersion, ref, value: currentFieldValue, onChange: handleChange, onSubmit: handleSubmit, isDisabled: disabled, isReadOnly: readOnly, className: classNames('muxui-token-field', className), 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null, React.createElement(AriaTokenInput, { ref: inputRef, className: 'muxui-token-input', children: (segment) => segment.type === 'token' ? React.createElement(AriaToken, { className: 'muxui-token' }, segment.text) : null }), React.createElement('input', { ref: resetAnchorRef, type: 'hidden', disabled: true, tabIndex: -1, 'aria-hidden': 'true' }), name ? currentValue.map((token, index) => React.createElement('input', { key: `${token}-${index}`, type: 'hidden', name, value: token, disabled, 'aria-hidden': 'true' })) : null, showPlaceholder ? React.createElement('span', { className: 'muxui-token-placeholder', 'aria-hidden': 'true' }, placeholder) : null);
});
TokenField.displayName = 'TokenField';
