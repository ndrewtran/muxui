import React from 'react';
import type { ComponentProps, ForwardRefExoticComponent, RefAttributes } from 'react';
import Shuffle from 'lucide-react/dist/esm/icons/shuffle.mjs';
import { AriaRadio, AriaRadioGroup } from '../substrate.ts';
import { MUXUI_THEME_ACTION_BACKGROUNDS, MUXUI_THEME_PRESETS } from '../themes.mjs';
import type { MuxUIThemeCollection, MuxUIThemeId, MuxUIThemePreset } from '../themes.js';
import { cx, h } from './part-utils.ts';

/** The theme ID of a preset, or `random` for the Random option. */
export type ThemePickerValue = MuxUIThemeId | 'random';

/**
 * The props Mux UI defines for ThemePicker; the catalog's web.react API is derived from this type (Decision 0031).
 * The picker is named by aria-label or aria-labelledby, and by Theme when it has neither.
 */
type ThemePickerOwnProps = {
  /** The selected theme ID, or random, when the page controls it. */
  value?: ThemePickerValue;
  /** The theme ID, or random, that starts selected, when the picker controls itself. */
  defaultValue?: ThemePickerValue;
  /** Called with the theme ID, or random, each time the user selects an option. */
  onChange?: (value: ThemePickerValue) => void;
  /** Adds a Random option before the presets. The picker only reports random; the page chooses the theme. */
  random?: boolean;
  /** Disables the picker and every option in it. */
  disabled?: boolean;
};

export type ThemePickerProps = ThemePickerOwnProps & { className?: string; 'aria-label'?: string; 'aria-labelledby'?: string };

const COLUMNS = 4;

const COLLECTION_LABELS: Record<MuxUIThemeCollection, string> = { standard: 'Standard', monochrome: 'Monochrome' };

type Group = { collection: MuxUIThemeCollection; presets: MuxUIThemePreset[] };

/** The presets grouped by collection, in the order the package lists them. */
function groupsOf(presets: readonly MuxUIThemePreset[]): Group[] {
  const groups: Group[] = [];
  for (const preset of presets) {
    const group = groups.find(({ collection }) => collection === preset.collection);
    if (group) group.presets.push(preset);
    else groups.push({ collection: preset.collection, presets: [preset] });
  }
  return groups;
}

/** The accessible name of a preset whose name an earlier collection already uses, which adds its collection. */
function repeatedNames(groups: readonly Group[]): Map<ThemePickerValue, string> {
  const labels = new Map<ThemePickerValue, string>();
  const seen = new Set<string>();
  for (const { collection, presets } of groups) {
    const inCollection = new Set<string>();
    for (const { id, name } of presets) {
      if (seen.has(name)) labels.set(id, `${COLLECTION_LABELS[collection]} ${name}`);
      inCollection.add(name);
    }
    for (const name of inCollection) seen.add(name);
  }
  return labels;
}

/** The visual rows, top to bottom: Random on a row of its own, then each collection in rows of COLUMNS. */
function rowsOf(groups: readonly Group[], random: boolean): ThemePickerValue[][] {
  const rows: ThemePickerValue[][] = random ? [['random']] : [];
  for (const { presets } of groups) {
    for (let start = 0; start < presets.length; start += COLUMNS) rows.push(presets.slice(start, start + COLUMNS).map(({ id }) => id));
  }
  return rows;
}

/**
 * Where a key moves focus: Home and End go to the first and last option, and Up and Down to the same column of the
 * row above or below, continuing across the group headings. A row too short for the column takes its last option.
 * Left and Right are not here: the radio group moves them by one.
 */
function targetOf(key: string, value: ThemePickerValue, rows: readonly (readonly ThemePickerValue[])[]): ThemePickerValue | undefined {
  if (key === 'Home') return rows[0]?.[0];
  if (key === 'End') return rows.at(-1)?.at(-1);
  if (key !== 'ArrowUp' && key !== 'ArrowDown') return undefined;
  const at = rows.findIndex((row) => row.includes(value));
  const next = rows[at + (key === 'ArrowDown' ? 1 : -1)];
  return next?.[Math.min(rows[at]?.indexOf(value) ?? 0, next.length - 1)];
}

type RadioKeyDown = NonNullable<ComponentProps<typeof AriaRadio>['onKeyDown']>;

export const ThemePicker: ForwardRefExoticComponent<ThemePickerProps & RefAttributes<HTMLDivElement>> = /*#__PURE__*/ React.forwardRef<HTMLDivElement, ThemePickerProps>(function ThemePicker({
  value,
  defaultValue,
  onChange,
  random = false,
  disabled = false,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
}, ref) {
  const groups = groupsOf(MUXUI_THEME_PRESETS);
  const names = repeatedNames(groups);
  const rows = rowsOf(groups, random);
  const options = rows.flat();
  // React Aria keeps the value of the option that last had focus, and with nothing selected it leaves every other option out of
  // the tab order while that one is missing. Removing Random starts the group over, so a removed Random cannot hold the tab stop.
  const [hadRandom, setHadRandom] = React.useState(random);
  const [generation, setGeneration] = React.useState(0);
  if (hadRandom !== random) {
    setHadRandom(random);
    if (!random) setGeneration(generation + 1);
  }
  // The selection is held here, not in React Aria, so a chosen Random can be set aside when `random` turns off.
  const controlled = value !== undefined;
  const [internal, setInternal] = React.useState<ThemePickerValue | undefined>(defaultValue);
  const chosen = controlled ? value : internal;
  // Without the Random option a chosen random selects nothing, so the first option holds the tab stop.
  // The choice itself is kept: Random is selected again if the option comes back.
  const selected = chosen === 'random' && !random ? null : chosen ?? null;
  // React Aria's group reports a string; the options say which value it was.
  const select = (next: string) => {
    const option = options.find((candidate) => candidate === next);
    if (option === undefined) return;
    if (!controlled) setInternal(option);
    onChange?.(option);
  };
  // One tab stop and Left and Right come from the radio group. The 2D keys select as they move, as a radio group's arrows do.
  const keyDown = (option: ThemePickerValue): RadioKeyDown => (event) => {
    const moves = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && /^(?:Arrow(?:Up|Down)|Home|End)$/u.test(event.key);
    if (!moves) {
      event.continuePropagation();
      return;
    }
    event.preventDefault();
    const target = targetOf(event.key, option, rows);
    if (target === undefined || target === option) return;
    const inputs = event.currentTarget.closest('[role="radiogroup"]')?.querySelectorAll('input') ?? [];
    const input = [...inputs].find((candidate) => candidate.value === target);
    if (input) {
      input.focus();
      input.click();
    }
  };
  const radio = (option: ThemePickerValue, label: string, swatch: React.ReactNode, modifier?: string) => h(AriaRadio, {
    key: option,
    value: option,
    'aria-label': names.get(option),
    className: cx('muxui-theme-picker__option', modifier),
    onKeyDown: keyDown(option),
    children: h(React.Fragment, null, swatch, h('span', { className: 'muxui-theme-picker__name' }, label)),
  });
  return h(AriaRadioGroup, {
    key: generation,
    ref,
    value: selected,
    onChange: select,
    isDisabled: disabled,
    orientation: 'horizontal',
    'aria-label': ariaLabelledby === undefined ? ariaLabel ?? 'Theme' : undefined,
    'aria-labelledby': ariaLabelledby,
    className: cx('muxui-theme-picker', className),
    children: [
      random && radio('random', 'Random', h('span', { className: 'muxui-theme-picker__swatch', 'aria-hidden': true }, h(Shuffle, { className: 'muxui-theme-picker__random-icon', size: 14, 'aria-hidden': true, focusable: 'false' })), 'muxui-theme-picker__option--random'),
      ...groups.map(({ collection, presets }) => h('div', { key: collection, className: 'muxui-theme-picker__group' },
        h('div', { className: 'muxui-theme-picker__heading' }, COLLECTION_LABELS[collection]),
        h('div', { className: 'muxui-theme-picker__grid' }, presets.map(({ id, name }) => radio(
          id,
          name,
          // The preset's own colours, so the swatch needs neither themes.css nor a theme scope. The stylesheet picks one by color scheme.
          h('span', { className: 'muxui-theme-picker__swatch', 'aria-hidden': true, 'data-muxui-color-paint': 'sample', style: { ...{ '--muxui-theme-picker-swatch-light': MUXUI_THEME_ACTION_BACKGROUNDS[id].light, '--muxui-theme-picker-swatch-dark': MUXUI_THEME_ACTION_BACKGROUNDS[id].dark } } }),
        )))
      )),
    ],
  });
});
