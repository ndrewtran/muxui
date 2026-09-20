import type * as React from 'react';

export type SelectNativeVisualSize = 'sm' | 'md' | 'lg';
export type SelectNativeProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'size'> & {
  label?: React.ReactNode;
  description?: React.ReactNode;
  errorMessage?: React.ReactNode;
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
  /** String values select Mux control targets; positive numbers pass to native select size. */
  size?: SelectNativeVisualSize | number;
  className?: string;
};

export declare const SelectNative: React.ForwardRefExoticComponent<SelectNativeProps & React.RefAttributes<HTMLSelectElement>>;
