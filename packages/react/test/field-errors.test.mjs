import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { TextField } from '../src/fields.ts';
import { Select } from '../src/select.ts';
import { CheckboxField } from '../src/supplemental/checkbox-field.ts';
import { Input } from '../src/supplemental/input.ts';
import { PaymentInput } from '../src/supplemental/payment-input.ts';
import { SwitchField } from '../src/supplemental/switch-field.ts';
import { TextArea } from '../src/supplemental/text-area.ts';
import { installDom } from './support/dom.mjs';

const h = React.createElement;

// Each field with its error part, the element whose aria-describedby must name the error, and the error's class.
// `error` is the error part as the caller writes it, or null while the field shows none.
const fields = {
  Input: {
    render: ({ invalid, error }) => h(Input.Root, { invalid }, h(Input.Label, null, 'Name'), h(Input.Input), error && h(Input.Error, error.props, error.text)),
    control: '.muxui-input',
    error: '.muxui-input__error',
  },
  TextArea: {
    render: ({ invalid, error }) => h(TextArea.Root, { invalid }, h(TextArea.Label, null, 'Bio'), h(TextArea.TextArea), error && h(TextArea.Error, error.props, error.text)),
    control: '.muxui-text-area__textarea',
    error: '.muxui-text-area__error',
  },
  PaymentInput: {
    render: ({ invalid, error }) => h(PaymentInput.Root, { invalid }, h(PaymentInput.Label, null, 'Card'), h(PaymentInput.Input), error && h(PaymentInput.Error, error.props, error.text)),
    control: '.muxui-payment-input__input',
    error: '.muxui-payment-input__error',
  },
  CheckboxField: {
    render: ({ invalid, error }) => h(CheckboxField.Root, { invalid }, h(CheckboxField.Button, null, h(CheckboxField.Indicator), 'Agree'), error && h(CheckboxField.Error, error.props, error.text)),
    control: '.muxui-checkbox-field input',
    error: '.muxui-checkbox-field__error',
  },
  SwitchField: {
    render: ({ invalid, error }) => h(SwitchField.Root, { invalid }, h(SwitchField.Button, null, h(SwitchField.Thumb), 'Alerts'), error && h(SwitchField.Error, error.props, error.text)),
    control: '.muxui-switch-field input',
    error: '.muxui-switch-field__error',
  },
  Select: {
    render: ({ invalid, error }) => h(Select, { label: 'Colour', invalid, items: [{ id: 'red', label: 'Red' }] }, h(Select.Label, null, 'Colour'), h(Select.Trigger, null, h(Select.Value)), error && h(Select.Error, error.props, error.text)),
    control: '.muxui-select__trigger',
    error: '.muxui-select__error',
  },
  TextField: {
    render: ({ invalid, error }) => h(TextField, { label: 'Title', invalid, errorMessage: error?.text }),
    control: 'input',
    error: '.muxui-field-error',
  },
};

// Renders the field on the client. jsdom stands in for a browser only partly: React Aria decides at import whether it
// has a DOM, so its slot ids never resolve here, and choice-native-state.test.mjs checks the links in a browser.
async function mount(render, initial) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  const root = createRoot(document.querySelector('#root'));
  await act(async () => root.render(render(initial)));
  return {
    async close() {
      await act(async () => root.unmount());
      restore();
      dom.window.close();
    },
  };
}

test('an error rendered from the start stays linked in the server markup', () => {
  for (const [name, field] of Object.entries(fields)) {
    const markup = renderToString(field.render({ invalid: true, error: { text: 'Fix this.', props: null } }));
    const { document: server } = new JSDOM(markup).window;
    const error = server.querySelector(field.error);
    assert.ok(error?.id, `${name}: the server error has an id`);
    const ids = server.querySelector(field.control)?.getAttribute('aria-describedby')?.split(/\s+/u) ?? [];
    assert.ok(ids.includes(error.id), `${name}: ${ids.join(' ')} names ${error.id}`);
  }
});

const errorAttributes = { role: 'alert', 'aria-live': 'assertive', 'aria-atomic': 'true', title: 'Problem', tabIndex: -1, 'data-kind': 'refusal', id: 'own-error' };

test('the error parts keep the standard attributes the caller gives them', async () => {
  for (const [name, field] of Object.entries(fields)) {
    if (name === 'TextField') continue;
    const page = await mount(field.render, { invalid: true, error: { text: 'Fix this.', props: errorAttributes } });
    try {
      const error = document.querySelector(field.error);
      assert.ok(error, `${name}: the error is shown`);
      assert.deepEqual({
        role: error.getAttribute('role'),
        live: error.getAttribute('aria-live'),
        atomic: error.getAttribute('aria-atomic'),
        title: error.getAttribute('title'),
        tabIndex: error.getAttribute('tabindex'),
        data: error.getAttribute('data-kind'),
        id: error.id,
      }, { role: 'alert', live: 'assertive', atomic: 'true', title: 'Problem', tabIndex: '-1', data: 'refusal', id: 'own-error' }, name);
    } finally {
      await page.close();
    }
  }
});
