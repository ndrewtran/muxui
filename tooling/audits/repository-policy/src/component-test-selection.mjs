const SHARED_TESTS = Object.freeze([
  'test/style-scopes.test.mjs',
  'test/styling-tokens.test.mjs',
]);

const SOURCE_ROUTES = Object.freeze({
  button: ['test/fixture.test.mjs'],
  components: ['test/components.test.mjs'],
  fields: ['test/fields.test.mjs'],
  collections: ['test/r1-3-parity.test.mjs'],
  overlays: ['test/r1-4-overlays.test.mjs'],
  markdown: ['test/heavy-components.test.mjs'],
  'text-editor': ['test/heavy-components.test.mjs'],
});

const FAMILY_ROUTES = Object.freeze({
  Avatar: ['test/image-avatar.test.mjs'],
  ColorPicker: ['test/color-swatch.test.mjs'],
  ColorSwatch: ['test/color-swatch.test.mjs'],
  CommandPalette: ['test/command-palette-hook.test.mjs'],
  IconButton: ['test/icon-button.test.mjs'],
  Image: ['test/image-avatar.test.mjs'],
  Lightbox: ['test/heavy-components.test.mjs'],
  Markdown: ['test/heavy-components.test.mjs'],
  ProgressCircle: ['test/progress-circle.test.mjs'],
  Resizable: ['test/heavy-components.test.mjs'],
  SelectNative: ['test/select-native.test.mjs'],
  Text: ['test/text.test.mjs'],
  TextEditor: ['test/heavy-components.test.mjs'],
});

function sourceRoute(record) {
  const source = record.source ?? '';
  if (source.endsWith('/supplemental/index.mjs')) return ['test/supplemental.test.mjs'];
  const sourceName = source.split('/').at(-1)?.replace(/\.mjs$/u, '');
  return SOURCE_ROUTES[sourceName] ?? [];
}

export function componentTestRoute(record) {
  const route = [...(FAMILY_ROUTES[record.family] ?? []), ...sourceRoute(record)];
  if (route.length === 0) {
    throw new Error(`MUXUI_COMPONENT_TEST_ROUTE_MISSING: ${record.family} (${record.source ?? 'no source'})`);
  }
  return [...new Set(route)];
}

/** Resolve existing behavioral test groups for canonical component records. */
export function selectComponentTestFiles(records, availableFiles) {
  const available = new Set(availableFiles);
  const selected = new Set();
  for (const record of records) {
    const route = componentTestRoute(record);
    const missing = route.filter((file) => !available.has(file));
    if (missing.length > 0) {
      throw new Error(`MUXUI_COMPONENT_TEST_ROUTE_FILE_MISSING: ${record.family}: ${missing.join(', ')}`);
    }
    route.forEach((file) => selected.add(file));
  }
  const missingShared = SHARED_TESTS.filter((file) => !available.has(file));
  if (missingShared.length > 0) {
    throw new Error(`MUXUI_COMPONENT_TEST_SHARED_FILE_MISSING: ${missingShared.join(', ')}`);
  }
  SHARED_TESTS.forEach((file) => selected.add(file));
  return [...selected].sort();
}

