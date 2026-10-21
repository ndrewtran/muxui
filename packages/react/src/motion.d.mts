// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { Easing } from 'motion/react';

/** Reports whether reduced motion applies to a node, now and on every change. Returns the function that stops observing. */
export declare function observeReducedMotion(node: Element, triggerNode: Element | null | undefined, onChange: (reduced: boolean) => void): () => void;

/** The tween a role resolves to: its settle duration in seconds, and the curve it follows. */
export interface MotionTransition {
  duration: number;
  ease: Easing;
}

/** The Motion spring a role resolves to. `visualDuration` and `bounce` are the perceived settings the spring runs, `duration` bounds the whole interpolation, and `opacity` is a tween on the role's curve. */
export interface MotionSpring {
  type: 'spring';
  duration: number;
  visualDuration: number;
  bounce: number;
  opacity: { type: 'tween'; duration: number; ease: Easing };
}

/** The role's Motion spring for physical values, read from the node's motion tokens. Null while motion is reduced or the role has no timing. */
export declare function resolvedMotionSpring(node: Element | null | undefined, triggerNode: Element | null | undefined, durationRole?: string, easingRole?: string): MotionSpring | null;

/** The role's tween for physical or opacity values, read from the node's motion tokens: its settle duration and curve. Null while motion is reduced or the role has no timing. */
export declare function resolvedMotionTransition(node: Element | null | undefined, triggerNode: Element | null | undefined, durationRole?: string, easingRole?: string): MotionTransition | null;
