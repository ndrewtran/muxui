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

/**
 * The components whose web.react API is derived from their TypeScript source. An entry names
 * its export and source, and may add:
 *   - `part`: the export's part that is the root, when the root is not the export itself;
 *   - `parts`: each other anatomy part that owns Mux UI props, mapped to its export member
 *     (`{ item: 'Item' }`), which becomes that part's entry in `partApis`; and
 *   - `callable`: the anatomy part whose props the export itself must also carry unchanged; and
 *   - `also`: other members of the export whose props must carry the root's props as well, each with the
 *     props it may `widen` (Select, whose Select.Root takes `label` as any node).
 */
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
  { slug: 'radio-group', name: 'RadioGroup', source: 'packages/react/src/radio-group.ts' },
  { slug: 'token-field', name: 'TokenField', source: 'packages/react/src/token-field.ts' },
  // ListBox is its own root (ListBox.Root is ListBox); Section and Item own props beside it, and Header owns none.
  { slug: 'list-box', name: 'ListBox', source: 'packages/react/src/list-box.ts', parts: { section: 'Section', item: 'Item' } },
  // Menu.Root is the root; the standalone Menu is Menu.List, which `callable` checks. Header and Separator own no props.
  { slug: 'menu', name: 'Menu', part: 'Root', callable: 'list', source: 'packages/react/src/menu.ts', parts: { trigger: 'Trigger', popup: 'Popup', list: 'List', item: 'Item', submenu: 'Submenu', section: 'Section' } },
  // GridList is its own root and has no Root part; Item owns props beside it.
  { slug: 'grid-list', name: 'GridList', source: 'packages/react/src/grid-list.ts', parts: { item: 'Item' } },
  // Virtualizer is one component with two layouts: its own props are one all-optional type, and its public type is two arms built from it.
  { slug: 'virtualizer', name: 'Virtualizer', source: 'packages/react/src/virtualizer.ts' },
  // PromptComposer is one form with no part; its inputRef and the form's own events stay in the public type.
  { slug: 'prompt-composer', name: 'PromptComposer', source: 'packages/react/src/supplemental/prompt-composer.ts' },
  // ComboBox has no part that owns props: its input, list, and option are rendered, not exported.
  { slug: 'combo-box', name: 'ComboBox', source: 'packages/react/src/combo-box.ts' },
  // Select is its own root; Select.Root takes the same props with `label` as any node, so the derivation checks both. Its anatomy calls Select.Item the option.
  // Label, Value, Description, and Error own no props.
  { slug: 'select', name: 'Select', also: [{ member: 'Root', widen: ['label'] }], source: 'packages/react/src/select.ts', parts: { trigger: 'Trigger', popup: 'Popup', list: 'List', option: 'Item' } },
  // ColorSwatchPicker is one component with no part that owns props: its swatches are rendered, not exported.
  { slug: 'color-swatch-picker', name: 'ColorSwatchPicker', source: 'packages/react/src/color-swatch-picker.ts' },
  // Tabs is one component; its list, tab, panels, and panel are rendered, not exported.
  { slug: 'tabs', name: 'Tabs', source: 'packages/react/src/tabs.ts' },
  // TagGroup is one component; its label, list, tag, and remove button are rendered, not exported. Its label is owned, and the public type offers it with the accessible name's arms.
  { slug: 'tag-group', name: 'TagGroup', source: 'packages/react/src/tag-group.ts' },
  // Table is one component; its header, column, body, row, and cell are rendered, not exported.
  { slug: 'table', name: 'Table', source: 'packages/react/src/table.ts' },
  // Tree is one component; its items and their nested children are rendered, not exported, and it takes no children of its own.
  { slug: 'tree', name: 'Tree', source: 'packages/react/src/tree.ts' },
  // TextEditor's handle, commands and document types are declared by its module; only its props and events are derived here.
  { slug: 'text-editor', name: 'TextEditor', source: 'packages/react/src/text-editor/index.ts' },
  // ButtonGroup and ColorModeToggle are single components: their API is the export's own.
  { slug: 'button-group', name: 'ButtonGroup', source: 'packages/react/src/supplemental/button-group.ts' },
  { slug: 'color-mode-toggle', name: 'ColorModeToggle', source: 'packages/react/src/supplemental/color-mode-toggle.ts' },
  // ProgressCircle is a compound whose root is ProgressCircle.Root; Track, Label and Value own no props.
  { slug: 'progress-circle', name: 'ProgressCircle', part: 'Root', source: 'packages/react/src/supplemental/progress-circle.ts' },
  // InputTags is a compound of one part, Root, whose props are the family's.
  { slug: 'input-tags', name: 'InputTags', part: 'Root', source: 'packages/react/src/supplemental/input-tags.ts' },
  // PaymentInput's root is PaymentInput.Root; CardIcon owns cardType, and the other parts own no props.
  { slug: 'payment-input', name: 'PaymentInput', part: 'Root', parts: { 'card-icon': 'CardIcon' }, source: 'packages/react/src/supplemental/payment-input.ts' },
  // The field compounds' root is Root, and each Button owns disabled; their other parts own no props.
  { slug: 'checkbox-field', name: 'CheckboxField', part: 'Root', parts: { button: 'Button' }, source: 'packages/react/src/supplemental/checkbox-field.ts' },
  { slug: 'radio-field', name: 'RadioField', part: 'Root', parts: { button: 'Button' }, source: 'packages/react/src/supplemental/radio-field.ts' },
  { slug: 'switch-field', name: 'SwitchField', part: 'Root', parts: { button: 'Button' }, source: 'packages/react/src/supplemental/switch-field.ts' },
]);

const SOURCE_ROOT = 'packages/react/src/';

function documentText(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * What `extractApis` reads of an entry, with the paths its declarations and source sit at. Every caller maps
 * an entry through this, so a field the entry sets (`also`, say) cannot reach the committed outputs and miss
 * the packed declarations, or the reverse.
 */
export const extractionComponent = ({ name, part, callable, also, parts }, paths) => ({ name, part, callable, also, parts, ...paths });

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
    components: components.map((component) => extractionComponent(component, {
      declarations: resolve(declarationRoot, component.source.slice(SOURCE_ROOT.length).replace(/\.ts$/u, '.d.ts')),
      source: resolve(repositoryRoot, component.source),
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
