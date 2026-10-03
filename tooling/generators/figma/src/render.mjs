/*
 * Browser rendering for measurement. Consumes @muxui/react the way a packed
 * consumer does: the public package entry for components and the published
 * `@muxui/react/styles.css` export for styles. A Vite dev server serves one
 * page per family; Chrome launches headless with a fresh temporary profile.
 */
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const packageRoot = resolve(import.meta.dirname, '..');
const stylesheetFile = fileURLToPath(import.meta.resolve('@muxui/react/styles.css'));
// The stylesheet's relative url()s (fonts) resolve against its location, so
// `/muxui-react/` mirrors the directory above it, as a bundler would see it.
const assetRoot = resolve(dirname(stylesheetFile), '..');
/** Request path of the published stylesheet; measurement maps it back to a stable source name. */
export const STYLESHEET_PATH = `/muxui-react/${relative(assetRoot, stylesheetFile)}`;
const CONTENT_TYPES = { '.css': 'text/css; charset=utf-8', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.woff': 'font/woff' };

/** A file under `/muxui-react/`, or undefined outside the stylesheet's asset root. */
async function packageAsset(pathname) {
  if (!pathname.startsWith('/muxui-react/')) return undefined;
  const file = resolve(assetRoot, decodeURIComponent(pathname.slice('/muxui-react/'.length)));
  if (relative(assetRoot, file).startsWith('..') || !CONTENT_TYPES[extname(file)]) return undefined;
  return { body: await readFile(file), type: CONTENT_TYPES[extname(file)] };
}

const chromeCandidates = [
  process.env.MUXUI_CHROME_EXECUTABLE,
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

async function chromePath() {
  for (const path of chromeCandidates) {
    try {
      await access(path);
      return path;
    } catch {
      // Try the next installed browser.
    }
  }
  throw new Error('Install Chrome or set MUXUI_CHROME_EXECUTABLE to measure components.');
}

/** Headless Chrome; Playwright gives every launch its own temporary profile. */
export async function launchBrowser() {
  return chromium.launch({ executablePath: await chromePath(), headless: true });
}

/** HTML shell that loads the published stylesheet and one module entry. */
export function pageShell({ attributes, entry }) {
  return `<!doctype html><html ${attributes}><head><meta charset="utf-8"><link rel="icon" href="data:,"><link rel="stylesheet" href="${STYLESHEET_PATH}"></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>`;
}

/**
 * Serve `pages` (HTML keyed by pathname) and `modules` (virtual module source
 * keyed by request path) on a random local port. The public entry is
 * pre-bundled up front so dependency discovery never reloads a running page.
 */
export async function startServer({ pages, modules }) {
  const cacheDir = await mkdtemp(join(tmpdir(), 'muxui-figma-vite-'));
  const moduleIds = new Map(Object.keys(modules).map((path) => [path, resolve(packageRoot, `.${path}`)]));
  const moduleSources = new Map(Object.entries(modules).map(([path, source]) => [moduleIds.get(path), source]));
  const server = await createServer({
    configFile: false,
    root: packageRoot,
    cacheDir,
    logLevel: 'error',
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom', 'react-dom/client', '@muxui/react'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [packageRoot, cacheDir] } },
    plugins: [{
      name: 'muxui-figma-render',
      resolveId: (id) => moduleIds.get(id),
      load: (id) => moduleSources.get(id),
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          const { pathname } = new URL(request.url ?? '/', 'http://127.0.0.1');
          const send = (body, type) => {
            response.statusCode = 200;
            response.setHeader('content-type', type);
            response.end(body);
          };
          if (pages[pathname] !== undefined) return send(pages[pathname], 'text/html; charset=utf-8');
          packageAsset(pathname).then((asset) => (asset ? send(asset.body, asset.type) : next()), next);
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
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    },
  };
}
