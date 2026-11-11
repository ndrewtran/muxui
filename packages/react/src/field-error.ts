import React from 'react';
import type { Context, Dispatch, ForwardRefExoticComponent, ForwardedRef, HTMLAttributes, ReactElement, ReactNode, RefAttributes, SetStateAction } from 'react';
import { FieldErrorContext as AriaFieldErrorContext, Text as AriaText, TextContext as AriaTextContext } from 'react-aria-components';

// A field's error part, shared by the compounds' Error parts, Select.Error and the fields that render errorMessage.

/** The native props of an error part: its element's attributes, and a className. */
type FieldErrorProps<E extends HTMLElement> = HTMLAttributes<E> & { className?: string };

// A layout effect on the client; on the server, where layout effects warn, a passive one that never runs.
const useLayoutEffectOnClient: typeof React.useEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

/* Late error parts. React Aria names a field's error in its control's aria-describedby only when the error is in the
   page as the field mounts or changes validity, so a part that mounts later, such as a message that arrives with a
   server answer, has no id from React Aria and is not linked. Such a part takes an id of its own (useSlotPartId) and
   hands it to the field's LateErrorScope, which adds it to what React Aria gives the control. A part that is there
   from the first render keeps React Aria's id, so server markup and hydration are unchanged. */
const LateErrorContext = React.createContext<Dispatch<SetStateAction<string | undefined>> | null>(null);

/**
 * The id a field's text part renders with: the caller's, else React Aria's id for its slot, else, when React Aria has
 * none because the part mounted after it resolved the field's ids, a stable one of its own. `late` is true when React
 * Aria will not name the part in the control's aria-describedby by itself.
 */
export function useSlotPartId(slot: 'description' | 'errorMessage', callerId: string | undefined): { id: string; late: boolean } {
  const context = React.useContext(AriaTextContext);
  const slotId = context && 'slots' in context ? context.slots?.[slot]?.id : undefined;
  const ownId = React.useId();
  return { id: callerId ?? slotId ?? ownId, late: slotId === undefined };
}

/** `value` with `id` added to its aria-describedby; a slotted context, which names no one control, stays as it is. */
function describedBy<V>(value: V, id: string): V {
  if (!value || typeof value !== 'object' || 'slots' in value) return value;
  const current = 'aria-describedby' in value && typeof value['aria-describedby'] === 'string' ? value['aria-describedby'] : '';
  return { ...value, 'aria-describedby': current ? `${current} ${id}` : id };
}

/**
 * Wraps the children of a field's root, inside React Aria's root (through lateErrorScope), and adds a late error part's id to the
 * aria-describedby that `context`, the React Aria context the field's control reads (InputContext, TextAreaContext,
 * or a Select's ButtonContext), gives the control.
 */
function LateErrorScope<V>({ context, children }: { context: Context<V>; children?: ReactNode }): ReactElement {
  const [lateId, setLateId] = React.useState<string | undefined>(undefined);
  const value = React.useContext(context);
  return React.createElement(LateErrorContext.Provider, { value: setLateId }, React.createElement(context.Provider, { value: lateId ? describedBy(value, lateId) : value }, children));
}

/** `children` in a LateErrorScope for the control that reads `context`. */
export function lateErrorScope<V>(context: Context<V>, ...children: ReactNode[]): ReactElement {
  return React.createElement(LateErrorScope<V>, { context }, ...children);
}

/**
 * Renders a field's error part as React Aria's FieldError does: in the field's error slot, only while the field is
 * invalid, with the caller's children or else the validation messages, and linked to the control even when it
 * mounts late (see LateErrorScope). Unlike FieldError, which keeps only an id, data-* and a few global attributes,
 * it passes every native attribute through, so a caller can give it a role, aria-live or a title. It calls hooks, so
 * a part calls it unconditionally from its render function.
 */
export function fieldError<E extends HTMLElement>(className: string, props: FieldErrorProps<E>, ref: ForwardedRef<E>): ReactElement | null {
  const validation = React.useContext(AriaFieldErrorContext);
  const register = React.useContext(LateErrorContext);
  const { children, className: callerClassName, id: callerId, ...rest } = props;
  const { id, late } = useSlotPartId('errorMessage', callerId);
  const content = children ?? (validation?.validationErrors.length ? validation.validationErrors.join(' ') : undefined);
  const shown = Boolean(validation?.isInvalid) && content !== undefined && content !== null;
  useLayoutEffectOnClient(() => {
    if (!shown || !late || !register) return undefined;
    register(id);
    return () => register((current) => current === id ? undefined : current);
  }, [shown, late, register, id]);
  if (!shown) return null;
  // data-rac is the marker React Aria's own FieldError writes; TypeScript accepts a data-* key in a call only from a spread.
  return React.createElement(AriaText, { ...{ 'data-rac': '' }, ...rest, id, ref, slot: 'errorMessage', className: [className, callerClassName].filter(Boolean).join(' ') }, content);
}

/** FieldError's place in a component that is not a compound part: an error part with its className and message. */
export const FieldErrorText: ForwardRefExoticComponent<FieldErrorProps<HTMLElement> & RefAttributes<HTMLElement>> = /*#__PURE__*/ React.forwardRef<HTMLElement, FieldErrorProps<HTMLElement>>(function FieldErrorText({ className, ...props }, ref) {
  return fieldError(className ?? '', props, ref);
});
