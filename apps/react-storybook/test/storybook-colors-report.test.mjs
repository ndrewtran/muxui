import assert from 'node:assert/strict';
import test from 'node:test';
import { colourStateSignatures } from './storybook-colors-report.mjs';

test('colour report signatures preserve multiplicity and reject partial scheme coverage', () => {
  const complete = [
    { scheme: 'light', state: 'manager/default', scope: 'manager' },
    { scheme: 'light', state: 'manager/default', scope: 'manager' },
    { scheme: 'light', state: 'docs/default', scope: 'docs' },
    { scheme: 'light', state: 'menu/Choose the Mux UI light or dark theme. Light', scope: 'manager' },
    { scheme: 'dark', state: 'manager/default', scope: 'manager' },
    { scheme: 'dark', state: 'manager/default', scope: 'manager' },
    { scheme: 'dark', state: 'docs/default', scope: 'docs' },
    { scheme: 'dark', state: 'menu/Choose the Mux UI light or dark theme. Dark', scope: 'manager' },
  ];
  assert.deepEqual(colourStateSignatures(complete, 'light'), colourStateSignatures(complete, 'dark'));

  const partial = complete.filter((entry) => !(entry.scheme === 'dark' && entry.state === 'docs/default'));
  assert.notDeepEqual(colourStateSignatures(partial, 'light'), colourStateSignatures(partial, 'dark'));
});
