// E-BL1-07: the surface-parity matrix for pattern data.
//
//   node tests/evidence/bl1/surface-parity.mjs
//
// For each request it compares one normalized response, the catalog API's own, across the
// surfaces that return it: the API, the real `muxui` process in JSON, human, and dense
// output (each parsed back to a response object), and the docs site's loader. Rows cover
// pattern `list`, `search`, and `get`, the participant filter (`--uses`), the derived
// "used in" view on component `get`, and component examples, which must stay
// component-bound. Two error rows keep the negative path in the matrix. The request set is
// derived from the shipped catalog, so a block added later joins the matrix by itself.
// A mismatch throws with the row and surface that differ.
import { execFileSync, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import * as catalog from '../../../packages/catalog/src/index.mjs';
import { executeCommand, parseCliArguments, parseDense, parseHuman } from '../../../packages/tooling/src/index.mjs';
import { canonicalJson } from '../../../tooling/audits/repository-policy/src/canonical-json.mjs';
import { matchingBlocks } from '../../../apps/docs/src/lib/block-filter.ts';
import { buildBlockFilterIndex, getBlockExamples, getBlockRecord, listBlocks } from '../../../apps/docs/src/lib/blocks.ts';
import { getComponentPage } from '../../../apps/docs/src/lib/catalog.ts';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const cli = resolve(repositoryRoot, 'packages/tooling/bin/muxui.mjs');
const digest = (value) => `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
const tail = (id) => id.slice(id.lastIndexOf(':') + 1);

function spawnCli(argv, mode) {
  const flags = mode === 'json' ? ['--json'] : mode === 'dense' ? ['--dense'] : [];
  const result = spawnSync(process.execPath, [cli, ...argv, ...flags], { cwd: repositoryRoot, encoding: 'utf8' });
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** The API's response for the request the CLI builds from `argv` (the registry owns the argv to request mapping). */
function apiResponse(argv) {
  const parsed = parseCliArguments(argv);
  assert.equal(parsed.kind, 'command', `${argv.join(' ')} does not parse`);
  return executeCommand(parsed.command, parsed.request, catalog);
}

function allListItems(request) {
  const items = [];
  let cursor;
  do {
    const response = catalog.listArtifacts({ ...request, platform: 'web.react', limit: 100, ...(cursor === undefined ? {} : { cursor }) });
    assert.notEqual(response.type, 'error', JSON.stringify(response));
    items.push(...response.data.items);
    cursor = response.meta.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return items;
}

// The in-process API answers without a project, so it reports an advisory authority, an unresolved
// compatibility, no target package, and the default package version; the `muxui` process resolves
// this repository's catalog as a project and reports installed-local authority and its own
// version. Only these location fields differ, and only they are excluded from the cross-process
// comparison: `meta.resolution.revisions` and `meta.resolution.sourceRevision`, and every other
// member of the response, are compared.
const metaLocationFields = ['authority', 'muxuiVersion'];
const resolutionLocationFields = ['authority', 'catalogSource', 'compatibility', 'targetPackages'];
export const normalizationRule = `meta.${metaLocationFields.join(', meta.')}, and meta.resolution.${resolutionLocationFields.join(', meta.resolution.')} describe how the process located the catalog and are excluded; every other member of the response, including meta.resolution.revisions and meta.resolution.sourceRevision, is compared`;
function normalize(response) {
  if (response.meta === undefined) return response;
  const meta = Object.fromEntries(Object.entries(response.meta).filter(([key]) => !metaLocationFields.includes(key)));
  if (meta.resolution !== undefined) {
    meta.resolution = Object.fromEntries(Object.entries(meta.resolution).filter(([key]) => !resolutionLocationFields.includes(key)));
  }
  return { ...response, meta };
}

/** One matrix row: `argv` through the API and the CLI's three outputs, plus the site check when the loader answers it. */
function compareRow(rows, { id, argv, group, site }) {
  const response = apiResponse(argv);
  const surfaces = ['api'];
  const json = spawnCli(argv, 'json');
  const parsedJson = JSON.parse(json.stdout);
  if (response.type === 'error') {
    // The CLI adds a recovery command to a diagnostic, so an error compares by code and rule.
    assert.equal(json.exitCode, apiExitCode(response), `${id}: exit code`);
    assert.deepEqual([parsedJson.error.code, parsedJson.error.ruleId], [response.error.code, response.error.ruleId], `${id}: cli-json`);
    assert.deepEqual(parseDense(spawnCli(argv, 'dense').stdout).error.code, response.error.code, `${id}: cli-dense`);
    surfaces.push('cli-json', 'cli-dense');
  } else {
    assert.equal(json.exitCode, 0, `${id}: cli-json exit code`);
    assert.deepEqual(normalize(parsedJson), normalize(response), `${id}: cli-json`);
    assert.deepEqual(parseHuman(spawnCli(argv, 'human').stdout), parsedJson, `${id}: cli-human`);
    assert.deepEqual(parseDense(spawnCli(argv, 'dense').stdout), parsedJson, `${id}: cli-dense`);
    surfaces.push('cli-json', 'cli-human', 'cli-dense');
  }
  if (site) {
    site(response);
    surfaces.push('site');
  }
  rows.push({ id, group, command: `muxui ${argv.join(' ')}`, surfaces, responseType: response.type, responseDigest: digest(normalize(response)) });
  return response;
}

const apiExitCode = (response) => ({ MUXUI_QUERY_INVALID: 2, MUXUI_ARTIFACT_NOT_FOUND: 4 })[response.error.code];

/** The revision the spawned CLI runs at: the checked-out HEAD, clean outside the evidence root. */
function cliRevision() {
  const git = (...args) => execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' });
  const dirty = git('status', '--porcelain=v1', '--untracked-files=all').split('\n').filter(Boolean).filter((line) => !line.slice(3).startsWith('tests/evidence/bl1/'));
  return { revision: git('rev-parse', 'HEAD').trim(), cleanOutsideEvidenceRoot: dirty.length === 0 };
}

/** Builds and checks the matrix, and returns its rows and totals. */
export async function surfaceParityMatrix() {
  const patterns = allListItems({ kind: 'pattern', detail: 'brief' });
  assert.ok(patterns.length > 0, 'the catalog lists no pattern');
  const patternIds = patterns.map(({ id }) => id);
  const records = Object.fromEntries(patternIds.map((id) => [id, catalog.getArtifact({ id, platform: 'web.react', detail: 'full' }).data.artifact]));
  const participants = [...new Set(patternIds.flatMap((id) => records[id].participants.map(({ component }) => component)))].sort();
  const variants = patternIds.flatMap((id) => records[id].variants.map(({ example }) => ({ pattern: id, example })));
  const variantIds = new Set(variants.map(({ example }) => example));
  const filterIndex = buildBlockFilterIndex();
  const rows = [];

  // Pattern list, in each detail tier; the site loader returns the brief items.
  for (const detail of ['brief', 'compact', 'full']) {
    compareRow(rows, {
      id: `list pattern ${detail}`,
      argv: ['list', 'pattern', '--detail', detail, '--limit', '100'],
      group: 'list',
      site: detail === 'brief' ? (response) => assert.deepEqual(listBlocks(), response.data.items, 'site loader list') : undefined,
    });
  }

  // The participant filter: every participant component, through list and through search.
  for (const component of participants) {
    compareRow(rows, {
      id: `list pattern --uses ${tail(component)}`,
      argv: ['list', 'pattern', '--detail', 'brief', '--limit', '100', '--uses', component],
      group: 'participant filter',
      site: (response) => {
        assert.deepEqual(listBlocks(component), response.data.items, 'site loader uses');
        assert.deepEqual(filterIndex.uses[component], response.data.items.map(({ id }) => tail(id)).sort(), 'site rail index uses');
      },
    });
  }
  const sampleParticipant = participants[0];
  const queries = ['poster grid', 'hero', 'pricing plans', 'account settings', 'billing toggle', 'collections', 'gallery'];
  for (const query of queries) {
    for (const uses of ['', sampleParticipant]) {
      compareRow(rows, {
        id: `search ${query}${uses ? ` --uses ${tail(uses)}` : ''}`,
        argv: ['search', query, '--detail', 'brief', '--limit', '100', ...(uses ? ['--uses', uses] : [])],
        group: 'search',
        site: (response) => {
          const expected = response.data.items.filter(({ kind }) => kind === 'pattern').map(({ id }) => tail(id)).sort();
          assert.deepEqual([...(matchingBlocks(filterIndex, { query, uses }) ?? [])].sort(), expected, 'site rail filter');
        },
      });
    }
  }

  // Pattern get: brief (default), full, and the variant examples section with exact source.
  for (const id of patternIds) {
    compareRow(rows, { id: `get ${tail(id)}`, argv: ['get', id], group: 'get pattern' });
    compareRow(rows, {
      id: `get ${tail(id)} --detail full`,
      argv: ['get', id, '--detail', 'full'],
      group: 'get pattern',
      site: (response) => {
        const loaded = getBlockRecord(id);
        for (const field of ['id', 'kind', 'name', 'summary', 'lifecycle', 'platforms', 'source', 'category', 'group', 'participants', 'variants', 'accessibility']) {
          assert.deepEqual(loaded[field], response.data.artifact[field], `site loader ${field}`);
        }
      },
    });
    compareRow(rows, {
      id: `get ${tail(id)} --section examples`,
      argv: ['get', id, '--section', 'examples'],
      group: 'get pattern',
      site: (response) => {
        const wanted = response.data.value.map(({ id: exampleId, kind, name, summary, lifecycle, platforms, source, code }) => ({ id: exampleId, kind, name, summary, lifecycle, platforms, source, code }));
        assert.deepEqual(getBlockExamples(id), wanted, 'site loader variants');
        assert.deepEqual(response.data.value.map(({ id: exampleId }) => exampleId), records[id].variants.map(({ example }) => example), 'variants in authored order');
      },
    });
  }
  for (const { example } of variants) {
    compareRow(rows, { id: `get ${tail(example)}`, argv: ['get', example], group: 'get variant example' });
  }

  // The derived "used in" view on each participant component, in two detail tiers.
  for (const component of participants) {
    const slug = tail(component);
    for (const detail of ['compact', 'full']) {
      compareRow(rows, {
        id: `get ${slug} --detail ${detail}`,
        argv: ['get', component, '--detail', detail],
        group: 'used in',
        site: (response) => {
          assert.deepEqual(getComponentPage(slug).usedIn, response.data.usedIn ?? [], 'site component page usedIn');
          assert.ok((response.data.usedIn ?? []).length > 0, `${component} is a participant but lists no block`);
        },
      });
    }
  }

  // Component pages list only component-bound examples. Every component, through the API, CLI JSON, and the site.
  const components = allListItems({ kind: 'component', detail: 'brief' });
  let componentExamples = 0;
  let componentsWithUsedIn = 0;
  for (const { id } of components) {
    const slug = tail(id);
    const argv = ['get', id, '--section', 'examples'];
    const response = apiResponse(argv);
    const json = spawnCli(argv, 'json');
    assert.equal(json.exitCode, 0, `${slug} examples exit code`);
    assert.deepEqual(normalize(JSON.parse(json.stdout)), normalize(response), `${slug} examples cli-json`);
    for (const example of response.data.value) {
      assert.ok(!variantIds.has(example.id), `${id} lists block variant ${example.id}`);
      assert.ok(example.source.content.startsWith(`catalog/components/${slug}/`), `${id} lists ${example.source.content}`);
    }
    // The site shows the web.react examples of a component; the CLI request above names no platform.
    assert.deepEqual(getComponentPage(slug).examples.map(({ id: exampleId }) => exampleId), response.data.value.filter(({ platforms }) => platforms.includes('web.react')).map(({ id: exampleId }) => exampleId), `${slug} site examples`);
    componentExamples += response.data.value.length;
    if ((catalog.getArtifact({ id, platform: 'web.react' }).data.usedIn ?? []).length > 0) componentsWithUsedIn += 1;
  }
  rows.push({
    id: 'component examples: all components',
    group: 'component examples',
    command: 'muxui get <component> --section examples',
    surfaces: ['api', 'cli-json', 'site'],
    responseType: 'artifact.detail',
    responseDigest: digest({ components: components.map(({ id }) => id), componentExamples }),
    components: components.length,
    boundExamples: componentExamples,
    blockVariantsListed: 0,
  });

  // Negative path: a malformed and an unknown `--uses` fail the same way on every surface that prints an error.
  compareRow(rows, { id: 'list --uses with a bare slug', argv: ['list', '--uses', 'button'], group: 'errors' });
  compareRow(rows, { id: 'search --uses with an unknown component', argv: ['search', 'grid', '--uses', 'muxui:component:missing'], group: 'errors' });

  return {
    patterns: patternIds,
    participants,
    variants: variants.map(({ example }) => example),
    components: components.length,
    componentsWithUsedIn,
    rows,
    normalization: normalizationRule,
    cli: cliRevision(),
    limits: [
      'The site comparison covers the fields the Blocks loader and component page loader read, not every member of a response.',
      'Rail search is compared as the set of matching blocks over the queries listed, not by rank.',
      'The in-process API is compared with the CLI process after the location fields in the normalization rule are excluded.',
    ],
    searchQueries: queries,
    rowCount: rows.length,
    comparedSurfaces: ['api', 'cli-json', 'cli-human', 'cli-dense', 'site'],
  };
}

if (process.argv[1] === import.meta.filename) {
  const matrix = await surfaceParityMatrix();
  console.log(`[E-BL1-07] ${matrix.rowCount} rows over ${matrix.patterns.length} patterns, ${matrix.variants.length} variants, ${matrix.participants.length} participant components, and ${matrix.components} component pages agree across the API, CLI JSON, human, dense, and the site loader`);
}
