import React from 'react';
import type { ForwardRefExoticComponent, HTMLAttributes, ImgHTMLAttributes, ReactElement, ReactNode, RefAttributes, SyntheticEvent } from 'react';
import { attachRef } from '../motion-geometry.mjs';

/** The sizes of an Avatar. */
export type AvatarSize = 'sm' | 'md' | 'lg';

/**
 * The props Mux UI defines for Avatar.Root, the compound's root; the catalog's
 * web.react API is derived from this interface (Decision 0031). Avatar.Image and
 * Avatar.Fallback take native image and span attributes.
 */
interface AvatarOwnProps {
  /** The avatar size. */
  size?: AvatarSize;
}

export type AvatarRootProps = AvatarOwnProps & HTMLAttributes<HTMLSpanElement> & {
  /** Avatar.Image and Avatar.Fallback, directly or inside fragments. */
  children?: ReactNode;
};
export type AvatarImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'alt' | 'className'> & { /** Required; use an empty string for a decorative avatar. */ alt: string; className?: string };
export type AvatarFallbackProps = HTMLAttributes<HTMLSpanElement>;

type ImageStatus = 'loaded' | 'error';
interface AvatarContextValue {
  hasImage: boolean;
  imageAvailable: boolean;
  imageLoaded: boolean;
  imageDecorative: boolean;
  failedKey: string | null;
  loadedKey: string | null;
  rootHasName: boolean;
  markFailure: (key: string) => void;
  markLoaded: (key: string) => void;
  reconcileImage: (key: string, image: HTMLImageElement | null, available: boolean) => void;
}
type AvatarPart = ReactElement<Partial<AvatarImageProps> & { children?: ReactNode }>;

const h = React.createElement;
// Keyed by the type, so a size added to it must be added here too.
const AVATAR_SIZES: Readonly<Record<AvatarSize, true>> = { sm: true, md: true, lg: true };
const AvatarContext = React.createContext<AvatarContextValue | null>(null);

function classNames(...values: unknown[]) {
  return values.filter(Boolean).join(' ');
}

// Untyped callers can pass anything; Object.hasOwn alone would coerce ['md'] to a key.
function normalizeSize(size: AvatarSize) {
  if (typeof size !== 'string' || !Object.hasOwn(AVATAR_SIZES, size)) throw new TypeError(`Avatar size must be one of: ${Object.keys(AVATAR_SIZES).join(', ')}.`);
  return size;
}

function imageSourceKey(src?: string, srcSet?: string) {
  return [src ?? '', srcSet ?? ''].join('\u0000');
}

function hasImageSource(src?: string, srcSet?: string) {
  return [src, srcSet].some((value) => typeof value === 'string' && value.trim().length > 0);
}

function collectAvatarParts(children: ReactNode, parts: AvatarPart[] = []) {
  React.Children.forEach(children, (child) => {
    if (child == null || typeof child === 'boolean') return;
    if (!React.isValidElement<Partial<AvatarImageProps> & { children?: ReactNode }>(child)) {
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

const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(function AvatarImage({
  alt,
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
  if (typeof alt !== 'string') throw new TypeError('Avatar.Image requires an alt string; use alt="" for decorative avatars.');
  const key = imageSourceKey(src, srcSet);
  const sourceAvailable = hasImageSource(src, srcSet);
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const setImageRef = React.useCallback((node: HTMLImageElement | null) => {
    imageRef.current = node;
    const detach = attachRef(ref, node);
    return () => {
      detach();
      imageRef.current = null;
    };
  }, [ref]);
  React.useEffect(() => {
    context.reconcileImage(key, imageRef.current, sourceAvailable);
  }, [context, key, sourceAvailable]);
  const failed = sourceAvailable && context.failedKey === key;
  const loaded = sourceAvailable && context.loadedKey === key;
  const unavailable = !sourceAvailable;
  const handleLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    onLoad?.(event);
    context.markLoaded(key);
  };
  const handleError = (event: SyntheticEvent<HTMLImageElement>) => {
    onError?.(event);
    context.markFailure(key);
  };
  return h('img', {
    ...props,
    // A new element per source: a reused img keeps painting the previous
    // image over the fallback until the new source decodes.
    key,
    ref: setImageRef,
    alt,
    src,
    srcSet,
    hidden: Boolean(hidden || unavailable || failed),
    // Until it loads, the root carries the name and the image stays unnamed.
    'aria-hidden': !loaded || context.rootHasName ? true : props['aria-hidden'],
    onLoad: handleLoad,
    onError: handleError,
    className: classNames('muxui-avatar__image', className),
    'data-error': failed ? '' : undefined,
    'data-loaded': loaded ? '' : undefined,
  });
});

AvatarImage.displayName = 'Avatar.Image';

const AvatarFallback = React.forwardRef<HTMLSpanElement, AvatarFallbackProps>(function AvatarFallback({
  children,
  className,
  hidden,
  ...props
}, ref) {
  const context = React.useContext(AvatarContext);
  if (!context) throw new Error('Avatar.Fallback must be used inside Avatar.Root.');
  const fallbackHidden = context.imageLoaded;
  const decorative = context.imageLoaded || context.imageDecorative || context.rootHasName;
  return h('span', {
    ...props,
    ref,
    hidden: Boolean(hidden || fallbackHidden),
    'aria-hidden': decorative ? true : props['aria-hidden'],
    className: classNames('muxui-avatar__fallback', className),
  }, children);
});

AvatarFallback.displayName = 'Avatar.Fallback';

const AvatarRoot = React.forwardRef<HTMLSpanElement, AvatarRootProps>(function AvatarRoot({
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
  const imageAlt = imageChild && typeof imageChild.props.alt === 'string' ? imageChild.props.alt : '';
  const imageKey = imageChild ? imageSourceKey(imageChild.props.src, imageChild.props.srcSet) : null;
  const imageAvailable = imageChild !== undefined && hasImageSource(imageChild.props.src, imageChild.props.srcSet);
  const imageDecorative = hasImage && imageAlt.trim().length === 0;
  const [imageState, setImageState] = React.useState<{ key: string | null; status: ImageStatus | null }>({ key: null, status: null });
  const imageStatus = imageState.key === imageKey ? imageState.status : null;
  const imageFailed = imageAvailable && imageStatus === 'error';
  // The fallback shows while the image loads, after it fails, or with no source.
  const imageLoaded = imageAvailable && imageStatus === 'loaded';
  const rootHasName = Boolean(ariaLabel || ariaLabelledby);
  const recoveryName = hasImage && !imageLoaded && imageAlt.trim() && !rootHasName && !ariaHidden ? imageAlt : undefined;
  const hasImageRole = !ariaHidden && (rootHasName || recoveryName);
  const markFailure = React.useCallback((key: string) => {
    setImageState((current) => current.key === key && current.status === 'error'
      ? current
      : { key, status: 'error' });
  }, []);
  const markLoaded = React.useCallback((key: string) => {
    setImageState((current) => current.key === key && current.status === 'loaded'
      ? current
      : { key, status: 'loaded' });
  }, []);
  const reconcileImage = React.useCallback((key: string, image: HTMLImageElement | null, available: boolean) => {
    if (!available || !image?.complete) return;
    if (image.naturalWidth > 0) markLoaded(key);
    else markFailure(key);
  }, [markFailure, markLoaded]);
  React.useEffect(() => {
    setImageState((current) => current.key === imageKey ? current : { key: imageKey, status: null });
  }, [imageKey]);
  const context = React.useMemo<AvatarContextValue>(() => ({
    hasImage,
    imageAvailable,
    imageLoaded,
    imageDecorative,
    failedKey: imageFailed ? imageKey : null,
    loadedKey: imageStatus === 'loaded' ? imageKey : null,
    rootHasName: rootHasName || Boolean(recoveryName),
    markFailure,
    markLoaded,
    reconcileImage,
  }), [hasImage, imageAvailable, imageLoaded, imageDecorative, imageFailed, imageKey, imageStatus, markFailure, markLoaded, reconcileImage, recoveryName, rootHasName]);
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

export const Avatar: {
  Root: ForwardRefExoticComponent<AvatarRootProps & RefAttributes<HTMLSpanElement>>;
  Image: ForwardRefExoticComponent<AvatarImageProps & RefAttributes<HTMLImageElement>>;
  Fallback: ForwardRefExoticComponent<AvatarFallbackProps & RefAttributes<HTMLSpanElement>>;
} = Object.freeze({
  Root: AvatarRoot,
  Image: AvatarImage,
  Fallback: AvatarFallback,
});
