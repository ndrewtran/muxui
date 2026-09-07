import { execFile } from 'node:child_process';
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createServer } from 'vite';
import { pinnedDonor } from './donor-adapter.mjs';

const execFileAsync = promisify(execFile);
const host = '127.0.0.1';
const appRoot = resolve(import.meta.dirname, '../..');
const appRequire = createRequire(import.meta.url);

async function git(taleRoot, args) {
  const { stdout } = await execFileAsync('git', ['-C', taleRoot, ...args], { timeout: 10_000 });
  return String(stdout).trim();
}

export async function assertPinnedTaleCheckout(taleRoot) {
  const commit = await git(taleRoot, ['rev-parse', 'HEAD']);
  if (commit !== pinnedDonor.commit) throw new Error(`Tale checkout must be pinned to ${pinnedDonor.commit}, got ${commit}`);
  const status = await git(taleRoot, ['status', '--porcelain']);
  if (status) throw new Error('Tale checkout must be clean before the finite paired capture');
  return { commit, tree: await git(taleRoot, ['rev-parse', `${pinnedDonor.commit}^{tree}`]) };
}

export async function browserPath() {
  const candidates = [
    process.env.MUXUI_CHROME_EXECUTABLE,
    process.env.CHROME_BIN,
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue through explicit capture-environment candidates.
    }
  }
  throw new Error('Chrome or Chromium is required for the finite paired capture');
}

function taleAliases(taleRoot) {
  const taleRequire = createRequire(resolve(taleRoot, 'packages/react/package.json'));
  const internationalizedDatePath = resolve(dirname(taleRequire.resolve('@internationalized/date')), 'index.mjs');
  const taleReactSource = resolve(taleRoot, 'packages/react/src');
  const utilsPath = resolve(taleRoot, 'packages/utils/src');
  const lucidePath = taleRequire.resolve('lucide-react');
  return [
    { find: /^react$/, replacement: appRequire.resolve('react') },
    { find: /^react-dom\/client$/, replacement: appRequire.resolve('react-dom/client') },
    { find: /^@tale-ui\/react$/, replacement: `${taleReactSource}/index.ts` },
    { find: /^@tale-ui\/react\/(.*)$/, replacement: `${taleReactSource}/$1/index.ts` },
    { find: /^@tale-ui\/react-styles$/, replacement: resolve(taleRoot, 'packages/styles/src/index.css') },
    { find: /^@tale-ui\/css$/, replacement: resolve(taleRoot, 'packages/css/src/index.css') },
    { find: /^@tale-ui\/utils\/(.*)$/, replacement: `${utilsPath}/$1.ts` },
    { find: /^@internationalized\/date$/, replacement: internationalizedDatePath },
    { find: /^lucide-react$/, replacement: lucidePath },
  ];
}

export async function startTaleServer(taleRoot, temporaryRoot, { repositoryRoot } = {}) {
  const server = await createServer({
    root: temporaryRoot,
    resolve: { alias: taleAliases(taleRoot), dedupe: ['react', 'react-dom'] },
    // The finite proof server is intentionally frozen. HMR/watch activity can
    // navigate a page while it is collecting a readiness or fact evaluation.
    server: { host, port: 0, strictPort: false, hmr: false, watch: null, fs: { allow: [temporaryRoot, '/private/tmp', appRoot, repositoryRoot, taleRoot].filter(Boolean) } },
  });
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address !== 'object') throw new Error('finite donor bootstrap could not reserve a local server port');
  return { server, url: `http://${host}:${address.port}` };
}

export const bundledFontFiles = Object.freeze([
  'Inter[opsz,wght].ttf',
  'Inter-Italic[opsz,wght].ttf',
  'PlayfairDisplay[wght].ttf',
  'PlayfairDisplay-Italic[wght].ttf',
  'RobotoMono[wght].ttf',
  'RobotoMono-Italic[wght].ttf',
]);

export async function writeTemporaryApp(entrySource, { fontSourceRoot } = {}) {
  const temporaryRoot = await mkdtemp('/tmp/muxui-r1-6-finite-tale-');
  if (fontSourceRoot) {
    const fontTargetRoot = resolve(temporaryRoot, 'mux-fonts');
    await mkdir(fontTargetRoot, { recursive: true });
    await Promise.all(bundledFontFiles.map((file) => copyFile(resolve(fontSourceRoot, file), resolve(fontTargetRoot, file))));
  }
  const entryUrl = `/@fs/${entrySource}`;
  await writeFile(resolve(temporaryRoot, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><title>Mux UI R1.6 finite donor</title><style>html, body { margin: 0; padding: 0; font-family: system-ui; }</style></head><body><main id="root"></main><script type="module" src="${entryUrl}"></script></body></html>\n`);
  return { temporaryRoot };
}

export async function disposeTemporaryApp(temporaryRoot) {
  await rm(temporaryRoot, { recursive: true, force: true });
}
