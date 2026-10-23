import React from 'react';
import { Label as AriaLabel, ProgressBar as AriaProgressBar } from 'react-aria-components';
import { h, cx, nativePart } from './part-utils.mjs';

/* ProgressCircle */
const circleSizes = Object.freeze({ sm: [32, 3], md: [48, 4], lg: [64, 5] });
const ProgressCircleContext = React.createContext({ percentage: null, size: 'md' });
export const ProgressCircle = {
  Root: React.forwardRef(function ProgressCircleRoot({ value = null, minValue = 0, maxValue = 100, size = 'md', className, children, label, ...props }, ref) {
    const normalizedValue = value == null || !Number.isFinite(value) ? null : value;
    const percentage = normalizedValue == null ? null : Math.max(0, Math.min(100, ((normalizedValue - minValue) / (maxValue - minValue || 1)) * 100));
    const hasExplicitName = props['aria-label'] != null || props['aria-labelledby'] != null;
    const nameFallback = !hasExplicitName && label != null ? { 'aria-label': label } : {};
    return h(ProgressCircleContext.Provider, { value: { percentage, size } }, h(AriaProgressBar, { ...props, ...nameFallback, ref, value: normalizedValue == null ? undefined : normalizedValue, isIndeterminate: normalizedValue == null, minValue, maxValue, label, 'data-indeterminate': percentage == null ? '' : undefined, 'data-complete': percentage === 100 ? '' : undefined, className: cx('muxui-progress-circle', size !== 'md' && `muxui-progress-circle--${size}`, className) }, children));
  }),
  Track: React.forwardRef(function ProgressCircleTrack({ className, ...props }, ref) {
    const { percentage, size } = React.useContext(ProgressCircleContext);
    const [dimension, stroke] = circleSizes[size] ?? circleSizes.md;
    const radius = (dimension - stroke) / 2;
    return h('svg', { ...props, ref, className: cx('muxui-progress-circle__track', className), viewBox: `0 0 ${dimension} ${dimension}`, fill: 'none', 'aria-hidden': true }, h('circle', { className: 'muxui-progress-circle__rail', cx: dimension / 2, cy: dimension / 2, r: radius, strokeWidth: stroke }), h('circle', { className: 'muxui-progress-circle__indicator', cx: dimension / 2, cy: dimension / 2, r: radius, strokeWidth: stroke, strokeLinecap: 'round', pathLength: 100, strokeDasharray: 100, strokeDashoffset: percentage == null ? undefined : 100 - percentage, 'data-indeterminate': percentage == null ? '' : undefined }));
  }),
  Label: React.forwardRef(function ProgressCircleLabel(props, ref) { return h(AriaLabel, { ...props, ref, className: cx('muxui-progress-circle__label', props.className) }); }),
  Value: React.forwardRef(function ProgressCircleValue({ children, ...props }, ref) { const { percentage } = React.useContext(ProgressCircleContext); return nativePart('span', 'muxui-progress-circle__value', props, ref, children ?? (percentage == null ? null : `${Math.round(percentage)}%`)); }),
};
