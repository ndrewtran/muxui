import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterStorybookEntries,
  selectedStorybookFamilies,
  storybookSelectionLabel,
} from './storybook-family-selection.mjs';

const selectorKeys = [
  'MUXUI_STORYBOOK_FAMILIES',
  'MUXUI_STORYBOOK_FAMILY_FILTER',
  'MUXUI_STORYBOOK_FAMILY',
];

function withSelection(value, callback) {
  const previous = Object.fromEntries(selectorKeys.map((key) => [key, process.env[key]]));
  for (const key of selectorKeys) delete process.env[key];
  if (value !== undefined) process.env.MUXUI_STORYBOOK_FAMILIES = value;
  try {
    return callback();
  } finally {
    for (const key of selectorKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('Storybook family selectors resolve canonical aliases and filter entries', () => {
  withSelection('date-picker,DatePicker', () => {
    assert.deepEqual(selectedStorybookFamilies(), ['DatePicker']);
    assert.equal(storybookSelectionLabel(), 'focused families: DatePicker');
    assert.deepEqual(
      filterStorybookEntries([
        { id: 'date-picker-default', title: 'Components/DatePicker' },
        { id: 'button-default', title: 'Components/Button' },
      ]),
      [{ id: 'date-picker-default', title: 'Components/DatePicker' }],
    );
  });
});

test('Storybook family selectors reject empty and unknown values', () => {
  withSelection('', () => assert.throws(
    () => selectedStorybookFamilies(),
    /MUXUI_STORYBOOK_FAMILY_SELECTION_EMPTY/u,
  ));
  withSelection('DatePicker,', () => assert.throws(
    () => selectedStorybookFamilies(),
    /MUXUI_STORYBOOK_FAMILY_SELECTION_EMPTY/u,
  ));
  withSelection('NotAComponent', () => assert.throws(
    () => selectedStorybookFamilies(),
    /MUXUI_STORYBOOK_FAMILY_UNKNOWN/u,
  ));
  withSelection('DatePicker,NotAComponent', () => assert.throws(
    () => selectedStorybookFamilies(),
    /MUXUI_STORYBOOK_FAMILY_UNKNOWN/u,
  ));
});
