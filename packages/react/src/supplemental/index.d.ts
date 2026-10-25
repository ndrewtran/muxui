import type * as React from 'react';
import type { SupplementalActivation as PartUtilsActivation } from './part-utils.ts';

export type SupplementalActivation = PartUtilsActivation;

export type SupplementalFieldProps = {
  disabled?: boolean;
  invalid?: boolean;
  required?: boolean;
  readOnly?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

type PartProps<T extends HTMLElement = HTMLElement> = React.HTMLAttributes<T> & { className?: string };
type ButtonPartProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  disabled?: boolean;
  onActivate?: (event: SupplementalActivation) => void;
  className?: string;
};

export declare const supplementalFamilies: readonly [
  'AlertDialog', 'Avatar', 'ButtonGroup', 'Card', 'CheckboxField', 'ColorModeToggle', 'CommandPalette', 'HeaderNav', 'Image', 'InputTags', 'Input', 'MultiSelect', 'PaymentInput', 'ProgressCircle', 'RadioField', 'SelectNative', 'Sidebar', 'SwitchField', 'TagSelect', 'TextArea', 'Text'
];
