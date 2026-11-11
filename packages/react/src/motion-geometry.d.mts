// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { Ref } from 'react';

/** Hands `node` to a forwarded ref and returns the function that detaches it. */
export declare function attachRef<T>(ref: Ref<T> | undefined, node: T | null): () => void;

/** Calls `onChange` when any of `attributes` changes on the elements or their ancestors, and returns the function that stops watching. */
export declare function observeAncestorAttributes(elements: readonly (Element | null | undefined)[], attributes: readonly string[], onChange: () => void): () => void;
