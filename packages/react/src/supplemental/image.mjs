import React from 'react';

const h = React.createElement;
const IMAGE_RADII = new Set(['none', 'sm', 'md', 'lg', 'full']);
const IMAGE_FITS = new Set(['cover', 'contain', 'fill', 'none']);

function normalize(value, allowed, option) {
  if (!allowed.has(value)) throw new TypeError(`Image ${option} must be one of: ${[...allowed].join(', ')}.`);
  return value;
}

function sourceKey(src, srcSet, fallbackSrc, fallbackSrcSet) {
  return [src ?? '', srcSet ?? '', fallbackSrc ?? '', fallbackSrcSet ?? ''].join('\u0000');
}

function hasSource(src, srcSet) {
  return [src, srcSet].some((value) => typeof value === 'string' && value.trim().length > 0);
}

function assignRef(ref, value) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

function classNames(...values) {
  return values.filter(Boolean).join(' ');
}

/** A Mux-styled native image with bounded, one-shot source recovery. */
export const Image = React.forwardRef(function Image({
  alt,
  src,
  srcSet,
  fallbackSrc,
  fallbackSrcSet,
  radius = 'none',
  fit = 'cover',
  className,
  onError,
  ...props
}, ref) {
  if (typeof alt !== 'string') throw new TypeError('Image requires an alt string; use alt="" for decorative images.');
  const resolvedRadius = normalize(radius, IMAGE_RADII, 'radius');
  const resolvedFit = normalize(fit, IMAGE_FITS, 'fit');
  const key = sourceKey(src, srcSet, fallbackSrc, fallbackSrcSet);
  const [recovery, setRecovery] = React.useState({ key: null, mode: null });
  const recoveryMode = recovery.key === key ? recovery.mode : null;
  const imageRef = React.useRef(null);
  const setImageRef = React.useCallback((node) => {
    imageRef.current = node;
    assignRef(ref, node);
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
  const handleError = (event) => {
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
  return h('img', {
    ...props,
    ref: setImageRef,
    alt,
    src: usingFallback ? fallbackSrc : src,
    srcSet: usingFallback ? fallbackSrcSet : srcSet,
    onError: handleError,
    className: classNames(
      'muxui-image',
      resolvedRadius !== 'none' && `muxui-image-radius-${resolvedRadius}`,
      `muxui-image--fit-${resolvedFit}`,
      failed && 'muxui-image--error',
      className,
    ),
    'data-fallback': usingFallback ? '' : undefined,
    'data-error': failed ? '' : undefined,
  });
});

Image.displayName = 'Image';
