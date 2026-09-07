import React from 'react';

export const TOGGLE_BUTTON_SIZES = Object.freeze(['sm', 'md', 'lg']);

export function normalizeToggleButtonSize(size, componentName = 'ToggleButton') {
  const resolved = size ?? 'md';
  if (!TOGGLE_BUTTON_SIZES.includes(resolved)) {
    throw new TypeError(`${componentName} size must be one of: ${TOGGLE_BUTTON_SIZES.join(', ')}`);
  }
  return resolved;
}

export const ToggleButtonSizeContext = React.createContext(undefined);
