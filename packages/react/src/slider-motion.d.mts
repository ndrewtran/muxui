// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { ReactElement } from 'react';

/** React Aria's slider track, fill, and thumb, with the thumb's hover, press, and key motion. The thumb carries the form `name`, and a read-only slider keeps it still. */
export declare function SliderMotionTrack(props: {
  orientation?: 'horizontal' | 'vertical';
  readOnly?: boolean;
  name?: string | undefined;
}): ReactElement;
