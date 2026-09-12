import React from 'react';
import { IconButton, Button } from '@muxui/react';

const e = React.createElement;
const icon = e('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor' }, e('path', { d: 'm6 6 12 12M18 6 6 18' }));

export function IconButtonFixture() {
  const [count, setCount] = React.useState(0);
  const [pending, setPending] = React.useState(false);
  const [submitted, setSubmitted] = React.useState('');
  const ref = React.useRef(null);
  React.useEffect(() => { document.documentElement.dataset.ready = ref.current?.tagName; }, []);
  return e(React.Fragment, null,
    e(IconButton, { ref, id: 'action', 'aria-label': 'Close panel', pending, onActivate: () => setCount((value) => value + 1) }, icon),
    e('output', { id: 'count' }, count),
    e('button', { id: 'toggle-pending', onClick: () => setPending((value) => !value) }, 'Toggle pending'),
    e(IconButton, { id: 'disabled', 'aria-label': 'Disabled action', disabled: true, onActivate: () => setCount(999) }, icon),
    e('span', { id: 'external-label' }, 'External label'),
    e(IconButton, { id: 'labelled', 'aria-labelledby': 'external-label', pending: true }, icon),
    ...['sm', 'md', 'lg'].map((size) => e(React.Fragment, { key: size },
      e(IconButton, { id: `size-${size}`, size, 'aria-label': `Size ${size}` }, icon),
      e(Button, { id: `button-${size}`, size }, 'Button'),
    )),
    e('form', { onSubmit: (event) => {
      event.preventDefault();
      setSubmitted(new FormData(event.currentTarget, event.nativeEvent.submitter).get('action'));
    } }, e(IconButton, { id: 'submit', 'aria-label': 'Save form', type: 'submit', name: 'action', value: 'save' }, icon)),
    e('output', { id: 'submitted' }, submitted),
  );
}
