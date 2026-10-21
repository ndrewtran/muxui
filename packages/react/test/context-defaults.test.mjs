import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

// A parameter default on one of these props reaches React Aria as an explicit value
// when the component forwards the prop raw, and useContextProps lets an explicit value
// override a React Aria context (DatePickerContext, DateRangePickerContext, ...).
// The derived APIs claim only parameter defaults, so a default named here is the hazard
// that made DatePicker and DateRangePicker ignore a context defaultOpen. The check is by
// name, so it also asks about props that no React Aria component receives; those are
// allowlisted below with that reason.
const contextMergedProps = ['defaultOpen', 'open', 'disabled', 'readOnly', 'required'];

const expand = (families, props) => families.flatMap((family) => props.map((prop) => `${family}.${prop}`));

// `family.prop` entries, grouped by why the default is safe. Before Decision 0031 moved the
// source to TypeScript, the "already explicit" defaults below already reached React Aria as
// an explicit false, so a context could not supply them then either. A new default does not
// belong in that group.
const audited = [
  {
    reason: 'already explicit before the TypeScript move: validationProps forwards the explicit false as isDisabled, isReadOnly and isRequired',
    entries: expand(
      ['autocomplete', 'checkbox-group', 'date-field', 'date-picker', 'date-range-picker', 'number-field', 'search-field', 'switch', 'text-field', 'time-field'],
      ['disabled', 'readOnly', 'required'],
    ),
  },
  {
    reason: 'already explicit before the TypeScript move: components.ts and overlays.ts forward the false',
    entries: ['checkbox.disabled', 'toggle-button.disabled', 'disclosure.disabled', 'disclosure-group.disabled', 'group.disabled', 'group.readOnly', 'drop-zone.disabled'],
  },
  {
    reason: 'Mux state or a native element: not forwarded to a React Aria prop that merges context',
    entries: [
      ...expand(['dialog', 'popover', 'preview-trigger', 'tooltip', 'lightbox'], ['defaultOpen']),
      'preview-trigger.disabled', 'tooltip.disabled', 'file-trigger.disabled', 'data-diff.disabled',
      'resizable.disabled', 'resizable.readOnly', 'select-native.disabled', 'select-native.required',
    ],
  },
];

function derivedDefaults() {
  const apiDirectory = new URL('../api/', import.meta.url);
  return readdirSync(apiDirectory)
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => {
      const { defaults } = JSON.parse(readFileSync(new URL(file, apiDirectory), 'utf8')).api;
      return Object.keys(defaults).map((prop) => `${file.slice(0, -'.json'.length)}.${prop}`);
    });
}

test('a derived default on a context-merged prop is audited, so a React Aria context can still supply it', () => {
  const allowed = new Set(audited.flatMap(({ entries }) => entries));
  const found = derivedDefaults().filter((name) => contextMergedProps.includes(name.slice(name.indexOf('.') + 1)));

  assert.deepEqual(
    found.filter((name) => !allowed.has(name)),
    [],
    'These parameter defaults would override a React Aria context when forwarded raw. Drop the default, or add it to `audited` with a reason after checking that the component keeps a context-supplied value.',
  );
  assert.deepEqual(
    [...allowed].filter((name) => !found.includes(name)),
    [],
    'These audited defaults no longer exist. Remove them from `audited`.',
  );
});
