import type * as React from 'react';

export type ImageRadius = 'none' | 'sm' | 'md' | 'lg' | 'full';
export type ImageFit = 'cover' | 'contain' | 'fill' | 'none';
export type ImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'alt' | 'className'> & {
  alt: string;
  fallbackSrc?: string;
  fallbackSrcSet?: string;
  radius?: ImageRadius;
  fit?: ImageFit;
  className?: string;
};

export declare const Image: React.ForwardRefExoticComponent<ImageProps & React.RefAttributes<HTMLImageElement>>;
