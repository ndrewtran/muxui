// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { ReactElement, ReactNode } from 'react';

/** Paints a range calendar's provisional range as row-local bands; the calendar state stays the only source of dates. */
export declare function RangeSelectionMotion(props: { children?: ReactNode }): ReactElement;
