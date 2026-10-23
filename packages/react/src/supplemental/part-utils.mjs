import React from 'react';

export const h = React.createElement;
export const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

export function cx(...values) {
  return values.filter(Boolean).join(' ');
}

export function dataState(value) {
  return value ? '' : undefined;
}

export function nativePart(tag, base, props, ref, children) {
  const { className, ...rest } = props ?? {};
  const attributes = { ...rest, ref, className: cx(base, className) };
  return children === undefined ? h(tag, attributes) : h(tag, attributes, children);
}

export function pressHandler(onActivate) {
  return onActivate
    ? (event) => onActivate({ type: 'activate', pointerType: event?.pointerType, target: event?.target })
    : undefined;
}
