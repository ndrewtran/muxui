import { createHash } from 'node:crypto';
import { lstat, mkdir, open, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { O_NOFOLLOW, O_RDONLY } from 'node:constants';
import { dirname, resolve } from 'node:path';
import {
  serializeScaleDocument,
  validateScaleDocument,
} from './theme-contract.mjs';

const ROUTE = /^\/__muxui\/scale\/themes(?:\/([a-z0-9]+(?:-[a-z0-9]+)*))?$/u;
const THEME_FILE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u;
const MAX_BODY_BYTES = 256 * 1024;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const writeLocks = new Map();

function sendJson(response, status, body, headers = {}) {
  const data = JSON.stringify(body);
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  for (const [key, value] of Object.entries(headers)) response.setHeader(key, value);
  response.end(data);
}

function requestHost(request) {
  return String(request.headers.host ?? '');
}

function revision(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function readBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw Object.assign(new Error('request body exceeds 256 KiB'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function fileFor(root, slug) {
  const file = resolve(root, `${slug}.json`);
  if (!file.startsWith(`${root}/`)) throw new TypeError('MUXUI_SCALE_PATH_INVALID');
  return file;
}

async function readTheme(file) {
  let handle;
  try {
    handle = await open(file, O_RDONLY | O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile()) throw new TypeError('MUXUI_SCALE_PATH_INVALID');
    if (info.size > MAX_BODY_BYTES) throw Object.assign(new Error('theme source exceeds 256 KiB'), { status: 413 });
    const bytes = await handle.readFile();
    const document = JSON.parse(bytes.toString('utf8'));
    validateScaleDocument(document);
    return { document, bytes, revision: revision(bytes) };
  } catch (error) {
    if (error.code === 'ELOOP') throw new TypeError('MUXUI_SCALE_PATH_INVALID');
    throw error;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

async function ensureThemeDirectory(root) {
  try {
    const actual = await realpath(root);
    if (actual !== root) throw new TypeError('MUXUI_SCALE_PATH_INVALID');
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function withWriteLock(slug, callback) {
  const previous = writeLocks.get(slug) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(callback);
  const settled = current.finally(() => {
    if (writeLocks.get(slug) === settled) writeLocks.delete(slug);
  }).catch(() => {});
  writeLocks.set(slug, settled);
  return current;
}

export function createScaleThemeMiddleware({ workspaceRoot, allowedHost = '127.0.0.1:5174', allowedOrigin = 'http://127.0.0.1:5174', renameFile = rename }) {
  // Normalize only the existing workspace anchor. The theme directory itself
  // is still checked at each request so a symlinked repository target fails.
  const themeRoot = resolve(realpathSync(workspaceRoot), 'catalog/tokens/themes');
  return async (request, response, next) => {
    const match = ROUTE.exec(request.url?.split('?')[0] ?? '');
    if (!match) return next();
    const host = requestHost(request);
    if (!LOCAL_HOSTS.has(host.split(':')[0].replace(/^\[/u, '').replace(/\]$/u, '')) || host !== allowedHost) return sendJson(response, 403, { error: 'MUXUI_SCALE_LOCALHOST_ONLY' });
    const slug = match[1];
    try {
      if (request.method === 'GET' && !slug) {
        let names = [];
        if (await ensureThemeDirectory(themeRoot)) {
          const { readdir } = await import('node:fs/promises');
          names = (await readdir(themeRoot, { withFileTypes: true }))
            .filter((entry) => entry.isFile() && THEME_FILE.test(entry.name))
            .map((entry) => entry.name.slice(0, -5))
            .sort();
        }
        return sendJson(response, 200, { themes: names });
      }
      if (!slug) return sendJson(response, 400, { error: 'MUXUI_SCALE_SLUG_REQUIRED' });
      const file = fileFor(themeRoot, slug);
      if (request.method === 'GET') {
        try {
          await ensureThemeDirectory(themeRoot);
          const current = await readTheme(file);
          return sendJson(response, 200, { theme: current.document, revision: current.revision });
        } catch (error) {
          if (error.code === 'ENOENT') return sendJson(response, 404, { error: 'MUXUI_SCALE_THEME_NOT_FOUND' });
          throw error;
        }
      }
      if (request.method !== 'PUT') return sendJson(response, 405, { error: 'MUXUI_SCALE_METHOD_NOT_ALLOWED' }, { allow: 'GET, PUT' });
      if (request.headers.origin !== allowedOrigin) return sendJson(response, 403, { error: 'MUXUI_SCALE_ORIGIN_INVALID' });
      const contentType = String(request.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase();
      if (contentType !== 'application/json') return sendJson(response, 415, { error: 'MUXUI_SCALE_JSON_REQUIRED' });
      return await withWriteLock(slug, async () => {
        const raw = await readBody(request);
        const document = validateScaleDocument(JSON.parse(raw));
        if (document.id !== `muxui:theme:${slug}`) return sendJson(response, 409, { error: 'MUXUI_SCALE_SOURCE_ID_MISMATCH' });
        let current;
        try {
          await ensureThemeDirectory(themeRoot);
          current = await readTheme(file);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        const expected = request.headers['if-match'];
        if (!current && expected) return sendJson(response, 412, { error: 'MUXUI_SCALE_SOURCE_MISSING' });
        if (current && (!expected || expected !== current.revision)) return sendJson(response, 412, { error: 'MUXUI_SCALE_STALE_SOURCE', revision: current.revision });
        const bytes = Buffer.from(`${serializeScaleDocument(document)}\n`);
        await mkdir(dirname(file), { recursive: true });
        const themeDirectory = await realpath(dirname(file));
        if (themeDirectory !== dirname(file)) throw new TypeError('MUXUI_SCALE_PATH_INVALID');
        try {
          const existing = await lstat(file);
          if (existing.isSymbolicLink()) throw new Error('MUXUI_SCALE_PATH_INVALID');
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
        try {
          await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
          await renameFile(temporary, file);
        } catch (error) {
          await unlink(temporary).catch(() => {});
          throw error;
        }
        return sendJson(response, current ? 200 : 201, { theme: document, revision: revision(bytes) });
      });
    } catch (error) {
      if (error.status) return sendJson(response, error.status, { error: 'MUXUI_SCALE_BODY_TOO_LARGE' });
      if (error instanceof SyntaxError || error.name === 'CanonicalJsonError') return sendJson(response, 400, { error: 'MUXUI_SCALE_JSON_INVALID' });
      if (error instanceof TypeError) return sendJson(response, 422, { error: error.message });
      console.error('[muxui-scale] theme endpoint failed', error);
      return sendJson(response, 500, { error: 'MUXUI_SCALE_SERVER_ERROR' });
    }
  };
}
