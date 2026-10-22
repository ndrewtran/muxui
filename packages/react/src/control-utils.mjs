export function classNames(base, className) {
  return [base, className].filter(Boolean).join(' ');
}

export function accessibleName(props, componentName) {
  const { label, ariaLabel, ariaLabelledby } = props;
  if ((label === undefined || label === null || label === '') && !ariaLabel && !ariaLabelledby) {
    throw new TypeError(`${componentName} requires label, aria-label, or aria-labelledby`);
  }
}
