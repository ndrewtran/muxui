// Narrow packed SSR and hydration proof for pattern ("block") variants (E-BL1-03).
//
//   node tooling/audits/repository-policy/src/pattern-variant-proof.mjs [--pattern <slug>]...
//   pnpm --filter @muxui/repository-policy run proof:pattern-variants
//
// It packs @muxui/react, installs the tarball and React in a clean offline
// consumer, compiles every variant source (or the named patterns') as
// `release-prepare.mjs` compiles its catalog examples, then runs the same
// consumer tools: `render-examples.mjs` server-renders each variant and
// `hydrate-examples.mjs` hydrates the markup in jsdom and fails on a mismatch.
// That is the pattern share of the R1 exit SSR and hydration proof, without
// the rest of `pnpm release:prepare` (full checks, the release candidate
// archive, the registry matrix, and a clean worktree). It never publishes.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { patternVariantExamples } from './pattern-variants.mjs';
import { resolvePinnedTool } from './pinned-tool.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const reactPackageRoot = resolve(repositoryRoot, 'packages/react');
const consumerToolRoot = resolve(import.meta.dirname, 'release-consumer');

function fail(code, detail) {
  throw new Error(`${code}: ${detail}`);
}

function run(label, command, args, options) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024, timeout: 300_000, ...options });
  if (result.status !== 0) {
    const output = String(result.error?.message || result.stderr || result.stdout || `exited with ${result.signal ?? result.status}`);
    fail('MUXUI_PATTERN_VARIANT_PROOF_FAILED', `${label}: ${output.slice(-4000)}`);
  }
  return result;
}

/**
 * Proves each variant in a packed clean consumer and returns one result per
 * variant: its server markup length and its hydration outcome. Throws on the
 * first failed stage with that stage's output.
 */
export async function provePatternVariants({ patterns = [] } = {}) {
  const selected = (await patternVariantExamples(repositoryRoot))
    .filter(({ patternSlug }) => patterns.length === 0 || patterns.includes(patternSlug));
  if (selected.length === 0) {
    fail('MUXUI_PATTERN_VARIANT_PROOF_EMPTY', patterns.length === 0 ? 'the catalog declares no pattern variant' : `no variant belongs to ${patterns.join(', ')}`);
  }
  const manifest = JSON.parse(readFileSync(join(reactPackageRoot, 'package.json'), 'utf8'));
  const vite = await import(resolvePinnedTool({ packageRoot: reactPackageRoot, manifest, name: 'vite', fail }).url);
  const jsdom = resolvePinnedTool({ packageRoot: reactPackageRoot, manifest, name: 'jsdom', fail });

  const temp = mkdtempSync(join(tmpdir(), 'muxui-pattern-variant-proof-'));
  try {
    run('pack @muxui/react', 'pnpm', ['pack', '--pack-destination', temp], {
      cwd: reactPackageRoot,
      env: { ...process.env, npm_config_engine_strict: 'false' },
    });
    const archive = `muxui-react-${manifest.version}.tgz`;
    const consumer = join(temp, 'consumer');
    mkdirSync(join(consumer, 'examples'), { recursive: true });
    writeFileSync(join(consumer, 'package.json'), `${JSON.stringify({
      name: 'muxui-pattern-variant-consumer',
      private: true,
      type: 'module',
      dependencies: { '@muxui/react': `file:../${archive}`, react: manifest.devDependencies.react, 'react-dom': manifest.devDependencies['react-dom'] },
    }, null, 2)}\n`);
    run('offline consumer install', 'pnpm', ['install', '--offline', '--ignore-scripts'], {
      cwd: consumer,
      env: { ...process.env, npm_config_engine_strict: 'false' },
    });

    const modules = [];
    for (const variant of selected) {
      const { code } = await vite.transformWithOxc(variant.text, resolve(repositoryRoot, variant.source), { lang: 'tsx', jsx: { runtime: 'automatic' } });
      const file = `examples/pattern-${variant.patternSlug}--${variant.variantSlug}.mjs`;
      writeFileSync(join(consumer, file), code);
      modules.push({ file, variant });
    }
    for (const tool of ['render-examples.mjs', 'hydrate-examples.mjs']) copyFileSync(join(consumerToolRoot, tool), join(consumer, tool));
    writeFileSync(join(consumer, 'ssr-plan.json'), `${JSON.stringify({ modules: modules.map(({ file }) => ({ file })), exportModules: [] })}\n`);
    // Server and client both use React's development build, which reports mismatches and provides act.
    const env = { ...process.env, NODE_ENV: 'development' };
    run('packed SSR render', process.execPath, ['render-examples.mjs', 'ssr-plan.json', 'ssr-result.json'], { cwd: consumer, env });
    const { renders } = JSON.parse(readFileSync(join(consumer, 'ssr-result.json'), 'utf8'));
    run('packed hydration', process.execPath, ['hydrate-examples.mjs', 'ssr-result.json', 'hydration-result.json', jsdom.url], { cwd: consumer, env });
    const { results } = JSON.parse(readFileSync(join(consumer, 'hydration-result.json'), 'utf8'));

    return modules.map(({ file, variant }) => {
      const render = renders.find((candidate) => candidate.file === file);
      const hydration = results.find((candidate) => candidate.id === render?.id);
      // A variant that rendered nothing from the packed package would pass hydration vacuously.
      if (!render || !render.html.includes('class="muxui-')) {
        fail('MUXUI_PATTERN_VARIANT_PROOF_EMPTY', `${variant.variantId} rendered no Mux UI markup from the packed package`);
      }
      if (!hydration || hydration.hydrationErrors.length > 0) {
        fail('MUXUI_PATTERN_VARIANT_PROOF_HYDRATION', `${variant.variantId}: ${hydration?.hydrationErrors[0] ?? 'no hydration result'}`);
      }
      return { id: variant.variantId, source: variant.source, markupBytes: render.html.length, consoleErrors: hydration.consoleErrors };
    });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] === import.meta.filename) {
  const args = process.argv.slice(2);
  const patterns = [];
  for (let index = 0; index < args.length; index += 2) {
    if (args[index] !== '--pattern' || args[index + 1] === undefined) {
      console.error('Usage: pattern-variant-proof.mjs [--pattern <slug>]...');
      process.exit(2);
    }
    patterns.push(args[index + 1]);
  }
  try {
    const results = await provePatternVariants({ patterns });
    for (const { id, markupBytes, consoleErrors } of results) {
      console.log(`[E-BL1-03] ${id}: packed SSR ${markupBytes} bytes, hydrated without mismatch${consoleErrors.length > 0 ? ` (console: ${consoleErrors[0]})` : ''}`);
    }
    console.log(`[E-BL1-03] ${results.length} pattern variants passed packed SSR and hydration`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
