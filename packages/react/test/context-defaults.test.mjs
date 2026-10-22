import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

// A parameter default on a prop that Mux forwards to React Aria reaches React Aria as an
// explicit value, and useContextProps lets an explicit value override a React Aria context
// (DatePickerContext, DateFieldContext, ...). The derived APIs claim only parameter
// defaults, so a default named here is the hazard that made DatePicker and DateRangePicker
// ignore a context defaultOpen. The check is by name: it also asks about a name that a
// family keeps to itself, and the audited groups below record why each such default is safe.
// The is* names are the upstream aliases of the Mux names before them.
const contextMergedProps = new Set([
  'open', 'isOpen', 'defaultOpen', 'modal', 'dismissable',
  'disabled', 'isDisabled', 'readOnly', 'isReadOnly', 'required', 'isRequired', 'invalid', 'isInvalid', 'pending', 'isPending', 'validationBehavior',
  'value', 'defaultValue', 'minValue', 'maxValue', 'step', 'type',
  'selectionMode', 'selected', 'isSelected', 'defaultSelected', 'checked', 'defaultChecked', 'indeterminate', 'isIndeterminate',
  'selectedKey', 'defaultSelectedKey', 'selectedKeys', 'defaultSelectedKeys',
  'expanded', 'isExpanded', 'defaultExpanded', 'defaultExpandedIds', 'multiple', 'items',
  'orientation', 'role', 'current', 'allowsMultiple', 'acceptDirectory',
  'placement', 'offset', 'crossOffset', 'shouldFlip', 'containerPadding', 'delay', 'closeDelay',
]);

const expand = (families, props) => families.flatMap((family) => props.map((prop) => `${family}.${prop}`));

// The fields that pass their props through validationProps.
const validationFamilies = ['autocomplete', 'checkbox-group', 'date-field', 'date-picker', 'date-range-picker', 'number-field', 'search-field', 'switch', 'text-field', 'time-field'];
const overlayFamilies = ['popover', 'preview-trigger', 'tooltip'];

// `family.prop` entries, grouped by why the default is safe. A new default does not belong
// in the first group: that group is the defaults the old JavaScript already sent upstream.
const audited = [
  {
    reason: 'explicit before the TypeScript move',
    entries: [
      ...expand(validationFamilies, ['disabled', 'readOnly', 'required']),
      ...expand(['checkbox'], ['disabled', 'invalid', 'indeterminate', 'defaultChecked']),
      ...expand(['toggle-button'], ['disabled', 'defaultSelected']),
      ...expand(['switch'], ['defaultSelected']),
      ...expand(['disclosure'], ['disabled', 'defaultExpanded']),
      ...expand(['disclosure-group'], ['disabled', 'defaultExpandedIds', 'multiple']),
      ...expand(['group'], ['disabled', 'invalid', 'readOnly', 'role']),
      ...expand(['drop-zone'], ['disabled']),
      // With text children the FileTrigger's Mux Button forwards disabled to a React Aria Button.
      ...expand(['file-trigger'], ['disabled', 'allowsMultiple', 'acceptDirectory']),
      ...expand(['separator'], ['orientation']),
      ...expand(['breadcrumbs'], ['items']),
      ...expand(['progress-bar'], ['minValue', 'maxValue']),
      ...expand(['number-field'], ['step']),
      ...expand(['text-field'], ['type']),
      ...expand(['form'], ['validationBehavior']),
      ...expand(['dialog', 'popover'], ['dismissable']),
      ...expand(['popover'], ['modal']),
      ...expand(overlayFamilies, ['placement', 'offset', 'crossOffset', 'shouldFlip', 'containerPadding']),
      ...expand(['preview-trigger', 'tooltip'], ['delay', 'closeDelay']),
      // The color controls send isDisabled (and ColorField isReadOnly and isRequired) as a boolean: their own flag, else the enclosing ColorPicker's.
      ...expand(['color-swatch', 'color-field', 'color-area', 'color-slider', 'color-wheel'], ['disabled']),
      ...expand(['color-field'], ['readOnly', 'required']),
      // color-slider sends orientation to React Aria as its own value, horizontal when omitted, as it did before the move.
      ...expand(['color-slider'], ['orientation']),
      // RangeCalendar already sent isDisabled, isReadOnly, and isRequired as booleans, so a RangeCalendarContext cannot supply them. Calendar claims none of the three: it sends the prop as given, so a CalendarContext still can.
      ...expand(['range-calendar'], ['disabled', 'readOnly', 'required']),
    ],
  },
  {
    reason: 'Mux-only, not forwarded',
    entries: [
      ...expand(['dialog', 'popover', 'preview-trigger', 'tooltip', 'lightbox'], ['defaultOpen']),
      ...expand(['preview-trigger', 'tooltip'], ['disabled']),
      ...expand(['data-diff'], ['disabled', 'pending']),
      ...expand(['resizable'], ['disabled', 'readOnly', 'orientation']),
      ...expand(['select-native'], ['disabled', 'required', 'invalid']),
      ...expand(['autocomplete'], ['defaultValue']),
      ...expand(['meter'], ['value', 'minValue', 'maxValue']),
      ...expand(['activity'], ['defaultExpanded']),
      // CheckboxGroup keeps its orientation for CSS and gives React Aria none.
      ...expand(['checkbox-group'], ['orientation']),
      // The color controls enforce readOnly themselves, with a data attribute and guards, and send React Aria no isReadOnly. ColorPicker's flags reach its children through a Mux UI context, and React Aria's picker takes neither.
      ...expand(['color-picker'], ['disabled', 'readOnly']),
      ...expand(['color-area', 'color-slider', 'color-wheel'], ['readOnly']),
    ],
  },
  {
    reason: 'transformed so omission and default send the same upstream value',
    entries: [
      // validationProps sends isInvalid: invalid ? true : undefined.
      ...expand(validationFamilies, ['invalid']),
      // Link sends aria-current: current ? 'page' : undefined.
      ...expand(['link'], ['current']),
      // color-field sends isInvalid: invalid ? invalid : undefined, so a React Aria context can still make it invalid.
      ...expand(['color-field'], ['invalid']),
      // The calendars send isInvalid the same way, so a CalendarContext or RangeCalendarContext can still make them invalid.
      ...expand(['calendar', 'range-calendar'], ['invalid']),
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
  const found = derivedDefaults().filter((name) => contextMergedProps.has(name.slice(name.indexOf('.') + 1)));

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
