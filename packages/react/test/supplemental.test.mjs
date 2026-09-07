import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { RadioGroup as AriaRadioGroup } from 'react-aria-components';
import { Form as AriaForm } from 'react-aria-components';
import { JSDOM } from 'jsdom';
import {
  AlertDialog,
  ButtonGroup,
  Card,
  CheckboxField,
  ColorModeToggle,
  CommandPalette,
  HeaderNav,
  Input,
  InputTags,
  MultiSelect,
  PaymentInput,
  ProgressCircle,
  RadioField,
  Sidebar,
  SwitchField,
  TagSelect,
  TextArea,
  supplementalFamilies,
} from '../src/supplemental/index.mjs';
import { SupplementalBrowserFixture } from './fixtures/supplemental-browser-fixture.mjs';

const packageRoot = resolve(import.meta.dirname, '..');

function installDom(dom) {
  const keys = ['window', 'document', 'Element', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'HTMLLabelElement', 'HTMLDivElement', 'HTMLFormElement', 'SVGElement', 'Node', 'NodeFilter', 'Event', 'InputEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'PointerEvent', 'CustomEvent', 'MutationObserver', 'FormData', 'CSS', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const previous = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  Object.assign(globalThis, Object.fromEntries(keys.map((key) => [key, dom.window[key] ?? globalThis[key]])));
  globalThis.requestAnimationFrame ??= (callback) => setTimeout(callback, 0);
  globalThis.cancelAnimationFrame ??= (handle) => clearTimeout(handle);
  globalThis.CSS ??= { escape: (value) => String(value).replace(/[^a-zA-Z0-9_-]/gu, (character) => `\\${character}`) };
  dom.window.HTMLElement.prototype.attachEvent ??= () => {};
  dom.window.HTMLElement.prototype.detachEvent ??= () => {};
  dom.window.HTMLElement.prototype.scrollTo ??= () => {};
  dom.window.Element.prototype.scrollTo ??= () => {};
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  };
}

function setInputValue(input, value) {
  input.focus();
  const setter = Object.getOwnPropertyDescriptor(input.ownerDocument.defaultView.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new input.ownerDocument.defaultView.InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('change', { bubbles: true }));
}

test('supplemental index exposes the exact admitted 17-family surface', () => {
  assert.deepEqual([...supplementalFamilies], [
    'AlertDialog', 'ButtonGroup', 'Card', 'CheckboxField', 'ColorModeToggle',
    'CommandPalette', 'HeaderNav', 'InputTags', 'Input', 'MultiSelect',
    'PaymentInput', 'ProgressCircle', 'RadioField', 'Sidebar', 'SwitchField',
    'TagSelect', 'TextArea',
  ]);
});

test('package-owned browser fixture is self-contained and exposes repeatable assertions', () => {
  const html = renderToStaticMarkup(React.createElement(SupplementalBrowserFixture));
  assert.match(html, /data-muxui-supplemental-browser-fixture="true"/u);
  assert.match(html, /data-testid="mode"/u);
  assert.match(html, /data-testid="tags"/u);
  assert.match(html, /data-testid="selected"/u);
  assert.match(html, /data-testid="tag-selected"/u);
  assert.match(html, /data-testid="card-surface"/u);
  assert.doesNotMatch(html, /tale-/u);
});

test('supplemental compound parts render with Mux-owned anatomy and no donor selectors', () => {
  const tree = React.createElement(React.Fragment, null,
    React.createElement(ButtonGroup, { 'aria-label': 'Actions' }, React.createElement('button', null, 'Save')),
    React.createElement(Card.Root, { variant: 'outlined' }, React.createElement(Card.Header, null, 'Title'), React.createElement(Card.Body, null, 'Body')),
    React.createElement(Input.Root, { 'aria-label': 'Name', defaultValue: 'Ada' }, React.createElement(Input.Input)),
    React.createElement(TextArea.Root, { 'aria-label': 'Notes' }, React.createElement(TextArea.TextArea, { rows: 3 })),
    React.createElement(ProgressCircle.Root, { value: 40, label: 'Progress' }, React.createElement(ProgressCircle.Track), React.createElement(ProgressCircle.Value)),
    React.createElement(ColorModeToggle, { 'aria-label': 'Color mode' }),
  );
  const html = renderToStaticMarkup(tree);
  assert.match(html, /muxui-button-group/u);
  assert.match(html, /muxui-card__header/u);
  assert.match(html, /muxui-input__root/u);
  assert.match(html, /class="muxui-input"/u);
  assert.doesNotMatch(html, /muxui-input__input/u);
  assert.match(html, /muxui-text-area__textarea/u);
  assert.match(html, /muxui-progress-circle__indicator/u);
  assert.doesNotMatch(html, /tale-/u);
});

test('supplemental field and collection modules preserve accessible state hooks in SSR', () => {
  const tree = React.createElement(React.Fragment, null,
    React.createElement(CheckboxField.Root, { checked: true, invalid: true }, React.createElement(CheckboxField.Button, null, React.createElement(CheckboxField.Indicator), 'Accept'), React.createElement(CheckboxField.Error, null, 'Required')),
    React.createElement(AriaRadioGroup, { 'aria-label': 'Plan', value: 'one' }, React.createElement(RadioField.Root, { value: 'one' }, React.createElement(RadioField.Button, null, React.createElement(RadioField.Indicator, null, React.createElement(RadioField.Dot)), 'One'))),
    React.createElement(AriaRadioGroup, { 'aria-label': 'Invalid plan', isInvalid: true }, React.createElement(RadioField.Root, { value: 'invalid', invalid: true }, React.createElement(RadioField.Button, null, React.createElement(RadioField.Indicator, null, React.createElement(RadioField.Dot)), 'Invalid'), React.createElement(RadioField.Description, null, 'Choose a plan.'), React.createElement(RadioField.Error, null, 'A plan is required.'))),
    React.createElement(SwitchField.Root, { checked: true }, React.createElement(SwitchField.Button, null, React.createElement(SwitchField.Thumb), 'Updates')),
    React.createElement(InputTags.Root, { defaultValue: ['React'], label: 'Tags' }),
    React.createElement(PaymentInput.Root, { defaultValue: '4111111111111111', 'aria-label': 'Card number' }, React.createElement(PaymentInput.Group, null, React.createElement(PaymentInput.Input), React.createElement(PaymentInput.CardIcon))),
    React.createElement(TagSelect.Root, { items: [{ id: 'one', label: 'One' }], label: 'Tags' }),
  );
  const html = renderToStaticMarkup(tree);
  assert.match(html, /muxui-checkbox-field/u);
  assert.match(html, /muxui-radio-field/u);
  assert.match(html, /role="alert" class="muxui-radio-field__error"/u);
  assert.match(html, /muxui-switch-field/u);
  assert.match(html, /muxui-input-tags__tag/u);
  assert.match(html, /data-card-type="visa"/u);
  assert.match(html, /muxui-tag-select__input/u);
});


test('RadioField links group-invalid errors without replacing descriptions or caller references', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  try {
    let setInvalid;
    let setCallerDescription;
    let setErrorId;
    function Field() {
      const [invalid, setInvalidState] = React.useState(false);
      const [callerDescription, setCallerDescriptionState] = React.useState('external-description');
      const [errorId, setErrorIdState] = React.useState('custom-radio-error');
      setInvalid = setInvalidState;
      setCallerDescription = setCallerDescriptionState;
      setErrorId = setErrorIdState;
      return React.createElement(AriaRadioGroup, { 'aria-label': 'Plan', isInvalid: invalid },
        React.createElement('span', { id: 'external-description' }, 'External context'),
        React.createElement('span', { id: 'replacement-description' }, 'Replacement context'),
        React.createElement(RadioField.Root, { value: 'monthly' },
          React.createElement(RadioField.Button, { 'aria-describedby': callerDescription }, React.createElement(RadioField.Indicator, null, React.createElement(RadioField.Dot)), 'Monthly'),
          React.createElement(RadioField.Description, null, 'Billed every month.'),
          React.createElement(RadioField.Error, { id: errorId }, 'Choose a plan.'),
        ),
      );
    }
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(Field)));
    const description = document.querySelector('.muxui-radio-field__description');
    let input = document.querySelector('.muxui-radio-field input');
    assert.match(input?.getAttribute('aria-describedby') ?? '', new RegExp(description?.id ?? 'missing-description', 'u'));
    assert.match(input?.getAttribute('aria-describedby') ?? '', /external-description/u);
    assert.equal(input?.getAttribute('aria-errormessage'), null);
    assert.equal(document.querySelector('.muxui-radio-field__error'), null);
    await act(async () => setCallerDescription('replacement-description'));
    input = document.querySelector('.muxui-radio-field input');
    assert.match(input?.getAttribute('aria-describedby') ?? '', new RegExp(description?.id ?? 'missing-description', 'u'));
    assert.match(input?.getAttribute('aria-describedby') ?? '', /replacement-description/u);
    assert.doesNotMatch(input?.getAttribute('aria-describedby') ?? '', /external-description/u);
    await act(async () => setInvalid(true));
    input = document.querySelector('.muxui-radio-field input');
    let error = document.querySelector('.muxui-radio-field__error');
    assert.equal(error?.id, 'custom-radio-error');
    assert.equal(error?.getAttribute('role'), 'alert');
    assert.equal(input?.getAttribute('aria-errormessage'), error?.id);
    await act(async () => setErrorId('replacement-radio-error'));
    input = document.querySelector('.muxui-radio-field input');
    error = document.querySelector('.muxui-radio-field__error');
    assert.equal(error?.id, 'replacement-radio-error');
    assert.equal(input?.getAttribute('aria-errormessage'), error?.id);
    await act(async () => setInvalid(false));
    input = document.querySelector('.muxui-radio-field input');
    assert.equal(document.querySelector('.muxui-radio-field__error'), null);
    assert.equal(input?.getAttribute('aria-errormessage'), null);
    assert.match(input?.getAttribute('aria-describedby') ?? '', new RegExp(description?.id ?? 'missing-description', 'u'));
    assert.match(input?.getAttribute('aria-describedby') ?? '', /replacement-description/u);
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('CheckboxField and SwitchField own controlled, default, disabled, and read-only selection on Root', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  try {
    const changes = [];
    function Fields() {
      const [checkboxChecked, setCheckboxChecked] = React.useState(false);
      const [switchChecked, setSwitchChecked] = React.useState(false);
      return React.createElement('form', null,
        React.createElement(CheckboxField.Root, { checked: checkboxChecked, name: 'checkbox', value: 'controlled', onChange: (next) => { changes.push(['checkbox', next]); setCheckboxChecked(next); } }, React.createElement(CheckboxField.Button, null, React.createElement(CheckboxField.Indicator), 'Controlled checkbox')),
        React.createElement(CheckboxField.Root, { defaultChecked: true, indeterminate: true, name: 'indeterminate', value: 'mixed' }, React.createElement(CheckboxField.Button, null, React.createElement(CheckboxField.Indicator), 'Default checkbox')),
        React.createElement(CheckboxField.Root, { defaultChecked: true, readOnly: true, name: 'read-only-checkbox', value: 'locked' }, React.createElement(CheckboxField.Button, null, React.createElement(CheckboxField.Indicator), 'Read only checkbox')),
        React.createElement(CheckboxField.Root, { defaultChecked: true, disabled: true, name: 'disabled-checkbox', value: 'disabled' }, React.createElement(CheckboxField.Button, null, React.createElement(CheckboxField.Indicator), 'Disabled checkbox')),
        React.createElement(SwitchField.Root, { checked: switchChecked, name: 'switch', value: 'controlled', onChange: (next) => { changes.push(['switch', next]); setSwitchChecked(next); } }, React.createElement(SwitchField.Button, null, React.createElement(SwitchField.Thumb), 'Controlled switch')),
        React.createElement(SwitchField.Root, { defaultChecked: true, readOnly: true, name: 'read-only-switch', value: 'locked' }, React.createElement(SwitchField.Button, null, React.createElement(SwitchField.Thumb), 'Read only switch')),
        React.createElement(SwitchField.Root, { defaultChecked: true, disabled: true, name: 'disabled-switch', value: 'disabled' }, React.createElement(SwitchField.Button, null, React.createElement(SwitchField.Thumb), 'Disabled switch')),
      );
    }
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(Fields)));
    const checkboxInputs = [...document.querySelectorAll('.muxui-checkbox-field input')];
    const switchInputs = [...document.querySelectorAll('.muxui-switch-field input')];
    assert.equal(checkboxInputs.length, 4);
    assert.equal(switchInputs.length, 3);
    assert.equal(checkboxInputs[0].checked, false);
    assert.equal(checkboxInputs[1].indeterminate, true);
    assert.equal(checkboxInputs[2].checked, true);
    assert.equal(checkboxInputs[3].disabled, true);
    assert.equal(switchInputs[0].checked, false);
    assert.equal(switchInputs[1].checked, true);
    assert.equal(switchInputs[2].disabled, true);
    await act(async () => checkboxInputs[0].click());
    await act(async () => switchInputs[0].click());
    await act(async () => checkboxInputs[2].click());
    await act(async () => switchInputs[1].click());
    await act(async () => checkboxInputs[3].click());
    await act(async () => switchInputs[2].click());
    assert.deepEqual(changes, [['checkbox', true], ['switch', true]]);
    assert.equal(checkboxInputs[0].checked, true);
    assert.equal(switchInputs[0].checked, true);
    assert.equal(checkboxInputs[2].checked, true);
    assert.equal(switchInputs[1].checked, true);
    assert.deepEqual([...new dom.window.FormData(document.querySelector('form')).entries()], [
      ['checkbox', 'controlled'], ['indeterminate', 'mixed'], ['read-only-checkbox', 'locked'],
      ['switch', 'controlled'], ['read-only-switch', 'locked'],
    ]);
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('InputTags gives its editable input the label while preserving consumer overrides', () => {
  const labelled = new JSDOM(renderToStaticMarkup(React.createElement(InputTags.Root, { label: 'Technologies' })));
  const labelledInput = labelled.window.document.querySelector('.muxui-input-tags__input');
  const label = labelled.window.document.querySelector('.muxui-input-tags__label');
  assert.equal(labelledInput?.getAttribute('aria-labelledby'), label?.id);
  assert.equal(labelledInput?.getAttribute('aria-label'), null);

  const overridden = new JSDOM(renderToStaticMarkup(React.createElement(InputTags.Root, { label: 'Technologies', 'aria-label': 'Tag editor' })));
  const overriddenInput = overridden.window.document.querySelector('.muxui-input-tags__input');
  assert.equal(overriddenInput?.getAttribute('aria-label'), 'Tag editor');
  assert.equal(overriddenInput?.getAttribute('aria-labelledby'), null);
});

test('InputTags associates live supporting text and field state with its actual input', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  let setInvalid;
  let setDescription;
  try {
    function Field() {
      const [invalid, setInvalidState] = React.useState(false);
      const [showDescription, setDescriptionState] = React.useState(true);
      setInvalid = setInvalidState;
      setDescription = setDescriptionState;
      return React.createElement(React.Fragment, null,
        React.createElement('span', { id: 'caller-description' }, 'Caller guidance'),
        React.createElement(InputTags.Root, {
          label: 'Tags', required: true, invalid, description: showDescription ? 'Add a tag.' : undefined,
          errorMessage: 'Tags are invalid.', 'aria-describedby': 'caller-description',
        }),
      );
    }
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(Field)));
    let input = document.querySelector('.muxui-input-tags__input');
    const label = document.querySelector('.muxui-input-tags__label');
    const description = document.querySelector('.muxui-input-tags__description');
    assert.equal(input?.getAttribute('aria-labelledby'), label?.id);
    assert.equal(input?.getAttribute('aria-required'), 'true');
    assert.equal(input?.getAttribute('aria-invalid'), null);
    assert.equal(input?.getAttribute('aria-describedby'), `caller-description ${description?.id}`);
    await act(async () => setInvalid(true));
    input = document.querySelector('.muxui-input-tags__input');
    const error = document.querySelector('.muxui-input-tags__error');
    assert.equal(input?.getAttribute('aria-invalid'), 'true');
    assert.equal(document.querySelector('.muxui-input-tags__description'), null);
    assert.equal(input?.getAttribute('aria-describedby'), `caller-description ${error?.id}`);
    await act(async () => setInvalid(false));
    input = document.querySelector('.muxui-input-tags__input');
    assert.equal(input?.getAttribute('aria-invalid'), null);
    assert.equal(input?.getAttribute('aria-describedby'), `caller-description ${document.querySelector('.muxui-input-tags__description')?.id}`);
    await act(async () => setDescription(false));
    input = document.querySelector('.muxui-input-tags__input');
    assert.equal(document.querySelector('.muxui-input-tags__description'), null);
    assert.equal(input?.getAttribute('aria-describedby'), 'caller-description');
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('compound overlays render stable Mux-owned parts in closed or static SSR state', () => {
  const tree = React.createElement(React.Fragment, null,
    React.createElement(AlertDialog.Root, { defaultOpen: false }, React.createElement(AlertDialog.Trigger, null, 'Delete')),
    React.createElement(CommandPalette.Root, { defaultOpen: false }, React.createElement(CommandPalette.Trigger, null, 'Search')),
    React.createElement(HeaderNav.Root, null, React.createElement(HeaderNav.Logo, { href: '/' }, 'Mux'), React.createElement(HeaderNav.Secondary, null, React.createElement(HeaderNav.NavButton, { href: '/', current: true }, 'Home'))),
    React.createElement(Sidebar.Root, null, React.createElement(Sidebar.NavList, null, React.createElement(Sidebar.NavItem, { href: '/', current: true }, 'Home'))),
    React.createElement(MultiSelect.Root, { items: [{ id: 'one', label: 'One' }], label: 'Options' }, (item) => React.createElement(MultiSelect.Item, { id: item.id }, item.label)),
  );
  const html = renderToStaticMarkup(tree);
  assert.match(html, /muxui-alert-dialog__trigger/u);
  assert.match(html, /muxui-command-palette__trigger/u);
  assert.match(html, /muxui-header-nav/u);
  assert.match(html, /muxui-sidebar__nav-list/u);
  assert.match(html, /muxui-multi-select__trigger/u);
});

test('supplemental declarations and CSS do not leak donor API names or selectors', async () => {
  const declaration = await readFile(resolve(packageRoot, 'src/supplemental/index.d.ts'), 'utf8');
  const styles = await readFile(resolve(packageRoot, 'src/supplemental/styles.css'), 'utf8');
  assert.doesNotMatch(declaration, /\b(?:isDisabled|isInvalid|isSelected|isOpen|onPress)\b/u);
  assert.doesNotMatch(declaration, /react-aria-components|tale-ui|@tale-ui|Tale/u);
  assert.doesNotMatch(styles, /\.tale-|--(?:neutral|color|red|success|space|radius|shadow)-/u);
  assert.match(styles, /--muxui-(?:semantic|reference)-/u);
  assert.doesNotMatch(styles, /--muxui-reference-color-neutral-/u);
  assert.doesNotMatch(styles, /--muxui-semantic-elevation-(?:control|overlay|indicator)/u);
  assert.match(styles, /--muxui-reference-effect-shadow-(?:s|m|l)/u);
  assert.doesNotMatch(styles, /var\(--(?:text-line-height|mono-font-family|mono-xs-font-size|text-font-weight|transparent)\b/u);
  assert.match(styles, /--muxui-semantic-typography-body-line-height/u);
  assert.match(styles, /--muxui-reference-typography-mono-font/u);
  assert.match(styles, /--muxui-semantic-typography-mono-xs-font-size/u);
  assert.match(styles, /--muxui-semantic-typography-text-font-weight/u);
  assert.match(styles, /\.muxui-multi-select__value--placeholder\s*\{\s*color:\s*var\(--muxui-semantic-color-neutral-60\);/u);
  assert.match(styles, /\btransparent\b/u);
});

test('supplemental CSS classifies foundation tokens separately from local component hooks', async () => {
  const styles = await readFile(resolve(packageRoot, 'src/supplemental/styles.css'), 'utf8');
  const references = new Set([...styles.matchAll(/var\(--([A-Za-z0-9_-]+)/gu)].map((match) => match[1]));
  const foundations = [...references].filter((name) => /^(?:muxui-semantic|muxui-reference)-/u.test(name));
  const localHooks = [...references].filter((name) => /^muxui-(?:focus-ring|field|item|popup|group-label|switch-field)-/u.test(name));
  const runtimeLocals = [...references].filter((name) => /^(?:size|ray-size|offset-diagonal|offset-orthogonal)$/u.test(name));
  const unknown = [...references].filter((name) => !foundations.includes(name) && !localHooks.includes(name) && !runtimeLocals.includes(name));
  assert.ok(foundations.some((name) => name.startsWith('muxui-semantic-')));
  assert.ok(foundations.some((name) => name.startsWith('muxui-reference-')));
  assert.ok(localHooks.some((name) => name.startsWith('muxui-field-')));
  assert.ok(runtimeLocals.length > 0);
  assert.deepEqual(unknown, []);
});

test('supplemental family declarations expose only their matching value and types', async () => {
  const families = {
    'alert-dialog': 'AlertDialog',
    'button-group': 'ButtonGroup',
    card: 'Card',
    'checkbox-field': 'CheckboxField',
    'color-mode-toggle': 'ColorModeToggle',
    'command-palette': 'CommandPalette',
    'header-nav': 'HeaderNav',
    'input-tags': 'InputTags',
    input: 'Input',
    'multi-select': 'MultiSelect',
    'payment-input': 'PaymentInput',
    'progress-circle': 'ProgressCircle',
    'radio-field': 'RadioField',
    sidebar: 'Sidebar',
    'switch-field': 'SwitchField',
    'tag-select': 'TagSelect',
    'text-area': 'TextArea',
  };
  const familyNames = Object.values(families);
  for (const [slug, family] of Object.entries(families)) {
    const declaration = await readFile(resolve(packageRoot, `src/supplemental/${slug}.d.ts`), 'utf8');
    assert.doesNotMatch(declaration, /export \* from/u, `${slug} must not re-export the whole supplemental index`);
    assert.match(declaration, new RegExp(`export \\{ ${family} \\} from`), `${slug} must export ${family}`);
    for (const otherFamily of familyNames.filter((name) => name !== family)) {
      assert.doesNotMatch(declaration, new RegExp(`export \\{ ${otherFamily} \\} from`), `${slug} must not export ${otherFamily}`);
    }
  }
});

test('Input and TextArea roots retain native string field props in their declarations', async () => {
  const declaration = await readFile(resolve(packageRoot, 'src/supplemental/index.d.ts'), 'utf8');
  assert.match(declaration, /export type InputRootProps = Omit<React\.HTMLAttributes<HTMLDivElement>, 'onChange'> & SupplementalFieldProps & \{[\s\S]*?value\?: string;[\s\S]*?defaultValue\?: string;[\s\S]*?onChange\?: \(value: string\) => void;/u);
  assert.match(declaration, /export type TextAreaRootProps = Omit<React\.HTMLAttributes<HTMLDivElement>, 'onChange'> & SupplementalFieldProps & \{[\s\S]*?value\?: string;[\s\S]*?defaultValue\?: string;[\s\S]*?onChange\?: \(value: string\) => void;/u);
  assert.match(declaration, /MultiSelectItemProps[\s\S]*?textValue\?: string/u);
  assert.match(declaration, /CheckboxFieldRootProps[\s\S]*?name\?: string;[\s\S]*?value\?: string/u);
  assert.match(declaration, /SwitchFieldRootProps[\s\S]*?name\?: string;[\s\S]*?value\?: string/u);
  assert.match(declaration, /RadioFieldRootProps[\s\S]*?value: string/u);
  assert.doesNotMatch(declaration, /export type RadioFieldButtonProps = [^\n]*?(?:value|selected|onChange)\?:/u);
  assert.match(declaration, /TagSelectItemProps[\s\S]*?textValue\?: string/u);
  assert.match(declaration, /interface MultiSelectRootComponent[\s\S]*?<T extends MultiSelectItem/u);
  assert.match(declaration, /interface TagSelectRootComponent[\s\S]*?<T extends TagSelectItem/u);
  assert.match(declaration, /CommandPaletteItemProps[\s\S]*?textValue\?: string/u);
});

test('Input uses the donor-backed root and control anatomy', () => {
  const html = renderToStaticMarkup(React.createElement(
    Input.Root,
    { 'aria-label': 'Name', invalid: true },
    React.createElement(Input.Input),
  ));
  assert.match(html, /class="muxui-input__root"/u);
  assert.match(html, /class="muxui-input"/u);
  assert.match(html, /aria-invalid="true"/u);
  assert.doesNotMatch(html, /muxui-input__input/u);
});

test('MultiSelect gives its trigger stable accessible naming and finite state classes', async () => {
  const labelled = new JSDOM(renderToStaticMarkup(React.createElement(
    MultiSelect.Root,
    { label: 'Technologies', invalid: true },
  )));
  const label = labelled.window.document.querySelector('.muxui-multi-select__label');
  const trigger = labelled.window.document.querySelector('.muxui-multi-select__trigger');
  assert.ok(label?.id);
  assert.equal(trigger?.getAttribute('aria-labelledby'), label?.id);
  assert.equal(trigger?.getAttribute('aria-label'), null);
  assert.ok(trigger?.classList.contains('muxui-multi-select__trigger--invalid'));

  const named = new JSDOM(renderToStaticMarkup(React.createElement(
    MultiSelect.Root,
    { label: 'Technologies', 'aria-label': 'Choose technologies', 'aria-labelledby': 'external-label' },
  )));
  const namedTrigger = named.window.document.querySelector('.muxui-multi-select__trigger');
  assert.equal(namedTrigger?.getAttribute('aria-label'), 'Choose technologies');
  assert.equal(namedTrigger?.getAttribute('aria-labelledby'), 'external-label');

  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  try {
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(MultiSelect.Root, { items: [{ id: 'one', label: 'One' }], label: 'Technologies' }, (item) => React.createElement(MultiSelect.Item, { id: item.id, textValue: item.label }, item.label))));
    await act(async () => document.querySelector('.muxui-multi-select__trigger')?.click());
    assert.equal(document.querySelectorAll('.muxui-multi-select__footer-btn').length, 2);
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('CommandPalette registers section headers and hides shortcut presentation by default', () => {
  const sectionHeader = renderToStaticMarkup(React.createElement(
    CommandPalette.Root,
    null,
    React.createElement(CommandPalette.ListBox, { 'aria-label': 'Commands' },
      React.createElement(CommandPalette.Section, null,
        React.createElement(CommandPalette.SectionHeader, null, 'Recent'),
        React.createElement(CommandPalette.Item, { id: 'one', title: 'One' }),
      ),
    ),
  ));
  assert.match(sectionHeader, /data-rac=""/u);
  assert.match(sectionHeader, /muxui-command-palette__section-header/u);

  const shortcut = new JSDOM(renderToStaticMarkup(React.createElement(CommandPalette.Shortcut, { keys: ['Mod', 'K'] })));
  const shortcutRoot = shortcut.window.document.querySelector('.muxui-command-palette__shortcut');
  assert.equal(shortcutRoot?.getAttribute('aria-hidden'), 'true');
  assert.deepEqual([...shortcut.window.document.querySelectorAll('kbd')].map((key) => key.className), [
    'muxui-command-palette__shortcut-key',
    'muxui-command-palette__shortcut-key',
  ]);
});

test('PaymentInput propagates field naming and keeps the card icon decorative', () => {
  const labelled = new JSDOM(renderToStaticMarkup(React.createElement(
    PaymentInput.Root,
    null,
    React.createElement(PaymentInput.Label, { id: 'card-label' }, 'Card number'),
    React.createElement(PaymentInput.Group, null, React.createElement(PaymentInput.Input), React.createElement(PaymentInput.CardIcon)),
  )));
  const labelledInput = labelled.window.document.querySelector('.muxui-payment-input__input');
  const labelledIcon = labelled.window.document.querySelector('.muxui-payment-input__card-icon');
  assert.ok(labelledInput?.getAttribute('aria-labelledby'));
  assert.equal(labelledIcon?.getAttribute('aria-label'), null);
  assert.equal(labelledIcon?.getAttribute('aria-hidden'), 'true');

  const named = new JSDOM(renderToStaticMarkup(React.createElement(
    PaymentInput.Root,
    { 'aria-label': 'Payment card number' },
    React.createElement(PaymentInput.Group, null, React.createElement(PaymentInput.Input), React.createElement(PaymentInput.CardIcon)),
  )));
  assert.equal(named.window.document.querySelector('.muxui-payment-input__input')?.getAttribute('aria-label'), 'Payment card number');
});

test('ProgressCircle delegates accessible range semantics to React Aria', () => {
  const render = (value, minValue = 0, maxValue = 100) => renderToStaticMarkup(React.createElement(
    ProgressCircle.Root,
    { value, minValue, maxValue, label: 'Upload progress' },
    React.createElement(ProgressCircle.Label, null, 'Upload progress'),
    React.createElement(ProgressCircle.Track),
  ));
  const under = render(-1);
  const over = render(101);
  const nullValue = render(null);
  const undefinedValue = render(undefined);
  const nan = render(Number.NaN);
  const zeroRange = render(0, 0, 0);
  assert.match(under, /aria-valuenow="0"/u);
  assert.match(over, /aria-valuenow="100"/u);
  for (const indeterminate of [nullValue, undefinedValue, nan]) {
    assert.match(indeterminate, /data-indeterminate=""/u);
    assert.doesNotMatch(indeterminate, /aria-valuenow=/u);
    assert.doesNotMatch(indeterminate, /aria-valuetext=/u);
  }
  assert.match(zeroRange, /aria-valuemin="0" aria-valuemax="0"/u);
  assert.match(zeroRange, /aria-valuenow="0"/u);
  assert.match(zeroRange, /aria-labelledby="[^"]+"/u);
  assert.match(zeroRange, /class="muxui-progress-circle__label"/u);
});

test('MultiSelect materializes iterable items once for all-selection counts', () => {
  function* items() {
    yield { id: 'one', label: 'One' };
    yield { id: 'two', label: 'Two' };
  }
  const html = renderToStaticMarkup(React.createElement(
    MultiSelect.Root,
    { items: items(), selectedKeys: 'all', label: 'Options', showFooter: false },
    (item) => React.createElement(MultiSelect.Item, { id: item.id, textValue: item.label }, item.label),
  ));
  assert.match(html, /2 selected/u);
});

test('PaymentInput applies the exact Mastercard 2221-2720 range', () => {
  const render = (digits) => renderToStaticMarkup(React.createElement(
    PaymentInput.Root,
    { defaultValue: digits, 'aria-label': `Card ${digits}` },
    React.createElement(PaymentInput.CardIcon),
  ));
  assert.match(render('2220'), /data-card-type="unknown"/u);
  assert.match(render('2221'), /data-card-type="mastercard"/u);
  assert.match(render('2720'), /data-card-type="mastercard"/u);
  assert.match(render('2721'), /data-card-type="unknown"/u);
});

test('InputTags supports keyboard add and remove while preserving the field contract', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  try {
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(React.Fragment, null,
      React.createElement(InputTags.Root, { defaultValue: ['React'], label: 'Technologies' }),
      React.createElement(InputTags.Root, { label: 'Frameworks' }),
    )));
    const inputs = [...document.querySelectorAll('.muxui-input-tags__input')];
    const labels = [...document.querySelectorAll('.muxui-input-tags__label')];
    assert.equal(inputs.length, 2);
    assert.equal(labels.length, 2);
    assert.equal(new Set(labels.map((node) => node.id)).size, 2);
    assert.equal(inputs[0].getAttribute('aria-labelledby'), labels[0].id);
    assert.equal(inputs[1].getAttribute('aria-labelledby'), labels[1].id);
    const initialLabelIds = inputs.map((node) => node.getAttribute('aria-labelledby'));
    const input = inputs[0];
    assert.ok(input);
    assert.equal(document.querySelectorAll('.muxui-input-tags__tag').length, 1);
    const initialRow = document.querySelector('.muxui-input-tags__tag-wrapper [role="row"]');
    const tagWrapper = document.querySelector('.muxui-input-tags__tag-wrapper');
    const tagWrapperPropsKey = Object.keys(tagWrapper).find((key) => key.startsWith('__reactProps'));
    initialRow.focus();
    tagWrapper[tagWrapperPropsKey].onKeyDown({ key: 'ArrowRight' });
    assert.equal(document.activeElement, input);
    await act(async () => {
      const propsKey = Object.keys(input).find((key) => key.startsWith('__reactProps'));
      input[propsKey].onChange({ target: { value: 'GraphQL' } });
    });
    assert.equal(input.value, 'GraphQL');
    await act(async () => {
      const refreshed = document.querySelector('.muxui-input-tags__input');
      refreshed.focus();
      refreshed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    assert.deepEqual([...document.querySelectorAll('.muxui-input-tags__input')].map((node) => node.getAttribute('aria-labelledby')), initialLabelIds);
    assert.match(document.querySelector('.muxui-input-tags__tag-wrapper')?.textContent ?? '', /React.*GraphQL/u);
    await act(async () => {
      const refreshed = document.querySelector('.muxui-input-tags__input');
      refreshed.focus();
      refreshed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    });
    assert.equal(document.activeElement?.getAttribute('role'), 'row');
    await act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })));
    assert.equal(document.querySelectorAll('.muxui-input-tags__tag').length, 1);
    assert.match(document.querySelector('.muxui-input-tags__tag-wrapper')?.textContent ?? '', /^React$/u);
    assert.deepEqual([...document.querySelectorAll('.muxui-input-tags__input')].map((node) => node.getAttribute('aria-labelledby')), initialLabelIds);
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('ColorModeToggle persists and applies the selected mode through the Mux data hook', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://127.0.0.1/' });
  const restore = installDom(dom);
  let root;
  try {
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(ColorModeToggle, { defaultMode: 'light', storageKey: 'supplemental-mode', 'aria-label': 'Color mode' })));
    const toggle = document.querySelector('.muxui-color-mode-toggle');
    const control = toggle?.querySelector('input,button');
    assert.ok(control);
    assert.equal(document.documentElement.getAttribute('data-muxui-color-scheme'), 'light');
    await act(async () => control.click());
    assert.equal(document.documentElement.getAttribute('data-muxui-color-scheme'), 'dark');
    assert.equal(dom.window.localStorage.getItem('supplemental-mode'), 'dark');
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('ColorModeToggle hydrates deterministically before restoring a persisted mode', async () => {
  const props = { defaultMode: 'light', storageKey: 'hydration-mode' };
  const serverMarkup = renderToString(React.createElement(ColorModeToggle, props));
  const dom = new JSDOM(`<!doctype html><div id="root">${serverMarkup}</div>`, { url: 'http://127.0.0.1/' });
  dom.window.localStorage.setItem('hydration-mode', 'dark');
  const restore = installDom(dom);
  const errors = [];
  const previousError = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  let root;
  try {
    root = hydrateRoot(document.querySelector('#root'), React.createElement(ColorModeToggle, props));
    await act(async () => {});
    assert.equal(document.querySelector('.muxui-color-mode-toggle')?.getAttribute('data-mode'), 'dark');
    assert.equal(document.documentElement.getAttribute('data-muxui-color-scheme'), 'dark');
    assert.equal(document.querySelector('.muxui-color-mode-toggle input, .muxui-color-mode-toggle button')?.getAttribute('aria-label'), 'Toggle dark mode');
    assert.deepEqual(errors, []);
  } finally {
    await act(async () => root?.unmount());
    console.error = previousError;
    restore();
    dom.window.close();
  }
});

test('MultiSelect filters and updates its uncontrolled selection through the popup', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  try {
    root = createRoot(document.querySelector('#root'));
    const items = [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }];
    await act(async () => root.render(React.createElement(MultiSelect.Root, { items, label: 'Options', showFooter: false }, (item) => React.createElement(MultiSelect.Item, { id: item.id, textValue: item.label }, item.label))));
    const trigger = document.querySelector('.muxui-multi-select__trigger');
    assert.ok(trigger);
    await act(async () => trigger.click());
    const search = document.querySelector('.muxui-multi-select__search-input');
    assert.ok(search);
    await act(async () => setInputValue(search, 'Two'));
    const searchField = document.querySelector('.muxui-multi-select__search');
    const searchPropsKey = searchField && Object.keys(searchField).find((key) => key.startsWith('__reactProps'));
    const inputPropsKey = Object.keys(search).find((key) => key.startsWith('__reactProps'));
    if (inputPropsKey) await act(async () => search[inputPropsKey].onChange?.({ target: { value: 'Two' } }));
    assert.equal(document.querySelectorAll('.muxui-multi-select__item').length, 1);
    await act(async () => document.querySelector('.muxui-multi-select__item')?.click());
    assert.match(trigger.textContent ?? '', /1 selected/u);
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('TagSelect preserves combobox filtering and chip focus/removal keyboard behavior', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  try {
    root = createRoot(document.querySelector('#root'));
    const items = [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }];
    await act(async () => root.render(React.createElement(TagSelect.Root, {
      items,
      label: 'Tags',
      defaultSelectedKeys: new Set(['one']),
    }, (item) => React.createElement(TagSelect.Item, { id: item.id, textValue: item.label }, item.label))));
    const input = document.querySelector('.muxui-tag-select__input');
    assert.ok(input);
    assert.equal(document.querySelectorAll('.muxui-tag-select__combobox .muxui-tag-select__tag').length, 1);
    await act(async () => {
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    });
    const removeButton = document.querySelector('.muxui-tag-select__combobox .muxui-tag-select__tag-remove');
    assert.equal(document.activeElement, removeButton);
    await act(async () => removeButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    assert.equal(document.querySelectorAll('.muxui-tag-select__combobox .muxui-tag-select__tag').length, 0);
    assert.equal(document.activeElement, document.querySelector('.muxui-tag-select__input'));
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('TagSelect preserves selected-key order for controlled chips and removals', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  let setSelectedKeys;
  const changes = [];
  try {
    function ControlledTags() {
      const [selectedKeys, setKeys] = React.useState(new Set(['two', 'one']));
      setSelectedKeys = setKeys;
      return React.createElement(TagSelect.Root, {
        items: [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }],
        label: 'Tags',
        selectedKeys,
        onSelectionChange: (next) => { changes.push([...next]); setKeys(next); },
      }, (item) => React.createElement(TagSelect.Item, { id: item.id, textValue: item.label }, item.label));
    }
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(ControlledTags)));
    const tags = () => [...document.querySelectorAll('.muxui-tag-select__combobox .muxui-tag-select__tag-text')].map((node) => node.textContent);
    assert.deepEqual(tags(), ['Two', 'One']);
    await act(async () => document.querySelector('.muxui-tag-select__tag-remove')?.click());
    assert.deepEqual(tags(), ['One']);
    assert.deepEqual(changes, [['one']]);
    await act(async () => setSelectedKeys(new Set(['one', 'two'])));
    assert.deepEqual(tags(), ['One', 'Two']);
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('CommandPalette opens its React Aria overlay from the keyboard', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  try {
    root = createRoot(document.querySelector('#root'));
    const command = React.createElement(CommandPalette.Root, null,
      React.createElement(CommandPalette.Trigger, null, 'Commands'),
      React.createElement(CommandPalette.Backdrop, null,
        React.createElement(CommandPalette.Popup, null,
          React.createElement(CommandPalette.Content, null,
            React.createElement(CommandPalette.Input, { 'aria-label': 'Command search' })))));
    await act(async () => root.render(command));
    const commandTrigger = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Commands');
    assert.ok(commandTrigger);
    await act(async () => commandTrigger.click());
    assert.ok(document.querySelector('.muxui-command-palette__dialog'));
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('AlertDialog renders its default-open modal content with accessible trigger and close parts', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  try {
    root = createRoot(document.querySelector('#root'));
    const alert = React.createElement(AlertDialog.Root, { defaultOpen: true },
      React.createElement(AlertDialog.Trigger, null, 'Delete'),
      React.createElement(AlertDialog.Backdrop, null,
        React.createElement(AlertDialog.Popup, null,
          React.createElement(AlertDialog.Content, null,
            React.createElement(AlertDialog.Title, null, 'Delete item'),
            React.createElement(AlertDialog.Description, { id: 'delete-description' }, 'This cannot be undone.'),
            React.createElement(AlertDialog.Close, null, 'Cancel')))));
    await act(async () => root.render(alert));
    const dialogTrigger = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Delete');
    assert.ok(dialogTrigger);
    const content = document.querySelector('.muxui-alert-dialog__content');
    assert.ok(content);
    const description = document.querySelector('#delete-description');
    assert.ok(description);
    assert.equal(content.getAttribute('aria-describedby'), 'delete-description');
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('HeaderNav and Sidebar mobile triggers open their accessible navigation dialogs', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  try {
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(HeaderNav.Root, null,
      React.createElement(HeaderNav.Logo, null, 'Mux'),
      React.createElement(HeaderNav.MobileTrigger, null, React.createElement(HeaderNav.NavButton, { href: '/docs' }, 'Docs')))));
    const headerTrigger = document.querySelector('.muxui-header-nav__mobile-trigger');
    assert.ok(headerTrigger);
    await act(async () => headerTrigger.click());
    assert.ok(document.querySelector('.muxui-header-nav__mobile-dialog'));
    await act(async () => root.unmount());

    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(Sidebar.Root, null,
      React.createElement(Sidebar.MobileTrigger, { logo: 'Mux' }, React.createElement(Sidebar.NavList, null, React.createElement(Sidebar.NavItem, { href: '/docs' }, 'Docs'))))));
    const sidebarTrigger = document.querySelector('.muxui-sidebar__mobile-menu-btn');
    assert.ok(sidebarTrigger);
    await act(async () => sidebarTrigger.click());
    assert.ok(document.querySelector('.muxui-sidebar__mobile-dialog'));
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('payment formatting and field errors remain accessible in the rendered Mux anatomy', () => {
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(PaymentInput.Root, { defaultValue: '4111111111111111', 'aria-label': 'Visa number' }, React.createElement(PaymentInput.Group, null, React.createElement(PaymentInput.Input), React.createElement(PaymentInput.CardIcon))),
    React.createElement(PaymentInput.Root, { defaultValue: '378282246310005', 'aria-label': 'Amex number' }, React.createElement(PaymentInput.Group, null, React.createElement(PaymentInput.Input), React.createElement(PaymentInput.CardIcon))),
    React.createElement(Input.Root, { invalid: true, 'aria-label': 'Name', 'aria-describedby': 'name-error' }, React.createElement(Input.Input), React.createElement(Input.Error, { id: 'name-error' }, 'Name is required')),
  ));
  assert.match(html, /value="4111 1111 1111 1111"/u);
  assert.match(html, /value="3782 822463 10005"/u);
  assert.match(html, /data-card-type="visa"/u);
  assert.match(html, /data-card-type="amex"/u);
  assert.match(html, /name-error/u);
  assert.match(html, /Name is required/u);
});

test('PaymentInput preserves controlled formatting while uncontrolled typing updates card state', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  let setControlledValue;
  const changes = [];
  try {
    function ControlledPayment() {
      const [value, setValue] = React.useState('4111111111111111');
      const [, rerender] = React.useState(0);
      setControlledValue = setValue;
      return React.createElement(PaymentInput.Root, {
        value,
        onChange: (next) => { changes.push(next); rerender((revision) => revision + 1); },
        'aria-label': 'Controlled card number',
      }, React.createElement(PaymentInput.Group, null,
        React.createElement(PaymentInput.Input),
        React.createElement(PaymentInput.CardIcon),
      ));
    }

    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(ControlledPayment)));
    let input = document.querySelector('.muxui-payment-input__input');
    let icon = document.querySelector('.muxui-payment-input__card-icon');
    assert.equal(input?.value, '4111 1111 1111 1111');
    assert.equal(icon?.getAttribute('data-card-type'), 'visa');

    await act(async () => setControlledValue('5555555555554444'));
    input = document.querySelector('.muxui-payment-input__input');
    icon = document.querySelector('.muxui-payment-input__card-icon');
    assert.equal(input?.value, '5555 5555 5555 4444');
    assert.equal(icon?.getAttribute('data-card-type'), 'mastercard');

    const inputPropsKey = Object.keys(input).find((key) => key.startsWith('__reactProps'));
    await act(async () => input?.[inputPropsKey]?.onChange?.({ target: { value: '4000 0000 0000 0002' } }));
    input = document.querySelector('.muxui-payment-input__input');
    assert.equal(changes.at(-1), '4000 0000 0000 0002');
    assert.equal(input?.value, '5555 5555 5555 4444');
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }

  const uncontrolledDom = new JSDOM('<!doctype html><div id="root"></div>');
  const restoreUncontrolled = installDom(uncontrolledDom);
  let uncontrolledRoot;
  try {
    uncontrolledRoot = createRoot(document.querySelector('#root'));
    await act(async () => uncontrolledRoot.render(React.createElement(PaymentInput.Root, {
      defaultValue: '',
      'aria-label': 'Uncontrolled card number',
    }, React.createElement(PaymentInput.Group, null,
      React.createElement(PaymentInput.Input),
      React.createElement(PaymentInput.CardIcon),
    ))));
    const input = document.querySelector('.muxui-payment-input__input');
    const inputPropsKey = Object.keys(input).find((key) => key.startsWith('__reactProps'));
    await act(async () => input?.[inputPropsKey]?.onChange?.({ target: { value: '4242424242424242' } }));
    assert.equal(input?.value, '4242 4242 4242 4242');
    assert.equal(document.querySelector('.muxui-payment-input__card-icon')?.getAttribute('data-card-type'), 'visa');
  } finally {
    await act(async () => uncontrolledRoot?.unmount());
    restoreUncontrolled();
    uncontrolledDom.window.close();
  }
});

test('Input retains its supplied error-message slot outside validation state', () => {
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(Input.Root, { 'aria-label': 'Name' }, React.createElement(Input.Input), React.createElement(Input.Error, null, 'Name guidance')),
  ));
  assert.match(html, /Name guidance/u);
  assert.doesNotMatch(html, /data-invalid/u);
});

test('Input links mounted description and error IDs without caller references', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  try {
    let setInvalid;
    function Field() {
      const [invalid, setInvalidState] = React.useState(false);
      setInvalid = setInvalidState;
      return React.createElement(Input.Root, { invalid },
        React.createElement(Input.Label, null, 'Name'),
        React.createElement(Input.Input),
        React.createElement(Input.Description, null, 'Preferred display name.'),
        React.createElement(Input.Error, { id: 'name-error' }, 'Name is required.'),
      );
    }
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(Field)));
    let input = document.querySelector('.muxui-input');
    const description = document.querySelector('.muxui-input__description');
    const error = document.querySelector('.muxui-input__error');
    assert.equal(error?.id, 'name-error');
    assert.match(input?.getAttribute('aria-describedby') ?? '', new RegExp(description?.id ?? 'missing-description', 'u'));
    assert.match(input?.getAttribute('aria-describedby') ?? '', /name-error/u);
    await act(async () => setInvalid(true));
    input = document.querySelector('.muxui-input');
    assert.match(input?.getAttribute('aria-describedby') ?? '', new RegExp(description?.id ?? 'missing-description', 'u'));
    assert.match(input?.getAttribute('aria-describedby') ?? '', /name-error/u);
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('Input preserves generated SSR associations and derives invalid state from Form errors', async () => {
  const serverMarkup = renderToString(React.createElement(Input.Root, { invalid: true, 'aria-label': 'Name' },
    React.createElement(Input.Input),
    React.createElement(Input.Description, null, 'Preferred display name.'),
    React.createElement(Input.Error, null, 'Name is required.'),
  ));
  const serverDocument = new JSDOM(serverMarkup).window.document;
  const serverInput = serverDocument.querySelector('.muxui-input');
  const serverIds = serverInput?.getAttribute('aria-describedby')?.split(' ') ?? [];
  assert.equal(serverIds.length, 2);
  assert.equal(serverIds.every((id) => serverDocument.getElementById(id)), true);

  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  let setErrors;
  try {
    function Field() {
      const [errors, setErrorsState] = React.useState({ name: 'Server says no' });
      setErrors = setErrorsState;
      return React.createElement(AriaForm, { validationBehavior: 'aria', validationErrors: errors },
        React.createElement(Input.Root, { name: 'name' },
          React.createElement(Input.Input, { 'aria-label': 'Name', 'aria-describedby': 'caller-description' }),
          React.createElement(Input.Description, { id: 'name-description' }, 'Preferred display name.'),
          React.createElement(Input.Error, { id: 'name-error' }, 'Server says no'),
        ),
      );
    }
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(Field)));
    let input = document.querySelector('.muxui-input');
    assert.equal(input?.getAttribute('aria-invalid'), 'true');
    assert.equal(input?.getAttribute('aria-describedby'), 'caller-description name-description name-error');
    await act(async () => setErrors({}));
    input = document.querySelector('.muxui-input');
    assert.equal(input?.getAttribute('aria-invalid'), null);
    assert.equal(input?.getAttribute('aria-describedby'), 'caller-description name-description name-error');
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('Input preserves live description and error-message relationships', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  try {
    let setInvalid;
    let setCallerDescription;
    let setErrorId;
    let setShowError;
    function Field() {
      const [invalid, setInvalidState] = React.useState(false);
      const [callerDescription, setCallerDescriptionState] = React.useState('external-description');
      const [errorId, setErrorIdState] = React.useState('name-error');
      const [showError, setShowErrorState] = React.useState(true);
      setInvalid = setInvalidState;
      setCallerDescription = setCallerDescriptionState;
      setErrorId = setErrorIdState;
      setShowError = setShowErrorState;
      return React.createElement(Input.Root, { invalid },
        React.createElement('span', { id: 'external-description' }, 'External context'),
        React.createElement('span', { id: 'replacement-description' }, 'Replacement context'),
        React.createElement(Input.Label, null, 'Name'),
        React.createElement(Input.Input, { 'aria-describedby': callerDescription }),
        React.createElement(Input.Description, null, 'Preferred display name.'),
        showError ? React.createElement(Input.Error, { id: errorId }, 'Name is required.') : null,
      );
    }
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(Field)));
    const description = document.querySelector('.muxui-input__description');
    let input = document.querySelector('.muxui-input');
    assert.match(input?.getAttribute('aria-describedby') ?? '', new RegExp(description?.id ?? 'missing-description', 'u'));
    assert.match(input?.getAttribute('aria-describedby') ?? '', /external-description/u);
    assert.equal(input?.getAttribute('aria-errormessage'), null);
    await act(async () => setCallerDescription('replacement-description'));
    input = document.querySelector('.muxui-input');
    assert.match(input?.getAttribute('aria-describedby') ?? '', /replacement-description/u);
    assert.doesNotMatch(input?.getAttribute('aria-describedby') ?? '', /external-description/u);
    await act(async () => setInvalid(true));
    input = document.querySelector('.muxui-input');
    let error = document.querySelector('.muxui-input__error');
    assert.equal(error?.id, 'name-error');
    assert.match(input?.getAttribute('aria-describedby') ?? '', /name-error/u);
    await act(async () => setErrorId('replacement-name-error'));
    input = document.querySelector('.muxui-input');
    error = document.querySelector('.muxui-input__error');
    assert.equal(error?.id, 'replacement-name-error');
    assert.match(input?.getAttribute('aria-describedby') ?? '', /replacement-name-error/u);
    await act(async () => setInvalid(false));
    input = document.querySelector('.muxui-input');
    assert.match(input?.getAttribute('aria-describedby') ?? '', new RegExp(description?.id ?? 'missing-description', 'u'));
    assert.match(input?.getAttribute('aria-describedby') ?? '', /replacement-description/u);
    assert.match(input?.getAttribute('aria-describedby') ?? '', /replacement-name-error/u);
    await act(async () => setShowError(false));
    input = document.querySelector('.muxui-input');
    assert.doesNotMatch(input?.getAttribute('aria-describedby') ?? '', /replacement-name-error/u);
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});
