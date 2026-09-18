import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  PolicyError,
  auditAliases,
  auditCurrentIdentity,
  auditRepository,
  generatedText,
  loadPolicy,
  sha256,
  validateGeneratedFile,
} from '../src/policy.mjs';
import { GenerationProofError, verifyGenerationState } from '../src/generation-proof.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const policy = await loadPolicy(repositoryRoot);

test('E-G0.0-01: a cold root navigation audit reaches every major owner', async () => {
  const result = await auditRepository(repositoryRoot);
  assert.equal(result.owners, 7);
});

test('identity reset audit rejects stale current names but permits explicit history', async () => {
  const root = await mkdtemp(join(tmpdir(), 'muxui-identity-'));
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(join(root, 'history'), { recursive: true });
  await writeFile(
    join(root, 'src/current.txt'),
    [
      "cli: 'core'",
      '_core_complete() {}',
      'core.experimental.g01-proof',
      'coreFixtureSourceSha256',
      'const record = { coreSource: "historical" };',
      'use @core-ui/react',
    ].join('\n'),
  );
  await writeFile(
    join(root, 'history/retained.txt'),
    'retired-react-r1-0-crosswalk-v1 coreFixtureSourceSha256 coreSource\n',
  );
  const identityPolicy = {
    identityReset: {
      current: {
        display: 'Mux UI',
        machine: 'muxui',
        repository: 'ndrewtran/muxui',
        packageScope: '@muxui/',
        artifactPrefix: 'muxui:',
        cli: 'muxui',
        publicRoots: ['.muxui-', '--muxui-', 'data-muxui-'],
        diagnosticsPrefix: 'MUXUI_',
        environmentPrefix: 'MUXUI_',
      },
      allowlistedPaths: ['history/'],
    },
  };

  await assert.rejects(
    auditCurrentIdentity(root, identityPolicy, ['src/current.txt', 'history/retained.txt']),
    (error) => error instanceof PolicyError
      && error.code === 'STALE_CURRENT_IDENTITY'
      && error.message.includes('src/current.txt:1'),
  );
  await writeFile(join(root, 'src/current.txt'), 'use @muxui/react\nconst record = { muxuiSource: "current" };\n');
  const result = await auditCurrentIdentity(root, identityPolicy, ['src/current.txt', 'history/retained.txt']);
  assert.deepEqual(result, { scanned: 1, allowlisted: 1 });
});

test('E-G0.0-03: generated output validates against its source and digest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'muxui-policy-'));
  await mkdir(join(root, 'catalog'), { recursive: true });
  await mkdir(join(root, 'tooling/generated'), { recursive: true });
  await writeFile(join(root, 'catalog/source.txt'), 'canonical input\n');
  await writeFile(
    join(root, 'tooling/generated/output.js'),
    generatedText({
      source: 'catalog/source.txt',
      body: 'export const answer = 42;\n',
      policy,
    }),
  );

  const result = await validateGeneratedFile(
    root,
    'tooling/generated/output.js',
    policy,
  );
  assert.equal(result.source, 'catalog/source.txt');
});

test('E-G0.0-03 negative: a direct projection edit is rejected with its owner', async () => {
  const root = await mkdtemp(join(tmpdir(), 'muxui-policy-'));
  await mkdir(join(root, 'catalog'), { recursive: true });
  await mkdir(join(root, 'tooling/generated'), { recursive: true });
  await writeFile(join(root, 'catalog/source.txt'), 'canonical input\n');
  const outputPath = join(root, 'tooling/generated/output.js');
  await writeFile(
    outputPath,
    generatedText({
      source: 'catalog/source.txt',
      body: 'export const answer = 42;\n',
      policy,
    }),
  );
  const edited = (await readFile(outputPath, 'utf8')).replace('42', '43');
  await writeFile(outputPath, edited);

  await assert.rejects(
    validateGeneratedFile(root, 'tooling/generated/output.js', policy),
    (error) => {
      assert.ok(error instanceof PolicyError);
      assert.equal(error.code, 'PROJECTION_DIGEST_MISMATCH');
      assert.match(error.message, /repair catalog\/source\.txt and regenerate/);
      return true;
    },
  );
});

test('G0.4 strict JSON projections use governed digest sidecars', async () => {
  const root = await mkdtemp(join(tmpdir(), 'muxui-policy-json-'));
  await mkdir(join(root, 'catalog'), { recursive: true });
  await mkdir(join(root, 'tooling/generated'), { recursive: true });
  await writeFile(join(root, 'catalog/source.json'), '{"version":1}\n');
  const path = 'tooling/generated/data.json';
  const provenance = `${path}.provenance`;
  const bytes = '{"value":42}\n';
  const strictPolicy = {
    ...policy,
    strictJsonProjections: [{ path, provenance }],
  };
  await writeFile(join(root, path), bytes);
  await writeFile(join(root, provenance), generatedText({
    source: 'catalog/source.json',
    body: `${JSON.stringify({ path, sha256: `sha256:${sha256(bytes)}` })}\n`,
    policy: strictPolicy,
  }));
  await validateGeneratedFile(root, path, strictPolicy);
  await writeFile(join(root, path), '{"value":43}\n');
  await assert.rejects(
    validateGeneratedFile(root, path, strictPolicy),
    (error) => error instanceof PolicyError && error.code === 'PROJECTION_DIGEST_MISMATCH',
  );
});

test('E-G0.0-03 negative: duplicate aliases fail deterministically', async () => {
  const root = await mkdtemp(join(tmpdir(), 'muxui-alias-'));
  await mkdir(join(root, 'catalog/components/button'), { recursive: true });
  await mkdir(join(root, 'catalog/patterns/form'), { recursive: true });
  await writeFile(
    join(root, 'catalog/components/button/artifact.json'),
    JSON.stringify({ id: 'muxui:component:button', aliases: ['action'] }),
  );
  await writeFile(
    join(root, 'catalog/patterns/form/artifact.json'),
    JSON.stringify({ id: 'muxui:pattern:form', aliases: ['action'] }),
  );

  await assert.rejects(auditAliases(root, policy), (error) => {
    assert.ok(error instanceof PolicyError);
    assert.equal(error.code, 'ALIAS_COLLISION');
    assert.match(error.message, /muxui:component:button/);
    assert.match(error.message, /muxui:pattern:form/);
    return true;
  });
});

test('E-G0.1-04: ArtifactRef grammar is derived from the schema owner', async () => {
  const configuredPolicy = JSON.parse(await readFile(
    join(repositoryRoot, 'tooling/audits/repository-policy/repository-policy.json'),
    'utf8',
  ));
  const artifactRefSchema = JSON.parse(await readFile(
    join(repositoryRoot, 'packages/schema/schemas/artifact-ref.schema.json'),
    'utf8',
  ));
  assert.equal(Object.hasOwn(configuredPolicy, 'artifactIdPattern'), false);
  assert.equal(policy.artifactIdPattern, artifactRefSchema.pattern);
});

test('E-G0.0-04 negative: an untracked non-projection output fails clean generation', () => {
  assert.throws(
    () => verifyGenerationState({
      beforeDigest: 'same',
      firstDigest: 'different',
      secondDigest: 'different',
      firstStatus: '?? unexpected-output.txt\n',
      secondStatus: '?? unexpected-output.txt\n',
    }),
    (error) => {
      assert.ok(error instanceof GenerationProofError);
      assert.equal(error.code, 'GENERATION_WORKTREE_DIRTY');
      assert.match(error.message, /unexpected-output\.txt/);
      return true;
    },
  );
});

test('E-G0.0-04: independent clean runs allow initially absent projections', () => {
  const source = new Map([['catalog/source.json', 'source-digest']]);
  const projection = new Map([
    ['catalog/source.json', 'source-digest'],
    ['packages/catalog/generated/catalog.json', 'projection-digest'],
  ]);

  assert.doesNotThrow(() => verifyGenerationState({
    firstBeforeFiles: source,
    firstFiles: projection,
    secondBeforeFiles: source,
    secondFiles: projection,
    projectionPaths: ['packages/catalog/generated/catalog.json'],
    firstStatus: '',
    secondStatus: '',
  }));
});

test('E-G0.0-04 negative: source mutation fails independent clean generation', () => {
  assert.throws(
    () => verifyGenerationState({
      firstBeforeFiles: new Map([['catalog/source.json', 'source-digest']]),
      firstFiles: new Map([['catalog/source.json', 'changed-source-digest']]),
      secondBeforeFiles: new Map([['catalog/source.json', 'source-digest']]),
      secondFiles: new Map([['catalog/source.json', 'source-digest']]),
      projectionPaths: [],
      firstStatus: '',
      secondStatus: '',
    }),
    (error) => error instanceof GenerationProofError && error.code === 'GENERATION_DRIFT',
  );
});

test('E-G0.0-04 negative: independent projection output drift is nondeterministic', () => {
  const source = new Map([['catalog/source.json', 'source-digest']]);
  assert.throws(
    () => verifyGenerationState({
      firstBeforeFiles: source,
      firstFiles: new Map([
        ['catalog/source.json', 'source-digest'],
        ['packages/catalog/generated/catalog.json', 'first-projection'],
      ]),
      secondBeforeFiles: source,
      secondFiles: new Map([
        ['catalog/source.json', 'source-digest'],
        ['packages/catalog/generated/catalog.json', 'second-projection'],
      ]),
      projectionPaths: ['packages/catalog/generated/catalog.json'],
      firstStatus: '',
      secondStatus: '',
    }),
    (error) => error instanceof GenerationProofError
      && error.code === 'GENERATION_NONDETERMINISTIC',
  );
});
