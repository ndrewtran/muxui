import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Activity, Disclosure, DisclosureGroup } from '../../generated/index.mjs';
import { launchBrowser } from './harness.mjs';

// DisclosureGroup and Activity share one spring: component.disclosuregroup.transition, whose visual duration is
// component.disclosuregroup.motion-duration. No rule reads either token under its own name. Rules read the parts the
// structured token compiles to (`-transition-spring-visual-duration`, `-duration`, `-easing`), and the motion runtime
// reads the roles those parts feed. So the parts and the motion duration are the assignment levers, and the
// `--muxui-component-disclosuregroup-transition` shorthand is not one: assigning it changes nothing anywhere.
//
// Where an assignment reaches (measured). The leaf parts the rules read, `-transition-duration`, `-transition-easing` and
// `-transition-spring-visual-duration`, work on any element: `:root`, a motion scope, a plain wrapper or the component
// itself. Their inputs, `motion-duration`, `-transition-spring-duration` and `-transition-spring-easing`, are aliased
// where the token layer declares them (`:root` and each `data-muxui-motion` scope), so they work on `:root` or a motion
// scope, which is what this test assigns, and do nothing on a plain wrapper or the component.
//
// A motion scope that assigns the inputs must move the panel roles of both families and the CSS transition of a group
// item, a plain scope must keep the default spring, and a stylesheet that drops the reads, flattens the default easing or
// changes the default durations must fail those checks. Chromium only, one launch, no server: static markup under the
// published stylesheet.
const styles = await readFile(resolve(import.meta.dirname, '../../generated/styles.css'), 'utf8');
const h = React.createElement;
const assigned = {
  '--muxui-component-disclosuregroup-motion-duration': '123ms',
  '--muxui-component-disclosuregroup-transition-spring-duration': '77ms',
  '--muxui-component-disclosuregroup-transition-spring-easing': 'linear',
};
const content = () => [
  h(DisclosureGroup, { key: 'group', defaultExpandedIds: ['a'] }, h(Disclosure, { id: 'a', title: 'One' }, 'Body'), h(Disclosure, { id: 'b', title: 'Two' }, 'Body')),
  h(Activity, { key: 'activity', label: 'Activity', status: 'running', items: [{ id: '1', label: 'One', status: 'completed', details: 'More' }] }),
];
const markup = renderToString(h('div', null,
  h('div', { id: 'assigned', 'data-muxui-motion': 'full', style: assigned }, ...content()),
  h('div', { id: 'plain', 'data-muxui-motion': 'full' }, ...content())));

// Runs in the page: the motion roles each panel hands the runtime, and the CSS transition of the first group item.
function observe() {
  const read = (scope) => {
    const root = document.getElementById(scope);
    const panel = (selector) => {
      const style = getComputedStyle(root.querySelector(selector));
      const role = (part) => style.getPropertyValue(`--muxui-semantic-motion-content-resize-transition-${part}`).trim();
      return { visual: role('spring-visual-duration'), duration: role('duration'), easing: role('easing') };
    };
    const item = getComputedStyle(root.querySelector('.muxui-disclosure-group > .muxui-disclosure'));
    return {
      group: panel('.muxui-disclosure-motion-panel'),
      activity: panel('.muxui-activity-motion-panel'),
      item: { duration: item.transitionDuration, easing: item.transitionTimingFunction },
    };
  };
  return { assigned: read('assigned'), plain: read('plain') };
}

// The default spring: 268ms visual, 600ms, and the generated curve for bounce 0.38 (it overshoots to 1.08 and settles on 1).
// A computed `linear()` may spell each stop with a position (`0.1454 5.26316%`), so easings compare by their values.
const springStops = [0, 0.1454, 0.4333, 0.7134, 0.9176, 1.0339, 1.0792, 1.0799, 1.0596, 1.0348, 1.0143, 1.0011, 0.9946, 0.993, 0.9941, 0.9961, 0.998, 0.9994, 1.0002, 1];
const easingStops = (easing) => [...easing.matchAll(/linear\(([^)]*)\)/gu)].map(([, stops]) => stops.split(',').map((stop) => Number.parseFloat(stop)));
const isSpring = (easing, count) => { const curves = easingStops(easing); return curves.length === count && curves.every((stops) => stops.join() === springStops.join()); };

// The names of the checks that fail.
function failures({ assigned: set, plain }) {
  const moved = (roles) => roles.visual === '123ms' && roles.duration === '77ms' && roles.easing === 'linear';
  const spring = (roles) => roles.visual === '268ms' && roles.duration === '600ms' && isSpring(roles.easing, 1);
  return [
    ['assigned DisclosureGroup roles', moved(set.group)],
    ['assigned Activity roles', moved(set.activity)],
    ['assigned item transition', set.item.duration === '0.077s, 0.077s' && set.item.easing === 'linear, linear'],
    ['default DisclosureGroup roles', spring(plain.group)],
    ['default Activity roles', spring(plain.activity)],
    // The item transitions two properties, so its timing function is listed twice.
    ['default item transition', plain.item.duration === '0.6s, 0.6s' && isSpring(plain.item.easing, 2)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

test('DisclosureGroup and Activity follow the motion duration and transition parts of their motion scope', { timeout: 60_000 }, async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const run = async (css) => {
      await page.setContent(`<!doctype html><html data-muxui-color-scheme="light"><head><style>${css}</style></head><body>${markup}</body></html>`);
      return page.evaluate(observe);
    };
    const seen = await run(styles);
    assert.deepEqual(failures(seen), [], JSON.stringify(seen));
    // Each part's read replaced by `initial`: the roles and the item transition lose the assigned values.
    const withoutReads = styles.replaceAll(/var\(--muxui-component-disclosuregroup-transition-(?:spring-visual-duration|duration|easing)\)/gu, 'initial');
    assert.notEqual(withoutReads, styles, 'the stylesheet has part reads to drop');
    const dropped = failures(await run(withoutReads));
    for (const name of ['assigned DisclosureGroup roles', 'assigned Activity roles', 'assigned item transition']) assert.ok(dropped.includes(name), `dropping the reads must fail "${name}"`);
    // Wrong default durations: the generated motion duration and spring duration changed.
    const wrongDefault = styles.replaceAll('--muxui-component-disclosuregroup-motion-duration: 268ms', '--muxui-component-disclosuregroup-motion-duration: 999ms')
      .replaceAll('--muxui-component-disclosuregroup-transition-spring-duration: 600ms', '--muxui-component-disclosuregroup-transition-spring-duration: 987ms');
    assert.notEqual(wrongDefault, styles, 'the stylesheet has default durations to change');
    const wrong = failures(await run(wrongDefault));
    for (const name of ['default DisclosureGroup roles', 'default Activity roles', 'default item transition']) assert.ok(wrong.includes(name), `a wrong default must fail "${name}"`);
    // A flattened default easing: the spring easing declarations replaced by a curve with no overshoot.
    const flat = styles.replaceAll(/(--muxui-component-disclosuregroup-transition-spring-easing:)[^;]+;/gu, '$1 linear(0, 1);');
    assert.notEqual(flat, styles, 'the stylesheet has default easings to flatten');
    const flattened = failures(await run(flat));
    for (const name of ['default DisclosureGroup roles', 'default Activity roles', 'default item transition']) assert.ok(flattened.includes(name), `a flattened easing must fail "${name}"`);
  } finally {
    await browser.close();
  }
});
