/**
 * What the package says about assistive technology: it claims no support. Its automated proof is axe in one browser plus
 * the package's keyboard and focus tests; the manual and assistive-technology testing a claim needs has not been done.
 * `unverified` lists what is missing, as current limitations. The generator publishes this record in release.json and
 * the compatibility record, and the generated-contract check holds every listed family to an exported one.
 */
export const ASSISTIVE_TECHNOLOGY = Object.freeze({
  claim: 'none',
  unverified: Object.freeze([
    { check: 'manual keyboard and focus review', families: ['DisclosureGroup'] },
    {
      check: 'manual and screen-reader testing',
      families: [
        'Autocomplete', 'Calendar', 'CheckboxGroup', 'ColorArea', 'ColorPicker', 'ColorSlider', 'ColorSwatchPicker', 'ColorWheel',
        'ComboBox', 'DatePicker', 'DateRangePicker', 'Dialog', 'DropZone', 'FileTrigger', 'Form', 'GridList', 'ListBox', 'Menu',
        'Popover', 'PreviewTrigger', 'RadioGroup', 'RangeCalendar', 'Select', 'Slider', 'Table', 'Tabs', 'TagGroup', 'Toast',
        'ToggleButtonGroup', 'TokenField', 'Toolbar', 'Tooltip', 'Tree', 'Virtualizer',
      ],
    },
    { check: 'an accessibility risk profile', scope: 'every component' },
  ].map((entry) => Object.freeze({ ...entry, ...(entry.families ? { families: Object.freeze(entry.families) } : {}) }))),
});
