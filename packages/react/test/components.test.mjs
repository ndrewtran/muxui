import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import {
  Breadcrumbs,
  Checkbox,
  Disclosure,
  DisclosureGroup,
  Group,
  Link,
  Meter,
  ProgressBar,
  Separator,
  ToggleButton,
} from '../src/components.mjs';
import { ToggleButtonGroup, RadioGroup } from '../src/collections.mjs';
import { CheckboxGroup } from '../src/fields.mjs';
import { RadioField } from '../src/supplemental/index.mjs';

function installDom(dom) {
  const keys = ['window', 'document', 'Element', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLAnchorElement', 'HTMLLabelElement', 'HTMLDivElement', 'HTMLOListElement', 'HTMLLIElement', 'SVGElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'PointerEvent', 'MutationObserver', 'getComputedStyle'];
  const previous = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLAnchorElement: dom.window.HTMLAnchorElement,
    HTMLLabelElement: dom.window.HTMLLabelElement,
    HTMLDivElement: dom.window.HTMLDivElement,
    HTMLOListElement: dom.window.HTMLOListElement,
    HTMLLIElement: dom.window.HTMLLIElement,
    SVGElement: dom.window.SVGElement,
    Node: dom.window.Node,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    KeyboardEvent: dom.window.KeyboardEvent,
    PointerEvent: dom.window.PointerEvent ?? dom.window.MouseEvent,
    MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  };
}

function allComponents({ onCheck, onDisclosure, onToggle, onLink } = {}) {
  return React.createElement(React.Fragment, null,
    React.createElement(Breadcrumbs, {
      'aria-label': 'Breadcrumb',
      items: [{ id: 'home', label: 'Home', href: '/' }, { id: 'docs', label: 'Docs' }],
    }),
    React.createElement(Checkbox, { defaultChecked: true, onChange: onCheck }, 'Accept'),
    React.createElement(Disclosure, { id: 'details', title: 'Details', defaultExpanded: true, onExpandedChange: onDisclosure }, 'More information'),
    React.createElement(DisclosureGroup, { defaultExpandedIds: ['one'], multiple: false },
      React.createElement(Disclosure, { id: 'one', title: 'One' }, 'First'),
      React.createElement(Disclosure, { id: 'two', title: 'Two' }, 'Second')),
    React.createElement(Group, { 'aria-label': 'Actions', disabled: true }, React.createElement('button', { type: 'button' }, 'Save')),
    React.createElement(Link, { href: '/next', onActivate: onLink }, 'Next'),
    React.createElement(Meter, { label: 'Storage', value: 50 }),
    React.createElement(ProgressBar, { label: 'Upload', value: 50 }),
    React.createElement(ProgressBar, { label: 'Loading' }),
    React.createElement(Separator, { orientation: 'vertical' }),
    React.createElement(ToggleButton, { defaultSelected: false, onChange: onToggle }, 'Bold'));
}

test('R1.1 RAC-backed component slice preserves SSR, hydration, semantics, and interactions', async () => {
  const server = renderToString(allComponents());
  assert.match(server, /<nav[^>]*aria-label="Breadcrumb"/u);
  assert.match(server, /role="group"/u);
  assert.match(server, /<div[^>]*role="meter"/u);
  assert.match(server, /role="progressbar"/u);
  assert.match(server, /aria-orientation="vertical"/u);
  assert.match(server, /aria-pressed="false"/u);
  const dom = new JSDOM(`<!doctype html><div id="root">${server}</div>`);
  const restore = installDom(dom);
  let hydrated;
  try {
    const root = document.querySelector('#root');
    await act(async () => { hydrated = hydrateRoot(root, allComponents()); });
    assert.equal(root.querySelector('nav[aria-label="Breadcrumb"]') !== null, true);
    assert.equal(root.querySelector('input[type="checkbox"]').checked, true);
    assert.equal(root.querySelector('.muxui-checkbox-indicator[data-selected]') !== null, true);
    assert.equal(root.querySelector('.muxui-disclosure > button').getAttribute('aria-expanded'), 'true');
    assert.equal(root.querySelector('.muxui-disclosure-panel[role="region"]') !== null, true);
    assert.equal(root.querySelector('.muxui-group').getAttribute('aria-disabled'), 'true');
    assert.equal(root.querySelector('.muxui-link[href="/next"]') !== null, true);
    assert.equal(root.querySelector('[role~="meter"]') !== null, true);
    assert.equal(root.querySelectorAll('.muxui-progress-bar[role~="progressbar"]').length, 2);
    assert.equal(root.querySelector('.muxui-separator-vertical').tagName, 'DIV');
    assert.equal(root.querySelector('.muxui-toggle-button').getAttribute('aria-pressed'), 'false');
    await act(async () => hydrated.unmount());
    hydrated = undefined;

    const interactionRoot = document.createElement('div');
    document.body.append(interactionRoot);
    const changes = [];
    const rootHandle = createRoot(interactionRoot);
    await act(async () => rootHandle.render(React.createElement('div', null,
      React.createElement(Checkbox, { onChange: (value) => changes.push(['checkbox', value]) }, 'Accept'),
      React.createElement(Disclosure, { title: 'Details' }, 'Content'),
      React.createElement(ToggleButton, { onChange: (value) => changes.push(['toggle', value]) }, 'Bold'),
      React.createElement(Link, { href: '/next', onActivate: (event) => changes.push(['link', event]) }, 'Next'))));
    await act(async () => interactionRoot.querySelector('input[type="checkbox"]').click());
    await act(async () => interactionRoot.querySelector('.muxui-disclosure > button').click());
    await act(async () => interactionRoot.querySelector('.muxui-toggle-button').click());
    await act(async () => interactionRoot.querySelector('.muxui-link').click());
    assert.deepEqual(changes.slice(0, 3), [['checkbox', true], ['toggle', true], ['link', changes[2]?.[1]]]);
    assert.equal(interactionRoot.querySelector('.muxui-disclosure > button').getAttribute('aria-expanded'), 'true');
    assert.equal(changes[2][1].type, 'activate');
    assert.equal(changes[2][1].target instanceof dom.window.HTMLAnchorElement, true);
    await act(async () => rootHandle.unmount());
    interactionRoot.remove();
  } finally {
    if (hydrated) await act(async () => hydrated.unmount());
    restore();
    dom.window.close();
  }
});

test('ToggleButton exposes size variants and groups can keep an active selection', async () => {
  for (const size of ['sm', 'md', 'lg']) {
    const markup = renderToString(React.createElement(ToggleButton, { size }, 'Bold'));
    assert.match(markup, new RegExp(`muxui-toggle-button--${size}`, 'u'));
    assert.match(markup, new RegExp(`data-size="${size}"`, 'u'));
  }
  assert.match(renderToString(React.createElement(ToggleButton, null, 'Bold')), /muxui-toggle-button--md/u);
  assert.throws(() => renderToString(React.createElement(ToggleButton, { size: 'xl' }, 'Bold')), /ToggleButton size must be one of/u);

  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  const changes = [];
  try {
    const root = document.querySelector('#root');
    await act(async () => createRoot(root).render(React.createElement(ToggleButtonGroup, {
      'aria-label': 'Formatting',
      size: 'sm',
      selectedIds: ['bold'],
      disallowEmptySelection: true,
      onSelectionChange: (ids) => changes.push(ids),
    },
    React.createElement(ToggleButton, { id: 'bold' }, 'Bold'),
    React.createElement(ToggleButton, { id: 'italic' }, 'Italic'))));
    assert.equal(root.querySelector('.muxui-toggle-button-group').getAttribute('data-size'), 'sm');
    const bold = root.querySelector('.muxui-toggle-button');
    assert.ok(bold);
    assert.equal(bold.classList.contains('muxui-toggle-button--sm'), true);
    await act(async () => bold.click());
    assert.ok(changes.length > 0);
    assert.ok(changes.every((ids) => ids.length > 0));
  } finally {
    restore();
    dom.window.close();
  }
});

test('choice controls expose compact size variants through direct and group APIs', () => {
  const checkbox = renderToString(React.createElement(Checkbox, { size: 'sm' }, 'Compact'));
  assert.match(checkbox, /muxui-checkbox--sm/u);
  assert.match(checkbox, /data-size="sm"/u);
  const largeCheckbox = renderToString(React.createElement(Checkbox, { size: 'lg' }, 'Large'));
  assert.match(largeCheckbox, /muxui-checkbox--lg/u);
  assert.throws(() => renderToString(React.createElement(Checkbox, { size: 'xl' }, 'Invalid')), /Checkbox size must be one of/u);

  const checkboxGroup = renderToString(React.createElement(CheckboxGroup, {
    'aria-label': 'Choices',
    orientation: 'horizontal',
    size: 'sm',
  }, React.createElement(Checkbox, null, 'Compact')));
  assert.match(checkboxGroup, /data-orientation="horizontal"/u);
  assert.match(checkboxGroup, /muxui-checkbox--sm/u);

  const radioGroup = renderToString(React.createElement(RadioGroup, {
    'aria-label': 'Choice',
    size: 'sm',
    options: [{ value: 'one', label: 'One' }],
  }));
  assert.match(radioGroup, /muxui-radio--sm/u);
  const largeRadioGroup = renderToString(React.createElement(RadioGroup, { 'aria-label': 'Choice', size: 'lg', options: [{ value: 'one', label: 'One' }] }));
  assert.match(largeRadioGroup, /data-size="lg"/u);
  assert.throws(() => renderToString(React.createElement(RadioGroup, { 'aria-label': 'Choice', size: 'xl' })), /RadioGroup size must be one of/u);

  const radioField = renderToString(React.createElement(RadioGroup, { label: 'Plan' },
    React.createElement(RadioField.Root, { value: 'monthly' },
      React.createElement(RadioField.Button, null,
        React.createElement(RadioField.Indicator, null, React.createElement(RadioField.Dot)),
        'Monthly'))));
  assert.match(radioField, /muxui-radio-group/u);
  assert.match(radioField, /muxui-radio-field__button/u);
  assert.throws(() => renderToString(React.createElement(RadioGroup, {
    'aria-label': 'Choice',
    options: [{ value: 'one', label: 'One' }],
  }, React.createElement(RadioField.Root, null))), /mutually exclusive/u);
});

test('RadioGroup labels preserve primitive names and reference visual ReactNode labels', async () => {
  const primitiveMarkup = renderToString(React.createElement(RadioGroup, {
    label: 'Plan', options: [{ value: 'basic', label: 'Basic' }],
  }));
  const primitiveDom = new JSDOM(`<!doctype html><div id="root">${primitiveMarkup}</div>`);
  const primitiveGroup = primitiveDom.window.document.querySelector('[role="radiogroup"]');
  assert.equal(primitiveGroup?.getAttribute('aria-label'), 'Plan');
  assert.equal(primitiveGroup?.hasAttribute('aria-labelledby'), false);
  primitiveDom.window.close();

  const visualLabel = React.createElement(React.Fragment, null,
    React.createElement('strong', null, 'Plan'),
    React.createElement('span', null, ' selection'));
  const nodeMarkup = renderToString(React.createElement(RadioGroup, {
    label: visualLabel, options: [{ value: 'basic', label: 'Basic' }],
  }));
  assert.doesNotMatch(nodeMarkup, /\[object Object\]/u);
  const nodeDom = new JSDOM(`<!doctype html><div id="root">${nodeMarkup}</div>`);
  const nodeGroup = nodeDom.window.document.querySelector('[role="radiogroup"]');
  const nodeLabel = nodeDom.window.document.querySelector('.muxui-field-label');
  const generatedLabelId = nodeGroup?.getAttribute('aria-labelledby');
  assert.equal(nodeGroup?.getAttribute('aria-label'), null);
  assert.ok(generatedLabelId);
  assert.equal(nodeLabel?.id, generatedLabelId);
  assert.equal(nodeLabel?.textContent, 'Plan selection');
  nodeDom.window.close();

  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  const rootElement = document.querySelector('#root');
  const root = createRoot(rootElement);
  try {
    await act(async () => root.render(React.createElement(RadioGroup, {
      label: React.createElement('span', null, 'Visual plan'),
      'aria-label': 'Caller name',
      options: [{ value: 'basic', label: 'Basic' }],
    })));
    const explicitLabelGroup = rootElement.querySelector('[role="radiogroup"]');
    assert.equal(explicitLabelGroup?.getAttribute('aria-label'), 'Caller name');
    assert.equal(explicitLabelGroup?.hasAttribute('aria-labelledby'), false);

    await act(async () => root.render(React.createElement('div', null,
      React.createElement('span', { id: 'external-radio-label' }, 'External plan'),
      React.createElement(RadioGroup, {
        label: React.createElement('span', null, 'Visual plan'),
        'aria-labelledby': 'external-radio-label',
        options: [{ value: 'basic', label: 'Basic' }],
      }))));
    const labelledByGroup = rootElement.querySelector('[role="radiogroup"]');
    assert.equal(labelledByGroup?.getAttribute('aria-labelledby'), 'external-radio-label');
    assert.equal(labelledByGroup?.hasAttribute('aria-label'), false);
  } finally {
    await act(async () => root.unmount());
    restore();
    dom.window.close();
  }
});

test('RadioField inherits group size and selection context through Mux RadioGroup', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  try {
    const root = document.querySelector('#root');
    await act(async () => createRoot(root).render(React.createElement(RadioGroup, {
      'aria-label': 'Plan',
      size: 'sm',
      defaultValue: 'monthly',
    },
    React.createElement(RadioField.Root, { value: 'monthly' }, React.createElement(RadioField.Button, null,
      React.createElement(RadioField.Indicator, null, React.createElement(RadioField.Dot)), 'Monthly')),
    React.createElement(RadioField.Root, { value: 'yearly' }, React.createElement(RadioField.Button, null,
      React.createElement(RadioField.Indicator, null, React.createElement(RadioField.Dot)), 'Yearly')))));
    const fields = [...root.querySelectorAll('.muxui-radio-field')];
    assert.equal(fields.length, 2);
    assert.ok(fields.every((field) => field.classList.contains('muxui-radio-field--sm')));
    const radios = [...root.querySelectorAll('input[type="radio"]')];
    assert.equal(radios.length, 2);
    assert.equal(radios[0].checked, true);
    await act(async () => radios[1].click());
    assert.equal(radios[0].checked, false);
    assert.equal(radios[1].checked, true);
  } finally {
    restore();
    dom.window.close();
  }
});

test('R1.1 MuxUI labels, checkbox indicator states, and breadcrumb current normalization are accessible', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  try {
    const root = document.querySelector('#root');
    await act(async () => createRoot(root).render(React.createElement(React.Fragment, null,
      React.createElement(Breadcrumbs, {
        items: [
          { id: 'home', label: 'Home', href: '/', current: true },
          { id: 'docs', label: React.createElement('strong', null, 'Docs'), href: '/docs' },
        ],
      }),
      React.createElement(Checkbox, { indeterminate: true, invalid: true, disabled: true }, 'Accept'),
      React.createElement(Meter, { label: 'String storage', value: 50 }),
      React.createElement(Meter, { label: React.createElement('span', null, 'Storage'), value: 50 }),
      React.createElement(ProgressBar, { label: 'String upload', value: 50 }),
      React.createElement(ProgressBar, { label: React.createElement('span', null, 'Upload'), value: 50 }),
    )));
    assert.equal(root.querySelector('nav[aria-label="Breadcrumbs"]') !== null, true);
    assert.equal(root.querySelectorAll('[aria-current="page"]').length, 1);
    assert.equal(root.querySelector('[aria-current="page"]').textContent, 'Docs');
    assert.equal(root.querySelector('.muxui-checkbox-indicator[data-indeterminate]') !== null, true);
    assert.equal(root.querySelector('.muxui-checkbox[data-invalid]') !== null, true);
    assert.equal(root.querySelector('.muxui-checkbox[data-disabled]') !== null, true);
    const labelledComponents = [...root.querySelectorAll('.muxui-meter, .muxui-progress-bar')];
    assert.deepEqual(labelledComponents.map((component) => component.getAttribute('aria-label')), [null, null, null, null]);
    assert.deepEqual(labelledComponents.map((component) => {
      const id = component.getAttribute('aria-labelledby');
      return root.querySelector(`[id="${id}"]`)?.textContent;
    }), ['String storage', 'Storage', 'String upload', 'Upload']);
  } finally {
    restore();
    dom.window.close();
}
});

test('R1.1 Breadcrumbs disabled items and ProgressBar completion stay within the Mux contract', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  const navigated = [];
  try {
    const root = document.querySelector('#root');
    await act(async () => createRoot(root).render(React.createElement(React.Fragment, null,
      React.createElement(Breadcrumbs, {
        'aria-label': 'Breadcrumb',
        items: [
          { id: 'home', label: 'Home', href: '/', disabled: true },
          { id: 'no-link', label: 'No link', disabled: true },
          { id: 'docs', label: 'Docs', href: '/docs' },
          { id: 'current', label: 'Current', disabled: true },
        ],
        onNavigate: (item) => navigated.push(item.id),
      }),
      React.createElement(ProgressBar, { label: 'Default complete', value: 100 }),
      React.createElement(ProgressBar, { label: 'Over max', value: 125, minValue: 10, maxValue: 100 }),
      React.createElement(ProgressBar, { label: 'Infinity complete', value: Infinity }),
      React.createElement(ProgressBar, { label: 'NaN incomplete', value: NaN }),
      React.createElement(ProgressBar, { label: 'Below max', value: 99, minValue: 10, maxValue: 100 }),
      React.createElement(ProgressBar, { label: 'Indeterminate' }),
      React.createElement(ProgressBar, { label: 'Zero width', value: 20, minValue: 20, maxValue: 20 }),
    )));
    const disabledLink = root.querySelector('.muxui-breadcrumbs-link[data-disabled]');
    assert.ok(disabledLink);
    assert.equal(disabledLink.getAttribute('aria-disabled'), 'true');
    await act(async () => disabledLink.click());
    const disabledSpans = [...root.querySelectorAll('.muxui-breadcrumbs-current[data-disabled]')];
    assert.equal(disabledSpans.length, 2);
    assert.deepEqual(disabledSpans.map((item) => item.getAttribute('aria-disabled')), ['true', 'true']);
    const currentItem = root.querySelector('.muxui-breadcrumbs-current[aria-current="page"]');
    assert.ok(currentItem);
    assert.equal(currentItem.getAttribute('aria-disabled'), 'true');
    await act(async () => disabledSpans.forEach((item) => item.click()));
    assert.deepEqual(navigated, []);

    const progressBars = [...root.querySelectorAll('.muxui-progress-bar')];
    assert.equal(progressBars.length, 7);
    assert.equal(progressBars[0].getAttribute('data-complete'), 'true');
    assert.equal(progressBars[1].getAttribute('data-complete'), 'true');
    assert.equal(progressBars[2].getAttribute('data-complete'), 'true');
    assert.equal(progressBars[3].hasAttribute('data-complete'), false);
    assert.equal(progressBars[4].hasAttribute('data-complete'), false);
    assert.equal(progressBars[5].hasAttribute('data-complete'), false);
    assert.equal(progressBars[6].hasAttribute('data-complete'), false);
  } finally {
    restore();
    dom.window.close();
  }
});

test('Checkbox and Radio focus rings stay on indicators with shared keyline geometry', async () => {
  const [components, collections, generated] = await Promise.all([
    readFile(new URL('../src/styles/components.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/collections.css', import.meta.url), 'utf8'),
    readFile(new URL('../generated/styles.css', import.meta.url), 'utf8'),
  ]);
  const rootFocusOutline = /\.muxui-(?:checkbox|radio)(?::focus-within|\[data-focus-visible\])\s*\{[^}]*outline:/u;
  const focusRules = [
    ['Checkbox focus-visible indicator', /\.muxui-checkbox\[data-focus-visible\] \.muxui-checkbox-indicator\s*\{[^}]*0 0 0 1px var\(--muxui-semantic-focus-inner\),\s*0 0 0 3px var\(--muxui-semantic-focus-ring\)[^}]*\}/u],
    ['Checkbox focus-within indicator', /\.muxui-checkbox:focus-within \.muxui-checkbox-indicator\s*\{[^}]*box-shadow:\s*none;[^}]*outline:\s*2px solid var\(--muxui-semantic-focus-ring\);[^}]*outline-offset:\s*2px;/u],
    ['Radio semantic focus-visible indicator', /\.muxui-radio\[data-focus-visible\] \.muxui-radio-indicator\s*\{[^}]*0 0 0 2px var\(--muxui-semantic-focus-inner\),\s*0 0 0 4px var\(--muxui-semantic-focus-ring\)[^}]*\}/u],
    ['Radio mode-aware focus-visible indicator', /\.muxui-radio\[data-focus-visible\] \.muxui-radio-indicator\s*\{[^}]*0 0 0 2px var\(--muxui-focus-ring-inner\),\s*0 0 0 4px var\(--muxui-focus-ring-outer\)[^}]*\}/u],
  ];
  const forcedColorsFocusRules = [
    ['Checkbox forced-colors indicator', components, /\.muxui-checkbox\[data-focus-visible\] \.muxui-checkbox-indicator\s*\{[^}]*outline:\s*2px solid Highlight;[^}]*outline-offset:\s*1px;/u],
    ['Radio forced-colors indicator', collections, /\.muxui-radio\[data-focus-visible\] \.muxui-radio-indicator\s*\{[^}]*outline:\s*2px solid Highlight;[^}]*outline-offset:\s*1px;/u],
  ];

  assert.doesNotMatch(components, rootFocusOutline);
  assert.doesNotMatch(generated, rootFocusOutline);
  for (const [label, rule] of focusRules) {
    const source = label.startsWith('Radio') ? collections : components;
    assert.match(source, rule, `${label} source declaration is missing`);
    assert.match(generated, rule, `${label} generated declaration is missing`);
  }
  for (const [label, source, rule] of forcedColorsFocusRules) {
    assert.match(source, rule, `${label} source declaration is missing`);
    assert.match(generated, rule, `${label} generated declaration is missing`);
  }
});

test('Checkbox and Radio generated CSS suppresses native input outlines', async () => {
  const [components, collections, generated] = await Promise.all([
    readFile(new URL('../src/styles/components.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/collections.css', import.meta.url), 'utf8'),
    readFile(new URL('../generated/styles.css', import.meta.url), 'utf8'),
  ]);
  const inputOutlineRules = [
    ['Checkbox', components, /\.muxui-checkbox input\[type='checkbox'\]\s*\{[^}]*outline:\s*none;/u],
    ['Radio', collections, /\.muxui-radio input\[type='radio'\]\s*\{[^}]*outline:\s*none;/u],
  ];

  for (const [label, source, rule] of inputOutlineRules) {
    assert.match(source, rule, `${label} source input reset is missing`);
    assert.match(generated, rule, `${label} generated input reset is missing`);
  }
});

test('DisclosureGroup uses accordion trigger geometry without changing standalone Disclosure sizing', async () => {
  const server = renderToString(React.createElement(React.Fragment, null,
    React.createElement(Disclosure, { title: 'Standalone' }, 'Content'),
    React.createElement(DisclosureGroup, null,
      React.createElement(Disclosure, { id: 'grouped', title: 'Grouped' }, 'Content'))));
  const dom = new JSDOM(`<!doctype html><div id="root">${server}</div>`);
  const standalone = dom.window.document.querySelector('.muxui-disclosure:not(.muxui-disclosure-group) .muxui-disclosure-trigger')
    ?? dom.window.document.querySelector('.muxui-disclosure-trigger');
  const grouped = dom.window.document.querySelector('.muxui-disclosure-group .muxui-disclosure-trigger');
  assert.ok(standalone);
  assert.ok(grouped);
  assert.equal(grouped.closest('.muxui-disclosure-group')?.classList.contains('muxui-disclosure-group'), true);
  const styles = await readFile(new URL('../generated/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /\.muxui-disclosure-group \.muxui-disclosure-trigger\s*\{[^}]*width:\s*100%[\s\S]*padding:\s*var\(--muxui-semantic-layout-control-inset\)/u);
  assert.match(styles, /\.muxui-disclosure-trigger\s*\{[\s\S]*width:\s*fit-content/u);
  dom.window.close();
});

test('Group read-only state stays data-only for its supported roles', () => {
  for (const role of ['group', 'region', 'presentation']) {
    const markup = renderToString(React.createElement(Group, {
      role,
      readOnly: true,
      'aria-label': `${role} actions`,
    }, React.createElement('button', { type: 'button' }, 'Save')));
    assert.match(markup, /data-readonly="true"/u, role);
    assert.doesNotMatch(markup, /aria-readonly=/u, role);
  }
});
