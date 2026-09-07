// @generated-from: packages/react/src/toggle-button-context.mjs
// @generated-content-sha256: sha256:2e38e755b5ae1bd1fed1180e941a2f88d75f6afdc323a273fee33bb3235126e3
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
