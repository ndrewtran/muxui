import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve } from 'node:path';
import test from 'node:test';
import { resolveAuthoringField } from '@muxui/schema';
import { compileCatalog } from '../src/compiler.mjs';
import { CONTENT_RULES, patternAssetIssues, patternContentIssues, scanLocalReferences, scanPatternContent } from '../src/pattern-content.mjs';

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
    'an xmlns that is not an SVG, XLink, or XHTML namespace': '<svg xmlns="http://example.com/ns" />',
    'a protocol-relative srcSet entry after the first': '<img srcSet="data:image/png;base64,AAAA 1x, //cdn.example.com/b.png 2x" alt="" />',
    'a protocol-relative srcset on a source': '<source srcset="//cdn.example.com/a.webp 1x, //cdn.example.com/b.webp 2x" />',
    'a protocol-relative srcSet entry in a template': '<img srcSet={`${one} 1x, //cdn.example.com/b.png 2x`} alt="" />',
    'a remote srcSet entry': '<img srcSet="a.png 1x, https://cdn.example.com/b.png 2x" alt="" />',
    'a remote entry in a quoted srcSet key': 'const props = { "srcSet": "a.png 1x,\n//cdn.example.com/b.png 2x" };',
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
    'a colour declaration in a comment': '/* Previously color: #fff on a dark surface. */',
    'a colour function in color-mix': '.art { color: color-mix(in srgb, var(--x), rgb(0 0 0)); }',
    'a relative colour from a literal origin': '.art { color: oklch(from #123456 l c h); }',
    'a relative colour from a named origin': '.art { color: oklch(from red l c h); }',
    'a nested literal colour in a relative colour': '.art { color: oklch(from rgb(1 2 3) l c h); }',
    'an uppercase colour function': '.art { color: RGB(10 20 30); }',
    'an uppercase oklch function': '.art { background: OKLCH(0.5 0.1 200); }',
    'an uppercase property name': '.art { BACKGROUND: red; }',
    'a capitalised property with a hex': '.art { Color: #fff; }',
    'an uppercase kebab property': '.art { BACKGROUND-COLOR: #fff; }',
    'a PascalCase style key': 'const style = { BackgroundColor: "red" };',
    'a hex in a custom property': '.art { --accent: #ff0000; }',
    'a named colour in a custom property': 'const style = { "--accent": "tomato" };',
    'a hex colour in a plain string': 'const palette = ["#1a2b3c", "#fff"];',
    'a hex colour in a template string': 'const brand = `#1a2b3c`;',
    'a JSX stopColor': '<stop offset="0" stopColor="red" />',
    'a JSX stopColor hex': '<stop offset="0" stopColor="#fff" />',
    'an SVG stop-color': '<stop offset="0" stop-color="gold" />',
    'a JSX floodColor': '<feFlood floodColor="gold" />',
    'a JSX lightingColor': '<feDiffuseLighting lightingColor="navy" />',
    'a JSX color attribute': '<Text color="red" size="sm">Caption</Text>',
    'a JSX color attribute with a hex': '<Text color="#fff">Caption</Text>',
    'a JSX fill in braces': '<path fill={"red"} d="M0 0" />',
    'a JSX stroke in braces': "<path stroke={'tomato'} d=\"M0 0\" />",
    'a JSX paint expression with a literal': "<rect fill={on ? 'red' : 'none'} />",
    'a JSX paint template': '<rect fill={`#fff`} />',
    'a gradient stop paint beside a url': '<rect fill="url(#fade) red" />',
  },
};

// Sources a variant may contain. Each must pass every source rule.
const ACCEPT = {
  'a data: URI': 'const src = "data:image/png;base64,iVBORw0KGgo=";',
  'an SVG data URI that declares its namespace': 'const src = `data:image/svg+xml,${encodeURIComponent(\'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>\')}`;',
  'an XLink namespace declaration': '<svg xmlns:xlink="http://www.w3.org/1999/xlink" />',
  'an xmlnsXlink JSX attribute': '<svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" />',
  'the XHTML namespace': '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">Hi</div></foreignObject>',
  'a namespace in single quotes': "<svg xmlns='http://www.w3.org/2000/svg' />",
  'a namespace with escaped quotes': 'const markup = \'<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"1\\"/>\';',
  'a namespace as a JSX string expression': '<svg xmlns={"http://www.w3.org/2000/svg"} />',
  'a // comment and a // after code': '// A note.\nconst a = 1; // Another note.',
  'a placeholder fragment href': '<a href={`#${id}`}>Details</a>',
  'a fragment that is not a colour': '<a href="#hero">Top</a><a href="#poster-1">One</a>',
  'a hex-lettered anchor': '<a href="#add">Add</a><Link href={`#fade`}>Fade</Link><a href=\'#cafe\'>Cafe</a>',
  'a hex-lettered fragment in url()': '.art { fill: url(#fade); mask: url(#bead); }',
  'a quoted fragment in url()': '.art { background-image: url("#fade"); }',
  'a gradient reference in a paint attribute': '<rect fill="url(#fade)" stroke="url(#add)" />',
  'a hash number in JSX text': '<Text size="sm">Ticket #100 and #add</Text>',
  'a hex-like word in a comment': '// The #fade gradient is defined below.',
  'a CSS id selector': '#fade { gap: 4px; }\n#add .art, #deadbeef { color: var(--muxui-semantic-content-strong); }',
  'a relative colour from a token': '.art { color: oklch(from var(--muxui-semantic-content-strong) l c h / 50%); }',
  'a relative rgb from a token': '.art { background: rgb(from var(--c) r g b / 50%); }',
  'rgb built from a token with spaces': '.art { color: rgb( var(--channels) ); }',
  'an uppercase token reference': '.art { color: RGB(VAR(--channels)); }',
  'a gradient stop built from tokens': '<linearGradient id="fade"><stop offset="0" stopColor="var(--muxui-semantic-surface-track)" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient>',
  'a paint attribute with a token': '<path fill="var(--muxui-semantic-content-muted)" stroke="none" />',
  'a paint expression with a token': "<rect fill={on ? 'var(--muxui-semantic-surface-track)' : 'none'} />",
  'a color prop that names a Mux role': '<Text color={muted ? "muted" : "default"} />',
  'a custom property that holds a token': '.art { --accent: var(--muxui-semantic-surface-track); }',
  'a srcSet of data and local entries': '<img srcSet="data:image/png;base64,AAAA 1x, data:image/png;base64,BBBB 2x" alt="" />',
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
    // The category registry sits beside the pattern directories the copy replaces.
    await mkdir(join(root, 'catalog/patterns'));
    await copyFile(join(repositoryRoot, 'catalog/patterns/categories.json'), join(root, 'catalog/patterns/categories.json'));
    const files = await seedFiles();
    edit(files);
    for (const [path, text] of files) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), text);
    }
    const manifest = JSON.parse(await readFile(join(repositoryRoot, 'packages/catalog/catalog-sources.json'), 'utf8'));
    manifest.records = manifest.records.filter(({ path }) => MINIMAL_SOURCES.test(path) || path.startsWith(`${directory}/`));
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
  ['content.remote-reference', 'a protocol-relative srcSet entry', cssPath, (source) => source.replace('alt=""', 'alt="" srcSet="data:image/png;base64,AAAA 1x, //cdn.example.com/b.png 2x"'), /css-grid\.tsx:\d+ has a protocol-relative URL/u],
  ['content.local-reference', 'a local src', cssPath, (source) => source.replace('src={posterSrc}', 'src="poster.png"'), /css-grid\.tsx:\d+ references the local path "poster\.png"/u],
  ['content.local-reference', 'a route-style href', virtualizedPath, (source) => source.replace('href={`#${poster.id}`}', 'href="/pricing"'), /virtualized\.tsx:\d+ references the local path "\/pricing"/u],
  ['content.colour-literal', 'a JSX colour attribute', virtualizedPath, (source) => source.replace('<Text as="div" size="sm" color="muted">', '<Text as="div" size="sm" color="red">'), /virtualized\.tsx:\d+ has the named colour "red" in a colour attribute/u],
  ['content.colour-literal', 'a hex colour in a plain string', cssPath, (source) => source.replace("const posterSrc =", "const brand = '#1a2b3c';\nconst posterSrc ="), /css-grid\.tsx:\d+ has a hex colour/u],
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

const licensedMark = new Set([`${directory}/assets/mark.svg`]);
const localReferences = (text, path = `${directory}/examples/react/v.tsx`) => scanLocalReferences({ text, path, directory, licensed: licensedMark }).map(({ line }) => line);

test('E-BL1-10: a local reference must resolve to a licensed asset inside the pattern directory', () => {
  const accepted = {
    'a licensed asset': '<img src="../../assets/mark.svg" alt="" />',
    'a licensed asset with a query and fragment': '<img src="../../assets/mark.svg?v=1#icon" alt="" />',
    'a path that normalises into the pattern': '<img src="../../assets/../assets/mark.svg" alt="" />',
    'a licensed asset in url()': '.art { background-image: url(../../assets/mark.svg); }',
    'a licensed asset in srcSet': '<img srcSet="../../assets/mark.svg 1x" alt="" />',
    'an in-page anchor': '<a href="#pricing">Pricing</a><a href={`#${id}`}>One</a>',
    'a gradient reference': '<rect fill="url(#fade)" /><path d="M0 0" style={{ fill: "url(#fade)" }} />',
    'a data: URI': '<img src="data:image/png;base64,AAAA" alt="" />',
    'a data: URI in url()': '.art { background-image: url(data:image/png;base64,AAAA); }',
    'a value that starts with a placeholder': '<img src={`${base}/a.png`} alt="" />',
    'a token in url()': '.art { background-image: url(var(--muxui-semantic-mark)); }',
    'an expression': '<img src={posterSrc} alt="" />',
    // `action`, `formAction`, and `poster` are ordinary words in data: only attribute syntax counts.
    'an object property named action': "const plans = [{ name: 'Starter', action: 'Start free' }];",
    'object properties named formAction and poster': "const row = { formAction: 'Save', poster: 'Sample Title' };",
    'variables named action and poster': "const action = 'Save';\nlet poster = 'Sample Title';",
    'an assigned member named action': "plan.action = 'Save';",
    'a destructured default named action': "const { action = 'Save' } = props;",
    'a parameter default named action': "const Row = ({ title, action = 'Save' }) => title;\nconst Plain = (action = 'Save') => action;",
    'a poster property that is a word': "const row = { poster: 'Sample Title', 'poster': 'Another Title' };",
    'a poster variable that is a word': "const poster = 'Sample Title';",
  };
  for (const [name, text] of Object.entries(accepted)) assert.deepEqual(localReferences(text), [], name);
  const rejected = {
    'an unlicensed file': '<img src="../../assets/other.svg" alt="" />',
    'a path relative to the wrong directory': '<img src="./mark.svg" alt="" />',
    'a root-absolute path': '<img src="/assets/mark.svg" alt="" />',
    'a route-style href': '<a href="/pricing">Pricing</a>',
    'a bare relative path': '<img src="poster.png" alt="" />',
    'a path that escapes the pattern': '<img src="../../../outside.svg" alt="" />',
    'a variant source': '<a href="./css-grid.tsx">Source</a>',
    'a mailto: link': '<a href="mailto:hi@example.com">Mail</a>',
    'a javascript: link': '<a href="javascript:void(0)">Run</a>',
    'a query-only link': '<a href="?tab=2">Tab</a>',
    'a dynamic path': '<img src={`/img/${n}.png`} alt="" />',
    'a path in an object': 'const poster = { src: "poster.png" };',
    'a quoted object key': 'const poster = { "href": "/pricing" };',
    'a local srcSet entry': '<img srcSet="../../assets/mark.svg 1x, poster.png 2x" alt="" />',
    'a local url()': '.art { background-image: url("poster.png"); }',
    'a local image-set string': '.art { background-image: image-set("poster.png" 1x); }',
    'a local @import': '@import "theme.css";',
    'an xlink href': '<use xlinkHref="sprite.svg#a" />',
    'a poster': '<video poster="poster.png" />',
    'an action attribute': '<form action="/x"></form>',
    'a single-quoted action attribute': "<form action='/x'></form>",
    'an action expression string': "<form action={'/x'}></form>",
    'a double-quoted action expression string': '<form action={"/x"}></form>',
    'an action attribute with spaces around the equals sign': '<form action = "/x"></form>',
    'a formAction attribute': '<button formAction="/x" />',
    'a url() in a style object': "<div style={{ backgroundImage: 'url(/x.png)' }} />",
    'an action attribute after a spread': '<form {...props} action="/x"></form>',
    'a poster property with a path': "const row = { poster: 'posters/a.png' };",
    'a poster property passed to createElement': "createElement('video', { poster: './a.png' });",
    'a poster property with an image extension': "const row = { poster: 'a.png' };",
    'a poster property with a slash and no extension': "const row = { poster: 'posters/cover' };",
    'a poster property that starts with a dot': "const row = { poster: '.cover' };",
    'a quoted poster key with a path': 'const row = { "poster": "posters/a.png" };',
    'a poster member assignment with a path': "video.poster = 'posters/a.png';",
    'a poster variable with a path': "const poster = 'posters/a.png';",
  };
  for (const [name, text] of Object.entries(rejected)) assert.deepEqual(localReferences(text), [1], name);
  // A reference resolves from the file that holds it: an asset's neighbour is found by its own name.
  assert.deepEqual(localReferences('<image href="mark.svg" />', `${directory}/assets/other.svg`), []);
  assert.deepEqual(localReferences('<image href="mark.svg" />'), [1]);
  // The rule needs a licensed asset to point at: none is known without context.
  assert.deepEqual(scanLocalReferences({ text: '<img src="a.svg" />', path: 'a/b.tsx', directory: 'a', licensed: new Set() }).map(({ ruleId }) => ruleId), ['content.local-reference']);
});

test('E-BL1-10 local references: a variant resolves them against the licensed assets of its pattern', async () => {
  const reference = (source) => source.replace('src={posterSrc}', 'src="../../assets/mark.svg"');
  const edit = (...edits) => (files) => edits.forEach((change) => change(files));
  const licensed = withAsset();
  const ok = await compileSeed({ edit: edit(licensed, mutate(cssPath, reference)) });
  assert.equal(ok instanceof Error, false, ok.message);

  // The reference needs both the file and a valid license record.
  const unlicensed = await compileSeed({ edit: edit(withAsset(null), mutate(cssPath, reference)) });
  assert.deepEqual(unlicensed.issues.map(({ ruleId, source }) => [ruleId, source]), [
    ['content.local-reference', cssPath],
    ['content.asset-license', `${directory}/assets/mark.svg`],
  ]);
  const missing = await compileSeed({ edit: mutate(cssPath, reference) });
  assert.deepEqual(missing.issues.map(({ ruleId }) => ruleId), ['content.local-reference']);

  // Marketing blocks keep working: in-page anchors and an inline SVG gradient with token stops.
  const marketing = await compileSeed({
    edit: mutate(cssPath, (source) => source.replace('<Link href={`#${poster.id}`}', '<svg width="0" height="0" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="fade"><stop offset="0" stopColor="var(--muxui-semantic-surface-track)" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs></svg>\n<a href="#add">Add</a>\n<Link href={`#${poster.id}`}')),
  });
  assert.equal(marketing instanceof Error, false, marketing.message);
});

test('E-BL1-10 asset licenses: a text asset resolves its own local references, and a dot-named asset needs a license', async () => {
  const sprite = (href) => withAsset(SIDECAR, `<svg xmlns="http://www.w3.org/2000/svg"><image href="${href}"/></svg>\n`);
  const dangling = await compileSeed({ edit: sprite('other.svg') });
  assert.deepEqual(dangling.issues.map(({ ruleId, source, line }) => [ruleId, source, line]), [['content.local-reference', `${directory}/assets/mark.svg`, 1]]);
  const self = await compileSeed({ edit: sprite('mark.svg#a') });
  assert.equal(self instanceof Error, false, self.message);

  const hidden = `${directory}/assets/.hidden.svg`;
  const hiddenSidecar = { ...SIDECAR, asset: '.hidden.svg' };
  const bare = await compileSeed({ edit: (files) => files.set(hidden, MARK) });
  assert.deepEqual(bare.issues.map(({ ruleId, source }) => [ruleId, source]), [['content.asset-license', hidden]]);
  const bareDirectory = await compileSeed({ edit: (files) => files.set(`${directory}/.private/key.pem`, 'key') });
  assert.deepEqual(bareDirectory.issues.map(({ ruleId, source }) => [ruleId, source]), [['content.asset-license', `${directory}/.private/key.pem`]]);
  const licensed = await compileSeed({ edit: (files) => { files.set(hidden, MARK); files.set(`${hidden}.license.json`, JSON.stringify(hiddenSidecar)); } });
  assert.equal(licensed instanceof Error, false, licensed.message);
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
  assert.deepEqual(CONTENT_RULES, ['content.remote-reference', 'content.local-reference', 'content.colour-literal', 'content.asset-license']);
});
