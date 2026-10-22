import type * as React from 'react';
import type { ButtonProps } from '@muxui/react';

/** Supply an icon as children and at least one explicit accessible name. */
export type IconButtonProps = Omit<ButtonProps, 'aria-label' | 'aria-labelledby' | 'showTextWhileLoading'> & (
  | { 'aria-label': string; 'aria-labelledby'?: string }
  | { 'aria-label'?: string; 'aria-labelledby': string }
);

export declare const IconButton: React.ForwardRefExoticComponent<IconButtonProps & React.RefAttributes<HTMLButtonElement>>;
