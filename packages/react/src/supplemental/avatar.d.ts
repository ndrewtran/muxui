import type * as React from 'react';

export type AvatarSize = 'sm' | 'md' | 'lg';
export type AvatarRootProps = React.HTMLAttributes<HTMLSpanElement> & { size?: AvatarSize; children?: React.ReactNode };
export type AvatarImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'alt' | 'className'> & { alt?: string; className?: string };
export type AvatarFallbackProps = React.HTMLAttributes<HTMLSpanElement>;

export declare const Avatar: {
  Root: React.ForwardRefExoticComponent<AvatarRootProps & React.RefAttributes<HTMLSpanElement>>;
  Image: React.ForwardRefExoticComponent<AvatarImageProps & React.RefAttributes<HTMLImageElement>>;
  Fallback: React.ForwardRefExoticComponent<AvatarFallbackProps & React.RefAttributes<HTMLSpanElement>>;
};
