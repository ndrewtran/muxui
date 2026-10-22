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
