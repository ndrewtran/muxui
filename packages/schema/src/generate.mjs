import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatedText, normalizePath } from '../../../tooling/audits/repository-policy/src/policy.mjs';
import { loadJsonDocument, resolveJsonPointer } from './contracts.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const recipe = loadJsonDocument('type-projection.json');
const platformSafetyContract = JSON.parse(readFileSync(
  join(repositoryRoot, 'packages/schema/platform-safety-contract.json'),
  'utf8',
));

function projectionValues(source, valueField) {
  const [fileName, pointer] = source.split('#');
  const document = fileName.startsWith('packages/')
    ? JSON.parse(readFileSync(join(repositoryRoot, fileName), 'utf8'))
    : loadJsonDocument(fileName);
  const value = resolveJsonPointer(
    document,
    pointer ? `#${pointer}` : '#',
  );
  const values = Array.isArray(value) ? value : Object.keys(value);
  return valueField === undefined ? values : values.map((entry) => entry[valueField]);
}

function union(values) {
  return values.map((value) => JSON.stringify(value)).join(' | ');
}

const declarations = recipe.projections.map(({ name, source, valueField }) => (
  `export type ${name} = ${union(projectionValues(source, valueField))};`
));
const body = [
  'export type ArtifactRef = `muxui:${ArtifactKind}:${string}`;',
  'export type BindingRef = `${Extract<ArtifactRef, `muxui:component:${string}`>}#${BindingId}`;',
  ...declarations,
  '',
].join('\n');
const policy = JSON.parse(await readFile(
  join(repositoryRoot, 'tooling/audits/repository-policy/repository-policy.json'),
  'utf8',
));
const source = 'packages/schema/schemas/type-projection.json';
const outputPath = join(repositoryRoot, recipe.output);
const expected = generatedText({ source, body, policy });
const platformSafetySource = 'packages/schema/platform-safety-contract.json';
const platformSafetyBody = [
  `export const platformSafetyContract = Object.freeze(${JSON.stringify(platformSafetyContract)});`,
  'export const platformSafetyRequirementIds = Object.freeze(',
  '  platformSafetyContract.requirements.map(({ id }) => id),',
  ');',
  '',
].join('\n');
const platformSafetyOutputPath = join(
  repositoryRoot,
  'packages/schema/generated/platform-safety-contract.mjs',
);
const expectedPlatformSafety = generatedText({
  source: platformSafetySource,
  body: platformSafetyBody,
  policy,
});

if (process.argv.includes('--check')) {
  const [actual, actualPlatformSafety] = await Promise.all([
    readFile(outputPath, 'utf8').catch(() => null),
    readFile(platformSafetyOutputPath, 'utf8').catch(() => null),
  ]);
  if (actual !== expected || actualPlatformSafety !== expectedPlatformSafety) {
    console.error(
      `SCHEMA_GENERATED_TYPES_DRIFT: ${normalizePath(recipe.output)} must be regenerated from ${source}`,
    );
    process.exitCode = 1;
  } else {
    console.log(`[schema] generated types and platform-safety contract match canonical sources`);
  }
} else {
  await Promise.all([
    mkdir(dirname(outputPath), { recursive: true }),
    mkdir(dirname(platformSafetyOutputPath), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(outputPath, expected),
    writeFile(platformSafetyOutputPath, expectedPlatformSafety),
  ]);
  console.log(`[schema] generated ${normalizePath(recipe.output)}`);
  console.log('[schema] generated packages/schema/generated/platform-safety-contract.mjs');
}
