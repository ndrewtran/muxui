import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, firefox, webkit } from 'playwright-core';
import { createServer } from 'vite';

export const packageRoot = resolve(import.meta.dirname, '../..');
export const repositoryRoot = resolve(packageRoot, '../..');

const chromeCandidates = [
  process.env.MUXUI_CHROME_EXECUTABLE,
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

export async function chromePath() {
  for (const path of chromeCandidates) {
    try {
      await access(path);
      return path;
    } catch {
      // Try the next installed browser.
    }
  }
  throw new Error('Install Chrome or set MUXUI_CHROME_EXECUTABLE for browser verification.');
}

const engines = { chromium, firefox, webkit };

/**
 * The engines an opt-in cross-engine test runs in: `MUXUI_BROWSER_ENGINES`
 * (comma-separated `chromium`, `firefox`, `webkit`), else Chromium alone.
 * Firefox and WebKit use Playwright's managed builds; install them with
 * `pnpm --filter @muxui/react exec playwright-core install firefox webkit`.
 */
export function browserEngines() {
  const names = (process.env.MUXUI_BROWSER_ENGINES || 'chromium').split(',').map((name) => name.trim()).filter(Boolean);
  const unknown = names.filter((name) => !Object.hasOwn(engines, name));
  if (unknown.length > 0) throw new Error(`MUXUI_BROWSER_ENGINES has unknown engines: ${unknown.join(', ')}`);
  return [...new Set(names)];
}

/** Launches headless Chrome, or Playwright's managed Firefox or WebKit build. */
export async function launchBrowser(engine = 'chromium') {
  if (engine === 'chromium') return chromium.launch({ executablePath: await chromePath(), headless: true });
  return engines[engine].launch({ headless: true });
}

// The union of bare dependencies the browser fixtures import.
const optimizeDepsInclude = [
  'react',
  'react-dom',
  'react-dom/client',
  'react-aria',
  'react-aria-components',
  'motion',
  'motion/react',
  'motion/react-m',
  'lucide-react',
];

/** The shared HTML document shell; `entry` is the module script that hydrates `body`. */
export function pageShell({ attributes = '', head = '', bodyAttributes = '', body = '', entry }) {
  const script = entry ? `<script type="module" src="${entry}"></script>` : '';
  return `<!doctype html><html${attributes ? ` ${attributes}` : ''}><head><meta charset="utf-8"><link rel="icon" href="data:,">${head}</head><body${bodyAttributes ? ` ${bodyAttributes}` : ''}>${body}${script}</body></html>`;
}

/**
 * Starts a Vite dev server for one browser test file on a random local port.
 *
 * - `root`: `'package'` serves `packages/react` at `/`; `'repository'` serves
 *   the repository root, so package files live under `/packages/react/`.
 * - `entries`: real modules, relative to the root, that Vite scans before the
 *   first request so dependency optimisation never reloads a running page.
 * - `pages`: HTML documents keyed by pathname; a function receives the request URL.
 * - `modules`: virtual module source keyed by request path.
 * - `middleware`: an extra connect handler that runs before `pages`.
 * - `aliasReact`: resolves React from this package at the repository root, for
 *   virtual modules whose React imports no scanned entry reveals.
 * - `alias`: extra module aliases, such as `@muxui/react` for a catalog source
 *   that imports the package by its public name.
 *
 * Each server gets its own dependency cache, removed by `close()`.
 */
export async function startServer({ root = 'package', entries, pages = {}, modules = {}, middleware, aliasReact = false, alias = {} } = {}) {
  const cacheDir = await mkdtemp(join(tmpdir(), 'muxui-browser-vite-'));
  const moduleIds = new Map(Object.keys(modules).map((path) => [path, resolve(import.meta.dirname, `.${path}`)]));
  const moduleSources = new Map(Object.entries(modules).map(([path, source]) => [moduleIds.get(path), source]));
  const server = await createServer({
    configFile: false,
    root: root === 'repository' ? repositoryRoot : packageRoot,
    cacheDir,
    logLevel: 'error',
    // Dedupe resolves React from the root, which only the package root can do.
    resolve: root === 'package' ? { dedupe: ['react', 'react-dom'], alias } : aliasReact ? {
      alias: { react: resolve(packageRoot, 'node_modules/react'), 'react-dom': resolve(packageRoot, 'node_modules/react-dom'), ...alias },
    } : { alias },
    // Pre-bundle only where the list resolves to this package's React; elsewhere a
    // stray copy would duplicate React, so those servers rely on `entries` scanning.
    optimizeDeps: { entries, include: root === 'package' || aliasReact ? optimizeDepsInclude : undefined },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repositoryRoot, cacheDir] } },
    plugins: [{
      name: 'muxui-browser-harness',
      resolveId: (id) => moduleIds.get(id),
      load: (id) => moduleSources.get(id),
      configureServer(vite) {
        if (middleware) vite.middlewares.use(middleware);
        vite.middlewares.use((request, response, next) => {
          const url = new URL(request.url ?? '/', 'http://127.0.0.1');
          const page = pages[url.pathname];
          if (page === undefined) return next();
          response.statusCode = 200;
          response.setHeader('content-type', 'text/html; charset=utf-8');
          response.end(typeof page === 'function' ? page(url) : page);
        });
      },
    }],
  });
  try {
    await server.listen();
  } catch (error) {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
    throw error;
  }
  const address = server.httpServer?.address();
  if (!address || typeof address !== 'object') throw new Error('Vite did not report a listening port.');
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    },
  };
}
