// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { ReactElement } from 'react';

/** React Aria's slider track, fill, and thumb, with the thumb's hover, press, and key motion. A read-only slider keeps its thumb still. */
export declare function ColorSliderMotionTrack(props: { readOnly?: boolean }): ReactElement;
