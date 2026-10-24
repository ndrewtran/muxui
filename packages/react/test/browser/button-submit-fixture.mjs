import React from 'react';
import { Button } from '../../src/button.ts';
import { Card } from '../../src/supplemental/card.ts';

// Forms with a pending submit Button or Card.Button for button.test.mjs. The page that loads
// this module (and, for server markup, node) counts submissions in window.__submits by form id
// and activations in window.__activations.

const h = React.createElement;

/** The pending submit controls the forms can use, by the name the tests report. */
export const submitControls = { Button, 'Card.Button': Card.Button };

/** Records one submission for `id`. */
function count(id) {
  window.__submits[id] = (window.__submits[id] ?? 0) + 1;
}

/**
 * Counts the submissions no React handler took, such as those before hydration, and keeps
 * the page from navigating.
 */
export function trackSubmits() {
  window.__submits = {};
  window.__activations = 0;
  document.addEventListener('submit', (event) => {
    if (event.defaultPrevented) return;
    event.preventDefault();
    count(event.target.id);
  });
}

/**
 * One- and two-field forms whose submit control (`control`, a key of submitControls) starts
 * pending, an explicitly disabled pending one, and a form with a reset Button. Implicit
 * submission differs by field count: a one-field form submits on Enter even with no submit
 * button, a two-field form does not. `#toggle` flips pending for every form.
 */
export function SubmitForms({ control = 'Button' }) {
  const [pending, setPending] = React.useState(true);
  const save = (id, props) => h(submitControls[control], { id: `${id}-save`, type: 'submit', pending, onActivate: () => { window.__activations += 1; }, ...props }, 'Save');
  const form = (id, fields, ...buttons) => h('form', {
    id,
    onSubmit: (event) => { event.preventDefault(); count(id); },
  }, fields.map((name) => h('input', { key: name, id: `${id}-${name}`, name, 'aria-label': name, defaultValue: 'start' })), ...buttons);
  return h('main', null,
    h('button', { id: 'toggle', type: 'button', onClick: () => setPending((value) => !value) }, 'Toggle'),
    form('one', ['a'], save('one')),
    form('two', ['a', 'b'], save('two')),
    form('locked', ['a'], save('locked', { disabled: true })),
    form('reset', ['a'], save('reset'), h(Button, { id: 'reset-reset', type: 'reset' }, 'Reset')));
}
