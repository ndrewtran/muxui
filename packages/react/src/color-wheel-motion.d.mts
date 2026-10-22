// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { ReactElement } from 'react';

/** React Aria's wheel track and thumb, with the thumb's hover and press motion. A read-only wheel keeps its thumb still. */
export declare function ColorWheelMotionTrack(props: { readOnly?: boolean }): ReactElement;
