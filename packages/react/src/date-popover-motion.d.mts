// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { ReactElement, ReactNode, RefObject } from 'react';
import type { Placement } from 'react-aria-components';

export interface DatePopoverMotionProps {
  children?: ReactNode;
  /** The side the popover opens toward; without one React Aria's default applies. */
  placement?: Placement;
  /** The element the popover anchors to; without one it uses the enclosing popover context's trigger. */
  triggerRef?: RefObject<Element | null>;
  /** The class of the date field that owns this popover, added to the popover's own. */
  ownerClassName: string;
}

/** Animates a date popover's entry and exit while React Aria keeps focus and portal ownership until the exit completes. */
export declare function DatePopoverMotion(props: DatePopoverMotionProps): ReactElement;
