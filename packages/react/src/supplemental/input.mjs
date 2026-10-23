import React from 'react';
import { Input as AriaInput, Label as AriaLabel, TextField as AriaTextField } from 'react-aria-components';
import { h, cx } from './part-utils.mjs';
import { fieldText } from './field-utils.mjs';
import { InputAssociationContext, fieldRoot } from './field-root.mjs';

function associatedFieldText(slot, className, props, ref, register) {
  const association = React.useContext(InputAssociationContext);
  const nodeRef = React.useRef(null);
  const setRef = React.useCallback((node) => {
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

export const Input = {
  Root: /*#__PURE__*/ fieldRoot(AriaTextField, 'muxui-input__root'),
  Input: React.forwardRef(function InputInput({ disabled, className, 'aria-describedby': ariaDescribedby, ...props }, ref) {
    const association = React.useContext(InputAssociationContext);
    const visualSize = association?.size ?? 'md';
    const describedby = [ariaDescribedby, association?.descriptionId, association?.errorId]
      .filter(Boolean)
      .join(' ') || undefined;
    const inputProps = { ...props, ref, disabled, className: cx('muxui-input', visualSize !== 'md' && `muxui-input--${visualSize}`, className) };
    if (describedby !== undefined) inputProps['aria-describedby'] = describedby;
    return h(AriaInput, inputProps);
  }),
  Label: React.forwardRef(function InputLabel(props, ref) { return h(AriaLabel, { ...props, ref, className: cx('muxui-input__label', props.className) }); }),
  Description: React.forwardRef(function InputDescription(props, ref) {
    const association = React.useContext(InputAssociationContext);
    return associatedFieldText('description', 'muxui-input__description', props, ref, association?.setDescriptionId);
  }),
  Error: React.forwardRef(function InputError(props, ref) {
    const association = React.useContext(InputAssociationContext);
    return associatedFieldText('errorMessage', 'muxui-input__error', props, ref, association?.setErrorId);
  }),
};
