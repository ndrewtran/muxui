import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { SchemaValidationError } from '@muxui/schema';
import { diagnoseCompileFailure } from '../src/index.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const patternPath = 'catalog/patterns/poster-grid/artifact.json';
const source = 'catalog/patterns/poster-grid/examples/react/css-grid.tsx';

test('E-BL1-10: a content-rule failure is diagnosed at the variants owner with its file and line, not as an import', async () => {
  // The compiler raises the issues of patternContentIssues; this one is a literal colour on line 3.
  const record = JSON.parse(await readFile(resolve(repositoryRoot, patternPath), 'utf8'));
  const issue = {
    artifactId: record.id,
    path: '$/variants',
    ruleId: 'content.colour-literal',
    source,
    line: 3,
    message: `${source}:3 has a hex colour ("#fff"); use a --muxui-semantic-* token`,
  };
  const error = new SchemaValidationError('MUXUI_RELATION_INVALID', [issue]);
  const { valid, diagnostics: [diagnostic] } = diagnoseCompileFailure({
    error,
    records: [{ family: 'pattern', path: patternPath, record }],
  });
  assert.equal(valid, false);
  assert.equal(diagnostic.ruleId, 'authoring.compile.content-invalid');
  assert.equal(diagnostic.details.artifactId, record.id);
  assert.deepEqual(diagnostic.details.source, { record: patternPath, path: '$/variants', file: source, line: 3 });
  assert.equal(diagnostic.details.owner.name, 'pattern-contract');
  assert.equal(diagnostic.details.owner.schemaPointer, '#/properties/variants');
  assert.equal(Object.hasOwn(diagnostic.details, 'canonicalImportForm'), false);
  assert.match(diagnostic.message, /has a hex colour .* \(content\.colour-literal\)$/u);

  // An asset-license issue links the asset file and has no line.
  const asset = 'catalog/patterns/poster-grid/assets/mark.svg';
  const [license] = diagnoseCompileFailure({
    error: new SchemaValidationError('MUXUI_RELATION_INVALID', [{
      artifactId: record.id,
      path: '$/variants',
      ruleId: 'content.asset-license',
      source: asset,
      message: `${asset} is an asset without a license and disclosure record`,
    }]),
    records: [{ family: 'pattern', path: patternPath, record }],
  }).diagnostics;
  assert.equal(license.ruleId, 'authoring.compile.content-invalid');
  assert.deepEqual(license.details.source, { record: patternPath, path: '$/variants', file: asset });
});
