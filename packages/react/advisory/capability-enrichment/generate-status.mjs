import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';

const advisoryRoot = resolve(import.meta.dirname);
const packageRoot = resolve(advisoryRoot, '../..');
const repositoryRoot = resolve(packageRoot, '../..');
const matrixPath = resolve(advisoryRoot, 'matrix.json');
const outputPath = resolve(advisoryRoot, 'implementation-status.json');
const implementedDispositions = new Set(['adopt', 'adapt']);
const allDispositions = new Set(['adopt', 'adapt', 'defer', 'omit']);
const runtimeExportNames = new Map([
  ['Modal', 'Dialog'],
]);

function fail(message) {
  throw new Error(`MUXUI_CAPABILITY_ENRICHMENT_STATUS_${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function repositoryPath(path) {
  const absolute = resolve(repositoryRoot, path);
  assert(relative(repositoryRoot, absolute) !== '..' && !relative(repositoryRoot, absolute).startsWith('../'), `PATH_OUTSIDE_REPOSITORY:${path}`);
  return absolute;
}

function parseReference(reference) {
  assert(typeof reference === 'string' && reference.length > 0, 'REFERENCE_SHAPE');
  assert((reference.match(/#/gu) ?? []).length <= 1, `REFERENCE_ANCHOR:${reference}`);
  const [withoutAnchor, anchor] = reference.split('#', 2);
  const lineMatch = withoutAnchor.match(/^(.*?):(\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)$/u);
  return {
    path: lineMatch?.[1] ?? withoutAnchor,
    lines: lineMatch?.[2],
    anchor: anchor ? `#${anchor}` : undefined,
  };
}

function assertProofNamespace(parsed, reference) {
  if (parsed.path.startsWith('packages/react/test/')) {
    assert(/^packages\/react\/test\/(?:[^/]+\.)?test\.(?:mjs|tsx)$/u.test(parsed.path), `PROOF_NAMESPACE:${reference}`);
    assert(!parsed.lines && !parsed.anchor, `PROOF_LOCATOR:${reference}`);
    return 'test';
  }
  if (parsed.path.startsWith('packages/react/src/')) {
    assert(/\.mjs$/u.test(parsed.path), `PROOF_NAMESPACE:${reference}`);
    assert(Boolean(parsed.lines || parsed.anchor), `PROOF_LOCATOR:${reference}`);
    assert(!(parsed.lines && parsed.anchor), `PROOF_LOCATOR:${reference}`);
    return 'runtime';
  }
  if (parsed.path.startsWith('catalog/components/')) {
    assert(/^catalog\/components\/[^/]+\/artifact\.json$/u.test(parsed.path), `PROOF_NAMESPACE:${reference}`);
    assert(parsed.anchor === '#bindings/web.react' && !parsed.lines, `PROOF_LOCATOR:${reference}`);
    return 'artifact';
  }
  fail(`PROOF_NAMESPACE:${reference}`);
}

async function readRepositoryFile(path) {
  const absolute = repositoryPath(path);
  try {
    return await readFile(absolute, 'utf8');
  } catch (error) {
    fail(`MISSING_PATH:${path}:${error.code ?? 'read-error'}`);
  }
}

function assertLineRange(source, path, lines) {
  if (!lines) return;
  const maxLine = Math.max(...lines.split(',').map((range) => Number(range.split('-').at(-1))));
  assert(maxLine <= source.split('\n').length, `LINE_RANGE:${path}:${lines}`);
}

async function resolveReference(reference, { jsonPointer = false } = {}) {
  const parsed = parseReference(reference);
  const source = await readRepositoryFile(parsed.path);
  assertLineRange(source, parsed.path, parsed.lines);
  if (!parsed.anchor) return { path: parsed.path, lines: parsed.lines ?? null, anchor: null };
  if (jsonPointer || parsed.path.endsWith('.json')) {
    let value;
    try {
      value = JSON.parse(source);
    } catch {
      fail(`INVALID_JSON:${parsed.path}`);
    }
    const segments = parsed.anchor.slice(1).split('/').filter(Boolean).map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
    for (const segment of segments) {
      assert(value !== null && typeof value === 'object' && Object.hasOwn(value, segment), `MISSING_ANCHOR:${reference}`);
      value = value[segment];
    }
    return { path: parsed.path, lines: parsed.lines ?? null, anchor: parsed.anchor };
  }
  assert(source.includes(parsed.anchor.slice(1)), `MISSING_ANCHOR:${reference}`);
  return { path: parsed.path, lines: parsed.lines ?? null, anchor: parsed.anchor };
}

function artifactSlug(family) {
  return family === 'Modal'
    ? 'dialog'
    : family.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

async function canonicalOwner(family) {
  const artifactPath = family.canonical?.artifactRef;
  const componentId = family.canonical?.componentId;
  const bindingProfile = family.canonical?.bindingProfile;
  assert(typeof artifactPath === 'string' && typeof componentId === 'string' && bindingProfile === 'web.react', `CANONICAL_SHAPE:${family.family}`);
  const artifactSource = await readRepositoryFile(artifactPath);
  let artifact;
  try {
    artifact = JSON.parse(artifactSource);
  } catch {
    fail(`INVALID_ARTIFACT_JSON:${artifactPath}`);
  }
  assert(artifact.id === componentId, `CANONICAL_ID:${family.family}`);
  const binding = artifact.bindings?.[bindingProfile];
  assert(binding && typeof binding === 'object', `CANONICAL_BINDING:${family.family}`);
  const bindingRef = `${artifactPath}#bindings/${bindingProfile}`;
  await resolveReference(bindingRef, { jsonPointer: true });
  return {
    artifact: { path: artifactPath, id: artifact.id },
    binding: {
      path: bindingRef,
      profile: bindingProfile,
      lifecycle: binding.lifecycle,
      strategy: binding.strategy,
    },
  };
}

async function runtimeOwner(family) {
  const runtimeRefs = family.evidenceRefs?.mux?.filter((reference) => reference.startsWith('packages/react/src/')) ?? [];
  assert(runtimeRefs.length === 1, `RUNTIME_COUNT:${family.family}`);
  const parsed = parseReference(runtimeRefs[0]);
  const source = await readRepositoryFile(parsed.path);
  assertLineRange(source, parsed.path, parsed.lines);
  const expectedAnchor = runtimeExportNames.get(family.family) ?? family.family;
  if (parsed.anchor) {
    assert(parsed.anchor.slice(1) === expectedAnchor, `RUNTIME_ANCHOR:${family.family}:${parsed.path}#${parsed.anchor.slice(1)}`);
  }
  const anchor = expectedAnchor;
  const escapedAnchor = anchor.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const exportDeclaration = new RegExp(`(?:^|\\n)\\s*export\\s+(?:(?:const|let|var|function|class)\\s+${escapedAnchor}\\b|\\{[^}]*\\b${escapedAnchor}\\b[^}]*\\})`, 'mu');
  assert(exportDeclaration.test(source), `RUNTIME_ANCHOR:${family.family}:${parsed.path}#${anchor}`);
  return [{ path: parsed.path, lines: parsed.lines ?? null, anchor: `#${anchor}` }];
}

function decisionKey(family, dimension, capability) {
  return `${family}/${dimension}/${capability}`;
}

async function proofOwners(decision) {
  assert(Array.isArray(decision.proofRefs) && decision.proofRefs.length > 0, 'PROOF_REQUIRED');
  const proof = [];
  for (const reference of decision.proofRefs) {
    const parsed = parseReference(reference);
    assertProofNamespace(parsed, reference);
    const resolved = await resolveReference(reference);
    proof.push(resolved);
  }
  return proof;
}

/** Build the advisory-only status projection from matrix and Mux-owned sources. */
export async function buildStatus(matrix, { expectedImplementedCount = 303 } = {}) {
  assert(matrix?.schema === 'muxui-react-capability-enrichment-matrix-v1', 'MATRIX_SCHEMA');
  const entries = {};
  const dispositionCounts = { adopt: 0, adapt: 0, defer: 0, omit: 0 };
  for (const family of matrix.families ?? []) {
    const owners = await canonicalOwner(family);
    const runtime = await runtimeOwner(family);
    for (const [dimension, cell] of Object.entries(family.dimensions ?? {})) {
      for (const decision of cell.decisions ?? []) {
        assert(allDispositions.has(decision.disposition), `DISPOSITION:${family.family}/${dimension}`);
        dispositionCounts[decision.disposition] += 1;
        if (!implementedDispositions.has(decision.disposition)) continue;
        const key = decisionKey(family.family, dimension, decision.capability);
        assert(!Object.hasOwn(entries, key), `DUPLICATE_KEY:${key}`);
        entries[key] = {
          family: family.family,
          tranche: family.tranche,
          dimension,
          capability: decision.capability,
          disposition: decision.disposition,
          implementation: 'implemented',
          owners,
          runtime,
          proof: await proofOwners(decision),
        };
      }
    }
  }
  assert(Object.keys(entries).length === expectedImplementedCount, `IMPLEMENTED_COUNT:${Object.keys(entries).length}`);
  return {
    schema: 'muxui-react-capability-enrichment-status-v1',
    status: 'complete',
    advisoryOnly: true,
    generatedFrom: 'packages/react/advisory/capability-enrichment/matrix.json',
    key: ['family', 'dimension', 'capability'],
    implementedDispositions: [...implementedDispositions],
    nonImplementationDispositions: ['defer', 'omit'],
    counts: {
      families: matrix.families.length,
      decisions: Object.values(dispositionCounts).reduce((sum, count) => sum + count, 0),
      implemented: Object.keys(entries).length,
      adopt: dispositionCounts.adopt,
      adapt: dispositionCounts.adapt,
      defer: dispositionCounts.defer,
      omit: dispositionCounts.omit,
    },
    entries,
  };
}

async function main() {
  const matrix = JSON.parse(await readFile(matrixPath, 'utf8'));
  const expected = `${JSON.stringify(await buildStatus(matrix), null, 2)}\n`;
  if (process.argv.includes('--check')) {
    const actual = await readFile(outputPath, 'utf8');
    assert(actual === expected, `DRIFT:${outputPath}`);
    return;
  }
  await writeFile(outputPath, expected);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
