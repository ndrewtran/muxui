import type { PartProps } from '../generated/part-utils.js';
import type { PartProps as AuthoredPartProps } from '../generated/supplemental.js';

// PartProps is declared twice until the authored supplemental declarations go: in part-utils, which TypeScript families import,
// and in the authored declarations, where it reaches the public surface by omission. Their text differs (a named import against
// React.HTMLAttributes), and nothing else ties them together, so these pins keep the two copies the same type.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;

export type Pins = [
  Expect<Same<PartProps, AuthoredPartProps>>,
  Expect<Same<PartProps<HTMLDivElement>, AuthoredPartProps<HTMLDivElement>>>,
  Expect<Same<PartProps<HTMLInputElement>, AuthoredPartProps<HTMLInputElement>>>,
];

// A copy that drifts fails the pin.
type DriftedPartProps<T extends HTMLElement = HTMLElement> = Omit<PartProps<T>, 'className'> & { className?: string | number };
// @ts-expect-error The shared className is a string.
export type DriftedClassNamePin = Expect<Same<DriftedPartProps<HTMLDivElement>, AuthoredPartProps<HTMLDivElement>>>;
