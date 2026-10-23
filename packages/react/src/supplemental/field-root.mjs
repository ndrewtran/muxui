import React from 'react';
import { normalizeChoiceControlSize } from '../choice-context.mjs';
import { h, cx } from './part-utils.ts';
import { mappedFieldProps } from './field-utils.ts';

/* Input and TextArea */
export const InputAssociationContext = React.createContext(null);

export function fieldRoot(Component, rootClass) {
  return React.forwardRef(function SupplementalFieldRoot({ disabled, invalid, required, readOnly, size = 'md', className, children, ...props }, ref) {
    const resolvedSize = normalizeChoiceControlSize(size, rootClass === 'muxui-text-area' ? 'TextArea' : 'Input');
    const [descriptionId, setDescriptionId] = React.useState(undefined);
    const [errorId, setErrorId] = React.useState(undefined);
    const association = React.useMemo(() => ({
      setDescriptionId,
      setErrorId,
      descriptionId,
      errorId,
      size: resolvedSize,
    }), [descriptionId, errorId, resolvedSize]);
    const renderChildren = (renderProps) => h(InputAssociationContext.Provider, { value: { ...association, invalid: Boolean(invalid || renderProps?.isInvalid) } }, typeof children === 'function' ? children(renderProps) : children);
    return h(Component, { ...mappedFieldProps({ disabled, invalid, required, readOnly, ...props }), ref, 'data-size': resolvedSize, className: cx(rootClass, resolvedSize !== 'md' && `${rootClass}--${resolvedSize}`, className), children: renderChildren });
  });
}
