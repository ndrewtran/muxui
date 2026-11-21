import type { ReactNode } from 'react';

/** The base class followed by the caller's `className`, leaving out whichever is empty. */
export function classNames(base: string, className?: string | undefined): string {
  return [base, className].filter(Boolean).join(' ');
}

/** What names a control: a visible label, `aria-label`, or `aria-labelledby`. */
interface AccessibleNameParts {
  label?: ReactNode;
  ariaLabel?: string | undefined;
  ariaLabelledby?: string | undefined;
}

/** Throws unless the control has a visible label, an `aria-label`, or an `aria-labelledby`; an empty label does not count. */
export function accessibleName(props: AccessibleNameParts, componentName: string): void {
  const { label, ariaLabel, ariaLabelledby } = props;
  if ((label === undefined || label === null || label === '') && !ariaLabel && !ariaLabelledby) {
    throw new TypeError(`${componentName} requires label, aria-label, or aria-labelledby`);
  }
}

/**
 * Lays the caller's host attributes under the DOM props a React Aria component renders. React Aria's DOM filter keeps
 * ids, data-* attributes, its own handlers and a few named attributes, so a title, a tabIndex or most aria-* attributes
 * the component accepts in its types would never reach the element. Whatever React Aria renders still wins, with one
 * exception: the caller's tabIndex replaces React Aria's default one. autoFocus stays React Aria's, which focuses the
 * element itself. React Aria's behaviour props, which an internal caller such as TextEditor's bubble menu passes through
 * an untyped spread, are React Aria's to read and never reach the element.
 */
export function withHostAttributes<DomProps extends object>(caller: object, domProps: DomProps): DomProps {
  const { autoFocus: _autoFocus, tabIndex, ...attributes } = caller as { autoFocus?: unknown; tabIndex?: number };
  for (const name of reactAriaBehaviourProps) delete (attributes as Record<string, unknown>)[name];
  return { ...attributes, ...domProps, ...(tabIndex === undefined ? {} : { tabIndex }) };
}

// React Aria 1.20's props for Button, Link and Disclosure, and its press, hover and focusable hook options, less the DOM
// attributes among them; allowFocusWhenDisabled is undocumented, and useButton reads it.
const reactAriaBehaviourProps = Object.freeze([
  'preventFocusOnPress', 'excludeFromTabOrder', 'isDisabled', 'isPending', 'routerOptions', 'elementType', 'render',
  'isPressed', 'allowFocusWhenDisabled', 'shouldCancelOnPointerExit', 'allowTextSelectionOnPress',
  'isExpanded', 'defaultExpanded', 'onExpandedChange',
  'onPress', 'onPressStart', 'onPressEnd', 'onPressChange', 'onPressUp', 'onHoverStart', 'onHoverEnd', 'onHoverChange', 'onFocusChange',
]);
