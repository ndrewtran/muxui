/**
 * The committed web.react API projections (Decision 0031): one
 * packages/react/api/<slug>.json per moved component, extracted from tsc's
 * emitted declarations and the component's executable source. Never authored;
 * the catalog compiler merges each into its component's web.react binding,
 * and React generation reads the merged record the same way.
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DERIVED_API_SCHEMA, mergeDerivedApis, validateDerivedApi } from '@muxui/schema';
import { extractApis } from './extract.mjs';

/** The components whose web.react API is derived from their TypeScript source. */
export const DERIVED_API_COMPONENTS = Object.freeze([
  { slug: 'button', name: 'Button', source: 'packages/react/src/button.ts' },
  { slug: 'icon-button', name: 'IconButton', source: 'packages/react/src/supplemental/icon-button.ts' },
  { slug: 'select-native', name: 'SelectNative', source: 'packages/react/src/supplemental/select-native.ts' },
  { slug: 'image', name: 'Image', source: 'packages/react/src/supplemental/image.ts' },
  // A compound: its API is that of Avatar.Root, the part the binding's root renders.
  { slug: 'avatar', name: 'Avatar', part: 'Root', source: 'packages/react/src/supplemental/avatar.ts' },
  { slug: 'message', name: 'Message', source: 'packages/react/src/supplemental/message.ts' },
  { slug: 'activity', name: 'Activity', source: 'packages/react/src/supplemental/activity.ts' },
  { slug: 'data-diff', name: 'DataDiff', source: 'packages/react/src/supplemental/data-diff.ts' },
  { slug: 'checkbox', name: 'Checkbox', source: 'packages/react/src/components.ts' },
  { slug: 'separator', name: 'Separator', source: 'packages/react/src/components.ts' },
  { slug: 'disclosure-group', name: 'DisclosureGroup', source: 'packages/react/src/components.ts' },
  { slug: 'group', name: 'Group', source: 'packages/react/src/components.ts' },
  { slug: 'progress-bar', name: 'ProgressBar', source: 'packages/react/src/components.ts' },
  { slug: 'meter', name: 'Meter', source: 'packages/react/src/components.ts' },
  { slug: 'link', name: 'Link', source: 'packages/react/src/components.ts' },
  { slug: 'disclosure', name: 'Disclosure', source: 'packages/react/src/components.ts' },
  { slug: 'toggle-button', name: 'ToggleButton', source: 'packages/react/src/components.ts' },
  { slug: 'breadcrumbs', name: 'Breadcrumbs', source: 'packages/react/src/components.ts' },
  { slug: 'resizable', name: 'Resizable', source: 'packages/react/src/supplemental/resizable.ts' },
  { slug: 'file-trigger', name: 'FileTrigger', source: 'packages/react/src/overlays.ts' },
  { slug: 'drop-zone', name: 'DropZone', source: 'packages/react/src/overlays.ts' },
  { slug: 'tooltip', name: 'Tooltip', source: 'packages/react/src/overlays.ts' },
  { slug: 'preview-trigger', name: 'PreviewTrigger', source: 'packages/react/src/overlays.ts' },
  { slug: 'popover', name: 'Popover', source: 'packages/react/src/overlays.ts' },
  { slug: 'toast', name: 'Toast', source: 'packages/react/src/overlays.ts' },
  { slug: 'dialog', name: 'Dialog', source: 'packages/react/src/overlays.ts' },
  { slug: 'form', name: 'Form', source: 'packages/react/src/fields.ts' },
  { slug: 'number-field', name: 'NumberField', source: 'packages/react/src/fields.ts' },
  { slug: 'checkbox-group', name: 'CheckboxGroup', source: 'packages/react/src/fields.ts' },
  { slug: 'switch', name: 'Switch', source: 'packages/react/src/fields.ts' },
  { slug: 'date-field', name: 'DateField', source: 'packages/react/src/fields.ts' },
  { slug: 'time-field', name: 'TimeField', source: 'packages/react/src/fields.ts' },
  { slug: 'date-picker', name: 'DatePicker', source: 'packages/react/src/fields.ts' },
  { slug: 'date-range-picker', name: 'DateRangePicker', source: 'packages/react/src/fields.ts' },
  { slug: 'text-field', name: 'TextField', source: 'packages/react/src/fields.ts' },
  { slug: 'search-field', name: 'SearchField', source: 'packages/react/src/fields.ts' },
  { slug: 'autocomplete', name: 'Autocomplete', source: 'packages/react/src/fields.ts' },
  { slug: 'markdown', name: 'Markdown', source: 'packages/react/src/markdown/index.ts' },
  { slug: 'code-block', name: 'CodeBlock', source: 'packages/react/src/supplemental/code-block.ts' },
  // Lightbox is flat exports, so its API is that of the root, Lightbox itself.
  { slug: 'lightbox', name: 'Lightbox', source: 'packages/react/src/supplemental/lightbox.ts' },
  { slug: 'color-swatch', name: 'ColorSwatch', source: 'packages/react/src/color-swatch.ts' },
  { slug: 'color-wheel', name: 'ColorWheel', source: 'packages/react/src/color-wheel.ts' },
  { slug: 'color-slider', name: 'ColorSlider', source: 'packages/react/src/color-slider.ts' },
  { slug: 'color-picker', name: 'ColorPicker', source: 'packages/react/src/color-picker.ts' },
  { slug: 'color-area', name: 'ColorArea', source: 'packages/react/src/color-area.ts' },
  { slug: 'color-field', name: 'ColorField', source: 'packages/react/src/color-field.ts' },
  { slug: 'calendar', name: 'Calendar', source: 'packages/react/src/calendar.ts' },
  { slug: 'range-calendar', name: 'RangeCalendar', source: 'packages/react/src/calendar.ts' },
  { slug: 'toolbar', name: 'Toolbar', source: 'packages/react/src/toolbar.ts' },
  { slug: 'toggle-button-group', name: 'ToggleButtonGroup', source: 'packages/react/src/toggle-button-group.ts' },
  { slug: 'slider', name: 'Slider', source: 'packages/react/src/slider.ts' },
]);

const SOURCE_ROOT = 'packages/react/src/';

function documentText(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * Each derived component's document by slug. With `declarationRoot` (the tsc
 * output directory) it extracts them; without one (--list-outputs, which runs
 * no tsc) it reads the committed files.
 */
export async function deriveApis({ packageRoot, repositoryRoot, declarationRoot, components = DERIVED_API_COMPONENTS }) {
  if (components.length === 0) return new Map();
  if (declarationRoot === undefined) {
    return new Map(await Promise.all(components.map(async ({ slug }) => [
      slug,
      validateDerivedApi(JSON.parse(await readFile(resolve(packageRoot, 'api', `${slug}.json`), 'utf8'))),
    ])));
  }
  const apis = extractApis({
    declarationRoot,
    components: components.map(({ name, part, source }) => ({
      name,
      part,
      declarations: resolve(declarationRoot, source.slice(SOURCE_ROOT.length).replace(/\.ts$/u, '.d.ts')),
      source: resolve(repositoryRoot, source),
    })),
  });
  return new Map(components.map(({ slug, name, source }) => [slug, validateDerivedApi({
    schema: DERIVED_API_SCHEMA,
    generatedFrom: source,
    component: `muxui:component:${slug}`,
    binding: 'web.react',
    export: name,
    api: apis.get(name),
  })]));
}

/** The component record with its derived web.react API merged in, when it has one. */
export function withDerivedApi(artifact, documents) {
  const document = documents.get(artifact.id.slice('muxui:component:'.length));
  return document === undefined ? artifact : mergeDerivedApis(artifact, { 'web.react': document });
}

/** Writes packages/react/api/ (or, when `checking`, fails on any drift), holding exactly `documents`. */
export async function syncDerivedApis({ packageRoot, documents, checking }) {
  const directory = resolve(packageRoot, 'api');
  const expected = new Map([...documents].map(([slug, document]) => [`${slug}.json`, documentText(document)]));
  const present = await readdir(directory).catch(() => []);
  if (checking) {
    for (const [name, text] of expected) {
      if (await readFile(resolve(directory, name), 'utf8').catch(() => null) !== text) {
        throw new Error(`MUXUI_REACT_GENERATED_DRIFT: api/${name}`);
      }
    }
    const unexpected = present.filter((name) => !expected.has(name));
    if (unexpected.length > 0) throw new Error(`MUXUI_REACT_GENERATED_DRIFT: api/${unexpected[0]} is not a derived API output`);
    return;
  }
  if (expected.size > 0) await mkdir(directory, { recursive: true });
  for (const [name, text] of expected) await writeFile(resolve(directory, name), text);
  for (const name of present.filter((entry) => !expected.has(entry))) await rm(resolve(directory, name), { recursive: true, force: true });
  if (expected.size === 0) await rm(directory, { recursive: true, force: true });
}
