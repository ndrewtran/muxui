import { parse } from 'acorn';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { analyzeReactSourceChange } from './component-source-impact.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../../../..');
const storybookSourceDirectory = path.resolve(repositoryRoot, 'apps/react-storybook/src');
const generatedDirectory = 'apps/react-storybook/.storybook/generated';
const manifestOutput = 'manifest.mjs';
const nonStoryExports = new Set(['__namedExportsOrder']);

function fail(code, message) {
  throw new Error(`MUXUI_CI_IMPACT_STORYBOOK_GENERATOR_${code}: ${message}`);
}

function parseSource(source, side) {
  try {
    return parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch (error) {
    fail('SOURCE_INVALID', `${side} generator source could not be parsed: ${error.message}`);
  }
}

function generatedRootRange(source, side) {
  const ast = parseSource(source, side);
  const declarations = ast.body.flatMap((statement) => (
    statement.type === 'VariableDeclaration' || statement.type === 'ExportNamedDeclaration'
      ? (statement.type === 'VariableDeclaration' ? [statement] : statement.declaration?.type === 'VariableDeclaration' ? [statement.declaration] : [])
      : []
  )).flatMap((statement) => statement.declarations)
    .filter((declaration) => declaration.id.type === 'Identifier' && declaration.id.name === 'generatedRoot');
  if (declarations.length !== 1 || !declarations[0].init) {
    fail('OUTPUT_ROOT_MISSING', `${side} generator must declare exactly one initialized generatedRoot binding`);
  }
  return declarations[0].init;
}

function redirectGeneratedRoot(source, outputRoot, side) {
  const init = generatedRootRange(source, side);
  return `${source.slice(0, init.start)}${JSON.stringify(outputRoot)}${source.slice(init.end)}`;
}

function validatePageIndex(pageIndex) {
  if (!Array.isArray(pageIndex) || pageIndex.length === 0) {
    fail('PAGE_INDEX_EMPTY', 'canonical pageIndex must contain at least one generated family');
  }
  const pagesByOutput = new Map();
  const records = [];
  const ids = new Set();
  for (const page of pageIndex) {
    if (typeof page.family !== 'string' || !page.family || typeof page.storyFile !== 'string'
      || !page.storyFile.startsWith(`${generatedDirectory}/`) || !Array.isArray(page.stories)) {
      fail('PAGE_INDEX_INVALID', 'each page needs a family, a canonical generated storyFile, and stories');
    }
    const outputName = page.storyFile.slice(`${generatedDirectory}/`.length);
    if (!outputName || outputName.includes('/') || !outputName.endsWith('.stories.mjs')) {
      fail('PAGE_INDEX_INVALID', `${page.family} has an unsupported generated storyFile ${page.storyFile}`);
    }
    if (pagesByOutput.has(outputName)) fail('PAGE_INDEX_DUPLICATE', `generated storyFile ${page.storyFile} has multiple page owners`);
    const pageIds = new Set();
    const exports = new Set();
    for (const story of page.stories) {
      if (typeof story.id !== 'string' || !story.id || typeof story.exportName !== 'string' || !story.exportName) {
        fail('PAGE_INDEX_INVALID', `${page.family} has a story without a canonical ID and exportName`);
      }
      if (ids.has(story.id) || pageIds.has(story.id)) fail('PAGE_INDEX_DUPLICATE', `story ID ${story.id} has multiple owners`);
      if (exports.has(story.exportName)) fail('PAGE_INDEX_DUPLICATE', `${page.family} repeats export ${story.exportName}`);
      ids.add(story.id);
      pageIds.add(story.id);
      exports.add(story.exportName);
      records.push({ family: story.id, export: story.exportName, source: page.storyFile, slug: story.id, parts: [] });
    }
    pagesByOutput.set(outputName, page);
  }
  return { pagesByOutput, records };
}

function exportedNames(source, outputName) {
  let ast;
  try {
    ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch (error) {
    fail('EMISSION_INVALID', `${outputName} emitted invalid JavaScript: ${error.message}`);
  }
  const names = new Set();
  for (const statement of ast.body) {
    if (statement.type === 'ExportAllDeclaration') {
      fail('EXPORT_UNSUPPORTED', `${outputName} uses export *; its Storybook page inventory cannot be resolved statically`);
    }
    if (statement.type !== 'ExportNamedDeclaration') continue;
    const declaration = statement.declaration;
    if (declaration?.type === 'VariableDeclaration') {
      for (const item of declaration.declarations) {
        if (item.id.type === 'Identifier') names.add(item.id.name);
      }
    } else if (declaration?.id?.name) {
      names.add(declaration.id.name);
    }
    for (const specifier of statement.specifiers) {
      if (specifier.type !== 'ExportSpecifier') {
        fail('EXPORT_UNSUPPORTED', `${outputName} uses an unsupported named-export form`);
      }
      const exported = specifier.exported;
      names.add(exported.type === 'Identifier' ? exported.name : String(exported.value));
    }
  }
  return names;
}

async function runGenerator(source, side) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'muxui-storybook-generator-impact-'));
  const outputRoot = path.join(temporaryRoot, 'generated');
  const isolatedSource = redirectGeneratedRoot(source, outputRoot, side);
  const evalSource = `import.meta.dirname = ${JSON.stringify(storybookSourceDirectory)};\n${isolatedSource}`;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', evalSource], {
    cwd: storybookSourceDirectory,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    await rm(temporaryRoot, { recursive: true, force: true });
    const detail = (result.stderr || result.stdout || result.error?.message || 'generator process failed').trim();
    fail('RUN_FAILED', `${side} generator emission failed (${result.status ?? result.signal ?? 'spawn error'}): ${detail}`);
  }

  try {
    const entries = await readdir(outputRoot, { withFileTypes: true });
    if (entries.some((entry) => !entry.isFile())) {
      fail('OUTPUT_INVALID', `${side} generator emitted nested or non-file output`);
    }
    const files = new Map(await Promise.all(entries.map(async (entry) => [
      entry.name,
      await readFile(path.join(outputRoot, entry.name), 'utf8'),
    ])));
    return { temporaryRoot, files };
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

function outputModulePath(outputName) {
  return path.posix.join(generatedDirectory, outputName);
}

/** Compare generator outputs in isolation and return affected canonical Storybook page IDs. */
export async function compareStorybookGeneratorEmissions({ beforeSource, afterSource, pageIndex }) {
  if (typeof beforeSource !== 'string' || typeof afterSource !== 'string') {
    fail('SOURCE_MISSING', 'base and head generator sources must both be strings');
  }
  const { pagesByOutput, records } = validatePageIndex(pageIndex);
  let before;
  let after;
  try {
    before = await runGenerator(beforeSource, 'base');
    after = await runGenerator(afterSource, 'head');

    const headStoryFiles = [...after.files.keys()].filter((name) => name.endsWith('.stories.mjs'));
    for (const outputName of headStoryFiles) {
      if (!pagesByOutput.has(outputName)) {
        fail('PAGE_OUTPUT_UNKNOWN', `head generator emitted CSF module ${outputName} with no canonical pageIndex owner`);
      }
    }
    for (const [outputName, page] of pagesByOutput) {
      const emitted = after.files.get(outputName);
      if (emitted === undefined) fail('PAGE_OUTPUT_MISSING', `${page.family} has no head emission at ${page.storyFile}`);
      const actualExports = new Set([...exportedNames(emitted, outputName)].filter((name) => !nonStoryExports.has(name)));
      const indexedExports = new Set(page.stories.map(({ exportName }) => exportName));
      for (const story of page.stories) {
        if (!actualExports.has(story.exportName)) {
          fail('PAGE_EXPORT_MISSING', `${page.family} page ${story.id} has no emitted export ${story.exportName}`);
        }
      }
      for (const exportName of actualExports) {
        if (!indexedExports.has(exportName)) {
          fail('PAGE_EXPORT_UNKNOWN', `${page.family} emission ${outputName} has unindexed export ${exportName}`);
        }
      }
    }

    const outputNames = new Set([...before.files.keys(), ...after.files.keys()]);
    const changedNames = [...outputNames].filter((name) => before.files.get(name) !== after.files.get(name));
    const removedUnindexedStories = changedNames.filter((name) => (
      name.endsWith('.stories.mjs') && before.files.has(name) && !after.files.has(name) && !pagesByOutput.has(name)
    ));
    const changedModules = changedNames.filter((name) => (
      name !== manifestOutput && !removedUnindexedStories.includes(name)
    ));
    if (changedModules.length === 0) {
      return {
        storyIds: [],
        reason: changedNames.includes(manifestOutput)
          ? 'generator changed manifest metadata only; emitted CSF and helper modules are unchanged'
          : removedUnindexedStories.length > 0
            ? `removed CSF outputs have no head page owner: ${removedUnindexedStories.join(', ')}`
            : 'generator emissions are unchanged',
      };
    }

    for (const outputName of changedModules) {
      if (!pagesByOutput.has(outputName) && !outputName.endsWith('.example.mjs')) {
        fail('OUTPUT_UNMAPPED', `changed generator output ${outputName} is neither an indexed CSF module nor an example helper`);
      }
    }

    const moduleSources = new Map([...outputNames]
      .filter((name) => name !== manifestOutput)
      .map((name) => [outputModulePath(name), {
        before: before.files.get(name) ?? '',
        after: after.files.get(name) ?? '',
      }]));
    const storyIds = new Set();
    const reasons = [];
    for (const outputName of changedModules) {
      const sourcePath = outputModulePath(outputName);
      let impact;
      try {
        impact = analyzeReactSourceChange({
          records,
          sourcePath,
          before: before.files.get(outputName) ?? '',
          after: after.files.get(outputName) ?? '',
          moduleSources,
        });
      } catch (error) {
        fail('OUTPUT_UNMAPPED', `cannot map changed output ${outputName} to canonical page IDs: ${error.message}`);
      }
      if (impact.families.length === 0) {
        fail('OUTPUT_UNMAPPED', `changed generator output ${outputName} resolved to no canonical page IDs`);
      }
      impact.families.forEach((storyId) => storyIds.add(storyId));
      reasons.push(impact.reason);
    }
    return {
      storyIds: [...storyIds].sort(),
      reason: `changed emitted Storybook code maps to canonical pages: ${reasons.join('; ')}`,
    };
  } finally {
    await Promise.all([
      before?.temporaryRoot,
      after?.temporaryRoot,
    ].filter(Boolean).map((directory) => rm(directory, { recursive: true, force: true })));
  }
}
