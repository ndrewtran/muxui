// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.

/** Reports whether reduced motion applies to a node, now and on every change. Returns the function that stops observing. */
export declare function observeReducedMotion(node: Element, triggerNode: Element | null | undefined, onChange: (reduced: boolean) => void): () => void;
