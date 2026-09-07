// @generated-from: packages/react/src/choice-context.mjs
// @generated-content-sha256: sha256:ff5d478eb77faec8cf6843b05bc15a245e5ed5ffb41a4f7dac6c972f8495303d
import React from 'react';

export const CHOICE_CONTROL_SIZES = Object.freeze(['sm', 'md']);

export function normalizeChoiceControlSize(size, componentName) {
  const resolved = size ?? 'md';
  if (!CHOICE_CONTROL_SIZES.includes(resolved)) {
    throw new TypeError(`${componentName} size must be one of: ${CHOICE_CONTROL_SIZES.join(', ')}`);
  }
  return resolved;
}

export const ChoiceControlSizeContext = React.createContext(undefined);
