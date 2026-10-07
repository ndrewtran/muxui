// E-BL1-10: the deterministic content scan over every pattern variant source and asset.
//
//   node tests/evidence/bl1/content-scan.mjs
//
// It runs the catalog compiler's own content rules (`@muxui/catalog/pattern-content`: no
// remote reference, no local reference that is not a licensed asset, no literal colour, and a
// license and disclosure record for every asset) over each variant source and each file beside
// a pattern record, and adds a structural scan for what a bounded section must not do (a
// fetch, storage, or routing call). It reports the files it read with their digests. It
// cannot decide brand marks, real names, or likenesses: the independent content review
// records that part (see capture-bl1.mjs).
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { posix, resolve } from 'node:path';
import { CONTENT_RULES, auditPatternAssets, patternContentIssues } from '../../../packages/catalog/src/pattern-content.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

// What a bounded section (Decision 0026 item 6) must not contain: data fetching, storage or
// cookies, and routing. `ResizeObserver` and local React state are allowed.
const forbiddenCalls = [
  ['data fetching', /\b(?:fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon)/u],
  ['storage or cookies', /\b(?:localStorage|sessionStorage|indexedDB)\b|document\.cookie/u],
  ['routing', /react-router|next\/(?:link|navigation|router)|@tanstack\/(?:react-)?router|\buse(?:Navigate|Router|Location)\b|\brouter\.(?:push|replace)|window\.location|\blocation\.(?:href|assign|replace)|history\.(?:push|replace)State/u],
];

const hitMessages = (hits) => hits.map(({ source, line, rule }) => `${source}:${line} contains ${rule}`);

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(resolve(repositoryRoot, directory), { withFileTypes: true })) {
    const path = posix.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile() && entry.name !== '.DS_Store') files.push(path);
  }
  return files.sort();
}

/** Scans every pattern the catalog source manifest declares and returns the report. */
export async function scanBlockContent() {
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, 'packages/catalog/catalog-sources.json'), 'utf8'));
  const readRecord = async (path) => JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8'));
  const examples = new Map();
  for (const { family, path } of manifest.records) {
    if (family === 'example') examples.set((await readRecord(path)).id, { path, ...await readRecord(path) });
  }
  const known = new Set([...manifest.records.map(({ path }) => path), ...[...examples.values()].map(({ source }) => source)]);

  const patterns = [];
  for (const { family, path } of manifest.records) {
    if (family !== 'pattern') continue;
    const pattern = await readRecord(path);
    const directory = posix.dirname(path);
    const variants = [];
    for (const { example } of pattern.variants) {
      const record = examples.get(example);
      variants.push({ id: example, record: record.path, source: record.source, bytes: await readFile(resolve(repositoryRoot, record.source)) });
    }
    const { issues: assetIssues, licensed } = await auditPatternAssets({ repositoryRoot, pattern, directory, known });
    const sourceIssues = patternContentIssues({ pattern, variants: variants.map(({ source, bytes }) => ({ source, text: bytes.toString('utf8') })), directory, licensed });
    const boundedHits = variants.flatMap(({ source, bytes }) => bytes.toString('utf8').split('\n').flatMap((text, index) => (
      forbiddenCalls.filter(([, pattern]) => pattern.test(text)).map(([rule]) => ({ source, line: index + 1, rule }))
    )));
    const files = await listFiles(directory);
    const roles = (file) => (file === path ? 'pattern-record' : variants.some(({ record }) => record === file) ? 'variant-record'
      : variants.some(({ source }) => source === file) ? 'variant-source' : file.endsWith('.license.json') ? 'license-record' : 'asset');
    const inventory = await Promise.all(files.map(async (file) => {
      const bytes = await readFile(resolve(repositoryRoot, file));
      return { path: file, role: roles(file), bytes: bytes.length, sha256: sha256(bytes) };
    }));
    patterns.push({
      id: pattern.id,
      category: pattern.category,
      directory,
      files: inventory,
      variants: variants.map(({ id, source, bytes }) => {
        const text = bytes.toString('utf8');
        return {
          id,
          source,
          sha256: sha256(bytes),
          lines: text.split('\n').length - 1,
          // Counted, not excused: a data URI fetches nothing and an xmlns value names a namespace.
          dataUris: (text.match(/data:[a-z/+-]+[;,]/gu) ?? []).length,
          xmlnsNamespaces: (text.match(/xmlns(?::[a-z]+|[A-Z][a-z]*)?\s*=/gu) ?? []).length,
        };
      }),
      assets: inventory.filter(({ role }) => role === 'asset').map(({ path: asset }) => asset),
      licenseRecords: inventory.filter(({ role }) => role === 'license-record').map(({ path: record }) => record),
      licensedAssets: [...licensed].sort(),
      contentIssues: [...sourceIssues, ...assetIssues].map(({ ruleId, source, line, message }) => ({ ruleId, source, line: line ?? null, message })),
      boundedSectionHits: boundedHits,
    });
  }
  const failures = patterns.flatMap(({ id, contentIssues, boundedSectionHits }) => [
    ...contentIssues.map(({ ruleId, message }) => `${id}: ${ruleId}: ${message}`),
    ...hitMessages(boundedSectionHits).map((hit) => `${id}: ${hit}`),
  ]);
  return {
    rules: CONTENT_RULES,
    boundedSectionRules: forbiddenCalls.map(([rule]) => rule),
    patterns,
    variantSources: patterns.reduce((sum, { variants }) => sum + variants.length, 0),
    assetFiles: patterns.reduce((sum, { assets }) => sum + assets.length, 0),
    failures,
  };
}

if (process.argv[1] === import.meta.filename) {
  const report = await scanBlockContent();
  for (const failure of report.failures) console.error(failure);
  console.log(`[E-BL1-10] ${report.variantSources} variant sources and ${report.assetFiles} assets in ${report.patterns.length} patterns: ${report.failures.length === 0 ? 'no content-rule violation' : `${report.failures.length} violations`}`);
  process.exitCode = report.failures.length === 0 ? 0 : 1;
}
