import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { normalizeLegacyQueryApi } from '../../../../tests/evidence/bl1/growth-scope.mjs';
import { catalogAcrossCommit, gitIn, growthRepository, jsonEdit, repositoryRoot } from './evidence-growth-repository.mjs';

// BL1 growth, E-BL1-08: a tree from before Decision 0028, before block categories were catalog data, before they carried labels, before a spring
// transition named no easing, or before the Scale block took its current shape or palette algorithm is normalized the same way on both sides of the comparison. Like
// `evidence-growth-catalog.test.mjs`, it compiles two full extracted trees per comparison (once per tree, however many comparisons share it), and
// `node --test` runs the two files in parallel.
test('trees from before the manifest key was removed or before category labels compile the way they did, and an unknown registry shape still fails', async () => {
  const repo = await growthRepository();
  const { cwd, second } = repo;
  try {
    // Decision 0028 removed `authorityDecisionPath` from the source manifest and the compiler rejects it, so trees from before then compile with that one key
    // dropped, on both sides. It is not an escape hatch: any other unknown manifest key still fails the compiler.
    const manifestEdit = (change) => jsonEdit((manifest) => ({ ...manifest, ...change }));
    const legacy = await repo.modify((edit) => edit('packages/catalog/catalog-sources.json', manifestEdit({ authorityDecisionPath: 'decisions/0017-text-family-admission.md' })));
    await repo.edit('README.md', (text) => `${text}\nLegacy.\n`);
    gitIn(cwd, 'add', '-A', '-f');
    gitIn(cwd, 'commit', '-q', '-m', 'a later change to a tree with the legacy manifest key (#105)');
    const legacyChild = gitIn(cwd, 'rev-parse', 'HEAD');
    const acrossLegacy = await catalogAcrossCommit({ cwd, commit: legacyChild, parent: legacy, excludedDirectories: [], digestAffectingPathsChanged: [] });
    assert.deepEqual([acrossLegacy.identical, acrossLegacy.holds], [true, true], 'trees that carry the removed manifest key compile on both sides');
    const acrossAdded = await catalogAcrossCommit({ cwd, commit: legacy, parent: second, excludedDirectories: [], digestAffectingPathsChanged: [] });
    assert.deepEqual([acrossAdded.identical, acrossAdded.holds], [true, true], 'the key is dropped from the tree that carries it, and the one that does not is unchanged');
    // Every category now carries an explicit label, so the older registry files are converted before compiling, with the label the docs derived from
    // each id then (the id with dashes as spaces, capitalised). The closed list injected into a tree without a registry, and the group-to-id-list file
    // that made categories catalog data, compile on both sides, and to the same digest as a labelled file that spells those labels out.
    const unregistered = await repo.modify(async (edit, root) => {
      await edit('packages/catalog/catalog-sources.json', jsonEdit(({ patternCategoriesPath: _registry, ...manifest }) => manifest));
      await rm(join(root, 'catalog/patterns/categories.json'));
    });
    await repo.edit('README.md', (text) => `${text}\nUnregistered.\n`);
    gitIn(cwd, 'add', '-A', '-f');
    gitIn(cwd, 'commit', '-q', '-m', 'a later change to a tree without a category registry (#106)');
    const unregisteredChild = gitIn(cwd, 'rev-parse', 'HEAD');
    const acrossUnregistered = await catalogAcrossCommit({ cwd, commit: unregisteredChild, parent: unregistered, excludedDirectories: [], digestAffectingPathsChanged: [] });
    assert.deepEqual([acrossUnregistered.identical, acrossUnregistered.holds], [true, true], 'trees from before categories were catalog data compile with the closed list');
    const registryPath = 'catalog/patterns/categories.json';
    const withRegistry = (change) => repo.modify((edit) => edit(registryPath, (text) => `${JSON.stringify(change(JSON.parse(text)), null, 2)}\n`));
    const derivedLabel = (id) => `${id.charAt(0).toUpperCase()}${id.replaceAll('-', ' ').slice(1)}`;
    const mapGroups = (registry, change) => Object.fromEntries(Object.entries(registry).map(([group, categories]) => [group, change(Object.keys(categories))]));
    const lists = await withRegistry((registry) => mapGroups(registry, (ids) => ids));
    const derived = await withRegistry((registry) => mapGroups(registry, (ids) => Object.fromEntries(ids.map((id) => [id, derivedLabel(id)]))));
    const sameDigest = async (commit, parent) => (await catalogAcrossCommit({ cwd, commit, parent, excludedDirectories: [], digestAffectingPathsChanged: [] })).identical;
    assert.equal(await sameDigest(lists, derived), true, 'a group-to-id-list registry compiles as the labelled file with capitalised ids');
    assert.equal(await sameDigest(unregistered, lists), true, 'the injected closed list is the same registry as the group-to-id-list file');
    assert.equal(await sameDigest(lists, second), false, 'the labels are derived, so a file with explicit labels such as "FAQ" differs');
    // A spring transition names no easing (token contract 6.0.0) and the token source schema refuses one that does, so a tree from before, which carries an
    // easing reference beside each spring, drops it on both sides and compiles to the digest of the tree without them. A transition without a spring still
    // needs its easing, so removing that one is not normalized away.
    const themePath = 'catalog/tokens/default-theme.json';
    const themeEdit = (change) => repo.modify((edit) => edit(themePath, jsonEdit((theme) => { change(theme.tokens); return theme; })));
    const springEasing = await themeEdit((tokens) => {
      for (const token of Object.values(tokens)) if (token.value?.kind === 'transition' && token.value.spring) token.value.easing = 'semantic.motion.interaction-easing';
    });
    assert.equal(await sameDigest(springEasing, second), true, 'a legacy easing beside a spring is dropped, so the tree compiles as the one without it');
    const bareTransition = await themeEdit((tokens) => { delete tokens['semantic.motion.progress-transition'].value.easing; });
    await assert.rejects(catalogAcrossCommit({ cwd, commit: bareTransition, parent: second, excludedDirectories: [], digestAffectingPathsChanged: [] }), (error) => error.code === 'MUXUI_SCHEMA_INVALID', 'a transition with neither a spring nor an easing still fails the compiler');
    // Token contract 8.0.0 replaced the Scale contrast `algorithm` with `algorithms` and a `defaultAlgorithm`, and the token source schema refuses the old
    // field, so a tree from before, whose one allowed algorithm was `wcag2-endpoint-v1`, is rewritten on both sides and compiles to the digest of the tree
    // with the current block. Any other algorithm is not converted away.
    // The old block led with `algorithm`, and the digest follows field order, so the rewrite keeps the old field's place.
    const scaleEdit = (algorithm) => repo.modify((edit) => edit(themePath, jsonEdit((theme) => {
      const { algorithms: _algorithms, defaultAlgorithm: _defaultAlgorithm, ...rest } = theme.theme.scale.contrast;
      theme.theme.scale.contrast = { algorithm, ...rest };
      return theme;
    })));
    const legacyContrast = await scaleEdit('wcag2-endpoint-v1');
    assert.equal(await sameDigest(legacyContrast, second), true, 'a legacy contrast algorithm becomes the list and default, so the tree compiles as the one with them');
    const otherAlgorithm = await scaleEdit('apca-endpoint-v1');
    await assert.rejects(catalogAcrossCommit({ cwd, commit: otherAlgorithm, parent: second, excludedDirectories: [], digestAffectingPathsChanged: [] }), (error) => error.code === 'MUXUI_SCHEMA_INVALID', 'an algorithm the old schema refused still fails the compiler');
    // Palette tuning replaced the palette algorithm id `muxui-oklch-v1` with `muxui-oklch-v2`, which the token source schema now requires, so a tree from
    // before is rewritten on both sides and compiles to the digest of the tree with the current id. It keeps the field's place, since the digest follows
    // field order. Any other id is not converted away.
    const paletteEdit = (algorithm) => repo.modify((edit) => edit(themePath, jsonEdit((theme) => { theme.theme.scale.algorithm = algorithm; return theme; })));
    const legacyPalette = await paletteEdit('muxui-oklch-v1');
    assert.equal(await sameDigest(legacyPalette, second), true, 'the legacy palette algorithm becomes the current id, so the tree compiles as the one with it');
    const otherPalette = await paletteEdit('muxui-oklch-v0');
    await assert.rejects(catalogAcrossCommit({ cwd, commit: otherPalette, parent: second, excludedDirectories: [], digestAffectingPathsChanged: [] }), (error) => error.code === 'MUXUI_SCHEMA_INVALID', 'an algorithm id the old schema refused still fails the compiler');
    // Anything else is not converted, so the compiler still rejects it: a group that is not a list of ids, a list mixed with a labelled group, and a list the
    // old schema already refused.
    for (const [name, change] of [
      ['a group that is a string', (registry) => ({ ...registry, application: 'forms' })],
      ['a list beside a labelled group', (registry) => ({ ...registry, application: Object.keys(registry.application) })],
      ['a list with a repeated id', (registry) => mapGroups(registry, (ids) => [...ids, ids[0]])],
      ['a list with a non-string id', (registry) => mapGroups(registry, (ids) => [...ids, 7])],
    ]) {
      const unknownShape = await withRegistry(change);
      await assert.rejects(catalogAcrossCommit({ cwd, commit: unknownShape, parent: second, excludedDirectories: [], digestAffectingPathsChanged: [] }), (error) => error.code === 'MUXUI_SCHEMA_INVALID', `${name} still fails the compiler`);
    }
    // The compiler parses these files strictly, so a repeated key is an error there. Normalization uses the same parser: `JSON.parse` would keep only the
    // last occurrence and the file would be rewritten as valid JSON, hiding the repeat. Each tree below is identical to its parent once the first occurrence is
    // discarded, so only a strict parse tells them apart.
    const duplicatedRegistry = await repo.modify((edit) => edit(registryPath, (text) => {
      const groups = Object.entries(mapGroups(JSON.parse(text), (ids) => ids)).map(([group, ids]) => `  ${JSON.stringify(group)}: ${JSON.stringify(ids)}`);
      return `{\n  "application": ["decoy"],\n${groups.join(',\n')}\n}\n`;
    }));
    await assert.rejects(catalogAcrossCommit({ cwd, commit: duplicatedRegistry, parent: lists, excludedDirectories: [], digestAffectingPathsChanged: [] }), (error) => error.code === 'JSON_DUPLICATE_KEY', 'a legacy registry with a repeated group is rejected, not normalized');
    const duplicatedKey = await repo.modify((edit) => edit('packages/catalog/catalog-sources.json', (text) => text.replace(/^\{\n/u, '{\n  "authorityDecisionPath": "decisions/old.md",\n  "authorityDecisionPath": "decisions/older.md",\n')));
    await assert.rejects(catalogAcrossCommit({ cwd, commit: duplicatedKey, parent: second, excludedDirectories: [], digestAffectingPathsChanged: [] }), (error) => error.code === 'JSON_DUPLICATE_KEY', 'a manifest with the removed key twice is rejected, not normalized');
    const unknownKey = await repo.modify((edit) => edit('packages/catalog/catalog-sources.json', manifestEdit({ unexpectedKey: true })));
    await assert.rejects(catalogAcrossCommit({ cwd, commit: unknownKey, parent: second, excludedDirectories: [], digestAffectingPathsChanged: [] }), /MUXUI_CATALOG_SOURCE_INVALID/u, 'any other unknown manifest key still fails');
  } finally {
    await repo.dispose();
  }
});

// Query API 3.0.0 replaced 2.1.0, which every tree from before declares in its source manifest, its page budget profile, and the command registry's CLI
// choices. The normalizer rewrites those recognised declarations and nothing else: a malformed file, an unknown version, or a budget the tree changed
// is left as authored, so the compiler still rejects it and the digest comparison still sees it.
const manifestPath = 'packages/catalog/catalog-sources.json';
const profilePath = 'packages/catalog/token-section-page-budget-profile.json';
const registryPath = 'packages/tooling/command-registry.json';
const legacyQueryApi = '2.1.0';
const legacyProfile = (profile) => ({
  ...profile,
  id: 'muxui-token-section-page-budget-2-1-0',
  queryApiVersion: legacyQueryApi,
  normalizedWorstCaseEnvelopeSha256: 'sha256:ebb291d53b0adc83e9192b5e83e29c725d720cf9e555cac14c907b5a98c42f15',
});
const withChoices = (choices) => (registry) => {
  registry.selectors.find(({ requestKey }) => requestKey === 'queryApiVersion').choices = choices;
  return registry;
};
const legacyDeclarations = (current) => ({
  [manifestPath]: jsonEdit((manifest) => ({ ...manifest, queryApiVersion: legacyQueryApi, supportedQueryApiVersions: [legacyQueryApi] }))(current[manifestPath]),
  [profilePath]: jsonEdit(legacyProfile)(current[profilePath]),
  [registryPath]: jsonEdit(withChoices([legacyQueryApi]))(current[registryPath]),
});

test('the query API normalizer rewrites only the legacy declarations it recognises, and leaves everything else as authored', async () => {
  const current = Object.fromEntries(await Promise.all([manifestPath, profilePath, registryPath].map(async (path) => [path, await readFile(join(repositoryRoot, path), 'utf8')])));
  const legacy = legacyDeclarations(current);
  const parsed = (files) => Object.fromEntries(Object.entries(files).map(([path, text]) => [path, JSON.parse(text)]));
  /** The three files written to a new directory, normalized, and read back as text; the directory created here is the one removed. */
  const normalized = async (files) => {
    const directory = await mkdtemp(join(tmpdir(), 'muxui-bl1-query-api-tree-'));
    try {
      for (const [path, text] of Object.entries(files)) {
        await mkdir(join(directory, dirname(path)), { recursive: true });
        await writeFile(join(directory, path), text);
      }
      await normalizeLegacyQueryApi(directory);
      return Object.fromEntries(await Promise.all(Object.keys(files).map(async (path) => [path, await readFile(join(directory, path), 'utf8')])));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };

  assert.deepEqual(await normalized(current), current, 'a tree that declares the current query API is left byte-identical');
  assert.deepEqual(parsed(await normalized(legacy)), parsed(current), 'the legacy manifest, profile, and CLI choices become the current declarations');

  // The budget a tree authored stays: only the id, the query API version, and the digest that names it are legacy values.
  const limited = { ...legacy, [profilePath]: jsonEdit((profile) => ({ ...profile, defaultItemLimit: 17 }))(legacy[profilePath]) };
  assert.deepEqual(parsed(await normalized(limited)), { ...parsed(current), [profilePath]: { ...JSON.parse(current[profilePath]), defaultItemLimit: 17 } }, 'a custom default item limit stays as authored');

  // A file the strict parser refuses is not normalized into valid JSON; the other files are still rewritten on their own.
  const text = legacy[profilePath];
  for (const [name, malformed] of [
    ['malformed JSON', text.slice(0, -12)],
    ['a repeated key', text.replace(/^\{\n/u, '{\n  "id": "decoy",\n')],
  ]) {
    const result = await normalized({ ...legacy, [profilePath]: malformed });
    assert.equal(result[profilePath], malformed, `${name} in the profile is left as it is`);
    assert.deepEqual(JSON.parse(result[manifestPath]), JSON.parse(current[manifestPath]), `${name} in the profile does not stop the manifest from being rewritten`);
  }
  const malformedManifest = legacy[manifestPath].slice(0, -3);
  assert.deepEqual(await normalized({ ...legacy, [manifestPath]: malformedManifest }), { ...legacy, [manifestPath]: malformedManifest }, 'a malformed manifest leaves every file as it is');

  // A version the legacy trees never carried is not recognised, field by field.
  const manifestWith = (change) => ({ ...legacy, [manifestPath]: jsonEdit((manifest) => ({ ...manifest, ...change }))(legacy[manifestPath]) });
  for (const [name, change] of [
    ['an unknown query API version', { queryApiVersion: '2.2.0' }],
    ['an unknown supported version', { supportedQueryApiVersions: ['not-a-version'] }],
    ['an unknown version beside the legacy one', { supportedQueryApiVersions: [legacyQueryApi, 'not-a-version'] }],
  ]) {
    const files = manifestWith(change);
    const result = JSON.parse((await normalized(files))[manifestPath]);
    const authored = JSON.parse(files[manifestPath]);
    for (const key of Object.keys(change)) assert.deepEqual(result[key], authored[key], `${name} stays as authored`);
  }
  const unknownChoices = jsonEdit(withChoices([legacyQueryApi, '2.2.0']))(current[registryPath]);
  assert.equal((await normalized({ ...legacy, [registryPath]: unknownChoices }))[registryPath], unknownChoices, 'CLI choices that list another version are left as they are');
  const unknownProfile = jsonEdit((profile) => ({ ...legacyProfile(profile), queryApiVersion: '9.9.9', normalizedWorstCaseEnvelopeSha256: `sha256:${'0'.repeat(64)}` }))(current[profilePath]);
  const profile = JSON.parse((await normalized({ ...legacy, [profilePath]: unknownProfile }))[profilePath]);
  assert.deepEqual([profile.queryApiVersion, profile.normalizedWorstCaseEnvelopeSha256], ['9.9.9', `sha256:${'0'.repeat(64)}`], 'an unknown profile version and digest stay as authored');
});

test('a tree with the legacy query API compiles, and an unrecognised declaration still fails or still shows in the digest', async () => {
  const repo = await growthRepository();
  const { cwd, second } = repo;
  try {
    const legacyTree = (change = {}) => repo.modify(async (edit) => {
      await edit(manifestPath, jsonEdit((manifest) => ({ ...manifest, queryApiVersion: legacyQueryApi, supportedQueryApiVersions: [legacyQueryApi], ...change.manifest })));
      await edit(profilePath, jsonEdit((profile) => ({ ...legacyProfile(profile), ...change.profile })));
      await edit(registryPath, jsonEdit(withChoices([legacyQueryApi])));
      if (change.profileText) await edit(profilePath, change.profileText);
    });
    const across = (commit, parent) => catalogAcrossCommit({ cwd, commit, parent, excludedDirectories: [], digestAffectingPathsChanged: [] });
    const legacy = await legacyTree();
    await repo.edit('README.md', (text) => `${text}\nLegacy query API.\n`);
    gitIn(cwd, 'add', '-A', '-f');
    gitIn(cwd, 'commit', '-q', '-m', 'a later change to a tree with the legacy query API (#107)');
    const legacyChild = gitIn(cwd, 'rev-parse', 'HEAD');
    const acrossLegacy = await across(legacyChild, legacy);
    assert.deepEqual([acrossLegacy.identical, acrossLegacy.holds], [true, true], 'trees that declare the legacy query API compile on both sides');
    // An authored budget is part of the catalog digest, so a legacy tree that changes it differs from the one that does not, instead of being replaced by the current profile.
    const limited = await legacyTree({ profile: { defaultItemLimit: 17 } });
    assert.equal((await across(limited, legacy)).identical, false, 'a custom default item limit is not erased by the normalization');
    await assert.rejects(across(await legacyTree({ manifest: { supportedQueryApiVersions: ['not-a-version'] } }), second), /MUXUI_CATALOG_SOURCE_INVALID/u, 'an unknown supported version still fails the compiler');
    await assert.rejects(across(await legacyTree({ profileText: (text) => text.slice(0, -12) }), second), (error) => error.code === 'JSON_PARSE_INVALID', 'a malformed profile still fails the compiler');
  } finally {
    await repo.dispose();
  }
});
