import React from 'react';
import type { CSSProperties, ForwardRefExoticComponent, HTMLAttributes, RefAttributes } from 'react';
import { cx, h, useIsomorphicLayoutEffect } from './part-utils.ts';

/** The sizes of a Skeleton.Circle, the same as Avatar's. */
export type SkeletonCircleSize = 'sm' | 'md' | 'lg';

/**
 * The props Mux UI defines for Skeleton.Root, the group; the catalog's web.react API is derived from this type
 * (Decision 0031). The group is the one loading status; the shapes inside it are hidden from assistive technology.
 */
type SkeletonOwnProps = {
  /** The loading status assistive technology reads for the whole group, such as Loading comments. */
  label?: string;
};

/** The props Mux UI defines for Skeleton.Line; its API is the line entry in the catalog's partApis. */
type SkeletonLineOwnProps = {
  /** The line's length: a CSS length or percentage, or a number of pixels. */
  width?: string | number;
};

/** The props Mux UI defines for Skeleton.Circle; its API is the circle entry in the catalog's partApis. */
type SkeletonCircleOwnProps = {
  /** The circle's size, matching an Avatar of the same size. */
  size?: SkeletonCircleSize;
};

/** The props Mux UI defines for Skeleton.Block; its API is the block entry in the catalog's partApis. */
type SkeletonBlockOwnProps = {
  /** The block's width: a CSS length or percentage, or a number of pixels. */
  width?: string | number;
  /** The block's height: a CSS length, or a number of pixels. It takes the place of the aspect ratio. */
  height?: string | number;
  /** The block's width-to-height ratio, such as 16 / 9, used when no height is given. */
  aspectRatio?: string | number;
};

type ShapeProps<Own> = Own & Omit<HTMLAttributes<HTMLSpanElement>, keyof Own | 'children' | 'dangerouslySetInnerHTML'>;

export type SkeletonRootProps = SkeletonOwnProps & Omit<HTMLAttributes<HTMLDivElement>, keyof SkeletonOwnProps | 'role' | 'dangerouslySetInnerHTML'>;
export type SkeletonLineProps = ShapeProps<SkeletonLineOwnProps>;
export type SkeletonCircleProps = ShapeProps<SkeletonCircleOwnProps>;
export type SkeletonBlockProps = ShapeProps<SkeletonBlockOwnProps>;

// Keyed by the type, so a size added to it must be added here too.
const CIRCLE_SIZES: Record<SkeletonCircleSize, true> = { sm: true, md: true, lg: true };
// The painted shapes: a line's bar, not the line, whose box is the whole line of text.
const SHAPES = '.muxui-skeleton__bar, .muxui-skeleton__circle, .muxui-skeleton__block';

type Outline = { x: number; y: number; width: number; height: number; radius: number };

/** A shape's corner radius in pixels, from its computed style; a percentage is of the shorter side. */
function radiusOf(shape: Element, width: number, height: number) {
  const value = getComputedStyle(shape).borderTopLeftRadius;
  const radius = Number.parseFloat(value) || 0;
  const pixels = value.trim().endsWith('%') ? (radius / 100) * Math.min(width, height) : radius;
  return Math.min(pixels, width / 2, height / 2);
}

/**
 * The outlines of the group's own shapes (not a nested group's), relative to the group's padding box, in its
 * untransformed pixels so a scaled ancestor does not shift the clip.
 */
function outlinesOf(group: HTMLElement): Outline[] {
  const box = group.getBoundingClientRect();
  const scale = group.offsetWidth > 0 ? box.width / group.offsetWidth : 1;
  if (!scale) return [];
  const round = (value: number) => Math.round(value * 100) / 100;
  return [...group.querySelectorAll(SHAPES)]
    .filter((shape) => shape.closest('.muxui-skeleton') === group)
    .map((shape) => {
      const rect = shape.getBoundingClientRect();
      const width = rect.width / scale;
      const height = rect.height / scale;
      return {
        x: round((rect.left - box.left) / scale - group.clientLeft),
        y: round((rect.top - box.top) / scale - group.clientTop),
        width: round(width),
        height: round(height),
        radius: round(radiusOf(shape, width, height)),
      };
    })
    .filter(({ width, height }) => width > 0 && height > 0);
}

const sameOutlines = (a: readonly Outline[], b: readonly Outline[]) => a.length === b.length
  && a.every((outline, index) => (Object.keys(outline) as (keyof Outline)[]).every((key) => outline[key] === b[index]?.[key]));

/**
 * Measures the group's shapes after every render and whenever the group or a shape resizes. The server and the
 * first client render have no outlines, so hydration matches and the sweep appears once the shapes are measured.
 */
function useOutlines(group: React.RefObject<HTMLDivElement | null>) {
  const [outlines, setOutlines] = React.useState<Outline[]>([]);
  useIsomorphicLayoutEffect(() => {
    const node = group.current;
    if (!node) return undefined;
    const measure = () => {
      const next = outlinesOf(node);
      setOutlines((previous) => (sameOutlines(previous, next) ? previous : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    for (const shape of node.querySelectorAll(SHAPES)) observer.observe(shape);
    return () => observer.disconnect();
  });
  return outlines;
}

function setRef<T>(ref: React.ForwardedRef<T>, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

const SkeletonRoot = /*#__PURE__*/ React.forwardRef<HTMLDivElement, SkeletonRootProps>(function SkeletonRoot({ label = 'Loading', className, children, ...props }, ref) {
  const group = React.useRef<HTMLDivElement | null>(null);
  const outlines = useOutlines(group);
  // useId's characters are not all valid in a url() reference.
  const clipId = `skeleton-clip${React.useId().replace(/[^a-zA-Z0-9_-]/gu, '')}`;
  const attach = React.useCallback((node: HTMLDivElement | null) => {
    group.current = node;
    setRef(ref, node);
  }, [ref]);
  return h('div', { ...props, ref: attach, role: 'status', className: cx('muxui-skeleton', className) },
    h('span', { className: 'muxui-skeleton__label' }, label),
    children,
    // One band for the whole group, clipped to the shapes' outlines, so one transform animation sweeps them all.
    outlines.length > 0 && h('span', { className: 'muxui-skeleton__sweep', 'aria-hidden': true, style: { clipPath: `url(#${clipId})` } },
      h('span', { className: 'muxui-skeleton__band' })),
    outlines.length > 0 && h('svg', { className: 'muxui-skeleton__clip', 'aria-hidden': true, focusable: 'false', width: 0, height: 0 },
      h('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' },
        outlines.map(({ x, y, width, height, radius }, index) => h('rect', { key: index, x, y, width, height, rx: radius, ry: radius })))));
});

/** A shape's size as an inline style, after the caller's own style so the props win. */
function sized(style: CSSProperties | undefined, size: CSSProperties) {
  const own = Object.fromEntries(Object.entries(size).filter(([, value]) => value !== undefined));
  return Object.keys(own).length > 0 ? { ...style, ...own } : style;
}

const SkeletonLine = /*#__PURE__*/ React.forwardRef<HTMLSpanElement, SkeletonLineProps>(function SkeletonLine({ width, className, style, ...props }, ref) {
  return h('span', { ...props, ref, 'aria-hidden': true, className: cx('muxui-skeleton__line', className), style: sized(style, { inlineSize: width }) },
    h('span', { className: 'muxui-skeleton__bar' }));
});

const SkeletonCircle = /*#__PURE__*/ React.forwardRef<HTMLSpanElement, SkeletonCircleProps>(function SkeletonCircle({ size = 'md', className, ...props }, ref) {
  if (typeof size !== 'string' || !Object.hasOwn(CIRCLE_SIZES, size)) throw new TypeError(`Skeleton.Circle size must be one of: ${Object.keys(CIRCLE_SIZES).join(', ')}.`);
  return h('span', { ...props, ref, 'aria-hidden': true, 'data-muxui-size': size, className: cx('muxui-skeleton__circle', className) });
});

const SkeletonBlock = /*#__PURE__*/ React.forwardRef<HTMLSpanElement, SkeletonBlockProps>(function SkeletonBlock({ width, height, aspectRatio, className, style, ...props }, ref) {
  return h('span', { ...props, ref, 'aria-hidden': true, className: cx('muxui-skeleton__block', className), style: sized(style, { inlineSize: width, blockSize: height, aspectRatio: height === undefined ? aspectRatio : 'auto' }) });
});

/**
 * Placeholders that hold the place of content while it loads. Root is the group: one loading status for assistive
 * technology and one sweep over all its shapes. Line, Circle and Block are the shapes, hidden from assistive technology.
 */
export const Skeleton: {
  Root: ForwardRefExoticComponent<SkeletonRootProps & RefAttributes<HTMLDivElement>>;
  Line: ForwardRefExoticComponent<SkeletonLineProps & RefAttributes<HTMLSpanElement>>;
  Circle: ForwardRefExoticComponent<SkeletonCircleProps & RefAttributes<HTMLSpanElement>>;
  Block: ForwardRefExoticComponent<SkeletonBlockProps & RefAttributes<HTMLSpanElement>>;
} = /*#__PURE__*/ Object.freeze({
  Root: SkeletonRoot,
  Line: SkeletonLine,
  Circle: SkeletonCircle,
  Block: SkeletonBlock,
});
