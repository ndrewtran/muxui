import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { ProgressCircle } from '../src/supplemental/index.mjs';
import { ProgressCircleConsumerFixture } from './fixtures/progress-circle-consumer-fixture.mjs';

function elementFor(html, selector = '[role="progressbar"]') {
  const dom = new JSDOM(html);
  const element = dom.window.document.querySelector(selector);
  assert.ok(element, `expected ${selector}`);
  return { dom, element };
}

function renderRoot(props, children = React.createElement(ProgressCircle.Track)) {
  return renderToStaticMarkup(React.createElement(ProgressCircle.Root, props, children));
}

test('ProgressCircle consumer fixture covers semantic and decorative compositions', () => {
  const html = renderToStaticMarkup(React.createElement(ProgressCircleConsumerFixture));
  const { dom } = elementFor(html, '[data-muxui-progress-circle-consumer]');
  const tab = dom.window.document.querySelector('#tab-loading [role="progressbar"]');
  const session = dom.window.document.querySelector('#session-import [role="progressbar"]');
  const decorative = dom.window.document.querySelector('#decorative-action [role="progressbar"]');

  assert.equal(tab?.getAttribute('aria-label'), 'Loading tab');
  assert.equal(tab?.getAttribute('aria-valuenow'), null);
  assert.equal(tab?.getAttribute('aria-valuetext'), null);
  assert.equal(tab?.hasAttribute('data-indeterminate'), true);
  assert.equal(session?.getAttribute('aria-valuenow'), '65');
  assert.equal(session?.getAttribute('aria-valuetext'), '65%');
  assert.equal(session?.getAttribute('aria-labelledby')?.length > 0, true);
  assert.equal(session?.ownerDocument.getElementById(session?.getAttribute('aria-labelledby') ?? '')?.textContent, 'Session import');
  assert.equal(decorative, null, 'a Track-only composition stays decorative inside an action');
  assert.equal(dom.window.document.querySelector('#decorative-track-wrapper svg')?.getAttribute('aria-hidden'), 'true');
});

test('ProgressCircle naming precedence supports shorthand and RAC Label context', () => {
  const shorthand = elementFor(renderRoot({ label: 'Loading tab' })).element;
  assert.equal(shorthand.getAttribute('aria-label'), 'Loading tab');
  assert.equal(shorthand.getAttribute('aria-labelledby'), null);

  const explicitLabel = elementFor(renderRoot({ label: 'Fallback', 'aria-label': 'Explicit name' })).element;
  assert.equal(explicitLabel.getAttribute('aria-label'), 'Explicit name');
  assert.equal(explicitLabel.getAttribute('aria-labelledby'), null);

  const explicitLabelledby = elementFor(renderRoot({ label: 'Fallback', 'aria-labelledby': 'external-name' })).element;
  assert.equal(explicitLabelledby.getAttribute('aria-label'), null);
  assert.equal(explicitLabelledby.getAttribute('aria-labelledby'), 'external-name');

  const withLabelPart = elementFor(renderRoot({}, React.createElement(
    React.Fragment,
    null,
    React.createElement(ProgressCircle.Track),
    React.createElement(ProgressCircle.Label, null, 'Visible name'),
  )));
  const labelPartId = withLabelPart.element.getAttribute('aria-labelledby');
  assert.equal(withLabelPart.element.getAttribute('aria-label'), null);
  assert.ok(labelPartId);
  assert.equal(withLabelPart.dom.window.document.getElementById(labelPartId)?.textContent, 'Visible name');

  function WrappedLabel() {
    return React.createElement(ProgressCircle.Label, null, 'Wrapped name');
  }
  const withWrappedLabel = elementFor(renderRoot({}, React.createElement(
    React.Fragment,
    null,
    React.createElement(ProgressCircle.Track),
    React.createElement(WrappedLabel),
  )));
  const wrappedLabelId = withWrappedLabel.element.getAttribute('aria-labelledby');
  assert.equal(withWrappedLabel.element.getAttribute('aria-label'), null);
  assert.ok(wrappedLabelId);
  assert.equal(withWrappedLabel.dom.window.document.getElementById(wrappedLabelId)?.textContent, 'Wrapped name');

  const labelWithPart = elementFor(renderRoot({ label: 'Fallback' }, React.createElement(
    React.Fragment,
    null,
    React.createElement(ProgressCircle.Track),
    React.createElement(ProgressCircle.Label, null, 'Visible name'),
  ))).element;
  assert.equal(labelWithPart.getAttribute('aria-label'), 'Fallback');
  assert.equal(labelWithPart.getAttribute('aria-labelledby'), null);

  const labelWithWrappedPart = elementFor(renderRoot({ label: 'Fallback' }, React.createElement(
    React.Fragment,
    null,
    React.createElement(ProgressCircle.Track),
    React.createElement(WrappedLabel),
  ))).element;
  assert.equal(labelWithWrappedPart.getAttribute('aria-label'), 'Fallback');
  assert.equal(labelWithWrappedPart.getAttribute('aria-labelledby'), null);

  function WrappedTrack() {
    return React.createElement(ProgressCircle.Track);
  }
  const wrappedTrack = elementFor(renderRoot({ label: 'Wrapped track' }, React.createElement(WrappedTrack))).element;
  assert.equal(wrappedTrack.getAttribute('aria-label'), 'Wrapped track');
  assert.equal(wrappedTrack.getAttribute('aria-labelledby'), null);

  const withValuePart = elementFor(renderRoot({ label: 'Progress' }, [
    React.createElement(ProgressCircle.Track, { key: 'track' }),
    React.createElement(ProgressCircle.Value, { key: 'value' }),
  ])).element;
  assert.equal(withValuePart.getAttribute('aria-label'), 'Progress');
  assert.equal(withValuePart.getAttribute('aria-labelledby'), null);
});

test('ProgressCircle exposes native progressbar semantics and avoids false precision', () => {
  const determinate = elementFor(renderRoot({ value: 65, label: 'Upload progress' }), '[role="progressbar"]');
  assert.equal(determinate.element.tagName, 'DIV');
  assert.equal(determinate.element.getAttribute('role'), 'progressbar');
  assert.equal(determinate.element.getAttribute('aria-valuemin'), '0');
  assert.equal(determinate.element.getAttribute('aria-valuemax'), '100');
  assert.equal(determinate.element.getAttribute('aria-valuenow'), '65');
  assert.equal(determinate.element.getAttribute('aria-valuetext'), '65%');
  assert.equal(determinate.element.getAttribute('aria-live'), null);
  assert.equal(determinate.dom.window.document.querySelector('svg')?.getAttribute('aria-hidden'), 'true');

  const clampedLow = elementFor(renderRoot({ value: -1, 'aria-label': 'Upload progress' })).element;
  const clampedHigh = elementFor(renderRoot({ value: 101, 'aria-label': 'Upload progress' })).element;
  assert.equal(clampedLow.getAttribute('aria-valuenow'), '0');
  assert.equal(clampedHigh.getAttribute('aria-valuenow'), '100');

  for (const value of [null, undefined, Number.NaN]) {
    const { element } = elementFor(renderRoot({ value, 'aria-label': 'Loading tab' }));
    assert.equal(element.hasAttribute('data-indeterminate'), true);
    assert.equal(element.getAttribute('aria-valuenow'), null);
    assert.equal(element.getAttribute('aria-valuetext'), null);
    assert.equal(element.getAttribute('aria-valuemin'), '0');
    assert.equal(element.getAttribute('aria-valuemax'), '100');
  }
});
