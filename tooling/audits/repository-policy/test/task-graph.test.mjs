import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const affectedTaskRunner = resolve(
  import.meta.dirname,
  '../src/run-workspace-task.mjs',
);

function run(command, args, options) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`,
  );
  return result;
}

test('E-G0.0-02: affected selection runs a changed package before every dependent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'muxui-task-graph-'));
  await mkdir(join(root, 'packages/leaf'), { recursive: true });
  await mkdir(join(root, 'packages/middle'), { recursive: true });
  await mkdir(join(root, 'packages/app'), { recursive: true });
  await mkdir(join(root, 'tooling/audits/repository-policy'), { recursive: true });

  await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
  await writeFile(
    join(root, 'tooling/audits/repository-policy/repository-policy.json'),
    JSON.stringify({ globalTaskInputs: [] }),
  );
  await writeFile(
    join(root, 'record.mjs'),
    "import { appendFileSync } from 'node:fs';\nappendFileSync(process.env.MUXUI_TASK_LOG, `${process.argv[2]}\\n`);\n",
  );

  const packages = [
    ['leaf', {}],
    ['middle', { '@fixture/leaf': 'workspace:*' }],
    ['app', { '@fixture/middle': 'workspace:*' }],
  ];
  for (const [name, dependencies] of packages) {
    await writeFile(
      join(root, `packages/${name}/package.json`),
      JSON.stringify({
        name: `@fixture/${name}`,
        version: '0.0.0',
        private: true,
        scripts: { check: `node ../../record.mjs ${name}` },
        dependencies,
      }),
    );
  }

  run('git', ['init', '--quiet'], { cwd: root });
  run('git', ['config', 'user.name', 'Mux UI fixture'], { cwd: root });
  run('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: root });
  run('git', ['add', '.'], { cwd: root });
  run('git', ['commit', '--quiet', '-m', 'fixture base'], { cwd: root });
  await writeFile(join(root, 'packages/leaf/change.txt'), 'changed\n');
  run('git', ['add', '.'], { cwd: root });
  run('git', ['commit', '--quiet', '-m', 'change leaf'], { cwd: root });

  const logPath = join(root, 'task-order.txt');
  const result = run(
    process.execPath,
    [affectedTaskRunner, 'check', '--affected'],
    {
      cwd: root,
      env: {
        ...process.env,
        MUXUI_BASE_REF: 'HEAD~1',
        MUXUI_TASK_LOG: logPath,
        MUXUI_TASK_REPOSITORY_ROOT: root,
      },
    },
  );

  assert.match(result.stdout, /\[workspace-task\] check: changed packages plus dependents/);
  assert.deepEqual(
    (await readFile(logPath, 'utf8')).trim().split('\n'),
    ['leaf', 'middle', 'app'],
  );
});

test('full check boundary overrides inherited Storybook skip selection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'muxui-task-full-'));
  await mkdir(join(root, 'packages/app'), { recursive: true });
  await mkdir(join(root, 'tooling/audits/repository-policy'), { recursive: true });
  await mkdir(join(root, 'bin'), { recursive: true });

  await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
  await writeFile(
    join(root, 'tooling/audits/repository-policy/repository-policy.json'),
    JSON.stringify({ globalTaskInputs: ['shared/'] }),
  );
  await writeFile(
    join(root, 'packages/app/package.json'),
    JSON.stringify({ name: '@fixture/app', version: '0.0.0', private: true, scripts: { check: 'true' } }),
  );
  await writeFile(
    join(root, 'bin/pnpm'),
    [
      '#!/usr/bin/env node',
      "import { writeFileSync } from 'node:fs';",
      "writeFileSync(process.env.MUXUI_TASK_LOG, JSON.stringify({ args: process.argv.slice(2), mode: process.env.MUXUI_STORYBOOK_AUDIT_MODE, event: process.env.MUXUI_STORYBOOK_AUDIT_EVENT, force: process.env.MUXUI_STORYBOOK_AUDIT_FORCE, families: process.env.MUXUI_STORYBOOK_FAMILIES }));",
      '',
    ].join('\n'),
  );
  await chmod(join(root, 'bin/pnpm'), 0o755);

  run('git', ['init', '--quiet'], { cwd: root });
  run('git', ['config', 'user.name', 'Mux UI fixture'], { cwd: root });
  run('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: root });
  run('git', ['add', '.'], { cwd: root });
  run('git', ['commit', '--quiet', '-m', 'fixture base'], { cwd: root });

  const logPath = join(root, 'runner-environment.json');
  const result = run(
    process.execPath,
    [affectedTaskRunner, 'check'],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${join(root, 'bin')}:${process.env.PATH}`,
        MUXUI_TASK_LOG: logPath,
        MUXUI_TASK_REPOSITORY_ROOT: root,
        MUXUI_STORYBOOK_AUDIT_MODE: 'skip-heavy',
        MUXUI_STORYBOOK_AUDIT_EVENT: 'pull_request',
        MUXUI_STORYBOOK_AUDIT_FORCE: '0',
        MUXUI_STORYBOOK_FAMILIES: 'DatePicker',
      },
    },
  );

  assert.match(result.stdout, /\[workspace-task\] check: full graph/);
  assert.deepEqual(await readFile(logPath, 'utf8').then(JSON.parse), {
    args: ['--recursive', '--sort', '--workspace-concurrency=1', '--if-present', 'run', 'check'],
    mode: 'full',
    event: 'check:all',
    force: '1',
  });

  await mkdir(join(root, 'shared'), { recursive: true });
  await writeFile(join(root, 'shared/change.txt'), 'changed\n');
  const affectedResult = run(
    process.execPath,
    [affectedTaskRunner, 'check', '--affected'],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${join(root, 'bin')}:${process.env.PATH}`,
        MUXUI_BASE_REF: 'HEAD',
        MUXUI_TASK_LOG: logPath,
        MUXUI_TASK_REPOSITORY_ROOT: root,
        MUXUI_STORYBOOK_AUDIT_MODE: 'skip-heavy',
        MUXUI_STORYBOOK_AUDIT_EVENT: 'pull_request',
        MUXUI_STORYBOOK_AUDIT_FORCE: '0',
        MUXUI_STORYBOOK_FAMILIES: 'DatePicker',
      },
    },
  );

  assert.match(affectedResult.stdout, /\[workspace-task\] check: full graph/);
  assert.deepEqual(await readFile(logPath, 'utf8').then(JSON.parse), {
    args: ['--recursive', '--sort', '--workspace-concurrency=1', '--if-present', 'run', 'check'],
    mode: 'full',
    event: 'check:all',
    force: '1',
  });
});
