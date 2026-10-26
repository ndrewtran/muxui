import React from 'react';
import type { ForwardRefExoticComponent, ImgHTMLAttributes, RefAttributes, SyntheticEvent } from 'react';
import { attachRef } from '../motion-geometry.mjs';

/** The corner radii of an Image. */
export type ImageRadius = 'none' | 'sm' | 'md' | 'lg' | 'full';
/** How an Image's picture fills its declared box. */
export type ImageFit = 'cover' | 'contain' | 'fill' | 'none';

/**
 * The props Mux UI defines for Image; the catalog's web.react API is derived from this
 * type (Decision 0031). The image's native attributes and events, such as src,
 * width, loading, and onError, pass through unchanged.
 * It is a type literal, not an interface, so the public props type stays assignable to
 * Record<string, unknown>, as it was before the move.
 */
type ImageOwnProps = {
  /** What the picture shows in its context, or an empty string for a decorative image. Required. */
  alt: string;
  /** A source tried once after the primary source fails to load. */
  fallbackSrc?: string;
  /** A source set tried once, with fallbackSrc, after the primary source fails to load. */
  fallbackSrcSet?: string;
  /** The corner radius. */
  radius?: ImageRadius;
  /** How the picture fills the box its width and height declare. */
  fit?: ImageFit;
};

export type ImageProps = ImageOwnProps & Omit<ImgHTMLAttributes<HTMLImageElement>, keyof ImageOwnProps | 'className'> & {
  className?: string;
};

type Recovery = { key: string | null; mode: 'fallback' | 'error' | null };

const h = React.createElement;
// Keyed by the types, so a value added to one must be added here too.
const IMAGE_RADII: Readonly<Record<ImageRadius, true>> = { none: true, sm: true, md: true, lg: true, full: true };
const IMAGE_FITS: Readonly<Record<ImageFit, true>> = { cover: true, contain: true, fill: true, none: true };

// Untyped callers can pass anything; Object.hasOwn alone would coerce ['md'] to a key.
function normalize<T extends string>(value: T, allowed: Readonly<Record<T, true>>, option: string): T {
  if (typeof value !== 'string' || !Object.hasOwn(allowed, value)) throw new TypeError(`Image ${option} must be one of: ${Object.keys(allowed).join(', ')}.`);
  return value;
}

function sourceKey(src?: string, srcSet?: string, fallbackSrc?: string, fallbackSrcSet?: string) {
  return [src ?? '', srcSet ?? '', fallbackSrc ?? '', fallbackSrcSet ?? ''].join('\u0000');
}

function hasSource(src?: string, srcSet?: string) {
  return [src, srcSet].some((value) => typeof value === 'string' && value.trim().length > 0);
}

// Native width/height map to `aspect-ratio: auto w / h`, so the source ratio
// replaces the declared box once it loads. A plain ratio keeps the declared box
// (and object-fit) while `block-size: auto` still scales it responsively. It is
// passed as a custom property so consumer classes can still set aspect-ratio.
function declaredAspectRatio(width: unknown, height: unknown) {
  const w = Number(width);
  const h = Number(height);
  return w > 0 && h > 0 && Number.isFinite(w) && Number.isFinite(h) ? `${w} / ${h}` : undefined;
}

function classNames(...values: unknown[]) {
  return values.filter(Boolean).join(' ');
}

/** A Mux-styled native image with bounded, one-shot source recovery. */
export const Image: ForwardRefExoticComponent<ImageProps & RefAttributes<HTMLImageElement>> = React.forwardRef<HTMLImageElement, ImageProps>(function Image({
  alt,
  src,
  srcSet,
  fallbackSrc,
  fallbackSrcSet,
  radius = 'none',
  fit = 'cover',
  className,
  style,
  onError,
  ...props
}, ref) {
  if (typeof alt !== 'string') throw new TypeError('Image requires an alt string; use alt="" for decorative images.');
  const resolvedRadius = normalize(radius, IMAGE_RADII, 'radius');
  const resolvedFit = normalize(fit, IMAGE_FITS, 'fit');
  const key = sourceKey(src, srcSet, fallbackSrc, fallbackSrcSet);
  const [recovery, setRecovery] = React.useState<Recovery>({ key: null, mode: null });
  const recoveryMode = recovery.key === key ? recovery.mode : null;
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const setImageRef = React.useCallback((node: HTMLImageElement | null) => {
    imageRef.current = node;
    const detach = attachRef(ref, node);
    return () => {
      detach();
      imageRef.current = null;
    };
  }, [ref]);
  const hasFallback = hasSource(fallbackSrc, fallbackSrcSet);
  const usingFallback = hasFallback && (recoveryMode === 'fallback' || recoveryMode === 'error');
  const failed = recoveryMode === 'error';
  const applyError = React.useCallback(() => {
    setRecovery((current) => {
      const mode = !usingFallback && hasFallback ? 'fallback' : 'error';
      return current.key === key && current.mode === mode ? current : { key, mode };
    });
  }, [hasFallback, key, usingFallback]);
  const handleError = (event: SyntheticEvent<HTMLImageElement>) => {
    onError?.(event);
    applyError();
  };
  React.useEffect(() => {
    setRecovery((current) => current.key === key ? current : { key, mode: null });
  }, [key]);
  React.useEffect(() => {
    const image = imageRef.current;
    if (!image?.complete || image.naturalWidth > 0) return;
    applyError();
  }, [applyError, key, usingFallback]);
  const aspectRatio = declaredAspectRatio(props.width, props.height);
  return h('img', {
    ...props,
    ref: setImageRef,
    alt,
    style: aspectRatio ? { '--muxui-image-ratio': aspectRatio, ...style } : style,
    src: usingFallback ? fallbackSrc : src,
    srcSet: usingFallback ? fallbackSrcSet : srcSet,
    onError: handleError,
    className: classNames(
      'muxui-image',
      resolvedRadius !== 'none' && `muxui-image--radius-${resolvedRadius}`,
      `muxui-image--fit-${resolvedFit}`,
      failed && 'muxui-image--error',
      className,
    ),
    'data-muxui-fallback': usingFallback ? '' : undefined,
    'data-muxui-error': failed ? '' : undefined,
  });
});

Image.displayName = 'Image';
