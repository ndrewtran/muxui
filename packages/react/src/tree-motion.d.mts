// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { MutableRefObject, ReactElement, Ref } from 'react';

/** Animates a Tree's rows as items expand, collapse and select. `children` is the React Aria Tree element, and `controllerRef` receives the handle the tree calls before it reports an expansion change. */
export declare function TreeMotion(props: { children: ReactElement; rootRef?: Ref<HTMLDivElement> | undefined; controllerRef?: MutableRefObject<{ beforeExpandedChange(): void } | null> | undefined }): ReactElement;
