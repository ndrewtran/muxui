// Types tsc reads where a TypeScript family (Decision 0031) imports this JavaScript
// module. Only the build reads them: the package ships the .mjs, and no shipped
// declaration names it. Remove this file when the module moves to TypeScript.
import type { ReactElement, ReactNode, Ref } from 'react';
import type { RadioRenderProps } from 'react-aria-components';

/** Moves one selected dot between the radios of the group it wraps, and hands the group element to `rootRef`. */
export declare function RadioGroupMotion(props: { children: ReactElement; rootRef?: Ref<HTMLDivElement> | undefined }): ReactElement;

/** A radio's indicator, which presses in while the radio is pressed and neither disabled nor read-only. */
export declare function RadioMotionIndicator(props: {
  children?: ReactNode;
  renderProps?: Pick<RadioRenderProps, 'isPressed' | 'isDisabled' | 'isReadOnly'>;
}): ReactElement;
