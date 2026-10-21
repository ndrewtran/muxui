// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { RefObject } from 'react';

export interface CandidateMotionOptions {
  active?: boolean;
  reveal?: boolean;
  angle?: number;
  triggerRef?: RefObject<Element | null>;
}

/** Finite feedback for owned candidate content. Initial SSR content stays still. */
export declare function useCandidateMotion(ref: RefObject<Element | null>, value: unknown, options?: CandidateMotionOptions): void;
