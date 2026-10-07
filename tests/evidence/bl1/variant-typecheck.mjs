// E-BL1-03: each pattern variant typechecked against the packed @muxui/react declarations.
//
//   node tests/evidence/bl1/variant-typecheck.mjs
//
// `packages/react/test/catalog-examples-types.test.mjs` typechecks every catalog example in one
// `tsc` run and prints nothing per example. This tool packs @muxui/react the same way, then runs
// `tsc --noEmit` once per variant in a clean consumer (strict, skipLibCheck off, NodeNext) and
// reports each variant's exit code and diagnostic count, and whether the program read the packed
// declarations rather than the workspace sources. It prints one JSON report and exits 1 if a
// variant fails to typecheck or does not resolve the packed declarations.
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { patternVariantExamples } from '../../../tooling/audits/repository-policy/src/pattern-variants.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const reactRoot = join(repositoryRoot, 'packages/react');
const tsc = join(repositoryRoot, 'node_modules/.pnpm/node_modules/.bin/tsc');

function run(command, args, options) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  return result;
}

/** Links the packed package's dependencies from the workspace install, as the packed-declarations test does. */
function linkDependencies(nodeModules) {
  const source = join(reactRoot, 'node_modules');
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.name === '.bin') continue;
    const destination = join(nodeModules, entry.name);
    if (entry.name.startsWith('@')) {
      mkdirSync(destination, { recursive: true });
      for (const scoped of readdirSync(join(source, entry.name), { withFileTypes: true })) {
        try { symlinkSync(join(source, entry.name, scoped.name), join(destination, scoped.name), 'junction'); } catch { /* the package itself is copied below */ }
      }
    } else {
      try { symlinkSync(join(source, entry.name), destination, 'junction'); } catch { /* already present */ }
    }
  }
}

/** Typechecks each variant against the packed declarations and returns the per-variant report. */
export async function typecheckVariants() {
  const variants = await patternVariantExamples(repositoryRoot);
  if (variants.length === 0) throw new Error('MUXUI_VARIANT_TYPECHECK_EMPTY: the catalog declares no pattern variant');
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), 'muxui-variant-typecheck-')));
  try {
    const packed = run('pnpm', ['pack', '--pack-destination', workspace, '--json'], { cwd: reactRoot, env: { ...process.env, npm_config_engine_strict: 'false' } });
    if (packed.status !== 0) throw new Error(`MUXUI_VARIANT_TYPECHECK_PACK: pnpm pack exited ${packed.status}`);
    const record = JSON.parse(packed.stdout.slice(packed.stdout.lastIndexOf('\n{\n') + 1));
    if (run('tar', ['-xzf', record.filename, '-C', workspace]).status !== 0) throw new Error('MUXUI_VARIANT_TYPECHECK_EXTRACT: tar failed');

    const consumer = join(workspace, 'consumer');
    const nodeModules = join(consumer, 'node_modules');
    mkdirSync(join(nodeModules, '@muxui'), { recursive: true });
    cpSync(join(workspace, 'package'), join(nodeModules, '@muxui/react'), { recursive: true });
    linkDependencies(nodeModules);

    const results = [];
    for (const [index, variant] of variants.entries()) {
      const file = join('examples', `${variant.patternSlug}--${variant.variantSlug}.tsx`);
      mkdirSync(dirname(join(consumer, file)), { recursive: true });
      copyFileSync(join(repositoryRoot, variant.source), join(consumer, file));
      const config = join(consumer, `tsconfig.${index}.json`);
      writeFileSync(config, `${JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', jsx: 'react-jsx', strict: true, skipLibCheck: false, noEmit: true, types: ['react', 'react-dom'] },
        files: [file],
      }, null, 2)}\n`);
      const check = run(tsc, ['--noEmit', '-p', config], { cwd: consumer });
      const listed = run(tsc, ['--noEmit', '-p', config, '--listFilesOnly'], { cwd: consumer });
      const files = listed.stdout.split('\n');
      results.push({
        id: variant.variantId,
        source: variant.source,
        exitCode: check.status,
        diagnostics: (check.stdout.match(/error TS\d+/gu) ?? []).length,
        // The program read the declarations from the packed package, not from workspace sources.
        packedDeclarations: files.some((path) => path.endsWith('/node_modules/@muxui/react/generated/index.d.ts') && path.startsWith(consumer)),
        workspaceSources: files.some((path) => path.startsWith(join(repositoryRoot, 'packages/react/src')) || path.startsWith(join(repositoryRoot, 'packages/react/generated'))),
      });
    }
    return { tsc: run(tsc, ['--version']).stdout.trim(), strict: true, skipLibCheck: false, variants: results };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

if (process.argv[1] === import.meta.filename) {
  const report = await typecheckVariants();
  console.log(JSON.stringify(report, null, 2));
  const failed = report.variants.filter(({ exitCode, packedDeclarations, workspaceSources }) => exitCode !== 0 || !packedDeclarations || workspaceSources);
  if (failed.length > 0) {
    console.error(`E-BL1-03 typecheck failed: ${failed.map(({ id }) => id).join(', ')}`);
    process.exitCode = 1;
  }
}
