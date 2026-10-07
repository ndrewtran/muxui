import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SchemaValidationError,
  loadFieldOwnershipRegistry,
  resolveAuthoringField,
  validateFamily,
} from '../src/index.mjs';
import { pattern } from './fixtures.mjs';

// The owners are literals on purpose: the assertion must not echo the registry it checks.
const OWNERS = {
  group: 'pattern-category-groups',
  patternRevision: 'pattern-revision-compiler',
  contentRevision: 'artifact-revision-compiler',
  specRevision: 'binding-revision-compiler',
  evidenceStatus: 'proof-system',
};

test('E-BL1-02: an authored reserved field resolves to its reserved owner and row', () => {
  const reserved = loadFieldOwnershipRegistry().reservedFields;
  for (const [family, field] of [
    ['pattern', 'group'],
    ['pattern', 'patternRevision'],
    ['pattern', 'contentRevision'],
    ['example', 'contentRevision'],
    ['component', 'specRevision'],
    ['component', 'evidenceStatus'],
  ]) {
    const resolved = resolveAuthoringField(family, `$/${field}`);
    assert.equal(resolved.owner, OWNERS[field], `${family} ${field}`);
    assert.equal(resolved.schema, 'field-ownership.json');
    assert.equal(reserved[Number(resolved.schemaPointer.split('/').at(-1))].name, field);
    assert.ok(Object.values(resolved.effects).every((effect) => effect === 'incompatible'));
    assert.deepEqual(resolved.revisionAxes, []);
  }
});

test('E-BL1-02: reserved fields resolve in each context the validator forbids them', () => {
  const owner = (family, path) => resolveAuthoringField(family, path).owner;
  assert.equal(owner('component', '$/bindings/web.react/specRevision'), OWNERS.specRevision);
  assert.equal(owner('binding', '$/specRevision'), OWNERS.specRevision);
  assert.equal(
    owner('component', '$/bindings/native.react-native/runtimeProfiles/native.react-native-web/specRevision'),
    OWNERS.specRevision,
  );
  // Elsewhere the key is only an unknown field, so its enclosing declared field still owns it.
  const intent = resolveAuthoringField('pattern', '$/intent/group');
  assert.equal(intent.owner, 'pattern-contract');
  assert.equal(intent.schemaPointer, '#/properties/intent');
  assert.equal(owner('component', '$/anatomy/0/specRevision'), 'component-contract');
  // A key that is neither declared nor reserved still has no owner to resolve.
  assert.throws(() => owner('pattern', '$/layout'), SchemaValidationError);
});

test('E-BL1-02: a reserved row scoped to other families does not own the field here', () => {
  // The authored rows scope group and patternRevision to the pattern family.
  assert.throws(() => resolveAuthoringField('example', '$/group'), SchemaValidationError);
  assert.throws(() => resolveAuthoringField('component', '$/patternRevision'), SchemaValidationError);
  const ownership = structuredClone(loadFieldOwnershipRegistry());
  const row = ownership.reservedFields.find(({ name }) => name === 'group');
  row.families = ['example'];
  assert.throws(
    () => resolveAuthoringField('pattern', '$/group', { ownership }),
    SchemaValidationError,
  );
  assert.equal(resolveAuthoringField('example', '$/group', { ownership }).owner, OWNERS.group);
});

test('E-BL1-02: the validator issue for an authored group or patternRevision resolves to the reserved owner', () => {
  for (const field of ['group', 'patternRevision']) {
    const record = { ...pattern(), [field]: 'x' };
    assert.throws(() => validateFamily('pattern', record), (error) => {
      const issue = error.issues.find(({ message }) => /cannot be authored/u.test(message));
      assert.equal(issue.path, `$/${field}`);
      assert.equal(resolveAuthoringField('pattern', issue.path).owner, OWNERS[field]);
      return true;
    });
  }
});
