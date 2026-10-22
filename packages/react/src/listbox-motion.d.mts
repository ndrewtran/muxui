// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { ReactElement, Ref } from 'react';

/** Keeps React Aria in control while one selected option's background travels between options; `children` is the ListBox element. */
export declare function ListBoxMotion(props: { children: ReactElement; selectionMode?: 'none' | 'single' | 'multiple'; rootRef?: Ref<HTMLDivElement> }): ReactElement;
