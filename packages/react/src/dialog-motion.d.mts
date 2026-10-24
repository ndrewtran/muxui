// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { ReactElement, ReactNode, RefObject } from 'react';

export interface DialogMotionProps {
  children?: ReactNode;
  originRef?: RefObject<Element | null>;
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
  onExitComplete?: () => void;
  onReducedChange?: (reduced: boolean) => void;
}

/** Animates a modal's panel node while React Aria owns the modal lifecycle and focus. It renders nothing. */
export declare function useModalMotion(options: ModalMotionOptions): null;
