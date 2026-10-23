// What the declaration-reference tests read: synthetic declaration sets that exercise every construct the
// reader admits, and the real package's declarations, manifest and family facts as `pnpm generate` wrote them.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generatedDeclarations } from './declarations.mjs';

const packageRoot = resolve(import.meta.dirname, '../..');

/** A package manifest with one typed entry, as the synthetic declaration sets are laid out. */
export const fixtureManifest = Object.freeze({
  name: '@muxui/react',
  version: '0.0.0-fixture',
  type: 'module',
  exports: Object.freeze({ '.': Object.freeze({ types: './generated/index.d.ts', default: './generated/index.mjs' }) }),
});

/** Gives each synthetic file the `@generated-from` header every shipped declaration carries. */
export const withHeaders = (files) => Object.fromEntries(Object.entries(files).map(([file, text]) => [
  file,
  `// @generated-from: packages/react/src/fixture/${file.replace(/\.d\.ts$/u, '.ts')}\n// @generated-content-sha256: sha256:0\n${text.trim()}\n`,
]));

/** Types, members, functions and host references of every kind the reader admits. */
export const CONFORMANCE = withHeaders({
  'index.d.ts': `
import type * as React from 'react';
import type { ReactNode, ForwardRefExoticComponent, RefAttributes } from 'react';
import type { Size, SizeProps, Named } from './shared.js';
export * from './shared.js';
export * from './parts.js';
export type Keywords = { s: string; n: number; b: boolean; big: bigint; sym: symbol; o: object; v: void; u: undefined; nu: null; ne: never; unk: unknown; a: any };
export type Literals = 'a' | "b'c" | 1 | -2 | true | false | null;
export type Nested = ('a' | 'b') | ('c' | ('d' | 'e'));
export type Arrays = { list: string[]; ro: readonly string[]; fn: (() => void)[]; un: (string | number)[]; k: keyof Keywords };
export type Tuples = [string, number?, ...boolean[]] | readonly [a: string, b?: number] | [first: string, ...rest: number[]];
export type Indexed = Keywords['s'] | Keywords['n'];
export type Functions = {
  plain: (a: string, b?: number, ...rest: boolean[]) => void;
  generic: <T extends string = 'x', U = T>(value: T, other: U) => [T, U];
  nested: (callback: (event: Size) => void) => () => void;
  guard: (value: unknown) => value is string;
  asserts: (value: unknown) => asserts value is string;
  assertsOnly: (value: unknown) => asserts value;
};
export type Members = {
  /** A documented property. */
  required: string;
  optional?: number;
  readonly frozen: string;
  readonly frozenOptional?: string;
  'quoted-name'?: boolean;
  method(a: string): void;
  optionalMethod?(): number;
  genericMethod<T>(value: T): T;
  explicit?: string | undefined;
  declaredNever?: never;
  [key: string]: unknown;
  (call: string): number;
};
export type Mapped = { readonly [K in 'a' | 'b']?: string } & { -readonly [K in keyof Keywords as Exclude<K, 'a'>]-?: Keywords[K] };
export type Hosts = { node: ReactNode; qualified: React.ReactNode; format: Intl.NumberFormatOptions; promise: Promise<void>; list: Array<string>; record: Record<string, number>; element: HTMLDivElement; exclude: Exclude<ReactNode, null | undefined | boolean> };
export interface Generic<T extends string = 'a', U = T> extends Named { value: T; other: U }
export interface Extends extends Generic<'b'>, React.HTMLAttributes<HTMLDivElement> { extra: number }
export declare const Count: number;
export declare const Fixed: readonly ['a', 'b'];
export type Query = typeof Count;
/** Reads the value. */
export declare function read(input: string, ...more: number[]): string;
export declare function isSized(value: unknown): value is Size;
export declare function Destructured({ a, b }: { a: string; b: number }): React.ReactElement;
export declare const Plain: ForwardRefExoticComponent<SizeProps & RefAttributes<HTMLDivElement>>;
`,
  'shared.d.ts': `
export type Size = 'sm' | 'md' | 'lg';
export interface SizeProps { size?: Size }
export interface Named { name?: string }
`,
  'parts.d.ts': `
import type * as React from 'react';
import type { ForwardRefExoticComponent, RefAttributes, FC, ComponentType, ReactElement, HTMLAttributes, ButtonHTMLAttributes } from 'react';
import type { Size } from './shared.js';
type Own = {
  /** The shown label. */
  label?: string;
  size?: Size;
  onPick?: (value: string) => void;
  tone?: 'calm' | 'loud';
};
export type BoxProps = Own & Omit<HTMLAttributes<HTMLDivElement>, keyof Own>;
export declare const Box: ForwardRefExoticComponent<BoxProps & RefAttributes<HTMLDivElement>>;
export type NameArms = { 'aria-label': string; 'aria-labelledby'?: never } | { 'aria-label'?: never; 'aria-labelledby': string } | { title: string };
export type ChooserProps = Own & NameArms;
export declare const Chooser: ForwardRefExoticComponent<ChooserProps & RefAttributes<HTMLElement>>;
type StackProps = { layout?: 'stack'; rows?: number };
type GridProps = { layout: 'grid'; columns: number };
export declare const Layout: ForwardRefExoticComponent<(StackProps & RefAttributes<HTMLDivElement>) | (GridProps & { ref?: never })>;
export declare const Fc: FC<{ a?: string }>;
export declare const Ct: ComponentType<{ b: number }>;
export type ListProps<T extends { id: string }> = { items: T[]; render?: (item: T) => React.ReactNode };
export interface ListComponent {
  <T extends { id: string } = { id: string }>(props: ListProps<T> & RefAttributes<HTMLUListElement>): ReactElement | null;
}
export declare const List: ListComponent & { Item: ForwardRefExoticComponent<HTMLAttributes<HTMLLIElement> & RefAttributes<HTMLLIElement>> };
export declare const Panel: {
  Root: ForwardRefExoticComponent<BoxProps & RefAttributes<HTMLDivElement>>;
  Title: FC<{ text: string }>;
  Close: (props: { onClose: () => void }) => ReactElement;
};
export declare const Self: ForwardRefExoticComponent<BoxProps & RefAttributes<HTMLDivElement>> & { Root: typeof Self };
export declare function functionComponent(props: { c?: boolean }): ReactElement;
export declare function hook(): { size: Size };
export type Picked = Pick<Own, 'label' | 'size'> & Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'className'>;
export declare const PickedComponent: FC<Picked>;
export type Dup = { size?: Size; flag?: boolean } & { size: 'sm' | 'md' | 'lg'; flag: boolean };
export declare const DupComponent: FC<Dup>;
export type Agree = Omit<{ a: string; mode: 'x' } | { a: string; mode: 'y' }, 'mode'>;
export declare const AgreeComponent: FC<Agree>;
export type DocLeft = {
  /** left doc */
  both?: string;
  onlyLeft?: string;
};
export type DocRight = {
  /** right doc */
  both?: string;
  /** right only */
  onlyRight?: string;
};
export declare const DocComponent: FC<DocLeft & DocRight>;
export {};
`,
});

/** Every public export of the synthetic package owned by one stand-in owner, so ownership is not under test. */
export function ownedByFixture(graph) {
  const names = graph.entries.flatMap(({ key, exports }) => exports.map(({ name }) => [key, name]));
  const exceptions = {};
  for (const [key, name] of names) (exceptions[key] ??= {})[name] = { owner: 'shared', reason: 'a synthetic export' };
  return exceptions;
}

/** A declaration set of one `index.d.ts` that must be rejected, or read. */
export const single = (text) => withHeaders({ 'index.d.ts': text });

/** The real package: its shipped declarations, manifest and family facts, as `pnpm generate` wrote them. */
export function realInputs() {
  const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
  const readGenerated = (file) => readFileSync(resolve(packageRoot, 'generated', file), 'utf8').split('\n').filter((line) => !line.startsWith('// @generated-')).join('\n');
  const contract = JSON.parse(readGenerated('r1-6-contract.json'));
  const descriptor = JSON.parse(readGenerated('descriptor.json'));
  const exportBySlug = new Map(descriptor.bindings.map(({ binding, export: name }) => [binding.slice('muxui:component:'.length, binding.indexOf('#')), name]));
  const families = contract.components.map(({ slug, source, module }) => ({ slug, exportName: exportBySlug.get(slug), source, module }));
  return { declarations: generatedDeclarations(), manifest, families };
}
