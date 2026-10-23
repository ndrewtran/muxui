import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

// A parameter default on a prop that Mux forwards to React Aria reaches React Aria as an
// explicit value, and useContextProps lets an explicit value override a React Aria context
// (DatePickerContext, DateFieldContext, ...). The derived APIs claim only parameter
// defaults, so a default named here is the hazard that made DatePicker and DateRangePicker
// ignore a context defaultOpen. The check is by name: it also asks about a name that a
// family keeps to itself, and the audited groups below record why each such default is safe.
// The is* names are the upstream aliases of the Mux names before them. A default of a part of a compound
// (partApis) is named `family.part.prop`, and the check reads the prop after the last dot.
const contextMergedProps = new Set([
  'open', 'isOpen', 'defaultOpen', 'modal', 'dismissable',
  'disabled', 'isDisabled', 'readOnly', 'isReadOnly', 'required', 'isRequired', 'invalid', 'isInvalid', 'pending', 'isPending', 'validationBehavior',
  'value', 'defaultValue', 'minValue', 'maxValue', 'step', 'type',
  'min', 'max', 'selectionMode', 'selected', 'isSelected', 'defaultSelected', 'checked', 'defaultChecked', 'indeterminate', 'isIndeterminate',
  'selectedKey', 'defaultSelectedKey', 'selectedKeys', 'defaultSelectedKeys',
  'expanded', 'isExpanded', 'defaultExpanded', 'defaultExpandedIds', 'multiple', 'items',
  'orientation', 'role', 'current', 'allowsMultiple', 'acceptDirectory', 'disallowEmptySelection',
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
      ...expand(['color-swatch', 'color-swatch-picker', 'color-field', 'color-area', 'color-slider', 'color-wheel'], ['disabled']),
      ...expand(['color-field'], ['readOnly', 'required']),
      // color-slider sends orientation to React Aria as its own value, horizontal when omitted, as it did before the move.
      ...expand(['color-slider'], ['orientation']),
      // RangeCalendar already sent isDisabled, isReadOnly, and isRequired as booleans, so a RangeCalendarContext cannot supply them. Calendar claims none of the three: it sends the prop as given, so a CalendarContext still can.
      ...expand(['range-calendar'], ['disabled', 'readOnly', 'required']),
      // Toolbar and ToggleButtonGroup send orientation to React Aria as their own value, horizontal when omitted, as they did before the move.
      ...expand(['toolbar', 'toggle-button-group'], ['orientation']),
      // ToggleButtonGroup sends selectionMode, isDisabled, and disallowEmptySelection to React Aria as its own values, single, false, and false when omitted, as it did before the move.
      ...expand(['toggle-button-group'], ['selectionMode', 'disabled', 'disallowEmptySelection']),
      // RadioGroup sends isDisabled, isReadOnly, isRequired, and orientation to React Aria as its own values, false, false, false, and vertical when omitted, as it did before the move.
      ...expand(['radio-group'], ['disabled', 'readOnly', 'required', 'orientation']),
      // TokenField sends isDisabled and isReadOnly to React Aria as its own values, false when omitted, as it did before the move.
      ...expand(['token-field'], ['disabled', 'readOnly']),
      // Slider sends minValue, maxValue, step, isDisabled, and orientation to React Aria as its own values, 0, 100, 1, false, and horizontal when omitted, as it did before the move.
      ...expand(['slider'], ['min', 'max', 'step', 'disabled', 'orientation']),
      // ListBox sent selectionMode and orientation to React Aria as its own values, single and vertical when omitted, before the move,
      // so a ListBoxContext never supplied them. Each ListBox.Item sent isDisabled as a boolean: its own flag, else the list's.
      ...expand(['list-box'], ['selectionMode', 'orientation']),
      ...expand(['list-box.item'], ['disabled']),
      // Menu.Trigger and Menu.Item sent isDisabled as a boolean: their own flag, else the menu's. Menu.Popup sent React Aria its geometry and isNonModal
      // as its own values, through the overlay geometry helper, whether or not they were set, and Menu.Submenu sent its delay.
      ...expand(['menu.trigger', 'menu.item'], ['disabled']),
      ...expand(['menu.popup'], ['offset', 'crossOffset', 'shouldFlip', 'containerPadding', 'modal']),
      ...expand(['menu.submenu'], ['delay']),
      // GridList sent selectionMode, isDisabled, and orientation to React Aria as its own values, single, false, and vertical when omitted,
      // before the move, so a GridListContext never supplied them. Each GridList.Item sent isDisabled as a boolean: its own flag, else the list's.
      ...expand(['grid-list'], ['selectionMode', 'disabled', 'orientation']),
      ...expand(['grid-list.item'], ['disabled']),
      // Virtualizer sent isDisabled to React Aria as its own value, false when omitted, before the move, so a ListBoxContext never supplied it.
      ...expand(['virtualizer'], ['disabled']),
      // Select sent React Aria isDisabled, isRequired, and defaultOpen as its own values (false when omitted), and its popup geometry and modal setting to its popup
      // through the overlay geometry helper, before the move, so no React Aria context supplied them. Select.Trigger and Select.Item sent isDisabled as a boolean: their own flag, else the Select's.
      ...expand(['select'], ['disabled', 'required', 'defaultOpen', 'placement', 'offset', 'crossOffset', 'shouldFlip', 'containerPadding', 'modal']),
      ...expand(['select.trigger', 'select.option'], ['disabled']),
      // ComboBox sent isDisabled, isReadOnly, and isRequired to React Aria as its own values (false when omitted) before the move, so no React Aria context supplied them.
      ...expand(['combo-box'], ['disabled', 'readOnly', 'required']),
      // Tabs sent isDisabled and orientation to React Aria as its own values, false and horizontal when omitted, before the move, so a TabsContext never supplied them.
      ...expand(['tabs'], ['disabled', 'orientation']),
      // TagGroup sent selectionMode and isDisabled to React Aria as its own values, none and false when omitted, before the move, so a TagGroupContext never supplied them.
      ...expand(['tag-group'], ['selectionMode', 'disabled']),
      // Table sent selectionMode and isDisabled to React Aria as its own values, none and false when omitted, before the move, so a TableContext never supplied them.
      ...expand(['table'], ['selectionMode', 'disabled']),
      // Tree sent selectionMode and isDisabled to React Aria as its own values, single and false when omitted, before the move, so a TreeContext never supplied them.
      ...expand(['tree'], ['selectionMode', 'disabled']),
      // ButtonGroup sent isDisabled and role to React Aria's Group as its own values, false and the resolved role, before the move, so a GroupContext never supplied them.
      ...expand(['button-group'], ['disabled', 'role']),
      // ColorModeToggle sent isDisabled to React Aria's Switch as its own value, false when omitted, before the move.
      ...expand(['color-mode-toggle'], ['disabled']),
      // ProgressCircle sent value (undefined for null), minValue and maxValue to React Aria's ProgressBar as its own values before the move.
      ...expand(['progress-circle'], ['value', 'minValue', 'maxValue']),
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
      ...expand(['color-area', 'color-slider', 'color-swatch-picker', 'color-wheel'], ['readOnly']),
      // Slider enforces readOnly itself, with a data attribute and guards, and sends React Aria no isReadOnly.
      ...expand(['slider'], ['readOnly']),
      // ListBox turns its disabled into disabledKeys and data attributes and never sends React Aria isDisabled.
      ...expand(['list-box'], ['disabled']),
      // Menu.Root drives React Aria's MenuTrigger with a controlled isOpen and sends it no isDisabled, so no React Aria context can supply either.
      // Menu.List turns its disabled into disabledKeys and data attributes and never sends React Aria isDisabled.
      ...expand(['menu'], ['defaultOpen', 'disabled']),
      ...expand(['menu.list'], ['disabled']),
      // Select enforces readOnly itself, with a data attribute and a guard on the selection, and sends React Aria no isReadOnly.
      ...expand(['select'], ['readOnly']),
      // ButtonGroup keeps its orientation for CSS, a data attribute and a class, and gives React Aria none.
      ...expand(['button-group'], ['orientation']),
      // PromptComposer renders a native form, textarea, and buttons, and gives its model Select explicit flags, so no React Aria context reaches its own disabled, pending, defaultValue, or multiple.
      ...expand(['prompt-composer'], ['disabled', 'pending', 'defaultValue', 'multiple']),
      // TextEditor renders its own contenteditable and buttons and sends React Aria no isDisabled, isReadOnly, isRequired, or isInvalid, so no React Aria context reaches its flags.
      ...expand(['text-editor'], ['disabled', 'readOnly', 'required', 'invalid']),
    ],
  },
  {
    reason: 'transformed so omission and default send the same upstream value',
    entries: [
      // validationProps sends isInvalid: invalid ? true : undefined.
      ...expand(validationFamilies, ['invalid']),
      // Link sends aria-current: current ? 'page' : undefined.
      ...expand(['link'], ['current']),
      // color-field and radio-group send isInvalid: invalid ? invalid : undefined, so a React Aria context can still make them invalid.
      ...expand(['color-field', 'radio-group'], ['invalid']),
      // The calendars send isInvalid the same way, so a CalendarContext or RangeCalendarContext can still make them invalid.
      ...expand(['calendar', 'range-calendar'], ['invalid']),
      // Select and ComboBox send isInvalid the same way, so a React Aria context can still make them invalid.
      ...expand(['select', 'combo-box'], ['invalid']),
    ],
  },
];

/** Every derived default as `family.prop`, and each part's as `family.part.prop`. */
function derivedDefaults() {
  const apiDirectory = new URL('../api/', import.meta.url);
  return readdirSync(apiDirectory)
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => {
      const family = file.slice(0, -'.json'.length);
      const { defaults, partApis = {} } = JSON.parse(readFileSync(new URL(file, apiDirectory), 'utf8')).api;
      return [
        ...Object.keys(defaults).map((prop) => `${family}.${prop}`),
        ...Object.entries(partApis).flatMap(([part, api]) => Object.keys(api.defaults).map((prop) => `${family}.${part}.${prop}`)),
      ];
    });
}

test('a derived default on a context-merged prop is audited, so a React Aria context can still supply it', () => {
  const allowed = new Set(audited.flatMap(({ entries }) => entries));
  const found = derivedDefaults().filter((name) => contextMergedProps.has(name.slice(name.lastIndexOf('.') + 1)));

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
