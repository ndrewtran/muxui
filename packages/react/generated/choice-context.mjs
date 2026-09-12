// @generated-from: packages/react/src/choice-context.mjs
// @generated-content-sha256: sha256:fa9162a6ca7e1cef1424f1acf794227dc2d0fee5e926ec29a7fb1b0d82309f44
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
