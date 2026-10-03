/**
 * Decision 0022: R1 evidence that is unmet, not passed, and deferred to stable
 * promotion. `families` mirrors Decision 0022's table; `E-R1.5-03` applies to
 * every exported binding. The generator projects this list and the R1
 * contract check verifies the projections against it.
 */
export const DEFERRED_R1_EVIDENCE = Object.freeze([
  {
    id: 'E-R1.1-04',
    part: 'manual half',
    provisional: 'applies if the risk class is declared Composite',
    families: ['DisclosureGroup'],
  },
  {
    id: 'E-R1.2-03',
    part: 'manual and assistive-technology half',
    families: ['Autocomplete', 'CheckboxGroup', 'DatePicker', 'DateRangePicker', 'Form'],
  },
  {
    id: 'E-R1.3-04',
    part: 'manual and assistive-technology half',
    families: [
      'Calendar', 'ColorArea', 'ColorPicker', 'ColorSlider', 'ColorSwatchPicker', 'ColorWheel',
      'ComboBox', 'GridList', 'ListBox', 'Menu', 'RadioGroup', 'RangeCalendar', 'Select',
      'Slider', 'Table', 'Tabs', 'TagGroup', 'ToggleButtonGroup', 'TokenField', 'Toolbar',
      'Tree', 'Virtualizer',
    ],
  },
  {
    id: 'E-R1.4-04',
    part: 'manual and assistive-technology proof',
    families: ['Dialog', 'DropZone', 'FileTrigger', 'Popover', 'PreviewTrigger', 'Toast', 'Tooltip'],
  },
  {
    id: 'E-R1.5-03',
    part: 'risk-profile half',
    scope: 'every exported binding',
  },
].map((entry) => Object.freeze({ ...entry, status: 'unmet', deferredTo: 'S1.0' })));

/** The deferred items that cover one family, without the family lists. */
export function deferredEvidenceForFamily(exportName) {
  return DEFERRED_R1_EVIDENCE
    .filter(({ families }) => !families || families.includes(exportName))
    .map(({ families: _families, scope: _scope, ...entry }) => entry);
}
