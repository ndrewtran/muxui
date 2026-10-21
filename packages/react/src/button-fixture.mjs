import React, { useState } from 'react';
import { Button } from './button.ts';

export function R1ButtonFixture({ disabled = false, pending = false, onPress }) {
  const [pressCount, setPressCount] = useState(0);
  return React.createElement('div', {
    'aria-busy': pending || undefined,
    'data-muxui-fixture-state': disabled ? 'disabled' : pending ? 'pending' : 'idle',
    'data-muxui-press-count': pressCount,
  }, React.createElement(Button, {
    className: 'muxui-r1-button',
    disabled,
    pending,
    'data-muxui-state': pending ? 'pending' : pressCount > 0 ? 'pressed' : 'idle',
    onActivate: (event) => {
      setPressCount((count) => count + 1);
      onPress?.(event);
    },
  }, pending ? 'Working' : 'Comparison action'));
}
