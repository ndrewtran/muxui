// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { ReactElement, Ref } from 'react';

/** Hands a GridList's row hover and press motion to its root; `children` is the React Aria GridList element. */
export declare function GridListMotion(props: { children: ReactElement; rootRef?: Ref<HTMLDivElement> | undefined }): ReactElement;
