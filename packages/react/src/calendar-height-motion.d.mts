// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { ReactElement, ReactNode } from 'react';

/** Measures a calendar's grid and animates the height of its body when the grid resizes, without scaling its dates or text. */
export declare function CalendarHeightMotion(props: { children?: ReactNode }): ReactElement;
