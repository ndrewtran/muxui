// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { Placement } from 'react-aria-components';

/** The anchored geometry an overlay accepts, each part optional and checked when given. */
export interface OverlayGeometryInput {
  placement?: string;
  offset?: number;
  crossOffset?: number;
  shouldFlip?: boolean;
  containerPadding?: number;
}

/** The geometry an overlay passes React Aria: every part present, with the placement in React Aria's spelling. */
export interface OverlayGeometry {
  placement: Placement;
  offset: number;
  crossOffset: number;
  shouldFlip: boolean;
  containerPadding: number;
}

/** The value, or the fallback when it is undefined. Throws a TypeError for a value that is not finite or is negative. */
export declare function normalizeNonNegativeFinite(value: number | undefined, fallback: number, name: string): number;

/** The value, or the fallback when it is undefined. Throws a TypeError for a value that is not a boolean. */
export declare function normalizeBoolean(value: boolean | undefined, fallback: boolean, name: string): boolean;

/** Validates each part of an overlay's geometry, filling an undefined part from `defaults`. Throws a TypeError naming `name` for an invalid part. */
export declare function overlayGeometry(geometry: OverlayGeometryInput, defaults: Required<OverlayGeometryInput>, name: string): OverlayGeometry;
