import assert from 'node:assert/strict';
import test from 'node:test';
import { nodeClaimProblem } from '../src/release-node-consumer.mjs';

test('the Node consumer runs only the newest Node major the engines claim admits', () => {
  assert.equal(nodeClaimProblem('>=24.19.0 <27', '26.13.1'), null);
  assert.equal(nodeClaimProblem('>=26.13.1 <27', '26.13.1'), null);
  assert.match(nodeClaimProblem('>=24.19.0 <27', '24.19.0'), /not the newest major >=24\.19\.0 <27 admits \(26\)/u);
  // A widened claim fails until CI moves to the new Node.
  assert.match(nodeClaimProblem('>=24.19.0 <28', '26.13.1'), /not the newest major .* \(27\)/u);
  assert.match(nodeClaimProblem('>=26.14.0 <27', '26.13.1'), /below >=26\.14\.0 <27/u);
  assert.match(nodeClaimProblem('>=26.13.2 <27', '26.13.1'), /below/u);
  for (const range of [undefined, '^24.19.0', '>=24.19.0', '>=24 <27', '>=24.19.0 <27 || >=28']) {
    assert.match(nodeClaimProblem(range, '26.13.1'), /is not ">=X\.Y\.Z <N"/u);
  }
});
