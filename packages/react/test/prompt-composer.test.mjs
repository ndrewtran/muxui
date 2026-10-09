import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { PromptComposer } from '../src/supplemental/prompt-composer.mjs';
import { createDom } from './support/dom.mjs';
const e = (props) => React.createElement(PromptComposer, props);

test('PromptComposer hydrates with native form/input refs, labels and events without exposing unwired controls', async () => {
  const formRef = React.createRef(); const inputRef = React.createRef(); const changes = []; const submissions = [];
  const element = e({ ref: formRef, inputRef, defaultValue: 'Keep this', inputProps: { name: 'message', required: true, maxLength: 32, 'aria-label': 'Draft' }, onChange: (event) => changes.push(event.currentTarget.tagName), onSubmit: (event) => submissions.push(event.currentTarget.tagName), onSend: (value) => submissions.push(value) });
  const { restore } = createDom(`<div id="root">${renderToString(element)}</div>`); let root;
  try {
    const errors = []; await act(async () => { root = hydrateRoot(document.querySelector('#root'), element, { onRecoverableError: (error) => errors.push(error) }); });
    assert.deepEqual(errors, []); assert.equal(formRef.current.tagName, 'FORM'); assert.equal(inputRef.current.tagName, 'TEXTAREA');
    assert.equal(inputRef.current.name, 'message'); assert.equal(inputRef.current.required, true); assert.equal(inputRef.current.maxLength, 32);
    assert.equal(document.querySelector('input[type=file],select'), null); assert.equal(document.querySelectorAll('button').length, 1);
    await act(async () => formRef.current.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.deepEqual(submissions, ['FORM', 'Keep this']);
    await act(async () => root.render(e({ defaultValue: '', pending: true, onStop: () => submissions.push('stop'), onSend: () => {} })));
    assert.equal(document.querySelector('textarea').readOnly, true); await act(async () => document.querySelector('button').click()); assert.equal(submissions.at(-1), 'stop');
    await act(async () => root.render(e({ disabled: true, error: 'Unable to send', onSend: () => {} })));
    assert.equal(document.querySelector('textarea').disabled, true); assert.equal(document.querySelector('[role=alert]').textContent, 'Unable to send'); assert.equal(document.querySelector('textarea').getAttribute('aria-invalid'), 'true');
    await act(async () => root.unmount());
  } finally { restore(); }
});

test('PromptComposer cancelled native submit/reset handlers keep domain state caller-owned', async () => {
  const { restore } = createDom(); let root; const calls = [];
  try {
    await act(async () => { root = createRoot(document.querySelector('#root')); root.render(e({ value: 'Controlled', onSubmit: (event) => event.preventDefault(), onSend: (value) => calls.push(value), onReset: (event) => event.preventDefault(), onValueChange: (value) => calls.push(value) })); });
    const event = new Event('submit', { bubbles: true, cancelable: true }); await act(async () => document.querySelector('form').dispatchEvent(event));
    assert.equal(event.defaultPrevented, true); assert.deepEqual(calls, []);
    await act(async () => document.querySelector('form').reset()); assert.equal(document.querySelector('textarea').value, 'Controlled'); assert.deepEqual(calls, []);
    await act(async () => root.unmount());
  } finally { restore(); }
});

test('PromptComposer model Select hydrates closed with a native button and controlled string selection', async () => {
  const calls = [];
  const props = { models: [{ id: 'standard', label: 'Standard' }, { id: 'detailed', label: 'Detailed' }], selectedModel: 'detailed', onModelChange: (id) => calls.push(id) };
  const element = e(props);
  const { restore } = createDom(`<div id="root">${renderToString(element)}</div>`, { layoutStubs: true }); let root;
  try {
    const errors = [];
    await act(async () => { root = hydrateRoot(document.querySelector('#root'), element, { onRecoverableError: (error) => errors.push(error) }); });
    assert.deepEqual(errors, []);
    const trigger = document.querySelector('.muxui-select-trigger');
    assert.equal(trigger.type, 'button');
    assert.equal(trigger.getAttribute('aria-label'), 'Model');
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(document.querySelector('.muxui-select-value').textContent, 'Detailed');
    assert.equal(document.querySelector('.muxui-select-popover'), null);
    await act(async () => root.render(e({ ...props, selectedModel: 'standard' })));
    assert.equal(document.querySelector('.muxui-select-value').textContent, 'Standard');
    await act(async () => document.querySelector('form').reset());
    assert.equal(document.querySelector('.muxui-select-value').textContent, 'Standard');
    assert.deepEqual(calls, []);
    await act(async () => root.unmount());
  } finally { restore(); }
});
