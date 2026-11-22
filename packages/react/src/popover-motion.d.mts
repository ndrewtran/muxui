// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import type { PopoverProps } from 'react-aria-components';

/** A React Aria Popover that animates its open and close cycle; `data-muxui-modal` reaches the DOM. */
export declare const PopoverMotion: ForwardRefExoticComponent<PopoverProps & { 'data-muxui-modal'?: boolean } & RefAttributes<HTMLElement>>;
