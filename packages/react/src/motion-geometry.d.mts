// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { Ref } from 'react';

/** Hands `node` to a forwarded ref and returns the function that detaches it. */
export declare function attachRef<T>(ref: Ref<T> | undefined, node: T | null): () => void;
