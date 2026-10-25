import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';
import { build } from 'vite';

const packageRoot = resolve(import.meta.dirname, '..');
const generated = resolve(packageRoot, 'generated');

// Disclosure is the one component in components.ts wrapped in a pure-annotated function. A plain
// forwardRef followed by `displayName = ...` is kept by a bundler even when nothing uses it, and
// would pull in Disclosure's motion modules for a consumer that imports another component.
test('tsc keeps the pure annotation on Disclosure\'s wrapper', () => {
  const emitted = readFileSync(resolve(generated, 'components.js'), 'utf8');
  assert.match(emitted, /^export const Disclosure = \/\*#__PURE__\*\/ \(\(\) => \{$/mu);
});

/** The package modules a bundle of `import { <name> } from <module>` keeps, as paths under generated/ with the bytes each renders. */
async function bundledModuleSizes(name, module = 'components.js') {
  mkdirSync(resolve(packageRoot, 'build'), { recursive: true });
  const directory = mkdtempSync(join(packageRoot, 'build', 'tree-shaking-'));
  try {
    const entry = join(directory, 'entry.mjs');
    writeFileSync(entry, `export { ${name} } from '${relative(directory, resolve(generated, module)).replaceAll('\\', '/')}';\n`);
    const bundle = await build({
      root: directory,
      configFile: false,
      logLevel: 'silent',
      build: {
        write: false,
        minify: false,
        lib: { entry, formats: ['es'], fileName: 'bundle' },
        // Packages are not under test: only which of the package's own modules the bundle keeps.
        rollupOptions: { external: [/^[^./]/u] },
      },
    });
    return [bundle].flat().flatMap(({ output }) => output)
      .filter(({ type }) => type === 'chunk')
      .flatMap(({ modules }) => Object.entries(modules))
      .filter(([, { renderedLength }]) => renderedLength > 0)
      .map(([id, { renderedLength }]) => [relative(generated, id).replaceAll('\\', '/'), renderedLength]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** The package modules a bundle of `import { <name> } from <module>` keeps, as paths under generated/. */
async function bundledModules(name, module = 'components.js') {
  return (await bundledModuleSizes(name, module)).map(([id]) => id);
}

test('a bundle that uses another component from components.js drops Disclosure and its motion modules', async () => {
  // The package marks only its stylesheets as side effects, so an unused module is dropped whole.
  assert.deepEqual(JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')).sideEffects, ['*.css']);
  const separatorOnly = await bundledModules('Separator');
  assert.ok(separatorOnly.includes('components.js'));
  assert.equal(separatorOnly.includes('motion-components.mjs'), false);
  // The control: using Disclosure keeps the motion module its panel needs.
  const withDisclosure = await bundledModules('Disclosure');
  assert.ok(withDisclosure.includes('components.js') && withDisclosure.includes('motion-components.mjs'));
});

// Dialog (a pure-annotated wrapper) and Popover (a pure-annotated forwardRef) are the two overlays
// whose motion modules only they need. Without the annotation, a bundler keeps both whenever any
// overlay is imported, for the same reason as Disclosure above.
test('tsc keeps the pure annotation on Dialog\'s wrapper and Popover\'s forwardRef', () => {
  const emitted = readFileSync(resolve(generated, 'overlays.js'), 'utf8');
  assert.match(emitted, /^export const Dialog = \/\*#__PURE__\*\/ \(\(\) => \{$/mu);
  assert.match(emitted, /^export const Popover = \/\*#__PURE__\*\/ React\.forwardRef\(/mu);
  assert.match(emitted, /^const PopupContent = \/\*#__PURE__\*\/ React\.forwardRef\(/mu);
});

test('a bundle that uses another overlay drops Dialog, Popover, and their motion modules', async () => {
  const tooltipOnly = await bundledModules('Tooltip', 'overlays.js');
  assert.ok(tooltipOnly.includes('overlays.js'));
  assert.equal(tooltipOnly.includes('dialog-motion.mjs'), false);
  assert.equal(tooltipOnly.includes('popover-motion.mjs'), false);
  // The controls: using Dialog keeps the modal motion, and using Popover keeps the popover motion.
  const withDialog = await bundledModules('Dialog', 'overlays.js');
  assert.ok(withDialog.includes('dialog-motion.mjs'));
  assert.equal(withDialog.includes('popover-motion.mjs'), false);
  const withPopover = await bundledModules('Popover', 'overlays.js');
  assert.ok(withPopover.includes('popover-motion.mjs'));
  assert.equal(withPopover.includes('dialog-motion.mjs'), false);
});

// Switch, DatePicker, DateRangePicker, and Autocomplete are wrapped in a pure-annotated function, and
// two module-level values carry the annotation too. Without it, a bundler keeps the motion modules
// they reach whenever any field is imported.
test('tsc keeps the pure annotations in fields.js', () => {
  const emitted = readFileSync(resolve(generated, 'fields.js'), 'utf8');
  for (const name of ['Switch', 'DatePicker', 'DateRangePicker', 'Autocomplete']) {
    assert.match(emitted, new RegExp(`^export const ${name} = \\/\\*#__PURE__\\*\\/ \\(\\(\\) => \\{$`, 'mu'), name);
  }
  assert.match(emitted, /^const TIME_PLACEHOLDER = \/\*#__PURE__\*\/ parseTime\(/mu);
  assert.match(emitted, /^const MUX_RUNTIME_SCOPE_SELECTOR = \/\*#__PURE__\*\/ \[/mu);
});

test('a bundle that uses one field keeps only the motion modules that field needs', async () => {
  const MOTION = ['calendar-height-motion.mjs', 'date-popover-motion.mjs', 'motion-components.mjs', 'motion-geometry.mjs', 'motion.mjs', 'popover-motion.mjs', 'range-selection-motion.mjs'];
  const motionKept = async (name) => (await bundledModules(name, 'fields.js')).filter((module) => MOTION.includes(module)).sort();
  for (const name of ['TextField', 'SearchField', 'NumberField', 'CheckboxGroup', 'Form', 'DateField', 'TimeField']) {
    assert.deepEqual(await motionKept(name), [], name);
  }
  assert.deepEqual(await motionKept('Switch'), ['motion-geometry.mjs', 'motion.mjs']);
  const dateMotion = ['calendar-height-motion.mjs', 'date-popover-motion.mjs', 'motion-geometry.mjs', 'motion.mjs', 'range-selection-motion.mjs'];
  assert.deepEqual(await motionKept('DatePicker'), dateMotion);
  assert.deepEqual(await motionKept('DateRangePicker'), dateMotion);
  assert.deepEqual(await motionKept('Autocomplete'), ['motion-components.mjs', 'motion-geometry.mjs', 'motion.mjs', 'popover-motion.mjs']);
});

// collections.mjs re-exports one module per collections family. Fourteen of the 24 families are a
// pure-annotated wrapper (the rest are a bare forwardRef with `displayName` beside it), so a bundler
// that ignores the package's sideEffects flag still drops the motion modules of an unused family.
test('the collections family modules keep the pure annotation on each wrapper', () => {
  const wrappers = {
    'calendar.js': ['Calendar', 'RangeCalendar'],
    'combo-box.js': ['ComboBox'],
    'grid-list.js': ['GridList'],
    'list-box.js': ['ListBox'],
    'menu.js': ['Menu'],
    'radio-group.js': ['RadioGroup'],
    'select.js': ['Select'],
    'tabs.js': ['Tabs'],
    'toggle-button-group.js': ['ToggleButtonGroup'],
    'tree.js': ['Tree'],
    'color-slider.js': ['ColorSlider'],
    'color-wheel.js': ['ColorWheel'],
    'slider.js': ['Slider'],
  };
  for (const [module, names] of Object.entries(wrappers)) {
    const emitted = readFileSync(resolve(generated, module), 'utf8');
    for (const name of names) {
      // The source writes `/* @__PURE__ */` or `/*#__PURE__*/`, and tsc keeps it as written.
      assert.match(emitted, new RegExp(`^export const ${name} = /\\*\\s*[#@]__PURE__\\s*\\*/ \\(\\(\\) => \\{$`, 'mu'), `${module}: ${name}`);
    }
  }
  // tsc indents the wrapper's body by four spaces.
  assert.match(readFileSync(resolve(generated, 'menu.js'), 'utf8'), /^ {4}const MenuPopup = \/\*#__PURE__\*\/ React\.forwardRef\(function MenuPopup/mu);
});

test('a bundle that uses one collections family keeps its own module and only the motion modules it needs', async () => {
  const pageMotion = ['motion-geometry.mjs', 'motion.mjs'];
  const popupMotion = ['motion-components.mjs', 'popover-motion.mjs', ...pageMotion];
  const calendarMotion = ['calendar-height-motion.mjs', 'calendar-selection-motion.mjs', 'range-selection-motion.mjs', ...pageMotion];
  const motionKept = {
    Calendar: calendarMotion,
    RangeCalendar: calendarMotion,
    ColorSlider: ['color-slider-motion.mjs', ...pageMotion],
    ColorWheel: ['color-wheel-motion.mjs', ...pageMotion],
    ListBox: ['listbox-motion.mjs', ...pageMotion],
    GridList: ['grid-list-item-context.mjs', 'grid-list-motion.mjs', ...pageMotion],
    Menu: ['menu-motion.mjs', 'overlay-positioning.mjs', ...popupMotion],
    ComboBox: popupMotion,
    Select: ['overlay-positioning.mjs', ...popupMotion],
    RadioGroup: ['radio-motion.mjs', ...pageMotion],
    Slider: ['slider-motion.mjs', ...pageMotion],
    Tabs: ['tabs-motion.mjs', ...pageMotion],
    ToggleButtonGroup: ['toggle-button-context.mjs', 'toggle-button-group-motion.mjs', ...pageMotion],
    Tree: ['tree-motion.mjs', ...pageMotion],
  };
  // Every motion module and motion context in generated/; choice-context is shared form plumbing and is left out.
  const motionModules = new Set(readdirSync(generated).filter((name) => /(?:^|-)motion(?:-[\w-]+)?\.mjs$|^(?:grid-list-item|toggle-button)-context\.mjs$|^overlay-positioning\.mjs$/u.test(name)));
  // The family modules are the barrel's re-export targets, and each name's module is its owner.
  const owners = new Map();
  for (const [, names, module] of readFileSync(resolve(generated, 'collections.mjs'), 'utf8').matchAll(/^export \{ ([^}]+) \} from '\.\/([\w-]+\.m?js)';$/gmu)) {
    for (const name of names.split(', ')) owners.set(name, module);
  }
  assert.equal(owners.size, 24);
  const familyModules = new Set(owners.values());
  assert.equal(familyModules.size, 23);
  for (const [name, owner] of owners) {
    const kept = await bundledModules(name, 'collections.mjs');
    // No other family's code comes along, which is what one module per family buys over one file.
    assert.deepEqual(kept.filter((module) => familyModules.has(module)), [owner], name);
    assert.deepEqual(kept.filter((module) => motionModules.has(module)).sort(), [...(motionKept[name] ?? [])].sort(), name);
  }
});

// Both calendars live in calendar.js, so either one keeps the module, the icon button its month buttons use,
// and the three calendar motion modules. Through the barrel, a bundle keeps exactly these package modules.
test('a bundle that uses Calendar or RangeCalendar keeps its own module, the icon button, and the calendar motion modules', async () => {
  const kept = ['button.js', 'calendar-height-motion.mjs', 'calendar-selection-motion.mjs', 'calendar.js', 'control-utils.js', 'icon-button.js', 'motion-geometry.mjs', 'motion.mjs', 'range-selection-motion.mjs'];
  for (const name of ['Calendar', 'RangeCalendar']) {
    assert.deepEqual((await bundledModules(name, 'collections.mjs')).sort(), kept, name);
  }
});

// ListBox keeps its own module, the item helpers it normalizes with, the shared class and name helper, and its selection
// motion. Through the barrel or the index, a bundle keeps exactly these package modules and no other family's.
test('a bundle that uses ListBox keeps its own module, the collection item helpers, and the list motion modules', async () => {
  const kept = ['collection-items.js', 'control-utils.js', 'list-box.js', 'listbox-motion.mjs', 'motion-geometry.mjs', 'motion.mjs'];
  assert.deepEqual((await bundledModules('ListBox', 'collections.mjs')).sort(), kept);
  assert.deepEqual((await bundledModules('ListBox', 'index.mjs')).sort(), kept);
});

// Menu keeps its own module, the item helpers it normalizes with, the trigger it renders, the shared class and name helper,
// and its menu and popup motion. Through the barrel or the index, a bundle keeps exactly these package modules and no
// other family's, which the three contexts and the geometry constant at the module's top level must not change.
test('a bundle that uses Menu keeps its own module, the collection helpers, and the menu and popup motion modules', async () => {
  const kept = ['collection-items.js', 'collection-trigger.js', 'control-utils.js', 'menu-motion.mjs', 'menu.js', 'motion-components.mjs', 'motion-geometry.mjs', 'motion.mjs', 'overlay-positioning.mjs', 'popover-motion.mjs'];
  assert.deepEqual((await bundledModules('Menu', 'collections.mjs')).sort(), kept);
  assert.deepEqual((await bundledModules('Menu', 'index.mjs')).sort(), kept);
});

// Select keeps its own module, the item helpers it normalizes with, the trigger it renders, the shared class and name helper,
// the choice size and overlay geometry helpers, and the popup motion. Through the barrel or the index, a bundle keeps exactly
// these package modules and no other family's, which the context and the geometry constant at the module's top level must not change.
test('a bundle that uses Select keeps its own module, the collection helpers, and the popup motion modules', async () => {
  const kept = ['choice-context.mjs', 'collection-items.js', 'collection-trigger.js', 'control-utils.js', 'motion-components.mjs', 'motion-geometry.mjs', 'motion.mjs', 'overlay-positioning.mjs', 'popover-motion.mjs', 'select.js'];
  assert.deepEqual((await bundledModules('Select', 'collections.mjs')).sort(), kept);
  assert.deepEqual((await bundledModules('Select', 'index.mjs')).sort(), kept);
});

// ComboBox keeps its own module, the item helper it normalizes with, the icon button its trigger renders, the shared class and name
// helper, the choice size helper, and the popup motion. Through the barrel or the index, a bundle keeps exactly these package modules.
test('a bundle that uses ComboBox keeps its own module, the collection helper, the icon button, and the popup motion modules', async () => {
  const kept = ['button.js', 'choice-context.mjs', 'collection-items.js', 'combo-box.js', 'control-utils.js', 'icon-button.js', 'motion-components.mjs', 'motion-geometry.mjs', 'motion.mjs', 'popover-motion.mjs'];
  assert.deepEqual((await bundledModules('ComboBox', 'collections.mjs')).sort(), kept);
  assert.deepEqual((await bundledModules('ComboBox', 'index.mjs')).sort(), kept);
});

// The color families share three modules, and each takes only the ones it uses: a swatch needs no read-only
// guard and a picker no motion. Through the barrel, a bundle keeps exactly these package modules.
test('a bundle that uses one color family keeps its own module and only the shared and motion modules it needs', async () => {
  const wheel = ['color-context.js', 'color-wheel-motion.mjs', 'color-wheel.js', 'control-utils.js', 'motion-geometry.mjs', 'motion.mjs', 'read-only-guard.js'];
  const slider = ['color-context.js', 'color-slider-motion.mjs', 'color-slider.js', 'control-utils.js', 'motion-geometry.mjs', 'motion.mjs', 'read-only-guard.js'];
  const kept = {
    ColorArea: ['color-area.js', 'color-context.js', 'control-utils.js', 'read-only-guard.js'],
    ColorField: ['choice-context.mjs', 'color-context.js', 'color-field.js', 'control-utils.js'],
    ColorPicker: ['color-context.js', 'color-picker.js', 'control-utils.js'],
    ColorSlider: slider,
    ColorSwatch: ['color-context.js', 'color-swatch.js', 'control-utils.js'],
    ColorWheel: wheel,
  };
  for (const [name, expected] of Object.entries(kept)) {
    assert.deepEqual((await bundledModules(name, 'collections.mjs')).sort(), expected, name);
  }
});

// The control families share control-utils, and each takes only the other shared and motion modules it uses:
// a toolbar needs nothing else, and no bundle pulls in another family's module.
test('a bundle that uses one control family keeps its own module and only the shared and motion modules it needs', async () => {
  const kept = {
    RadioGroup: ['choice-context.mjs', 'control-utils.js', 'motion-geometry.mjs', 'motion.mjs', 'radio-group.js', 'radio-motion.mjs'],
    Slider: ['control-utils.js', 'motion-geometry.mjs', 'motion.mjs', 'read-only-guard.js', 'slider-motion.mjs', 'slider.js'],
    TokenField: ['control-utils.js', 'token-field.js'],
    ToggleButtonGroup: ['control-utils.js', 'motion-geometry.mjs', 'motion.mjs', 'toggle-button-context.mjs', 'toggle-button-group-motion.mjs', 'toggle-button-group.js'],
    Toolbar: ['control-utils.js', 'toolbar.js'],
  };
  for (const [name, expected] of Object.entries(kept)) {
    assert.deepEqual((await bundledModules(name, 'collections.mjs')).sort(), expected, name);
  }
});

// supplemental.mjs re-exports one module per family. Before the split every export kept the whole barrel and the 14
// modules it reaches, about 112 KB, because a family that is an object literal or a forwardRef call is kept whenever
// its module is. Now a family keeps its own module, the helpers it imports and what it already needed. The three
// wrappers that are an immediately invoked function, the three field factories and the two modal wrappers carry the
// pure annotation that lets a bundler drop what no export uses; the TypeScript families are checked by the bundle test below.
test('the supplemental modules keep the pure annotation on each wrapper', () => {
  const emitted = (module) => {
    const mjs = resolve(generated, `${module}.mjs`);
    return readFileSync(existsSync(mjs) ? mjs : resolve(generated, `${module}.js`), 'utf8');
  };
  // The source writes `/* @__PURE__ */` or `/*#__PURE__*/`, and tsc keeps it as written.
  const pure = String.raw`\/\*\s*[#@]__PURE__\s*\*\/`;
  for (const [module, name] of [['command-palette', 'CommandPalette']]) {
    assert.match(emitted(module), new RegExp(`^export const ${name} = ${pure} \\(\\(\\) => \\(\\{$`, 'mu'), `${module}: ${name}`);
  }
  for (const [module, name] of [['checkbox-field', 'CheckboxField'], ['radio-field', 'RadioField'], ['switch-field', 'SwitchField']]) {
    assert.match(emitted(module), new RegExp(`^export const ${name} = ${pure} make${name}\\(\\);$`, 'mu'), `${module}: ${name}`);
  }
  for (const wrapper of ['MotionModalBackdrop', 'MotionModalPopup']) {
    assert.match(emitted('modal-parts'), new RegExp(`^export const ${wrapper}ForwardRef = ${pure} React\\.forwardRef\\(${wrapper}\\);$`, 'mu'), wrapper);
  }
});

// The package marks only its stylesheets as side effects, so a bundler drops an unused module whole before it looks at a single call,
// which hides the families' constructors. To see them, the emitted modules are copied out of the package, where that marking does not
// apply, and bundled with every module's side effects retained and its packages left external. Nothing is used but a sentinel, so a
// forwardRef call that survives is one a bundler must keep: an unmarked construction, or the Object.freeze that holds the parts.
// Using the family instead keeps every constructor it builds, which shows the count reads the emitted spelling and that the family was
// bundled at all, so a skipped or externalised module cannot pass the first check by being empty. The number is the family's forwardRef calls.
// A family that imports a module still unmarked (Button) keeps that module's constructor too in this copy, so an optional
// fourth entry names those imports, and their bare constructors are counted first and added to both expectations.
const annotatedFamilies = [
  ['card', 'Card', 5, ['button']],
  ['header-nav', 'HeaderNav', 5, ['icon-button']],
  // Nine parts, and the two modal-parts wrappers its Backdrop and Popup use, which are marked and so are kept only with them.
  ['alert-dialog', 'AlertDialog', 11, ['button', 'icon-button']],
  // Eleven parts, and the nine constructors of the Menu it draws and the one of the Tooltip, which are marked and so are kept only with them.
  ['sidebar', 'Sidebar', 21, ['icon-button', 'menu', 'overlays']],
  ['button-group', 'ButtonGroup', 1],
  ['color-mode-toggle', 'ColorModeToggle', 1],
  ['progress-circle', 'ProgressCircle', 4],
  ['input-tags', 'InputTags', 1],
  // Two parts, and the constructor of the popover motion wrapper its list opens in, which is marked and so is kept only with it.
  ['multi-select', 'MultiSelect', 3],
  // The same two parts and the popover motion wrapper, and the unmarked constructor of the IconButton its tags remove with.
  ['tag-select', 'TagSelect', 3, ['icon-button']],
  ['payment-input', 'PaymentInput', 7],
  ['checkbox-field', 'CheckboxField', 5],
  ['switch-field', 'SwitchField', 5],
  ['radio-field', 'RadioField', 6],
  ['input', 'Input', 5],
  ['text-area', 'TextArea', 5],
];

test('a bundle that uses nothing from a TypeScript supplemental family keeps none of its forwardRef calls, and one that uses it keeps them all', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'muxui-tree-shaking-'));
  try {
    for (const file of readdirSync(generated)) if (/\.m?js$/u.test(file)) copyFileSync(resolve(generated, file), join(directory, file));
    const retainedConstructors = async (entryText) => {
      const entry = join(directory, 'entry.mjs');
      writeFileSync(entry, entryText);
      const bundle = await build({
        root: directory,
        configFile: false,
        logLevel: 'silent',
        build: { write: false, minify: false, lib: { entry, formats: ['es'], fileName: 'bundle' }, rollupOptions: { external: [/^[^./]/u], treeshake: { moduleSideEffects: true } } },
      });
      const code = [bundle].flat().flatMap(({ output }) => output).filter(({ type }) => type === 'chunk').map((chunk) => chunk.code).join('\n');
      return code.match(/forwardRef\(/gu)?.length ?? 0;
    };
    for (const [module, name, constructors, imports = []] of annotatedFamilies) {
      const imported = await retainedConstructors(`${imports.map((file) => `import './${file}.js';\n`).join('')}export const sentinel = 1;\n`);
      assert.equal(await retainedConstructors(`import './${module}.js';\nexport const sentinel = 1;\n`), imported, `${name} keeps a forwardRef call nothing uses`);
      assert.equal(await retainedConstructors(`export { ${name} } from './${module}.js';\n`), imported + constructors, `${name} keeps the forwardRef calls it uses`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// Per export: its owning module, the helpers it may keep, and the bytes it kept before the split. The byte figure is a
// ceiling, not a target: the ownership checks are what name a leak, since a bundle's rendered size shifts by a few
// bytes with the checkout path.
const supplementalRetention = {
  ButtonGroup: { module: 'button-group', helpers: ['part-utils'], before: 111775 },
  Text: { module: 'text', helpers: ['part-utils'], before: 111775 },
  ColorModeToggle: { module: 'color-mode-toggle', helpers: ['part-utils'], before: 111775 },
  SwitchField: { module: 'switch-field', helpers: ['field-utils', 'part-utils'], before: 113269 },
  CheckboxField: { module: 'checkbox-field', helpers: ['field-utils', 'part-utils'], before: 113972 },
  TextArea: { module: 'text-area', helpers: ['field-root', 'field-utils', 'part-utils'], before: 111775 },
  ProgressCircle: { module: 'progress-circle', helpers: ['part-utils'], before: 111775 },
  useCommandPalette: { module: 'command-palette', helpers: [], before: 114805 },
  Input: { module: 'input', helpers: ['field-root', 'field-utils', 'part-utils'], before: 111779 },
  PaymentInput: { module: 'payment-input', helpers: ['field-utils', 'part-utils'], before: 111775 },
  RadioField: { module: 'radio-field', helpers: ['field-utils', 'part-utils'], before: 115764 },
  Card: { module: 'card', helpers: ['part-utils'], before: 111775 },
  InputTags: { module: 'input-tags', helpers: ['part-utils'], before: 111775 },
  HeaderNav: { module: 'header-nav', helpers: ['navigation-drawer', 'part-utils'], before: 111775 },
  AlertDialog: { module: 'alert-dialog', helpers: ['modal-parts', 'part-utils'], before: 126470 },
  MultiSelect: { module: 'multi-select', helpers: ['item-renderer', 'part-utils'], before: 120579 },
  CommandPalette: { module: 'command-palette', helpers: ['modal-parts', 'part-utils'], before: 133366 },
  TagSelect: { module: 'tag-select', helpers: ['item-renderer', 'part-utils'], before: 122879 },
  Sidebar: { module: 'sidebar', helpers: ['navigation-drawer', 'part-utils'], before: 111775 },
};

test('a bundle that uses one supplemental family keeps its own module, only the helpers it needs, and at most the bytes it kept before the split', async () => {
  const families = new Set(Object.values(supplementalRetention).map(({ module }) => module));
  const helpers = new Set(['part-utils', 'field-utils', 'field-root', 'modal-parts', 'item-renderer', 'navigation-drawer']);
  // A module keeps its name's stem when it moves from .mjs to .js.
  const stem = (id) => id.replace(/\.\w+$/u, '');
  for (const [name, { module, helpers: allowed, before }] of Object.entries(supplementalRetention)) {
    // A family in TypeScript ships as its own module and is exported from the root index; the rest come from the supplemental barrel.
    const kept = await bundledModuleSizes(name, existsSync(resolve(generated, `${module}.js`)) ? 'index.mjs' : 'supplemental.mjs');
    const stems = kept.map(([id]) => stem(id));
    // No other family's code comes along, which is what one module per family buys over one file.
    assert.deepEqual(stems.filter((candidate) => families.has(candidate)), [module], name);
    assert.deepEqual(stems.filter((candidate) => helpers.has(candidate) && !allowed.includes(candidate)), [], `${name} keeps a helper it does not use`);
    const bytes = kept.reduce((total, [, size]) => total + size, 0);
    assert.ok(bytes <= before, `${name} keeps ${bytes} bytes, more than the ${before} it kept before the split`);
  }
  // Through the root index a bundle keeps the same supplemental modules.
  for (const name of ['Text', 'ButtonGroup', 'Sidebar']) {
    const { module, helpers: allowed } = supplementalRetention[name];
    const stems = (await bundledModules(name, 'index.mjs')).map(stem).filter((candidate) => families.has(candidate) || helpers.has(candidate)).sort();
    assert.deepEqual(stems, [module, ...allowed].sort(), name);
  }
});

// TextEditor's Root self-alias is assigned after its forwardRef, so the component is built in a pure-annotated function; without
// it a bundler keeps the whole module's component, and the Button and IconButton modules it needs, for a consumer who imports only
// the document helpers. The module itself still ships (its helpers are in it).
test('tsc keeps the pure annotation on TextEditor\'s wrapper, and a bundle of its document helper drops the component', async () => {
  const emitted = readFileSync(resolve(generated, 'text-editor.js'), 'utf8');
  assert.match(emitted, /^export const TextEditor = \/\*#__PURE__\*\/ \(\(\) => \{$/mu);
  const helperOnly = await bundledModuleSizes('isTextEditorDocument', 'text-editor.js');
  const withEditor = await bundledModuleSizes('TextEditor', 'text-editor.js');
  assert.deepEqual(helperOnly.map(([id]) => id), ['text-editor.js']);
  assert.deepEqual(withEditor.map(([id]) => id).sort(), ['button.js', 'icon-button.js', 'text-editor.js']);
  const size = (sizes) => sizes.find(([id]) => id === 'text-editor.js')[1];
  assert.ok(size(helperOnly) < size(withEditor) / 2, 'the helper keeps a small part of the module');
});
