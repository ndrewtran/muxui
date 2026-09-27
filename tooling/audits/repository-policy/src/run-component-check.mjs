import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { componentTestSelection } from './component-test-selection.mjs';

const packageRoot = resolve(import.meta.dirname, '../../../../packages/react');
const rawFamilyValues = process.env.MUXUI_COMPONENT_FAMILIES ?? '';
const familyValues = rawFamilyValues.split(',').map((value) => value.trim());
if (!rawFamilyValues || familyValues.some((value) => !value)) {
  throw new Error('MUXUI_COMPONENT_FAMILIES_REQUIRED: component checks need one or more non-empty families');
}

const contractSource = await readFile(resolve(packageRoot, 'generated/r1-6-contract.json'), 'utf8');
const contract = JSON.parse(contractSource.split('\n').filter((line) => !line.startsWith('// @generated-')).join('\n'));
const allRecords = Array.isArray(contract.components) ? contract.components : [];
const records = [];
const unknown = [];
for (const value of familyValues) {
  const record = allRecords.find((candidate) => [candidate.family, candidate.slug, candidate.export]
    .filter(Boolean)
    .some((key) => key.toLowerCase() === value.toLowerCase()));
  if (!record) unknown.push(value);
  else if (!records.some(({ family }) => family === record.family)) records.push(record);
}
if (unknown.length > 0 || records.length === 0) {
  throw new Error(`MUXUI_COMPONENT_TEST_METADATA_UNKNOWN: ${unknown.length > 0 ? unknown.join(', ') : familyValues.join(', ')}`);
}

const testRoots = [resolve(packageRoot, 'test'), resolve(packageRoot, 'test/browser')];
const testFiles = [];
for (const root of testRoots) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.test.mjs')) testFiles.push(resolve(root, entry.name));
  }
}
const availableFiles = testFiles.map((file) => file.slice(packageRoot.length + 1).replaceAll('\\', '/'));
const testSources = Object.fromEntries(await Promise.all(testFiles.map(async (file, index) => [
  availableFiles[index],
  await readFile(file, 'utf8'),
])));
const rawBehaviorProofFamilies = process.env.MUXUI_COMPONENT_BROWSER_PROOF_FAMILIES ?? '';
const behaviorProofFamilies = rawBehaviorProofFamilies ? rawBehaviorProofFamilies.split(',').map((value) => value.trim()) : [];
if (behaviorProofFamilies.some((family) => !family)) {
  throw new Error('MUXUI_COMPONENT_BROWSER_PROOF_FAMILIES_EMPTY: provide non-empty family names');
}
const unknownBehaviorProofFamilies = behaviorProofFamilies.filter((family) => !records.some(({ family: current }) => current === family));
if (unknownBehaviorProofFamilies.length > 0) {
  throw new Error(`MUXUI_COMPONENT_BROWSER_PROOF_FAMILY_UNKNOWN: ${unknownBehaviorProofFamilies.join(', ')}`);
}
const selection = componentTestSelection(records, availableFiles, {
  includeSharedSource: process.env.MUXUI_COMPONENT_INCLUDE_SHARED_SOURCE !== '0',
  testSources,
  behaviorProofFamilies,
});

console.log(`[component-check] families=${records.map(({ family }) => family).join(', ')}`);
console.log(`[component-check] tests=${selection.files.join(', ')}`);
if (selection.behaviorProofFamilies.length > 0) {
  console.log(`[component-check] Storybook BrowserProof families=${selection.behaviorProofFamilies.join(', ')}`);
}
console.log('[component-check] shared integrity tests=test/style-scopes.test.mjs, test/styling-tokens.test.mjs');
const focusedFiles = Object.entries(selection.testNamesByFile);
if (focusedFiles.length > 0) {
  console.log(`[component-check] focused test names=${focusedFiles.map(([file, names]) => `${file}: ${names.join(' | ')}`).join('; ')}`);
}
for (const file of selection.files) {
  const names = selection.testNamesByFile[file];
  const namePattern = names?.length
    ? `^(?:${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|')})$`
    : null;
  const testResult = spawnSync(process.execPath, [
    '--test',
    '--test-concurrency=1',
    ...(namePattern ? [`--test-name-pattern=${namePattern}`] : []),
    file,
  ], {
    cwd: packageRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (testResult.error) throw testResult.error;
  if ((testResult.status ?? 1) !== 0) process.exit(testResult.status ?? 1);
}

const typeResult = spawnSync('pnpm', ['exec', 'tsc', '--noEmit', '-p', 'test/tsconfig.json'], {
  cwd: packageRoot,
  stdio: 'inherit',
  env: process.env,
});
if (typeResult.error) throw typeResult.error;
process.exit(typeResult.status ?? 1);
