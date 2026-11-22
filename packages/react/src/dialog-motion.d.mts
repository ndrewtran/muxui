// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { ReactElement, ReactNode, RefObject } from 'react';

export interface DialogMotionProps {
  children?: ReactNode;
  originRef?: RefObject<Element | null>;
  /** Whether the panel is a sheet: it slides up from the bottom edge and a drag can dismiss it. */
  sheet?: boolean;
  /** Whether a drag on a sheet's grip or title dismisses it; true unless set. */
  draggable?: boolean;
  onExitComplete?: () => void;
  onReducedChange?: (reduced: boolean) => void;
}

/** Animates a modal's panel while React Aria owns the modal lifecycle and focus. */
export declare function DialogMotion(props: DialogMotionProps): ReactElement;

export interface ModalMotionOptions {
  node: HTMLElement | null;
  isOpen: boolean;
  triggerRef?: RefObject<Element | null>;
  reducedAttribute?: string;
  /** Whether the panel fades as it slides and scales; true unless set. */
  fade?: boolean;
  onExitComplete?: () => void;
  onReducedChange?: (reduced: boolean) => void;
}

/** Animates a modal's panel node while React Aria owns the modal lifecycle and focus. It renders nothing. */
export declare function useModalMotion(options: ModalMotionOptions): null;
