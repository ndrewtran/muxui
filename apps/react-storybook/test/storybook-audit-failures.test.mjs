import assert from 'node:assert/strict';
import test from 'node:test';
import { assertNoPageFailures, recordPageFailure } from './storybook-audit-failures.mjs';

test('page audit failures aggregate every page and scheme into one readable error', () => {
  const failures = [];
  const logged = [];
  const log = (line) => logged.push(line);
  recordPageFailure(failures, { scheme: 'dark', id: 'b--states', family: 'B' }, new Error('color-contrast\n  target=x'), { log });
  recordPageFailure(failures, { scheme: 'light', id: 'a--default', family: 'A' }, new Error('empty audit'), { log });
  assert.equal(logged.length, 2);

  assert.doesNotThrow(() => assertNoPageFailures('audit', []));
  assert.throws(() => assertNoPageFailures('audit', failures), (error) => {
    assert.equal(error.message, [
      'audit: 2 failure(s) across 2 page(s)',
      '- light a--default (A)',
      '    empty audit',
      '- dark b--states (B)',
      '    color-contrast',
      '      target=x',
    ].join('\n'));
    return true;
  });
});

test('page audit failures rethrow once the audit is cancelled', () => {
  const controller = new AbortController();
  controller.abort();
  const error = new Error('aborted');
  assert.throws(() => recordPageFailure([], { scheme: 'light', id: 'a' }, error, { signal: controller.signal }), error);
});
