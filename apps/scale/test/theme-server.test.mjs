import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { request } from 'node:http';
import { createScaleThemeMiddleware } from '../src/theme-server.mjs';
import { DEFAULT_SETTINGS, createScaleDocument } from '../src/theme-contract.mjs';

function httpRequest(port, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, (response) => {
      let data = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: data ? JSON.parse(data) : null, headers: response.headers }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function listen(createMiddleware) {
  let middleware;
  const server = createServer((request, response) => middleware(request, response, () => {
    response.statusCode = 404;
    response.end();
  }));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  middleware = createMiddleware(address.port);
  return { server, port: address.port };
}

test('Scale endpoint validates, atomically persists, and rejects stale writes', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'muxui-scale-server-'));
  const outsideRoot = await mkdtemp(join(tmpdir(), 'muxui-scale-outside-'));
  const activeServer = await listen((port) => createScaleThemeMiddleware({ workspaceRoot, allowedHost: `127.0.0.1:${port}`, allowedOrigin: `http://127.0.0.1:${port}` }));
  const { port: activePort, server: active } = activeServer;
  try {
    const source = createScaleDocument(DEFAULT_SETTINGS, { slug: 'server-theme' });
    const requestHeaders = { 'content-type': 'application/json', origin: `http://127.0.0.1:${activePort}` };
    const themesRoot = join(workspaceRoot, 'catalog/tokens/themes');
    await mkdir(themesRoot, { recursive: true });
    const outsideFile = join(outsideRoot, 'outside.json');
    await writeFile(outsideFile, JSON.stringify(source));
    await symlink(outsideFile, join(themesRoot, 'leak.json'));
    const symlinkList = await httpRequest(activePort, 'GET', '/__muxui/scale/themes', null);
    assert.equal(symlinkList.status, 200);
    assert.equal(symlinkList.body.themes.includes('leak'), false);
    const symlinkRead = await httpRequest(activePort, 'GET', '/__muxui/scale/themes/leak', null);
    assert.equal(symlinkRead.status, 422);
    const wrongHost = await httpRequest(activePort, 'GET', '/__muxui/scale/themes', null, { host: `localhost:${activePort}` });
    assert.equal(wrongHost.status, 403);
    const wrongOrigin = await httpRequest(activePort, 'PUT', '/__muxui/scale/themes/server-theme', JSON.stringify(source), { 'content-type': 'application/json', origin: `http://localhost:${activePort}`.replace('127.0.0.1', 'localhost') });
    assert.equal(wrongOrigin.status, 403);
    const wrongContentType = await httpRequest(activePort, 'PUT', '/__muxui/scale/themes/server-theme', JSON.stringify(source), { origin: requestHeaders.origin });
    assert.equal(wrongContentType.status, 415);
    const malformed = await httpRequest(activePort, 'PUT', '/__muxui/scale/themes/server-theme', '{', requestHeaders);
    assert.equal(malformed.status, 400);
    const invalidSource = await httpRequest(activePort, 'PUT', '/__muxui/scale/themes/server-theme', JSON.stringify({}), requestHeaders);
    assert.equal(invalidSource.status, 422);
    const oversized = await httpRequest(activePort, 'PUT', '/__muxui/scale/themes/server-theme', 'x'.repeat(256 * 1024 + 1), requestHeaders);
    assert.equal(oversized.status, 413);
    const mismatch = await httpRequest(activePort, 'PUT', '/__muxui/scale/themes/server-theme', JSON.stringify(createScaleDocument(DEFAULT_SETTINGS, { slug: 'other-theme' })), requestHeaders);
    assert.equal(mismatch.status, 409);
    const missingExpected = await httpRequest(activePort, 'PUT', '/__muxui/scale/themes/missing-theme', JSON.stringify(createScaleDocument(DEFAULT_SETTINGS, { slug: 'missing-theme' })), { ...requestHeaders, 'if-match': 'sha256:missing' });
    assert.equal(missingExpected.status, 412);
    const created = await httpRequest(activePort, 'PUT', '/__muxui/scale/themes/server-theme', JSON.stringify(source), requestHeaders);
    assert.equal(created.status, 201);
    assert.match(created.body.revision, /^sha256:/u);

    const loaded = await httpRequest(activePort, 'GET', '/__muxui/scale/themes/server-theme');
    assert.equal(loaded.status, 200);
    assert.deepEqual(loaded.body.theme, source);

    const stale = await httpRequest(activePort, 'PUT', '/__muxui/scale/themes/server-theme', JSON.stringify(source), { ...requestHeaders, 'if-match': 'sha256:stale' });
    assert.equal(stale.status, 412);

    const invalid = await httpRequest(activePort, 'PUT', '/__muxui/scale/themes/../escape', '{}', { 'content-type': 'application/json' });
    assert.notEqual(invalid.status, 201);
    const persisted = await readFile(join(workspaceRoot, 'catalog/tokens/themes/server-theme.json'), 'utf8');
    assert.match(persisted, /muxui:theme:server-theme/u);

    const failingServer = await listen((port) => createScaleThemeMiddleware({
      workspaceRoot,
      allowedHost: `127.0.0.1:${port}`,
      allowedOrigin: `http://127.0.0.1:${port}`,
      renameFile: async () => { throw new Error('injected rename failure'); },
    }));
    const failingPort = failingServer.port;
    try {
      const failedWrite = await httpRequest(failingPort, 'PUT', '/__muxui/scale/themes/rename-failure', JSON.stringify(createScaleDocument(DEFAULT_SETTINGS, { slug: 'rename-failure' })), { ...requestHeaders, origin: `http://127.0.0.1:${failingPort}` });
      assert.equal(failedWrite.status, 500);
      assert.equal((await readdir(join(workspaceRoot, 'catalog/tokens/themes'))).some((name) => name.includes('.tmp')), false);
    } finally {
      await new Promise((resolve) => failingServer.server.close(resolve));
    }
  } finally {
    await new Promise((resolve) => active.close(resolve));
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});
