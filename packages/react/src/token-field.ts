import React from 'react';
import type { ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react';
import { Label as AriaLabel, TokenFieldValue } from 'react-aria-components';
import { AriaTokenField, AriaTokenInput, AriaToken } from './substrate.ts';
import { classNames, accessibleName } from './control-utils.ts';
import type { MuxUIAccessibleName } from './fields.ts';

/**
 * The props Mux UI defines for TokenField. The field is named by label, aria-label, or aria-labelledby,
 * and it takes no description, error message, required, or invalid.
 */
export type TokenFieldOwnProps = {
  /** The visible label, which also names the field. Without one, the field needs an aria-label or aria-labelledby, and an empty label does not count. */
  label?: Exclude<ReactNode, null | undefined | boolean>;
  /** The tokens, in order, when the caller controls them. */
  value?: string[];
  /** The tokens the field starts with, when it controls itself. Form reset restores them. */
  defaultValue?: string[];
  /** Called with the token array each time the tokens change, and only then: typed text that is not yet a token does not call it. A disabled or read-only field does not call it. */
  onChange?: (value: string[]) => void;
  /** Disables the field: it can be neither focused nor changed, and it submits no tokens. */
  disabled?: boolean;
  /** Makes the field read-only: its tokens stay visible and focusable but cannot be changed, and it still submits them. */
  readOnly?: boolean;
  /** The form field name. A named field submits one entry per token under it. */
  name?: string;
  /** Text shown while the field holds no tokens and no typed text. */
  placeholder?: string;
};

export type TokenFieldProps = Omit<TokenFieldOwnProps, 'label'> & { className?: string } & MuxUIAccessibleName;

// React Aria's index names the class and not its segment types.
type TokenSegment = TokenFieldValue<string>['segments'][number];

function toTokenValue(values: readonly string[] = [], text = '') {
  const segments: TokenSegment[] = values.map((value) => ({ type: 'token', text: String(value), value: String(value) }));
  if (text) segments.push({ type: 'text', text });
  return new TokenFieldValue(segments);
}

function tokenValues(fieldValue: TokenFieldValue<string>) {
  return fieldValue.segments.filter((segment) => segment.type === 'token').map((segment) => String(segment.value ?? segment.text));
}

function draftText(fieldValue: TokenFieldValue<string>) {
  return fieldValue.segments.filter((segment) => segment.type === 'text').map((segment) => segment.text).join('');
}

// Enter commits each trimmed text run as a token in place; blank runs are dropped.
// Duplicate tokens are kept, matching the token array contract.
function commitDraftText(fieldValue: TokenFieldValue<string>) {
  const segments = fieldValue.segments.flatMap((segment): TokenSegment[] => {
    if (segment.type !== 'text') return [segment];
    const text = segment.text.trim();
    return text ? [{ type: 'token', text, value: text }] : [];
  });
  return new TokenFieldValue(segments, { caretPosition: { index: segments.length, offset: 0 } });
}

function sameTokens(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((token, index) => token === String(right[index]));
}

function useTokenFieldFormReset(onReset: () => void) {
  const callbackRef = React.useRef(onReset);
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const listenerRef = React.useRef<((event: Event) => void) | null>(null);
  const resetTokenRef = React.useRef(0);
  callbackRef.current = onReset;
  return React.useCallback((node: HTMLInputElement | null) => {
    const nextForm = node?.form ?? null;
    if (nextForm === formRef.current) return;
    if (formRef.current && listenerRef.current) formRef.current.removeEventListener('reset', listenerRef.current, true);
    formRef.current = nextForm;
    listenerRef.current = null;
    if (!nextForm) return;
    const listener = (event: Event) => {
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
export const TokenField: ForwardRefExoticComponent<TokenFieldProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, TokenFieldProps>(function TokenField({ label, value, defaultValue, onChange, disabled = false, readOnly = false, name, placeholder, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
  accessibleName({ label, ariaLabel, ariaLabelledby }, 'TokenField');
  const controlled = value !== undefined;
  const initialDefaultValueRef = React.useRef<string[] | null>(null);
  // An omitted defaultValue is an empty list; a list is copied once, so a later change to it replaces nothing.
  if (initialDefaultValueRef.current === null) initialDefaultValueRef.current = defaultValue === undefined ? [] : [...defaultValue];
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
  const inputRef = React.useRef<HTMLDivElement>(null);
  const showPlaceholder = Boolean(placeholder) && currentFieldValue.toString() === '';
  React.useLayoutEffect(() => {
    // showPlaceholder holds only for a placeholder with text, which the second test restates for the type.
    if (showPlaceholder && placeholder) inputRef.current?.setAttribute('aria-placeholder', placeholder);
    else inputRef.current?.removeAttribute('aria-placeholder');
  }, [showPlaceholder, placeholder]);
  const resetAnchorRef = useTokenFieldFormReset(() => {
    if (!controlled) {
      setFieldValue(toTokenValue(initialDefaultValue));
      setResetVersion((version) => version + 1);
    }
  });
  const handleChange = (next: TokenFieldValue<string>) => {
    // Two tests rather than `disabled || readOnly`: extraction reads `||` on an owned prop as replacing its default.
    if (disabled) return;
    if (readOnly) return;
    const nextValue = tokenValues(next);
    // A controlled consumer that keeps its tokens rejects the change on the next render.
    setFieldValue(next);
    if (!sameTokens(nextValue, currentValue)) onChange?.(nextValue);
  };
  // React Aria calls onSubmit for Enter (insertParagraph), never mid-composition.
  const handleSubmit = () => {
    if (disabled) return;
    if (readOnly) return;
    if (!draftText(currentFieldValue).trim()) return;
    handleChange(commitDraftText(currentFieldValue));
  };
  return React.createElement(AriaTokenField, { key: resetVersion, ref, value: currentFieldValue, onChange: handleChange, onSubmit: handleSubmit, isDisabled: disabled, isReadOnly: readOnly, className: classNames('muxui-token-field', className), 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null,
    // React Aria calls children for token segments only, with the text between them rendered as text (TokenInput in react-aria-components 1.20.0).
    React.createElement(AriaTokenInput, { ref: inputRef, className: 'muxui-token-field__input', children: (segment) => React.createElement(AriaToken, { className: 'muxui-token-field__token' }, segment.text) }),
    React.createElement('input', { ref: resetAnchorRef, type: 'hidden', disabled: true, tabIndex: -1, 'aria-hidden': 'true' }),
    name ? currentValue.map((token, index) => React.createElement('input', { key: `${token}-${index}`, type: 'hidden', name, value: token, disabled, 'aria-hidden': 'true' })) : null,
    showPlaceholder ? React.createElement('span', { className: 'muxui-token-field__placeholder', 'aria-hidden': 'true' }, placeholder) : null);
});
TokenField.displayName = 'TokenField';
