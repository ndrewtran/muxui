/**
 * Who owns each public export, for the declaration reference. It builds on the family facts that already
 * exist (the generated contract's slugs, export names, runtime sources and modules; the supplemental
 * mapping behind them) and keeps no second registry of families. A public item is keyed by its entry point
 * and export name, and gets exactly one owner:
 *
 * 1. an explicit exception below, each with its reason, for what no family owns or what several share;
 * 2. the family that owns the whole entry point, for a subpath family (`./text-editor`, `./markdown`);
 * 3. the family whose export name is the item's name (`Dialog`);
 * 4. the one family the item's declaration file ships (`virtualizer.d.ts` is Virtualizer's alone);
 * 5. the family with the longest export name that prefixes the item's name (`CheckboxGroupProps` is
 *    CheckboxGroup's, not Checkbox's), among the families that file can hold.
 *
 * An item no rule reaches fails with the item named, and an exception that a rule already settles is
 * stale and fails too, so the table cannot drift from the code it describes.
 */
import { ReferenceReadError } from './errors.mjs';

/** The owner of types several families share. */
export const SHARED = 'shared';
/** The owner of exports that belong to the package and to no component. */
export const PACKAGE_LEVEL = 'package-level';

const group = (owner, reason, ...names) => Object.fromEntries(names.map((name) => [name, { owner, reason }]));

/** Items no rule above settles, by entry point and export name. */
export const OWNER_EXCEPTIONS = Object.freeze({
  '.': Object.freeze({
    ...group(SHARED, 'the field families share these control, label and validation types', 'ControlSize', 'FieldInputProps', 'FieldValidationProps', 'NamedFieldProps', 'MuxUIAccessibleName', 'MuxUIAriaAccessibleName', 'MuxUIAriaLabel', 'MuxUIDateRange', 'MuxUIDateValue', 'MuxUITimeValue', 'MuxUIValidationErrors'),
    ...group(SHARED, 'the collection families share these item and selection types', 'MuxUICollectionItem', 'MuxUIItems', 'MuxUISelection', 'CollectionProps'),
    ...group(SHARED, 'the colour families share these colour value types', 'MuxUIColorChannel', 'MuxUIColorSpace', 'MuxUIColorValue'),
    ...group(SHARED, 'the overlay families share these placement and accessible-name types', 'MuxUIPlacement', 'OverlayAccessibleName'),
    ...group(SHARED, 'a button-derived pointer type that other families re-export', 'ComponentPointerType'),
    ...group(SHARED, 'helper types of the supplemental declarations that several supplemental families use', 'PartProps', 'SupplementalActivation', 'SupplementalFieldProps'),
    ...group('drop-zone', 'the drop item and event types are the DropZone API', 'MuxUIDirectoryDropItem', 'MuxUIDropActivateEvent', 'MuxUIDropEvent', 'MuxUIDropItem', 'MuxUIDropOperation', 'MuxUIFileDropItem', 'MuxUITextDropItem'),
    ...group('breadcrumbs', 'the item type of Breadcrumbs, whose name is the singular of the family name', 'BreadcrumbItem'),
    ...group('command-palette', 'the hook and its option and result types belong to CommandPalette', 'useCommandPalette', 'UseCommandPaletteOptions', 'UseCommandPaletteReturn'),
    ...group('toast', 'the hook that reaches the toast manager of ToastProvider', 'useToast'),
    ...group(PACKAGE_LEVEL, 'the compatibility record of the package, not a component', 'reactCompatibility'),
    ...group(PACKAGE_LEVEL, 'the list of supplemental family names, not a component', 'supplementalFamilies'),
  }),
  './themes': Object.freeze(group(PACKAGE_LEVEL, 'theme presets belong to the package, not to a component family',
    'MUXUI_DEFAULT_THEME_PRESET_ID', 'MUXUI_THEME_PRESETS', 'MUXUI_THEME_PRESETS_BY_ID', 'MuxUIMonochromeThemeId', 'MuxUIStandardThemeId', 'MuxUIThemeCollection', 'MuxUIThemeId', 'MuxUIThemePreset', 'MuxUIThemeSwatch')),
});

/**
 * @param {object} options
 * @param {readonly { key: string, exports: readonly { name: string, type?: string, value?: string }[] }[]} options.entries The graph's entry points.
 * @param {readonly { slug: string, exportName: string, source: string, module: string }[]} options.families The package's families.
 * @param {ReadonlyMap<string, string>} options.sources The source each declaration module was generated from.
 * @param {Readonly<Record<string, Readonly<Record<string, { owner: string, reason: string }>>>>} [options.exceptions]
 * @returns {Map<string, { owner: string, reason?: string, rule: string }>} By `<entry>\0<name>`.
 */
export function assignOwners({ entries, families, sources, exceptions = OWNER_EXCEPTIONS }) {
  const bySource = new Map();
  for (const family of families) bySource.set(family.source, [...(bySource.get(family.source) ?? []), family]);
  const slugs = new Set(families.map(({ slug }) => slug));
  const owners = new Map();
  const unowned = [];
  const used = new Set();

  // The family the rules give an item, or undefined when only an exception can.
  function settle(entry, wholesale, item, module) {
    if (wholesale !== undefined) return { owner: wholesale.slug, rule: 'entry' };
    if (entry.key !== '.') return undefined;
    const exact = families.find((family) => family.exportName === item.name);
    if (exact) return { owner: exact.slug, rule: 'name' };
    const shipped = bySource.get(sources.get(module)) ?? [];
    if (shipped.length === 1) return { owner: shipped[0].slug, rule: 'file' };
    const prefixed = families
      .filter((family) => item.name.startsWith(family.exportName) && (shipped.length === 0 || shipped.some(({ slug }) => slug === family.slug)))
      .sort((left, right) => right.exportName.length - left.exportName.length)[0];
    return prefixed ? { owner: prefixed.slug, rule: 'prefix' } : undefined;
  }

  for (const entry of entries) {
    const wholesale = families.find((family) => family.module === entry.key && family.module !== '.');
    for (const item of entry.exports) {
      const key = `${entry.key}\0${item.name}`;
      const module = (item.type ?? item.value).split('#')[0];
      const exception = exceptions[entry.key]?.[item.name];
      const settled = settle(entry, wholesale, item, module);
      if (exception !== undefined) {
        used.add(key);
        if (settled !== undefined) throw new ReferenceReadError('OWNERSHIP', `${entry.key} ${item.name}`, `the exception is stale: the ${settled.rule} rule already gives ${settled.owner}`);
        if (exception.owner !== SHARED && exception.owner !== PACKAGE_LEVEL && !slugs.has(exception.owner)) {
          throw new ReferenceReadError('OWNERSHIP', `${entry.key} ${item.name}`, `the exception names ${exception.owner}, which is not a family`);
        }
        owners.set(key, { owner: exception.owner, reason: exception.reason, rule: 'exception' });
      } else if (settled === undefined) {
        unowned.push(`${entry.key} ${item.name}`);
      } else {
        owners.set(key, settled);
      }
    }
  }
  if (unowned.length > 0) {
    throw new ReferenceReadError('OWNERSHIP', 'ownership', `${unowned.length} public exports have no owner; give each a family rule or an exception with its reason: ${unowned.join(', ')}`);
  }
  const stale = Object.entries(exceptions).flatMap(([entry, names]) => Object.keys(names).filter((name) => !used.has(`${entry}\0${name}`)).map((name) => `${entry} ${name}`));
  if (stale.length > 0) throw new ReferenceReadError('OWNERSHIP', 'ownership', `exceptions for exports that no longer exist: ${stale.join(', ')}`);
  return owners;
}
