// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { ReactElement, Ref } from 'react';

/** Keeps focus, hover, and the moving highlight of a menu's items in step; `children` is the Menu list element. */
export declare function MenuMotion(props: { children: ReactElement; rootRef?: Ref<HTMLDivElement> }): ReactElement;
