// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { ReactElement, Ref } from 'react';

/** Slides a highlight between the selected toggle buttons of the group it wraps, and hands the group element to `rootRef`. A disabled group keeps it still. */
export declare function ToggleButtonGroupMotion(props: {
  children: ReactElement;
  selectionMode?: 'single' | 'multiple';
  disabled?: boolean;
  rootRef?: Ref<HTMLDivElement> | undefined;
}): ReactElement;
