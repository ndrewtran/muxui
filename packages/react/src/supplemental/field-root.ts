import React from 'react';
import type { Context, Dispatch, ForwardedRef, ReactElement, ReactNode, SetStateAction } from 'react';
import { AriaTextField } from '../substrate.ts';
import type { TextFieldProps as AriaTextFieldProps, TextFieldRenderProps as AriaTextFieldRenderProps } from 'react-aria-components';
import { normalizeChoiceControlSize } from '../choice-context.mjs';
import { h, cx } from './part-utils.ts';
import { mappedFieldProps } from './field-utils.ts';

/** What Input and TextArea's description and error parts tell the field's input to describe itself by. */
export interface InputAssociation {
  setDescriptionId: Dispatch<SetStateAction<string | undefined>>;
  setErrorId: Dispatch<SetStateAction<string | undefined>>;
  descriptionId: string | undefined;
  errorId: string | undefined;
  size: 'sm' | 'md' | 'lg';
  invalid: boolean;
}

/* Input and TextArea */
export const InputAssociationContext: Context<InputAssociation | null> = React.createContext<InputAssociation | null>(null);

/** What a field root hands renderFieldRoot: its state flags and size, its class and children, and the rest for the text field. */
type FieldRootProps = {
  disabled?: boolean;
  invalid?: boolean;
  required?: boolean;
  readOnly?: boolean;
  size: string;
  className?: string;
  children?: unknown;
  [other: string]: unknown;
};

/**
 * Renders the root of Input or TextArea: a text field that provides the input association to its parts. It calls hooks,
 * so a family calls it, unconditionally, from its own render function. The props are written structurally so that no
 * declaration names the upstream package.
 */
export function renderFieldRoot(
  rootClass: string,
  componentName: 'Input' | 'TextArea',
  { disabled, invalid, required, readOnly, size, className, children, ...props }: FieldRootProps,
  ref: ForwardedRef<HTMLDivElement>,
): ReactElement {
  const resolvedSize = normalizeChoiceControlSize(size, componentName);
  const [descriptionId, setDescriptionId] = React.useState<string | undefined>(undefined);
  const [errorId, setErrorId] = React.useState<string | undefined>(undefined);
  const association = React.useMemo(() => ({
    setDescriptionId,
    setErrorId,
    descriptionId,
    errorId,
    size: resolvedSize,
  }), [descriptionId, errorId, resolvedSize]);
  const renderChildren = (renderProps: AriaTextFieldRenderProps & { defaultChildren: ReactNode | undefined }): ReactNode => h(InputAssociationContext.Provider, { value: { ...association, invalid: Boolean(invalid || renderProps?.isInvalid) } }, typeof children === 'function' ? children(renderProps) : children as ReactNode);
  return h(AriaTextField, { ...(mappedFieldProps({ disabled, invalid, required, readOnly, ...props }) as AriaTextFieldProps), ref, ...{ 'data-muxui-size': resolvedSize }, className: cx(rootClass, resolvedSize !== 'md' && `${rootClass}--${resolvedSize}`, className), children: renderChildren });
}
