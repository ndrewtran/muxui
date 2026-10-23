import React from 'react';
import type { ForwardedRef, HTMLAttributes, ReactElement, ReactNode, createElement, useEffect } from 'react';

// Annotated, so the declaration names the React types by import and never the default import.
export const h: typeof createElement = React.createElement;
export const useIsomorphicLayoutEffect: typeof useEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

export function cx(...values: unknown[]) {
  return values.filter(Boolean).join(' ');
}

export function dataState(value: unknown) {
  return value ? '' : undefined;
}

/** The native props of a part: its element's attributes, and a className. */
export type PartProps<T extends HTMLElement = HTMLElement> = HTMLAttributes<T> & { className?: string };

/** Renders `tag` with the part's native props, its base class first, then the caller's className. */
export function nativePart<E extends HTMLElement>(tag: string, base: string, props: PartProps<E> | null | undefined, ref: ForwardedRef<E>, children?: ReactNode): ReactElement {
  const { className, ...rest } = props ?? {};
  const attributes = { ...rest, ref, className: cx(base, className) };
  return children === undefined ? h(tag, attributes) : h(tag, attributes, children);
}

/** The activation a press reports: the pointer and target of the event that caused it. */
export type SupplementalActivation = {
  type: 'activate';
  pointerType?: string;
  target?: EventTarget | null;
};

export function pressHandler(onActivate?: (event: SupplementalActivation) => void) {
  return onActivate
    ? (event?: { pointerType?: string; target?: EventTarget | null }) => onActivate({ type: 'activate', pointerType: event?.pointerType, target: event?.target })
    : undefined;
}
