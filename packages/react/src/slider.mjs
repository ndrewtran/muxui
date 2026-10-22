import React from 'react';
import { Slider as AriaSlider, SliderOutput as AriaSliderOutput, Label as AriaLabel } from 'react-aria-components';
import { SliderMotionTrack } from './slider-motion.mjs';
import { classNames, accessibleName } from './control-utils.ts';
import { readOnlyKeyGuard, useReadOnlyTargets } from './read-only-guard.ts';

export const Slider = /* @__PURE__ */ (() => {
  const component = React.forwardRef(function Slider({ label, value, defaultValue, onChange, onChangeEnd, min = 0, max = 100, step = 1, disabled = false, readOnly = false, orientation = 'horizontal', name, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
    accessibleName({ label, ariaLabel, ariaLabelledby }, 'Slider');
    const readOnlyRef = useReadOnlyTargets(ref, readOnly, '[role="slider"], input[type="range"]');
    const preventReadOnlyInteraction = React.useCallback((event) => {
      if (readOnly) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, [readOnly]);
    const handleChange = React.useCallback((next) => {
      if (!disabled && !readOnly) onChange?.(next);
    }, [disabled, onChange, readOnly]);
    const handleChangeEnd = React.useCallback((next) => {
      if (!disabled && !readOnly) onChangeEnd?.(next);
    }, [disabled, onChangeEnd, readOnly]);
    const assignSliderRef = React.useCallback((node) => {
      if (node) {
        if (disabled) node.setAttribute('aria-disabled', 'true');
        else node.removeAttribute('aria-disabled');
      }
      readOnlyRef(node);
    }, [disabled, readOnlyRef]);
    return React.createElement(AriaSlider, {
      ...props,
      ref: assignSliderRef,
      value,
      defaultValue,
      onChange: handleChange,
      onChangeEnd: readOnly ? undefined : handleChangeEnd,
      minValue: min,
      maxValue: max,
      step,
      isDisabled: disabled,
      orientation,
      'data-readonly': readOnly || undefined,
      onMouseDownCapture: preventReadOnlyInteraction,
      onTouchStartCapture: preventReadOnlyInteraction,
      onPointerDownCapture: preventReadOnlyInteraction,
      onPointerMoveCapture: preventReadOnlyInteraction,
      onTouchMoveCapture: preventReadOnlyInteraction,
      onClickCapture: preventReadOnlyInteraction,
      onKeyDownCapture: readOnlyKeyGuard(readOnly),
      onChangeCapture: preventReadOnlyInteraction,
      className: classNames('muxui-slider', className),
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
    }, React.createElement('div', { className: 'muxui-slider-header' }, label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null, React.createElement(AriaOutput, { className: 'muxui-slider-output' })), React.createElement('div', { className: 'muxui-slider-control' }, React.createElement(SliderMotionTrack, { orientation, readOnly, name })));
  });
  component.displayName = 'Slider';
  return component;
})();

const AriaOutput = AriaSliderOutput;
