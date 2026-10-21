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
