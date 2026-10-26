import React from 'react';
import type { ForwardRefExoticComponent, ForwardedRef, HTMLAttributes, RefAttributes, SVGAttributes } from 'react';
import { Label as AriaLabel, ProgressBar as AriaProgressBar } from 'react-aria-components';
import { h, cx, nativePart } from './part-utils.ts';
import type { PartProps } from './part-utils.ts';

/**
 * The props Mux UI defines for ProgressCircle.Root, the compound's root; the catalog's
 * web.react API is derived from this type (Decision 0031). Track, Label and Value take native attributes.
 */
type ProgressCircleOwnProps = {
  /** The progress between `minValue` and `maxValue`; `null` shows indeterminate progress. */
  value?: number | null;
  /** The value at which the circle is empty. */
  minValue?: number;
  /** The value at which the circle is full. */
  maxValue?: number;
  /** The circle's diameter. */
  size?: 'sm' | 'md' | 'lg';
  /** Accessible name shorthand; explicit aria-label or aria-labelledby takes precedence. */
  label?: string;
};

export type ProgressCircleProps = ProgressCircleOwnProps & HTMLAttributes<HTMLDivElement>;
export type ProgressCircleRootProps = ProgressCircleProps;
export type ProgressCircleTrackProps = SVGAttributes<SVGSVGElement>;
export type ProgressCircleLabelProps = PartProps<HTMLSpanElement>;
export type ProgressCircleValueProps = PartProps<HTMLSpanElement>;

/* ProgressCircle */
const circleSizes = Object.freeze({ sm: [32, 3], md: [48, 4], lg: [64, 5] });
const ProgressCircleContext = React.createContext<{ percentage: number | null; size: 'sm' | 'md' | 'lg' }>({ percentage: null, size: 'md' });
const ProgressCircleRoot = /*#__PURE__*/ React.forwardRef<HTMLDivElement, ProgressCircleProps>(function ProgressCircleRoot({ value = null, minValue = 0, maxValue = 100, size = 'md', className, children, label, ...props }, ref) {
  const normalizedValue = value == null || !Number.isFinite(value) ? null : value;
  const percentage = normalizedValue == null ? null : Math.max(0, Math.min(100, ((normalizedValue - minValue) / (maxValue - minValue || 1)) * 100));
  const hasExplicitName = props['aria-label'] != null || props['aria-labelledby'] != null;
  const nameFallback = !hasExplicitName && label != null ? { 'aria-label': label } : {};
  return h(ProgressCircleContext.Provider, { value: { percentage, size } }, h(AriaProgressBar, { ...props, ...nameFallback, ref, value: normalizedValue == null ? undefined : normalizedValue, isIndeterminate: normalizedValue == null, minValue, maxValue, ...{ label, 'data-muxui-state-indeterminate': percentage == null ? '' : undefined, 'data-complete': percentage === 100 ? '' : undefined }, className: cx('muxui-progress-circle', size !== 'md' && `muxui-progress-circle--${size}`, className) }, children));
});
const ProgressCircleTrack = /*#__PURE__*/ React.forwardRef<SVGSVGElement, ProgressCircleTrackProps>(function ProgressCircleTrack({ className, ...props }, ref) {
  const { percentage, size } = React.useContext(ProgressCircleContext);
  const [dimension, stroke] = circleSizes[size] ?? circleSizes.md;
  const radius = (dimension - stroke) / 2;
  return h('svg', { ...props, ref, className: cx('muxui-progress-circle__track', className), viewBox: `0 0 ${dimension} ${dimension}`, fill: 'none', 'aria-hidden': true }, h('circle', { className: 'muxui-progress-circle__rail', cx: dimension / 2, cy: dimension / 2, r: radius, strokeWidth: stroke }), h('circle', { className: 'muxui-progress-circle__indicator', cx: dimension / 2, cy: dimension / 2, r: radius, strokeWidth: stroke, strokeLinecap: 'round', pathLength: 100, strokeDasharray: 100, strokeDashoffset: percentage == null ? undefined : 100 - percentage, 'data-muxui-state-indeterminate': percentage == null ? '' : undefined }));
});
const ProgressCircleLabel = /*#__PURE__*/ React.forwardRef<HTMLSpanElement, ProgressCircleLabelProps>(function ProgressCircleLabel(props, ref) { return h(AriaLabel, { ...props, ref: ref as ForwardedRef<HTMLLabelElement>, className: cx('muxui-progress-circle__label', props.className) }); });
const ProgressCircleValue = /*#__PURE__*/ React.forwardRef<HTMLSpanElement, ProgressCircleValueProps>(function ProgressCircleValue({ children, ...props }, ref) { const { percentage } = React.useContext(ProgressCircleContext); return nativePart('span', 'muxui-progress-circle__value', props, ref, children ?? (percentage == null ? null : `${Math.round(percentage)}%`)); });
export const ProgressCircle: {
  Root: ForwardRefExoticComponent<ProgressCircleProps & RefAttributes<HTMLDivElement>>;
  Track: ForwardRefExoticComponent<ProgressCircleTrackProps & RefAttributes<SVGSVGElement>>;
  Label: ForwardRefExoticComponent<ProgressCircleLabelProps & RefAttributes<HTMLSpanElement>>;
  Value: ForwardRefExoticComponent<ProgressCircleValueProps & RefAttributes<HTMLSpanElement>>;
} = /*#__PURE__*/ Object.freeze({
  Root: ProgressCircleRoot,
  Track: ProgressCircleTrack,
  Label: ProgressCircleLabel,
  Value: ProgressCircleValue,
});
