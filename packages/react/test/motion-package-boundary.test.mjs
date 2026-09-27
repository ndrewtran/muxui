import assert from 'node:assert/strict';
import { access, cp, mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'vite';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const packageRoot = resolve(repositoryRoot, 'packages/react');
const publicEntry = resolve(packageRoot, 'generated/index.mjs');
const externalRuntime = (id) => (
  ['react', 'react-dom', 'react-aria-components', '@internationalized/date', 'lucide-react'].includes(id)
  || id.startsWith('lucide-react/')
);

const motionModulePattern = /node_modules\/\.pnpm\/(?:motion|framer-motion|motion-dom|motion-utils)@/u;

function retainedModuleSummary(entries) {
  const renderedBytes = entries.reduce((total, [, module]) => total + module.renderedLength, 0);
  return `${entries.length} modules / ${renderedBytes} rendered bytes`;
}

function outputChunks(result) {
  const output = Array.isArray(result) ? result : result.output;
  return output.filter((entry) => entry.type === 'chunk');
}

async function bundlePublicExport(exportName, directory) {
  const entry = join(directory, `${exportName}.mjs`);
  await writeFile(entry, `import { ${exportName} } from ${JSON.stringify(publicEntry)};\nexport { ${exportName} };\n`);
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    root: directory,
    build: {
      write: false,
      rollupOptions: {
        input: entry,
        external: externalRuntime,
        preserveEntrySignatures: 'strict',
        output: { format: 'es' },
      },
    },
  });
  const chunks = outputChunks(result);
  assert.equal(chunks.length, 1, `${exportName} bundle emits one entry chunk`);
  assert.ok(chunks[0].exports.includes(exportName), `${exportName} remains a public bundle export`);
  assert.ok(chunks[0].modules, `${exportName} exposes Rollup module retention metadata`);
  return chunks[0];
}

for (const exportName of ['Button', 'TextField']) {
  test(`public ${exportName} bundle excludes the private motion edge`, async () => {
    const directory = await mkdtemp(join(tmpdir(), `muxui-motion-public-${exportName.toLowerCase()}-`));
    try {
      const chunk = await bundlePublicExport(exportName, directory);
      const retainedMotionModules = Object.entries(chunk.modules)
        .filter(([id, module]) => motionModulePattern.test(id) && module.renderedLength > 0);
      assert.equal(
        retainedMotionModules.length,
        0,
        `${exportName} does not retain the bundled motion dependency closure (${retainedModuleSummary(retainedMotionModules)})`,
      );
      assert.doesNotMatch(chunk.code, /(?:motion\/react|framer-motion|motion-dom|motion-utils)/u, `${exportName} output has no motion runtime code`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test('public Switch bundle retains its required private motion edge', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'muxui-motion-public-switch-'));
  try {
    const chunk = await bundlePublicExport('Switch', directory);
    const retainedMotionModules = Object.entries(chunk.modules)
      .filter(([id, module]) => motionModulePattern.test(id) && module.renderedLength > 0);
    assert.ok(
      retainedMotionModules.length > 0,
      'Switch retains the bundled motion dependency closure required by its interaction feedback',
    );
    assert.match(chunk.code, /\banimate\b/u, 'Switch bundle includes the motion runtime call');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('packed package resolves motion closure and temporal SSR from an isolated consumer', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'muxui-motion-packed-consumer-'));
  try {
    const packageStaging = join(directory, 'package');
    await mkdir(packageStaging);
    const packageManifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
    for (const file of new Set(['package.json', ...(packageManifest.files ?? [])])) {
      await cp(join(packageRoot, file), join(packageStaging, file), { recursive: true });
    }
    const archivePath = join(directory, 'muxui-react-packed.tgz');
    const packed = spawnSync('tar', ['-czf', archivePath, '-C', directory, 'package'], {
      encoding: 'utf8',
    });
    assert.equal(packed.status, 0, packed.stderr || packed.stdout);
    const archiveName = (await readdir(directory)).find((name) => name.endsWith('.tgz'));
    assert.ok(archiveName, 'the isolated package staging emits the archive');

    const consumer = join(directory, 'consumer');
    await mkdir(consumer);
    await writeFile(join(consumer, 'package.json'), `${JSON.stringify({
      name: 'muxui-motion-packed-consumer',
      private: true,
      type: 'module',
      dependencies: {
        '@muxui/react': `file:../${archiveName}`,
        react: '19.2.8',
        'react-dom': '19.2.8',
      },
    }, null, 2)}\n`);
    const install = spawnSync('pnpm', ['install', '--prefer-offline', '--ignore-scripts'], {
      cwd: consumer,
      encoding: 'utf8',
      env: { ...process.env, npm_config_engine_strict: 'false' },
    });
    assert.equal(install.status, 0, install.stderr || install.stdout);

    const consumerScript = `
      import { access, readFile } from 'node:fs/promises';
      import React from 'react';
      import { renderToString } from 'react-dom/server';
      import { Button, DatePicker, DateRangePicker, Form } from '@muxui/react';
      const packageEntry = await import.meta.resolve('@muxui/react');
      if (!packageEntry.endsWith('/generated/index.mjs')) throw new Error('public package entry resolution');
      const packageManifest = JSON.parse(await readFile(new URL('../package.json', packageEntry), 'utf8'));
      if (packageManifest.dependencies.motion !== '13.4.0') throw new Error('packed motion dependency');
      for (const file of ['motion.MIT.txt', 'framer-motion.MIT.txt', 'motion-dom.MIT.txt', 'motion-utils.MIT.txt', 'tslib.0BSD.txt']) {
        await access(new URL('../licenses/' + file, packageEntry));
      }
      if (typeof Button !== 'object' && typeof Button !== 'function') throw new Error('public Button export');
      const html = renderToString(React.createElement(Form, null,
        React.createElement(DatePicker, { label: 'Due date', value: '2026-08-26' }),
        React.createElement(DateRangePicker, { label: 'Trip', value: { start: '2026-08-26', end: '2026-09-01' } }),
      ));
      if (!html.includes('Due date') || !html.includes('2026-08-26')) throw new Error('temporal SSR output');
      console.log(JSON.stringify({ packageEntry, htmlBytes: html.length }));
    `;
    const consumerCheck = spawnSync(process.execPath, ['--input-type=module', '--eval', consumerScript], {
      cwd: consumer,
      encoding: 'utf8',
      env: { ...process.env, npm_config_engine_strict: 'false' },
    });
    assert.equal(consumerCheck.status, 0, consumerCheck.stderr || consumerCheck.stdout);
    assert.match(consumerCheck.stdout, /"htmlBytes":\d+/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
