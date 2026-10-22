import React from 'react';
import { Radio as AriaRadio, RadioGroup as AriaRadioGroup, FieldError as AriaFieldError } from 'react-aria-components';
import { normalizeChoiceControlSize, ChoiceControlSizeContext } from './choice-context.mjs';
import { RadioGroupMotion, RadioMotionIndicator } from './radio-motion.mjs';
import { classNames, accessibleName } from './control-utils.mjs';

export const RadioGroup = /*#__PURE__*/ (() => {
  const component = React.forwardRef(function RadioGroup({ label, errorMessage, options = [], children, value, defaultValue, onChange, disabled = false, readOnly = false, required = false, invalid = false, orientation = 'vertical', size = 'md', name, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
    accessibleName({ label, ariaLabel, ariaLabelledby }, 'RadioGroup');
    const labelId = React.useId();
    // The visible label text labels the group, so the two cannot drift apart.
    const generatedLabelledby = ariaLabel === undefined && ariaLabelledby === undefined && label !== undefined && label !== null
      ? labelId
      : undefined;
    if (orientation !== 'horizontal' && orientation !== 'vertical') {
      throw new TypeError('RadioGroup orientation must be horizontal or vertical');
    }
    if (options.length > 0 && children !== undefined && children !== null) {
      throw new TypeError('RadioGroup options and children are mutually exclusive');
    }
    const resolvedSize = normalizeChoiceControlSize(size, 'RadioGroup');
    const radioContent = options.length > 0
      ? options.map((option) => React.createElement(AriaRadio, { key: String(option.id ?? option.value), value: String(option.value ?? option.id), isDisabled: disabled || option.disabled, className: classNames('muxui-radio', resolvedSize === undefined || resolvedSize === 'md' ? undefined : `muxui-radio--${resolvedSize}`) }, (renderProps) => React.createElement(React.Fragment, null,
        React.createElement(RadioMotionIndicator, { renderProps }),
        option.label ?? option.value)))
      : children;
    const group = React.createElement(AriaRadioGroup, { ref, name, value, defaultValue, onChange: (next) => { if (!disabled && !readOnly) onChange?.(next); }, isDisabled: disabled, isReadOnly: readOnly, isRequired: required, isInvalid: invalid || undefined, orientation, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby ?? generatedLabelledby, 'data-orientation': orientation, 'data-size': resolvedSize, className: classNames('muxui-radio-group', className) }, radioContent,
      // Inside the group, so RAC wires it into the group's aria-describedby and shows it only while the group is invalid.
      // It is always mounted: without errorMessage it shows the server or browser validation message, as CheckboxGroup does.
      React.createElement(AriaFieldError, { className: 'muxui-field-error muxui-radio-group-error' }, errorMessage));
    const motionGroup = React.createElement(RadioGroupMotion, { rootRef: ref }, group);
    const content = label === undefined
      ? motionGroup
      : React.createElement('div', { className: 'muxui-radio-group-field', 'data-disabled': disabled || undefined, 'data-invalid': invalid || undefined },
        React.createElement('span', { id: generatedLabelledby, className: 'muxui-field-label' }, label),
        motionGroup);
    return React.createElement(ChoiceControlSizeContext.Provider, { value: resolvedSize }, content);
  });
  component.displayName = 'RadioGroup';
  return component;
})();
