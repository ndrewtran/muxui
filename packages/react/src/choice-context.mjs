import React from 'react';

export const CHOICE_CONTROL_SIZES = Object.freeze(['sm', 'md', 'lg']);

export function normalizeChoiceControlSize(size, componentName) {
  const resolved = size ?? 'md';
  if (!CHOICE_CONTROL_SIZES.includes(resolved)) {
    throw new TypeError(`${componentName} size must be one of: ${CHOICE_CONTROL_SIZES.join(', ')}`);
  }
  return resolved;
}

export const ChoiceControlSizeContext = React.createContext(undefined);
