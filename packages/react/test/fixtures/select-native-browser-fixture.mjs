import React from 'react';
import { SelectNative } from '../../src/supplemental/select-native.mjs';

const h = React.createElement;

export function SelectNativeBrowserFixture() {
  const selectRef = React.useRef(null);
  const [selected, setSelected] = React.useState('inbox');
  const [lastChange, setLastChange] = React.useState('');
  const [submitted, setSubmitted] = React.useState('');

  React.useEffect(() => {
    document.documentElement.dataset.ready = selectRef.current?.tagName ?? '';
  }, []);

  return h('main', null,
    h('form', {
      id: 'panel-form',
      onSubmit(event) {
        event.preventDefault();
        setSubmitted(new FormData(event.currentTarget).get('panel') ?? '');
      },
    },
    h(SelectNative, {
      ref: selectRef,
      id: 'panel',
      label: 'Saved panel',
      description: 'Choose a saved panel.',
      name: 'panel',
      defaultValue: 'inbox',
      size: 'sm',
      title: 'Saved panel URL',
      onChange(event) {
        setLastChange(event.currentTarget.value);
        setSelected(event.currentTarget.value);
      },
    },
    h('option', { value: '' }, 'More saved panels'),
    h('optgroup', { label: 'Workspaces' },
      h('option', { value: 'inbox' }, 'Inbox'),
      h('option', { value: 'research' }, 'Research'))),
    h('button', { id: 'submit', type: 'submit' }, 'Submit'),
    h('button', { id: 'reset', type: 'reset' }, 'Reset')),
    h('output', { id: 'selected' }, selected),
    h('output', { id: 'last-change' }, lastChange),
    h('output', { id: 'submitted' }, submitted),
  );
}
