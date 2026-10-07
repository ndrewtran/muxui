import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve } from 'node:path';
import test from 'node:test';
import { resolveAuthoringField } from '@muxui/schema';
import { compileCatalog } from '../src/compiler.mjs';
import { CONTENT_RULES, patternAssetIssues, patternContentIssues, scanPatternContent } from '../src/pattern-content.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const directory = 'catalog/patterns/poster-grid';
const cssPath = `${directory}/examples/react/css-grid.tsx`;
const virtualizedPath = `${directory}/examples/react/virtualized.tsx`;

const rules = (source) => scanPatternContent(source).map(({ ruleId }) => ruleId);

// One negative fixture per rule form. Each source must fail with exactly the named rule.
const REJECT = {
  'content.remote-reference': {
    'an http URL': 'const src = "http://example.com/poster.png";',
    'an https URL in a template': 'const src = `https://example.com/poster.png`;',
    'a protocol-relative src': '<img src="//cdn.example.com/poster.png" alt="" />',
    'a protocol-relative url()': '.art { background-image: url(//cdn.example.com/poster.png); }',
    'a remote url() with spaces and quotes': '.art { background-image: url( "https://cdn.example.com/poster.png" ); }',
    'a remote @import': '@import "//fonts.example.com/face.css";',
    'a scheme URL': 'const socket = "wss://example.com/live";',
    'a remote href': '<Link href="https://example.com/about">About</Link>',
    'a namespace URL that is not an xmlns value': 'const note = "see http://www.w3.org/2000/svg";',
    'an xmlns that is not an SVG or XLink namespace': '<svg xmlns="http://example.com/ns" />',
  },
  'content.colour-literal': {
    'a 3-digit hex': '.art { color: #fff; }',
    'a 4-digit hex': '.art { color: #fffa; }',
    'a 6-digit hex': '.art { background: #1a2b3c; }',
    'an 8-digit hex': '.art { background: #1a2b3cff; }',
    'an uppercase hex in a string': 'const fill = "#1A2B3C";',
    rgb: '.art { color: rgb(10 20 30); }',
    rgba: '.art { color: rgba(10, 20, 30, 0.5); }',
    hsl: '.art { color: hsl(10 20% 30%); }',
    hsla: '.art { color: hsla(10, 20%, 30%, 0.5); }',
    hwb: '.art { color: hwb(10 20% 30%); }',
    lab: '.art { color: lab(50% 10 10); }',
    lch: '.art { color: lch(50% 10 10); }',
    oklab: '.art { color: oklab(0.5 0.1 0.1); }',
    oklch: '.art { color: oklch(0.5 0.1 200); }',
    'color()': '.art { color: color(display-p3 1 0 0); }',
    'a named colour in color': '.art { color: red; }',
    'a named colour in background': '.art { background: navy; }',
    'a named colour in a border shorthand': '.art { border: 1px solid tomato; }',
    'a named colour in a box-shadow list': '.art { box-shadow: 0 0 0 1px var(--x), 0 0 2px gold; }',
    'a named colour in a style object': 'const style = { backgroundColor: "rebeccapurple", gap: 4 };',
    'a named colour in a quoted style key': 'const style = { "border-color": "crimson" };',
    'a named colour in a var() fallback': '.art { color: var(--x, white); }',
    'a named colour in a gradient': '.art { background-image: linear-gradient(red, var(--x)); }',
    'a named colour in an SVG paint attribute': '<path fill="red" d="M0 0" />',
    'a literal colour in a comment': '/* Previously #fff on a dark surface. */',
    'a colour function in color-mix': '.art { color: color-mix(in srgb, var(--x), rgb(0 0 0)); }',
  },
};

// Sources a variant may contain. Each must pass every source rule.
const ACCEPT = {
  'a data: URI': 'const src = "data:image/png;base64,iVBORw0KGgo=";',
  'an SVG data URI that declares its namespace': 'const src = `data:image/svg+xml,${encodeURIComponent(\'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>\')}`;',
  'an XLink namespace declaration': '<svg xmlns:xlink="http://www.w3.org/1999/xlink" />',
  'a // comment and a // after code': '// A note.\nconst a = 1; // Another note.',
  'a placeholder fragment href': '<a href={`#${id}`}>Details</a>',
  'a fragment that is not a colour': '<a href="#hero">Top</a><a href="#poster-1">One</a>',
  'an HTML entity': '<p>&#169; and &#x1F4A9;</p>',
  'a token reference': '.art { background-color: var(--muxui-semantic-surface-track); gap: var(--muxui-semantic-layout-tight-gap); }',
  'a token name that contains a colour word': '.art { color: var(--muxui-semantic-color-white); }',
  'transparent and currentColor': '.art { background: transparent; color: currentColor; border-color: inherit; }',
  'rgb built from a token': '.art { color: rgb(var(--channels)); }',
  'a colour word in prose': '<p>Choose a tan sofa in red or blue.</p>',
  'a colour word in a non-colour property': '.art { grid-area: tan; font-family: gold; }',
  'a colour word in a url() path': '.art { background-image: url(red.png); }',
  'a Mux colour prop': '<Text color="muted" size="sm">Caption</Text>',
};

for (const [rule, cases] of Object.entries(REJECT)) {
  test(`E-BL1-10: ${rule} rejects each negative fixture`, () => {
    for (const [name, source] of Object.entries(cases)) {
      assert.deepEqual([...new Set(rules(source))], [rule], name);
      assert.equal(scanPatternContent(source)[0].line, 1, name);
    }
  });
}

test('E-BL1-10: accepted forms pass every source rule', () => {
  for (const [name, source] of Object.entries(ACCEPT)) assert.deepEqual(scanPatternContent(source), [], name);
});

test('E-BL1-10: a violation reports its line and each rule once per line', () => {
  const source = ['const ok = 1;', '', '.a { color: #fff; background: #000; }', 'const u = "https://example.com"; // //x'].join('\n');
  assert.deepEqual(
    scanPatternContent(source).map(({ ruleId, line }) => [ruleId, line]),
    [['content.colour-literal', 3], ['content.remote-reference', 4]],
  );
});

test('E-BL1-10: the shipped poster grid variants pass every source rule', async () => {
  for (const path of [cssPath, virtualizedPath]) {
    assert.deepEqual(scanPatternContent(await readFile(join(repositoryRoot, path), 'utf8')), [], path);
  }
});

/** The real poster-grid files, keyed by repository-relative path. */
async function seedFiles(path = directory, files = new Map()) {
  for (const entry of await readdir(join(repositoryRoot, path), { withFileTypes: true })) {
    const child = posix.join(path, entry.name);
    if (entry.isDirectory()) await seedFiles(child, files);
    else files.set(child, await readFile(join(repositoryRoot, child), 'utf8'));
  }
  return files;
}

// The real poster grid needs only these sources, so mutated compiles stay fast.
const MINIMAL_SOURCES = /^catalog\/(?:capabilities\/|tokens\/|components\/(?:button|grid-list|image|link|text|virtualizer)\/)/u;

/**
 * Compiles the real poster grid in a root that symlinks the repository except
 * `catalog/patterns`, which holds a copy `edit(files)` may change or extend
 * (a path under the pattern directory that is not a record is an asset).
 * Returns the compile result, or the error it threw.
 */
async function compileSeed({ edit = () => {} } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'muxui-pattern-content-'));
  try {
    for (const name of await readdir(repositoryRoot)) {
      if (name !== '.git' && name !== 'catalog') await symlink(join(repositoryRoot, name), join(root, name));
    }
    await mkdir(join(root, 'catalog'));
    for (const name of await readdir(join(repositoryRoot, 'catalog'))) {
      if (name !== 'patterns') await symlink(join(repositoryRoot, 'catalog', name), join(root, 'catalog', name));
    }
    const files = await seedFiles();
    edit(files);
    for (const [path, text] of files) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), text);
    }
    const manifest = JSON.parse(await readFile(join(repositoryRoot, 'packages/catalog/catalog-sources.json'), 'utf8'));
    manifest.records = manifest.records.filter(({ path }) => MINIMAL_SOURCES.test(path) || path.startsWith('catalog/patterns/'));
    await writeFile(join(root, 'catalog-sources.json'), JSON.stringify(manifest));
    return await compileCatalog({ repositoryRoot: root, sourceManifestPath: 'catalog-sources.json' });
  } catch (error) {
    return error;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const mutate = (path, change) => (files) => files.set(path, change(files.get(path)));

// Mutation proof (E-BL1-10): each rule must trip on the real, shipped source once a violation is injected into it.
const MUTATIONS = [
  ['content.remote-reference', 'an http URL', cssPath, (source) => source.replace('alt=""', 'alt="" data-src="http://example.com/a.png"'), /^.*css-grid\.tsx:\d+ has an http or https URL/u],
  ['content.remote-reference', 'an https URL', virtualizedPath, (source) => source.replace('const titles = [', 'const poster = "https://cdn.example.com/poster.png";\nconst titles = ['), /virtualized\.tsx:\d+ has an http or https URL/u],
  ['content.remote-reference', 'a protocol-relative url()', cssPath, (source) => source.replace('inline-size: 100%;', 'inline-size: 100%; background: url(//cdn.example.com/a.png);'), /css-grid\.tsx:\d+ has a protocol-relative URL/u],
  ['content.colour-literal', 'a hex colour', cssPath, (source) => source.replace('var(--muxui-semantic-surface-track)', '#1a2b3c'), /css-grid\.tsx:\d+ has a hex colour/u],
  ['content.colour-literal', 'an rgb() colour', virtualizedPath, (source) => source.replace('var(--muxui-semantic-surface-track)', 'rgb(10 20 30)'), /virtualized\.tsx:\d+ has a colour function/u],
  ['content.colour-literal', 'an oklch() colour', cssPath, (source) => source.replace('var(--muxui-semantic-surface-track)', 'oklch(0.5 0.1 200)'), /css-grid\.tsx:\d+ has a colour function/u],
  ['content.colour-literal', 'a named colour', virtualizedPath, (source) => source.replace('var(--muxui-semantic-surface-track)', 'rebeccapurple'), /virtualized\.tsx:\d+ has the named colour "rebeccapurple" in background-color/u],
];

test('E-BL1-10 mutation: the real seed compiles, and each injected violation fails the compile with its rule and source line', async () => {
  const seed = await compileSeed();
  assert.equal(seed instanceof Error, false, seed.message);
  for (const [ruleId, name, path, change, message] of MUTATIONS) {
    const error = await compileSeed({ edit: mutate(path, change) });
    assert.equal(error.code, 'MUXUI_RELATION_INVALID', `${ruleId} ${name}: ${error.message}`);
    const issues = error.issues.filter((issue) => issue.ruleId === ruleId);
    assert.ok(issues.length > 0, `${ruleId} ${name} did not fail by that rule: ${error.message}`);
    assert.equal(error.issues.length, issues.length, `${ruleId} ${name} tripped another rule: ${error.message}`);
    const [issue] = issues;
    assert.equal(issue.artifactId, 'muxui:pattern:poster-grid');
    assert.equal(issue.path, '$/variants');
    assert.equal(issue.source, path);
    assert.ok(Number.isInteger(issue.line) && issue.line > 0);
    assert.match(issue.message, message, `${ruleId} ${name}`);
    assert.equal(resolveAuthoringField('pattern', issue.path).owner, 'pattern-contract');
  }
});

const SIDECAR = {
  schemaVersion: '1.0.0',
  asset: 'mark.svg',
  author: 'Mux UI',
  license: 'MIT',
  disclosure: 'Authored for Mux UI; no third-party material.',
};
const MARK = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="currentColor"/></svg>\n';
const withAsset = (sidecar = SIDECAR, asset = MARK) => (files) => {
  files.set(`${directory}/assets/mark.svg`, asset);
  if (sidecar !== null) files.set(`${directory}/assets/mark.svg.license.json`, typeof sidecar === 'string' ? sidecar : JSON.stringify(sidecar));
};
const sidecarWithout = (field) => Object.fromEntries(Object.entries(SIDECAR).filter(([key]) => key !== field));

test('E-BL1-10 asset licenses: an asset with a valid license record and clean content compiles', async () => {
  const result = await compileSeed({ edit: withAsset() });
  assert.equal(result instanceof Error, false, result.message);
  // The asset is never listed, so the bundle (and the catalog digest) does not depend on it.
  const without = await compileSeed();
  assert.equal(result.bundle.catalogDigest, without.bundle.catalogDigest);
});

test('E-BL1-10 asset licenses: each negative fixture fails with the asset-license rule at its file', async () => {
  const cases = [
    ['an asset with no license record', withAsset(null), `${directory}/assets/mark.svg`, /is an asset without a license and disclosure record; add mark\.svg\.license\.json beside it/u],
    ['a record with no disclosure', withAsset(sidecarWithout('disclosure')), `${directory}/assets/mark.svg.license.json`, /needs a non-empty "disclosure"/u],
    ['a record with a blank license', withAsset({ ...SIDECAR, license: ' ' }), `${directory}/assets/mark.svg.license.json`, /needs a non-empty "license"/u],
    ['a record that names another asset', withAsset({ ...SIDECAR, asset: 'other.svg' }), `${directory}/assets/mark.svg.license.json`, /must name its asset "mark\.svg"/u],
    ['a record with an unknown field', withAsset({ ...SIDECAR, notes: 'x' }), `${directory}/assets/mark.svg.license.json`, /has unknown fields notes/u],
    ['a record that is not JSON', withAsset('not json'), `${directory}/assets/mark.svg.license.json`, /is not valid JSON/u],
    ['a record with no asset', (files) => files.set(`${directory}/assets/gone.svg.license.json`, JSON.stringify({ ...SIDECAR, asset: 'gone.svg' })), `${directory}/assets/gone.svg.license.json`, /is a license record with no asset beside it/u],
    ['a binary asset with no license record', (files) => files.set(`${directory}/assets/poster.png`, 'png bytes'), `${directory}/assets/poster.png`, /is an asset without a license/u],
  ];
  for (const [name, edit, source, message] of cases) {
    const error = await compileSeed({ edit });
    assert.equal(error.code, 'MUXUI_RELATION_INVALID', `${name}: ${error.message}`);
    assert.deepEqual(error.issues.map(({ ruleId }) => ruleId), ['content.asset-license'], name);
    const [issue] = error.issues;
    assert.equal(issue.source, source, name);
    assert.equal(issue.path, '$/variants', name);
    assert.match(issue.message, message, name);
  }
});

test('E-BL1-10 asset licenses: a licensed text asset still passes the colour and remote rules', async () => {
  const error = await compileSeed({
    edit: withAsset(SIDECAR, '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://cdn.example.com/a.png"/><rect fill="#fff"/></svg>\n'),
  });
  assert.deepEqual(error.issues.map(({ ruleId, source, line }) => [ruleId, source, line]), [
    ['content.colour-literal', `${directory}/assets/mark.svg`, 1],
    ['content.remote-reference', `${directory}/assets/mark.svg`, 1],
  ]);
});

test('E-BL1-10 asset licenses: files the compiler already reads, and dotfiles, are not assets', async () => {
  const issues = await patternAssetIssues({
    repositoryRoot,
    pattern: { id: 'muxui:pattern:poster-grid' },
    directory,
    known: new Set([...(await seedFiles()).keys()]),
  });
  assert.deepEqual(issues, []);
  const result = await compileSeed({ edit: (files) => files.set(`${directory}/.DS_Store`, 'finder') });
  assert.equal(result instanceof Error, false, result.message);
});

test('E-BL1-10: the issue helper links each variant source and names the variants owner', () => {
  const [issue] = patternContentIssues({
    pattern: { id: 'muxui:pattern:poster-grid' },
    variants: [{ source: 'a/b.tsx', text: 'ok\n.x { color: #fff; }' }],
  });
  assert.deepEqual(issue, {
    artifactId: 'muxui:pattern:poster-grid',
    path: '$/variants',
    ruleId: 'content.colour-literal',
    source: 'a/b.tsx',
    line: 2,
    message: 'a/b.tsx:2 has a hex colour ("#fff"); use a --muxui-semantic-* token, a var() reference, or currentColor',
  });
  assert.deepEqual(CONTENT_RULES, ['content.remote-reference', 'content.colour-literal', 'content.asset-license']);
});
