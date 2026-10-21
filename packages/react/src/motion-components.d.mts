// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { HTMLAttributes, ReactElement, ReactNode, RefObject } from 'react';

/** Keep the grouped chevron on the component spring, including reversals. */
export declare function useDisclosureIconMotion(ref: RefObject<Element | null>, isOpen: boolean, grouped?: boolean): void;

export interface MotionHeightProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  isOpen: boolean;
  triggerRef?: RefObject<Element | null>;
  hostRef?: RefObject<HTMLElement | null>;
  contentClassName?: string;
  onCloseComplete?: () => void;
  grouped?: boolean;
}

/** Animate a disclosure's measured content height without scaling its contents. */
export declare function MotionHeight(props: MotionHeightProps): ReactElement;

export interface MotionLifecycleOptions {
  isOpen: boolean;
  /** The placement the surface opens toward; it picks the side the entry and exit travel from. */
  placement?: string;
  triggerRef?: RefObject<Element | null>;
  /** The style property that carries the movement. \`translate\` composes with React Aria's placement transform. */
  property?: 'transform' | 'translate';
  entryOffset?: { x: number; y: number };
  exitOffset?: { x: number; y: number };
  onEntryComplete?: () => void;
  onExitComplete?: () => void;
}

/** Owns the pixels of one open and close cycle. Returns the ref callback for the animated element. */
export declare function useMotionLifecycle(options: MotionLifecycleOptions): (element: HTMLElement | null) => void;

/** Animates a node's reflow when `layoutKey` changes, on the independent translate channel. */
export declare function useMotionLayout(nodeRef: RefObject<Element | null>, layoutKey: unknown, triggerRef?: RefObject<Element | null>): void;
