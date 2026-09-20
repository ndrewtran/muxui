import React from 'react';

const h = React.createElement;
const AVATAR_SIZES = new Set(['sm', 'md', 'lg']);
const AvatarContext = React.createContext(null);

function classNames(...values) {
  return values.filter(Boolean).join(' ');
}

function normalizeSize(size) {
  if (!AVATAR_SIZES.has(size)) throw new TypeError(`Avatar size must be one of: ${[...AVATAR_SIZES].join(', ')}.`);
  return size;
}

function imageSourceKey(src, srcSet) {
  return [src ?? '', srcSet ?? ''].join('\u0000');
}

function hasImageSource(src, srcSet) {
  return [src, srcSet].some((value) => typeof value === 'string' && value.trim().length > 0);
}

function assignRef(ref, value) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

function collectAvatarParts(children, parts = []) {
  React.Children.forEach(children, (child) => {
    if (child == null || typeof child === 'boolean') return;
    if (!React.isValidElement(child)) {
      throw new TypeError('Avatar.Root accepts Avatar.Image and Avatar.Fallback as direct children or fragment children.');
    }
    if (child.type === React.Fragment) {
      collectAvatarParts(child.props.children, parts);
      return;
    }
    if (child.type !== AvatarImage && child.type !== AvatarFallback) {
      throw new TypeError('Avatar.Root accepts Avatar.Image and Avatar.Fallback as direct children or fragment children.');
    }
    parts.push(child);
  });
  return parts;
}

const AvatarImage = React.forwardRef(function AvatarImage({
  alt = '',
  src,
  srcSet,
  className,
  hidden,
  onLoad,
  onError,
  ...props
}, ref) {
  const context = React.useContext(AvatarContext);
  if (!context) throw new Error('Avatar.Image must be used inside Avatar.Root.');
  const key = imageSourceKey(src, srcSet);
  const sourceAvailable = hasImageSource(src, srcSet);
  const imageRef = React.useRef(null);
  const setImageRef = React.useCallback((node) => {
    imageRef.current = node;
    assignRef(ref, node);
  }, [ref]);
  React.useEffect(() => {
    context.reconcileImage(key, imageRef.current, sourceAvailable);
  }, [context, key, sourceAvailable]);
  const failed = sourceAvailable && context.failedKey === key;
  const loaded = sourceAvailable && context.loadedKey === key;
  const unavailable = !sourceAvailable;
  const handleLoad = (event) => {
    onLoad?.(event);
    context.markLoaded(key);
  };
  const handleError = (event) => {
    onError?.(event);
    context.markFailure(key);
  };
  return h('img', {
    ...props,
    ref: setImageRef,
    alt,
    src,
    srcSet,
    hidden: Boolean(hidden || unavailable || failed),
    'aria-hidden': unavailable || failed || context.rootHasName ? true : props['aria-hidden'],
    onLoad: handleLoad,
    onError: handleError,
    className: classNames('muxui-avatar__image', className),
    'data-error': failed ? '' : undefined,
    'data-loaded': loaded ? '' : undefined,
  });
});

AvatarImage.displayName = 'Avatar.Image';

const AvatarFallback = React.forwardRef(function AvatarFallback({
  children,
  className,
  hidden,
  ...props
}, ref) {
  const context = React.useContext(AvatarContext);
  if (!context) throw new Error('Avatar.Fallback must be used inside Avatar.Root.');
  const fallbackHidden = context.imageVisible;
  const decorative = context.imageVisible || context.imageDecorative || context.rootHasName;
  return h('span', {
    ...props,
    ref,
    hidden: Boolean(hidden || fallbackHidden),
    'aria-hidden': decorative ? true : props['aria-hidden'],
    className: classNames('muxui-avatar__fallback', className),
  }, children);
});

AvatarFallback.displayName = 'Avatar.Fallback';

const AvatarRoot = React.forwardRef(function AvatarRoot({
  size = 'md',
  children,
  className,
  role,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  'aria-hidden': ariaHidden,
  ...props
}, ref) {
  const resolvedSize = normalizeSize(size);
  const parts = collectAvatarParts(children);
  const imageChild = parts.find((child) => child.type === AvatarImage);
  const hasImage = Boolean(imageChild);
  const imageAlt = hasImage && typeof imageChild.props.alt === 'string' ? imageChild.props.alt : '';
  const imageKey = hasImage ? imageSourceKey(imageChild.props.src, imageChild.props.srcSet) : null;
  const imageAvailable = hasImage && hasImageSource(imageChild.props.src, imageChild.props.srcSet);
  const imageDecorative = hasImage && imageAlt.trim().length === 0;
  const [imageState, setImageState] = React.useState({ key: null, status: null });
  const imageStatus = imageState.key === imageKey ? imageState.status : null;
  const imageFailed = imageAvailable && imageStatus === 'error';
  const imageVisible = imageAvailable && !imageFailed;
  const rootHasName = Boolean(ariaLabel || ariaLabelledby);
  const recoveryName = hasImage && !imageVisible && imageAlt.trim() && !rootHasName && !ariaHidden ? imageAlt : undefined;
  const hasImageRole = !ariaHidden && (rootHasName || recoveryName);
  const markFailure = React.useCallback((key) => {
    setImageState((current) => current.key === key && current.status === 'error'
      ? current
      : { key, status: 'error' });
  }, []);
  const markLoaded = React.useCallback((key) => {
    setImageState((current) => current.key === key && current.status === 'loaded'
      ? current
      : { key, status: 'loaded' });
  }, []);
  const reconcileImage = React.useCallback((key, image, available) => {
    if (!available || !image?.complete) return;
    if (image.naturalWidth > 0) markLoaded(key);
    else markFailure(key);
  }, [markFailure, markLoaded]);
  React.useEffect(() => {
    setImageState((current) => current.key === imageKey ? current : { key: imageKey, status: null });
  }, [imageKey]);
  const context = React.useMemo(() => ({
    hasImage,
    imageAvailable,
    imageVisible,
    imageDecorative,
    failedKey: imageFailed ? imageKey : null,
    loadedKey: imageStatus === 'loaded' ? imageKey : null,
    rootHasName: rootHasName || Boolean(recoveryName),
    markFailure,
    markLoaded,
    reconcileImage,
  }), [hasImage, imageAvailable, imageVisible, imageDecorative, imageFailed, imageKey, imageStatus, markFailure, markLoaded, reconcileImage, recoveryName, rootHasName]);
  return h(AvatarContext.Provider, { value: context }, h('span', {
    ...props,
    ref,
    role: role ?? (hasImageRole ? 'img' : undefined),
    'aria-label': ariaLabel ?? recoveryName,
    'aria-labelledby': ariaLabelledby,
    'aria-hidden': ariaHidden,
    className: classNames('muxui-avatar', `muxui-avatar--${resolvedSize}`, className),
    'data-size': resolvedSize,
    'data-image-state': !hasImage || !imageAvailable ? 'fallback' : imageFailed ? 'error' : imageStatus === 'loaded' ? 'loaded' : 'loading',
  }, children));
});

AvatarRoot.displayName = 'Avatar.Root';

export const Avatar = Object.freeze({
  Root: AvatarRoot,
  Image: AvatarImage,
  Fallback: AvatarFallback,
});
