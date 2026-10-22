import React from 'react';
import type { ForwardRefExoticComponent, ReactNode, RefAttributes, SyntheticEvent } from 'react';
import { Slider as AriaSlider, SliderOutput as AriaSliderOutput, Label as AriaLabel } from 'react-aria-components';
import { SliderMotionTrack } from './slider-motion.mjs';
import { classNames, accessibleName } from './control-utils.ts';
import { readOnlyKeyGuard, useReadOnlyTargets } from './read-only-guard.ts';
import type { MuxUIAccessibleName } from './fields.ts';

/** The props Mux UI defines for Slider. The slider is named by label, aria-label, or aria-labelledby. */
export type SliderOwnProps = {
  /** The visible label, which also names the slider. Without one, the slider needs an aria-label or aria-labelledby, and an empty label does not count. */
  label?: Exclude<ReactNode, null | undefined | boolean>;
  /** The value, when the caller controls it. */
  value?: number;
  /** The starting value, when the slider controls itself. */
  defaultValue?: number;
  /** The smallest value the thumb can take. */
  min?: number;
  /** The largest value the thumb can take. */
  max?: number;
  /** How far one arrow key press moves the value, and the increment the value snaps to. */
  step?: number;
  /** Disables the slider: it can be neither focused nor changed. */
  disabled?: boolean;
  /** Makes the slider read-only: it stays focusable but its value cannot be changed. */
  readOnly?: boolean;
  /** The direction of the track. */
  orientation?: 'horizontal' | 'vertical';
  /** The form field name. A named slider submits its value. */
  name?: string;
  /** Called with the new value each time it changes while the thumb moves. A disabled or read-only slider does not call it. */
  onChange?: (value: number) => void;
  /** Called with the current value when an interaction ends, such as a key press or a drag release, even when the value did not move. A disabled or read-only slider does not call it. */
  onChangeEnd?: (value: number) => void;
};

export type SliderProps = Omit<SliderOwnProps, 'label'> & { className?: string } & MuxUIAccessibleName;

export const Slider: ForwardRefExoticComponent<SliderProps & RefAttributes<HTMLDivElement>> = /* @__PURE__ */ (() => {
  const component = React.forwardRef<HTMLDivElement, SliderProps>(function Slider({ label, value, defaultValue, onChange, onChangeEnd, min = 0, max = 100, step = 1, disabled = false, readOnly = false, orientation = 'horizontal', name, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
    accessibleName({ label, ariaLabel, ariaLabelledby }, 'Slider');
    const readOnlyRef = useReadOnlyTargets(ref, readOnly, '[role="slider"], input[type="range"]');
    const preventReadOnlyInteraction = React.useCallback((event: SyntheticEvent) => {
      if (readOnly) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, [readOnly]);
    const handleChange = React.useCallback((next: number) => {
      if (!disabled && !readOnly) onChange?.(next);
    }, [disabled, onChange, readOnly]);
    const handleChangeEnd = React.useCallback((next: number) => {
      if (!disabled && !readOnly) onChangeEnd?.(next);
    }, [disabled, onChangeEnd, readOnly]);
    const assignSliderRef = React.useCallback((node: HTMLDivElement | null) => {
      if (node) {
        if (disabled) node.setAttribute('aria-disabled', 'true');
        else node.removeAttribute('aria-disabled');
      }
      readOnlyRef(node);
    }, [disabled, readOnlyRef]);
    return React.createElement(AriaSlider<number>, {
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
      // React Aria's props do not name the data-readonly hook the styles read, nor the capture handlers for a key press
      // or a change, and TypeScript accepts such a key in a call only from a spread.
      ...{ 'data-readonly': readOnly ? readOnly : undefined },
      onMouseDownCapture: preventReadOnlyInteraction,
      onTouchStartCapture: preventReadOnlyInteraction,
      onPointerDownCapture: preventReadOnlyInteraction,
      onPointerMoveCapture: preventReadOnlyInteraction,
      onTouchMoveCapture: preventReadOnlyInteraction,
      onClickCapture: preventReadOnlyInteraction,
      ...{ onKeyDownCapture: readOnlyKeyGuard(readOnly), onChangeCapture: preventReadOnlyInteraction },
      className: classNames('muxui-slider', className),
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
    }, React.createElement('div', { className: 'muxui-slider-header' }, label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null, React.createElement(AriaOutput, { className: 'muxui-slider-output' })), React.createElement('div', { className: 'muxui-slider-control' }, React.createElement(SliderMotionTrack, { orientation, readOnly, name })));
  });
  component.displayName = 'Slider';
  return component;
})();

const AriaOutput = AriaSliderOutput;
