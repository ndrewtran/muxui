// @generated-from: packages/react/src/supplemental/icon-button.d.ts
// @generated-content-sha256: sha256:32166700c84db0c59ddcf7dac4b0631d839490916fe761a70f0c4bf77be2e084
import type * as React from 'react';
import type { ButtonProps } from '@muxui/react';

/** Supply an icon as children and at least one explicit accessible name. */
export type IconButtonProps = Omit<ButtonProps, 'aria-label' | 'aria-labelledby' | 'showTextWhileLoading'> & (
  | { 'aria-label': string; 'aria-labelledby'?: string }
  | { 'aria-label'?: string; 'aria-labelledby': string }
);

export declare const IconButton: React.ForwardRefExoticComponent<IconButtonProps & React.RefAttributes<HTMLButtonElement>>;
