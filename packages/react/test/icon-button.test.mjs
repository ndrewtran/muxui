import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { NumberField } from '../src/fields.mjs';
import { IconButton } from '../src/supplemental/icon-button.mjs';

const icon = React.createElement('svg', { viewBox: '0 0 24 24' }, React.createElement('title', null, 'Decorative icon'));

test('IconButton requires an explicit nonblank accessible name', () => {
  for (const props of [{}, { 'aria-label': '' }, { 'aria-labelledby': '  ' }, { 'aria-label': '\t', 'aria-labelledby': '' }]) {
    assert.throws(() => renderToStaticMarkup(React.createElement(IconButton, props, icon)), /non-empty aria-label or aria-labelledby/u);
  }
  for (const props of [{ 'aria-label': 'Search' }, { 'aria-labelledby': 'search-label' }, { 'aria-label': 'Search', 'aria-labelledby': 'search-label' }]) {
    assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(IconButton, props, icon)));
  }
});

test('IconButton renders one named button and decorative icon with Button defaults', () => {
  const html = renderToStaticMarkup(React.createElement(IconButton, { 'aria-label': 'Search', className: 'consumer-class' }, icon));
  const document = new JSDOM(html).window.document;
  const button = document.querySelector('button');
  assert.equal(document.querySelectorAll('button').length, 1);
  assert.equal(button.getAttribute('aria-label'), 'Search');
  assert.equal(button.getAttribute('type'), 'button');
  assert.equal(button.dataset.variant, 'ghost');
  assert.equal(button.dataset.size, 'md');
  assert.ok(button.classList.contains('consumer-class'));
  assert.ok(button.classList.contains('muxui-button'));
  assert.equal(button.querySelector('.muxui-icon-button-icon').getAttribute('aria-hidden'), 'true');
});

test('IconButton preserves its name, native form props, and pending/disabled states', () => {
  for (const name of [{ 'aria-label': 'Save' }, { 'aria-labelledby': 'save-label' }]) {
    const html = renderToStaticMarkup(React.createElement(IconButton, {
      ...name, pending: true, variant: 'primary', size: 'lg', type: 'submit', name: 'action', value: 'save',
    }, icon));
    const button = new JSDOM(html).window.document.querySelector('button');
    for (const [key, value] of Object.entries(name)) {
      if (key === 'aria-labelledby') assert.ok(button.getAttribute(key).split(/\s+/u).includes(value));
      else assert.equal(button.getAttribute(key), value);
    }
    assert.equal(button.getAttribute('aria-busy'), 'true');
    assert.equal(button.getAttribute('type'), 'button', 'pending prevents native form submission');
    assert.equal(button.getAttribute('name'), 'action');
    assert.equal(button.getAttribute('value'), 'save');
    assert.ok(button.querySelector('.muxui-button-spinner'));
    assert.equal(button.querySelector('.muxui-button-content').style.visibility, 'hidden');
  }
  const submitHtml = renderToStaticMarkup(React.createElement(IconButton, { 'aria-label': 'Save', type: 'submit' }, icon));
  assert.equal(new JSDOM(submitHtml).window.document.querySelector('button').type, 'submit');
  const html = renderToStaticMarkup(React.createElement(IconButton, { 'aria-label': 'Save', disabled: true }, icon));
  assert.equal(new JSDOM(html).window.document.querySelector('button').disabled, true);
});

test('IconButton inherits slot-provided NumberField names and disabled state', () => {
  const html = renderToStaticMarkup(React.createElement(NumberField, { label: 'Quantity', defaultValue: 2, disabled: true }));
  const document = new JSDOM(html).window.document;
  const decrement = document.querySelector('.muxui-number-stepper-decrement');
  const increment = document.querySelector('.muxui-number-stepper-increment');
  for (const [button, action] of [[decrement, 'Decrease'], [increment, 'Increase']]) {
    assert.equal(button.disabled, true);
    assert.equal(button.getAttribute('aria-label'), action);
    const labelledBy = button.getAttribute('aria-labelledby').split(/\s+/u);
    assert.ok(labelledBy.some((id) => document.getElementById(id)?.textContent === 'Quantity'));
  }
});
