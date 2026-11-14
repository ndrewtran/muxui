// The release candidate on the newest Node the published packages claim. The workspace toolchain is pinned to the
// oldest supported Node, so CI packs the candidate there with release-prepare.mjs and then, on the newest supported
// Node, runs:
//
//   node release-node-consumer.mjs <candidate directory>
//
// With npm and with the workspace's pinned pnpm (installed by that npm, since newer Node ships no Corepack), it
// installs every tarball of the publish set with React into a clean project outside the checkout, engine-strict. npm
// refuses a tarball whose engines exclude this Node; pnpm checks only registry packages, so each installed manifest's
// range is also checked here. Each consumer then imports every public entry (set-entries.mjs), server-renders React
// (matrix-smoke.mjs), and runs `muxui --help`.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { isolatedPackageManagerEnvironment, nodeBundledCli } from './release-proof.mjs';
import { parseReleaseVersions, readPublishSet, readSourceVersions, tarballFileName } from './release-set.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const consumerToolRoot = resolve(import.meta.dirname, 'release-consumer');
const registry = 'https://registry.npmjs.org/';
// The React release-prepare.mjs installs in its consumers.
const reactVersion = '19.2.8';

/**
 * Why `version` is not what this job must run for an `engines.node` range of the form `>=X.Y.Z <N`, or null: it
 * must be admitted, and its major must be the newest the range admits (N - 1), so a widened claim fails here until
 * CI moves to the new Node.
 */
export function nodeClaimProblem(range, version) {
  const claim = /^>=(\d+)\.(\d+)\.(\d+) <(\d+)$/u.exec(range ?? '');
  if (!claim) return `engines.node ${JSON.stringify(range)} is not ">=X.Y.Z <N"`;
  const [minimum, upper] = [claim.slice(1, 4).map(Number), Number(claim[4])];
  const running = version.split('.').map(Number);
  const below = running.findIndex((part, index) => part !== minimum[index]);
  if (below !== -1 && running[below] < minimum[below]) return `Node ${version} is below ${range}`;
  if (running[0] !== upper - 1) return `Node ${version} is not the newest major ${range} admits (${upper - 1})`;
  return null;
}

// Runs a child with stderr shown and stdout returned; a failure or a 10-minute stall throws.
function run(label, [command, ...args], options) {
  console.log(`$ ${label}`);
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 600_000, maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`${label} failed (${result.error?.message ?? result.signal ?? `exit ${result.status}`})\n${result.stdout ?? ''}`);
  return result.stdout;
}

const lastJsonLine = (output) => JSON.parse(output.trim().split('\n').at(-1));

// The directory Node resolves `name` to from `from`, by walking up its node_modules.
function resolvePackageDirectory(from, name) {
  for (let directory = from; ; directory = dirname(directory)) {
    const candidate = join(directory, 'node_modules', name);
    if (existsSync(candidate)) return realpathSync(candidate);
    if (dirname(directory) === directory) return null;
  }
}

function main(candidateDirectory) {
  if (!candidateDirectory) throw new Error('usage: node release-node-consumer.mjs <candidate directory>');
  const publishSet = readPublishSet(repositoryRoot);
  const names = publishSet.packages.map(({ name }) => name);
  const versions = parseReleaseVersions(process.env.MUXUI_RELEASE_VERSIONS, publishSet, readSourceVersions(publishSet, repositoryRoot));
  const tarballs = new Map(names.map((name) => [name, tarballFileName(name, versions.get(name))]));
  const node = process.versions.node;
  const pnpmVersion = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')).packageManager.replace(/^pnpm@/u, '');

  const temp = mkdtempSync(join(tmpdir(), 'muxui-node-consumer-'));
  try {
    const userConfig = join(temp, 'empty-userconfig');
    const globalConfig = join(temp, 'empty-globalconfig');
    writeFileSync(userConfig, '');
    writeFileSync(globalConfig, '');
    // No host configuration or credentials, and the engines check on.
    const env = { ...isolatedPackageManagerEnvironment(process.env, { userConfig, globalConfig }), npm_config_engine_strict: 'true' };
    const npm = [process.execPath, nodeBundledCli('npm')];
    const tools = join(temp, 'tools');
    run(`npm install pnpm@${pnpmVersion}`, [...npm, 'install', '--prefix', tools, '--no-audit', '--no-fund', `--registry=${registry}`, `pnpm@${pnpmVersion}`], { cwd: temp, env });
    const installs = {
      npm: [...npm, 'install', '--engine-strict', '--ignore-scripts', '--no-audit', '--no-fund', `--registry=${registry}`],
      pnpm: [process.execPath, join(tools, 'node_modules/pnpm/bin/pnpm.cjs'), 'install', '--engine-strict', '--ignore-scripts', '--no-frozen-lockfile', `--registry=${registry}`],
    };

    for (const [manager, install] of Object.entries(installs)) {
      const consumer = join(temp, `consumer-${manager}`);
      mkdirSync(consumer);
      for (const file of tarballs.values()) copyFileSync(join(candidateDirectory, file), join(consumer, file));
      for (const file of ['set-entries.mjs', 'matrix-smoke.mjs']) copyFileSync(join(consumerToolRoot, file), join(consumer, file));
      const specifiers = Object.fromEntries([...tarballs].map(([name, file]) => [name, `file:./${file}`]));
      writeFileSync(join(consumer, 'package.json'), `${JSON.stringify({
        name: `muxui-node-${manager}-consumer`, private: true, type: 'module',
        dependencies: { ...specifiers, react: reactVersion, 'react-dom': reactVersion },
        // The set is not on the registry, so the tarballs also stand in for the ranges its members declare on each other.
        pnpm: { overrides: specifiers },
      }, null, 2)}\n`);
      run(`${manager} install on Node ${node}`, install, { cwd: consumer, env });

      const installed = (name) => JSON.parse(readFileSync(join(consumer, 'node_modules', name, 'package.json'), 'utf8'));
      for (const name of names) {
        const { version, engines } = installed(name);
        if (version !== versions.get(name)) throw new Error(`${manager} installed ${name}@${version}, not the candidate ${versions.get(name)}`);
        const problem = nodeClaimProblem(engines?.node, node);
        if (problem) throw new Error(`${name}: ${problem}`);
      }
      // Tooling's catalog is the candidate, not a registry copy of the same version.
      const tooling = realpathSync(join(consumer, 'node_modules/@muxui/tooling'));
      if (resolvePackageDirectory(tooling, '@muxui/catalog') !== realpathSync(join(consumer, 'node_modules/@muxui/catalog'))) {
        throw new Error(`${manager} resolves @muxui/tooling's @muxui/catalog outside the candidate`);
      }

      const { exportNames, resolved } = lastJsonLine(run(`${manager} set-entries.mjs`, [process.execPath, 'set-entries.mjs', JSON.stringify(names)], { cwd: consumer }));
      const smoke = lastJsonLine(run(`${manager} matrix-smoke.mjs`, [process.execPath, 'matrix-smoke.mjs', JSON.stringify(installed('@muxui/react').exports)], { cwd: consumer }));
      const help = run(`${manager} muxui --help`, [process.execPath, join(tooling, installed('@muxui/tooling').bin.muxui), '--help'], { cwd: consumer });
      if (!help.startsWith('muxui ')) throw new Error(`muxui --help printed ${JSON.stringify(help.slice(0, 200))}`);
      console.log(`Node ${node} ${manager} consumer: ${tarballs.size} tarballs installed engine-strict, ${Object.keys(exportNames).length} entries imported and ${resolved.length} resolved, SSR ${smoke.rendered.join(' and ')}, muxui --help ran`);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

if (import.meta.main) main(process.argv[2]);
