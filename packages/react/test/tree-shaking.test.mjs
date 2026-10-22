import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

/** The package modules a bundle of `import { <name> } from <module>` keeps, as paths under generated/. */
async function bundledModules(name, module = 'components.js') {
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
      .map(([id]) => relative(generated, id).replaceAll('\\', '/'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
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
    'combo-box.mjs': ['ComboBox'],
    'grid-list.mjs': ['GridList'],
    'list-box.mjs': ['ListBox'],
    'menu.mjs': ['Menu'],
    'radio-group.js': ['RadioGroup'],
    'select.mjs': ['Select'],
    'tabs.mjs': ['Tabs'],
    'toggle-button-group.js': ['ToggleButtonGroup'],
    'tree.mjs': ['Tree'],
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
  assert.match(readFileSync(resolve(generated, 'menu.mjs'), 'utf8'), /^ {2}const MenuPopup = \/\*#__PURE__\*\/ React\.forwardRef\(function MenuPopup/mu);
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
    ToggleButtonGroup: ['control-utils.js', 'motion-geometry.mjs', 'motion.mjs', 'toggle-button-context.mjs', 'toggle-button-group-motion.mjs', 'toggle-button-group.js'],
    Toolbar: ['control-utils.js', 'toolbar.js'],
  };
  for (const [name, expected] of Object.entries(kept)) {
    assert.deepEqual((await bundledModules(name, 'collections.mjs')).sort(), expected, name);
  }
});
