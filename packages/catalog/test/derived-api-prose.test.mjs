import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const read = (path) => readFile(resolve(repositoryRoot, path), 'utf8');
const derivedApi = (slug) => read(`packages/react/api/${slug}.json`).then(JSON.parse);

/** The section of a guide under `## heading`. */
function section(markdown, heading) {
  const start = markdown.indexOf(`\n## ${heading}\n`);
  assert.notEqual(start, -1, `the guide has a ${heading} section`);
  const end = markdown.indexOf('\n## ', start + 1);
  return markdown.slice(start, end === -1 ? undefined : end);
}

/** The values each bullet of a guide section opens with: "- `a` is ...", "- `a`, the default, ...", or "- `a` and `b` are ...". */
function bulletSubjects(markdown, heading) {
  return section(markdown, heading).split('\n')
    .map((line) => /^- ((?:`[^`]+`(?:, | and )?)+)/u.exec(line)?.[1])
    .filter(Boolean)
    .flatMap((subjects) => [...subjects.matchAll(/`([^`]+)`/gu)].map(([, value]) => value));
}

/** The bullet value a section marks as the default: "- `a`, the default, ..." or "- `a` is the default, ...". */
const bulletDefault = (markdown, heading) => /^- `([^`]+)`(?:,| is) the default,/mu.exec(section(markdown, heading))?.[1];

/** The literal values a derived type admits, through named types and object arms' members named `member`. */
function literals(type, types, member) {
  switch (type.kind) {
    case 'literal': return [type.value];
    case 'reference': return literals(types[type.name].type, types, member);
    case 'union': return type.members.flatMap((arm) => literals(arm, types, member));
    case 'array': return literals(type.element, types, member);
    case 'object': return member === undefined ? [] : type.members.filter(({ name }) => name === member).flatMap(({ type: memberType }) => literals(memberType, types));
    default: return [];
  }
}

/** Every member name of the object types a derived block reaches, inline or named. */
function memberNames(value, names = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => memberNames(item, names));
  else if (value !== null && typeof value === 'object') {
    if (value.kind === 'object') for (const { name } of value.members) names.add(name);
    Object.values(value).forEach((item) => memberNames(item, names));
  }
  return names;
}

// Decision 0031: Button's variant values live in its React source. The usage guide
// no longer lists them; its variant guidance names each one, in source order.
test('the Button guide covers exactly the variants its derived API declares', async () => {
  const [guide, derived] = await Promise.all([read('catalog/guides/button-usage.md'), derivedApi('button')]);
  const variants = derived.api.propDetails.variant.enum;
  assert.deepEqual(bulletSubjects(guide, 'Choosing a variant'), variants);
  assert.equal(bulletSubjects('\n## Choosing a variant\n- `primary` is the main action.\n- `ghost` and `danger` are quiet.\n- `inverse`, the default, sits on a dark surface.\n', 'Choosing a variant').join(), 'primary,ghost,danger,inverse');
  // The value list and defaults are the generated API reference's, not restated prose.
  assert.doesNotMatch(guide, /finite `variant` values|They default to/u);
  assert.match(guide, /\[API reference\]\(#api-reference\) lists the `variant` and `size` values/u);
});

// Code spans a guide may state that no derived block owns. `native` lists native attributes and
// their values, DOM and web APIs, and JavaScript values. `declared` lists facts about a
// declaration-only surface, such as a provider's props, that the declaration-backed reference
// reader will check; until it exists, the list names exactly the spans no check compares. It
// excuses prose spans only, never an example's attributes, and only DECLARATION_ONLY_GUIDES use it.
// `from` lists, by slug, the spans a guide states about a neighbouring component's API, such as the slider
// props a picker's advice names; each must be a prop, event prop, or finite value of that component's derived
// API, so the claim moves with the neighbour. It excuses prose spans only, like `declared`.
// `described` lists, by derived type name, the spans a guide states about a format that type's description
// states, such as the date format; each must appear in that description, so a changed format fails the guide.
// It excuses prose spans only too.
const GUIDES = {
  button: { native: ['type', 'submit', 'reset', 'requestSubmit'] },
  'icon-button': { native: ['aria-label', 'aria-labelledby', 'type="button"', 'type="submit"'] },
  'select-native': { native: ['FormData.getAll', 'event.currentTarget.value', 'option', 'optgroup'] },
  image: { native: ['width', 'height'] },
  // Avatar's block is Avatar.Root's; alt is Avatar.Image's native image attribute.
  avatar: { native: ['alt', 'alt=""'] },
  message: { native: ['http', 'https'] },
  activity: {},
  'data-diff': { native: ['0', 'false', 'null'] },
  checkbox: { native: ['aria-describedby', 'FormData.get', 'FormData.has', 'false', 'null'] },
  separator: { native: ['hr'] },
  'disclosure-group': {},
  group: { native: ['aria-label', 'aria-labelledby'] },
  'progress-bar': {},
  meter: { native: ['aria-label', 'aria-labelledby'] },
  link: { native: ['aria-label', 'currentColor', '1em', 'aria-hidden="true"', 'focusable="false"'] },
  disclosure: {},
  'toggle-button': {},
  breadcrumbs: {},
  resizable: {},
  // `capture` is the native attribute that defaultCamera sets.
  'file-trigger': { native: ['capture'] },
  // `getFile()` is the file item's read; aria-label names the area.
  'drop-zone': { native: ['aria-label', 'getFile()'] },
  tooltip: {},
  'preview-trigger': {},
  // aria-label names the dialog surface.
  popover: { native: ['aria-label'] },
  // maxVisible, placement and its four values, and className are ToastProvider's props, and pending is Button's.
  dialog: {},
  // The native validation rules a form checks are the browser's, not Form's.
  form: { native: ['required', 'type', 'pattern'] },
  // className is the native attribute the sizing example sets; the width custom property and `width` are CSS; NaN, 0, null, and Number.isNaN are JavaScript.
  'number-field': { native: ['className', '--muxui-component-number-field-width', 'width', 'NaN', '0', 'null', 'Number.isNaN', 'JSON.stringify(NaN)', 'inputMode="numeric"'] },
  // FormData.get and FormData.getAll read the group's repeated entries.
  'checkbox-group': { native: ['FormData.get', 'FormData.getAll'] },
  // aria-label and aria-labelledby name the Switch when it has no label.
  switch: { native: ['aria-label', 'aria-labelledby'] },
  // YYYY-MM-DD is the value format, which the type states as a string.
  'date-field': { native: ['YYYY-MM-DD'] },
  // The clock formats and the rejected date-time and offset forms are strings the type states as a string.
  'time-field': { native: ['HH:mm', '09:30:45', '2026-08-26T09:30', '09:30+10:00', 'HH:mm:ss', 'HH:mm:ss.fraction'] },
  // YYYY-MM-DD is the value format, which the type states as a string.
  'date-picker': { native: ['YYYY-MM-DD'] },
  // YYYY-MM-DD is the value format, which the types state as strings.
  'date-range-picker': { native: ['YYYY-MM-DD'] },
  // autoComplete and inputMode are native input attributes TextField forwards; event.target.value and the setter are the change handler's JavaScript.
  'text-field': { native: ['autoComplete', 'inputMode', 'event.target.value', 'onChange={setName}'] },
  // preventDefault is the native keydown event's method the guide tells the input props to call.
  'search-field': { native: ['preventDefault'] },
  // aria-label and aria-labelledby name the field when it has no label, and {id, label, value} is the record the guide describes in words.
  autocomplete: { native: ['aria-label', 'aria-labelledby', '{id, label, value}'] },
  // The heading markers and levels, the pre element, a fragment link, and the link schemes are Markdown syntax, HTML, and URL parts.
  // null is the value a controlled selection takes to mean nothing selected, and the two calls are the requests the guide names.
  lightbox: { native: ['null', 'onOpenChange(false)', 'onSelectedChange(null, null)'] },
  // The patch markers a mistaken source starts its lines with.
  'code-block': { native: ['+', '-'] },
  markdown: { native: ['#', '##', '###', 'h1', 'h2', 'pre', '#summary', 'http', 'https', 'mailto'] },
  // aria-label is the native attribute the example names the swatch with.
  'color-swatch': { native: ['aria-label'] },
  // rgba() and hsla() are the CSS color functions onChange returns.
  'color-wheel': { native: ['rgba()', 'hsla()'] },
  'color-slider': { native: ['rgba()', 'hsla()'] },
  'color-area': { native: ['rgba()', 'hsla()'] },
  // #336699 is the uppercase hex a named field submits.
  'color-field': { native: ['rgba()', 'hsla()', '#336699'] },
  // colorSpace, hsb, and hsl are the slider's, which the guide tells a hex picker to set, and the form name is the field's.
  'color-picker': { native: ['rgba()', 'hsla()'], from: { 'color-slider': ['colorSpace', 'hsb', 'hsl'], 'color-field': ['name'] } },
  // YYYY-MM-DD is Mux UI's own value format, not a native one: MuxUIDateValue's description states it, and the check reads it there.
  calendar: { described: { MuxUIDateValue: ['YYYY-MM-DD'] } },
  'range-calendar': {},
  'radio-group': {},
  slider: {},
  // ToggleButtonGroup's guide words its missing form name as "no `name` prop", which the check reads.
  'toggle-button-group': {},
  toolbar: {},
  toast: { declared: ['pending', 'maxVisible', 'placement', 'top-start', 'top-end', 'bottom-start', 'bottom-end', 'className'] },
};

// The guides whose declaration-only surface (ToastProvider and useToast) the check cannot read yet.
const DECLARATION_ONLY_GUIDES = ['toast'];
/** The guides that list `declared` spans without being declaration-only. */
const undeclaredOwners = (guides) => Object.entries(guides)
  .filter(([slug, entry]) => 'declared' in entry && !DECLARATION_ONLY_GUIDES.includes(slug))
  .map(([slug]) => slug);

/**
 * The names a guide may state for a component: its block, its anatomy, its native values, and the
 * package's own names. An example's attributes are checked against `attributes`; the guide's
 * prose also gets the `declared` spans.
 */
function guideNames({ derived, record, entry: { native = [], declared = [], from = {}, described = {} }, importPaths, componentNames }) {
  const { api } = derived;
  const attributes = new Set([
    ...importPaths,
    ...componentNames,
    ...record.anatomy.map((part) => `${derived.export}.${part[0].toUpperCase()}${part.slice(1)}`),
    ...api.props,
    ...api.events,
    ...Object.values(api.eventDetails).map(({ prop }) => prop),
    ...Object.values(api.propDetails).flatMap(({ enum: values = [] }) => values),
    ...memberNames(api.types),
    ...memberNames(api.propDetails),
    ...native,
  ]);
  return { attributes, prose: new Set([...attributes, ...declared, ...Object.values(from).flat(), ...Object.values(described).flat()]) };
}

/** The spans of `spans` that `api` (another component's derived API) does not own as a prop, event prop, or finite value. */
function missingFromOwner(api, spans) {
  const owned = new Set([
    ...api.props,
    ...Object.values(api.eventDetails).map(({ prop }) => prop),
    ...Object.values(api.propDetails).flatMap(({ enum: values = [] }) => values),
    ...memberNames(api.types),
  ]);
  return spans.filter((span) => !owned.has(span));
}

/** The `Type: span` pairs of `described` whose span `api`'s description of that derived type does not contain. */
const missingFromDescription = (api, described) => Object.entries(described)
  .flatMap(([type, spans]) => spans.filter((span) => !api.types[type]?.description.includes(span)).map((span) => `${type}: ${span}`));

/** The attribute names an example gives the component that `checked` does not hold. */
function unknownExampleAttributes(code, exportName, checked) {
  return [...code.matchAll(new RegExp(`<${exportName}\\b([^>]*)>`, 'gu'))]
    .flatMap(([, attributes]) => [...attributes.matchAll(/([a-zA-Z-]+)=/gu)].map(([, name]) => name))
    .filter((name) => !checked.has(name));
}

const FENCE = /^```[a-z]*\n[\s\S]*?^```$/gmu;
// A guide states a missing prop one way, which the check reads: "has no `placeholder` prop"
// or "there is no separate `tone` property".
const ABSENCE_CLAIM = /\bno (?:separate )?`([^`]+)` prop(?:erty)?\b/gu;
// Any other wording of a missing prop or option, which the check could not read.
const UNREAD_ABSENCE = /\b(?:no|not|without)\b[^.`]*\bprop(?:erty|s)?\b|\bunavailable\b/iu;

/**
 * The props a guide's prose says its component lacks, and the claims it words another way.
 * A claim holds only while the derived block has no such prop or event prop.
 */
function absenceClaims(markdown) {
  const sentences = markdown.replace(FENCE, '').replace(/\s+/gu, ' ').split(/(?<=[.:]) /u);
  const claims = sentences.map((sentence) => [...sentence.matchAll(ABSENCE_CLAIM)].map(([, name]) => name));
  return {
    claimed: claims.flat(),
    unread: sentences.filter((sentence, index) => claims[index].length === 0 && UNREAD_ABSENCE.test(sentence)),
  };
}

/** The props a guide claims are absent that its derived API has, as props or event props. */
const contradictedAbsences = (markdown, api) => absenceClaims(markdown).claimed
  .filter((name) => api.props.includes(name) || Object.values(api.eventDetails).some(({ prop }) => prop === name));

// Architecture, "One owner per fact": a guide states no prop, enum member, default, event,
// or import path in prose unless a check compares it with the block. Every code span in the
// guide of each component with a derived API is checked here.
test('every API name a derived component\'s guide states is in its derived API or the React package', async () => {
  const [reactPackage, readme, components] = await Promise.all([
    read('packages/react/package.json').then(JSON.parse),
    read('packages/react/README.md'),
    readdir(resolve(repositoryRoot, 'catalog/components')),
  ]);
  const derivedSlugs = (await readdir(resolve(repositoryRoot, 'packages/react/api'))).map((file) => file.replace(/\.json$/u, '')).sort();
  assert.deepEqual(Object.keys(GUIDES).sort(), derivedSlugs, 'each derived component\'s guide is checked');
  assert.deepEqual(undeclaredOwners(GUIDES), [], 'only a declaration-only guide lists declared spans');
  const componentNames = new Set(await Promise.all(components.map((slug) => read(`catalog/components/${slug}/artifact.json`).then((text) => JSON.parse(text).name, () => undefined))));
  const importPaths = Object.keys(reactPackage.exports).map((path) => `${reactPackage.name}${path.slice(1)}`);
  // The stylesheet's layer order, as the generated README states it.
  const layerOrder = /^@layer reset, [^\n]+;$/mu.exec(readme)?.[0];
  assert.ok(layerOrder, 'the React README states the layer order');

  for (const [slug, { native = [], declared = [], from = {}, described = {} }] of Object.entries(GUIDES)) {
    const [guide, derived, record] = await Promise.all([
      read(`catalog/guides/${slug}-usage.md`),
      derivedApi(slug),
      read(`catalog/components/${slug}/artifact.json`).then(JSON.parse),
    ]);
    const { api } = derived;
    const props = new Set(api.props);
    // Each absence claim is worded so the check reads it, and the block has no such prop.
    const { claimed: absent, unread } = absenceClaims(guide);
    assert.deepEqual(unread, [], `${slug} guide words an absence the check cannot read; write "no \`name\` prop"`);
    assert.deepEqual(contradictedAbsences(guide, api), [], `${slug} guide claims a prop the derived API has is absent`);
    const { attributes: checked, prose: proseChecked } = guideNames({ derived, record, entry: GUIDES[slug], importPaths, componentNames });
    // `name="value"` or `name={value}` names a prop and, where the prop is finite, one of its values.
    const attribute = (span) => {
      const match = /^([a-zA-Z-]+)=(?:"([^"]*)"|\{(.+)\})$/u.exec(span);
      if (!match || native.includes(span)) return false;
      const values = api.propDetails[match[1]]?.enum;
      return props.has(match[1]) && (values === undefined || values.includes(match[2] ?? JSON.parse(match[3])));
    };
    const fences = [...guide.matchAll(/^```[a-z]*\n([\s\S]*?)^```$/gmu)].map(([, code]) => code);
    const prose = guide.replace(FENCE, '');
    // The list names only what the guide still states.
    const stated = new Set([...prose.matchAll(/`([^`]+)`/gu)].map(([, span]) => span.replace(/\s+/gu, ' ')));
    assert.deepEqual(declared.filter((span) => !stated.has(span)), [], `${slug} declares spans its guide no longer states`);
    assert.deepEqual(Object.values(described).flat().filter((span) => !stated.has(span)), [], `${slug} describes spans its guide no longer states`);
    assert.deepEqual(missingFromDescription(api, described), [], `${slug} guide states a format its derived types do not describe`);
    for (const [owner, spans] of Object.entries(from)) {
      assert.notEqual(owner, slug, `${slug} takes its own spans from another component`);
      assert.deepEqual(spans.filter((span) => !stated.has(span)), [], `${slug} lists ${owner} spans its guide no longer states`);
      assert.deepEqual(missingFromOwner((await derivedApi(owner)).api, spans), [], `${slug} guide states ${owner} spans its derived API does not own`);
    }
    const unchecked = [...prose.matchAll(/`([^`]+)`/gu)].map(([, span]) => span.replace(/\s+/gu, ' '))
      .filter((span) => !proseChecked.has(span) && !attribute(span) && span !== layerOrder && !absent.includes(span));
    assert.deepEqual(unchecked, [], `${slug} guide`);
    // An example imports from the package and gives the component only checked attributes.
    for (const code of fences) {
      for (const [, names, path] of code.matchAll(/^import \{ ([^}]+) \} from '([^']+)';$/gmu)) {
        assert.ok(importPaths.includes(path), `${slug} guide imports ${path}`);
        for (const name of names.split(',').map((value) => value.trim())) assert.ok(componentNames.has(name), `${slug} guide imports ${name}`);
      }
      assert.deepEqual(unknownExampleAttributes(code, derived.export, checked), [], `${slug} guide example attributes`);
    }
  }
});

// The picker guide names the slider's colorSpace, hsb, and hsl. They are checked against the slider's derived API,
// not excused as native, so a slider that drops one fails the picker's guide.
test('spans a guide states about a neighbour are checked against the neighbour\'s derived API', async () => {
  const slider = (await derivedApi('color-slider')).api;
  assert.deepEqual(missingFromOwner(slider, GUIDES['color-picker'].from['color-slider']), []);
  assert.deepEqual(missingFromOwner(slider, ['colorSpace', 'hsb', 'tone', 'onChange']), ['tone']);
  // The slider drops hsb from colorSpace, drops a prop, or renames its change prop.
  const withoutHsb = { ...slider, propDetails: { ...slider.propDetails, colorSpace: { ...slider.propDetails.colorSpace, enum: ['rgb', 'hsl'] } }, types: {} };
  assert.deepEqual(missingFromOwner(withoutHsb, ['hsb', 'hsl']), ['hsb']);
  assert.deepEqual(missingFromOwner({ ...slider, props: slider.props.filter((name) => name !== 'colorSpace') }, ['colorSpace']), ['colorSpace']);
  // A span listed `from` excuses prose only: the picker's examples may not pass colorSpace to the picker.
  const [derived, record] = await Promise.all([derivedApi('color-picker'), read('catalog/components/color-picker/artifact.json').then(JSON.parse)]);
  const { attributes, prose } = guideNames({ derived, record, entry: GUIDES['color-picker'], importPaths: [], componentNames: [] });
  assert.equal(prose.has('colorSpace'), true);
  assert.equal(attributes.has('colorSpace'), false);
  assert.deepEqual(unknownExampleAttributes('<ColorPicker colorSpace="hsb" />', 'ColorPicker', attributes), ['colorSpace']);
});

// The Calendar guide states YYYY-MM-DD, Mux UI's own value format. It is checked against MuxUIDateValue's description,
// not excused as native, so a changed format fails the guide.
test('a format a guide states is checked against the derived type that describes it', async () => {
  const [{ api }, record] = await Promise.all([derivedApi('calendar'), read('catalog/components/calendar/artifact.json').then(JSON.parse)]);
  const { described } = GUIDES.calendar;
  assert.deepEqual(missingFromDescription(api, described), []);
  // The type's description changes the format, or the type leaves the block.
  const description = api.types.MuxUIDateValue.description;
  assert.match(description, /YYYY-MM-DD/u);
  const reformatted = { ...api, types: { ...api.types, MuxUIDateValue: { ...api.types.MuxUIDateValue, description: description.replace('YYYY-MM-DD', 'DD/MM/YYYY') } } };
  assert.deepEqual(missingFromDescription(reformatted, described), ['MuxUIDateValue: YYYY-MM-DD']);
  assert.deepEqual(missingFromDescription({ ...api, types: {} }, described), ['MuxUIDateValue: YYYY-MM-DD']);
  // The span excuses prose only: an example may not pass it as an attribute.
  const { attributes, prose } = guideNames({ derived: { api, export: 'Calendar' }, record, entry: GUIDES.calendar, importPaths: [], componentNames: [] });
  assert.equal(prose.has('YYYY-MM-DD'), true);
  assert.equal(attributes.has('YYYY-MM-DD'), false);
});

test('declared spans belong to the declaration-only guide and never excuse an example attribute', async () => {
  assert.deepEqual(undeclaredOwners(GUIDES), []);
  // Another guide, even with an empty list, is rejected.
  assert.deepEqual(undeclaredOwners({ ...GUIDES, button: { ...GUIDES.button, declared: ['tone'] } }), ['button']);
  assert.deepEqual(undeclaredOwners({ ...GUIDES, tooltip: { declared: [] } }), ['tooltip']);

  // Toast's provider props are declared, so the guide may state them in prose but an example may not pass them.
  const [derived, record] = await Promise.all([derivedApi('toast'), read('catalog/components/toast/artifact.json').then(JSON.parse)]);
  const { attributes: checked, prose } = guideNames({ derived, record, entry: GUIDES.toast, importPaths: [], componentNames: [] });
  for (const span of GUIDES.toast.declared) {
    assert.equal(prose.has(span), true, `${span} is stated in prose`);
    assert.equal(checked.has(span), false, `${span} is excused in prose only`);
  }
  assert.deepEqual(unknownExampleAttributes('<Toast message="Saved" variant="success" duration={0} onDismiss={close} />', 'Toast', checked), []);
  assert.deepEqual(unknownExampleAttributes('<Toast message="Saved" maxVisible={5} pending={true} />', 'Toast', checked), ['maxVisible', 'pending']);
});

test('a guide\'s absence claim fails once the derived API gains the prop', async () => {
  const claims = { button: 'tone', 'icon-button': 'showTextWhileLoading', 'select-native': 'placeholder' };
  for (const [slug, name] of Object.entries(claims)) {
    const [guide, { api }] = await Promise.all([read(`catalog/guides/${slug}-usage.md`), derivedApi(slug)]);
    assert.ok(absenceClaims(guide).claimed.includes(name), `the ${slug} guide claims there is no ${name}`);
    assert.deepEqual(contradictedAbsences(guide, api), []);
    assert.deepEqual(contradictedAbsences(guide, { ...api, props: [...api.props, name] }), [name], `${slug} with a ${name} prop`);
  }
  // An event prop counts, and so does an absence the check reads from a hard-wrapped line.
  const api = { props: [], eventDetails: { change: { prop: 'onChange' } } };
  assert.deepEqual(contradictedAbsences('Select has no `onChange`\nprop.', api), ['onChange']);
  // A missing prop worded any other way is reported, so it cannot go unchecked.
  assert.deepEqual(absenceClaims('SelectNative has no placeholder prop. `size` is unavailable here. Use a label.').unread,
    ['SelectNative has no placeholder prop.', '`size` is unavailable here.']);
});

test('the defaults and finite values the derived guides state are their derived APIs\'', async () => {
  const guide = (slug) => read(`catalog/guides/${slug}-usage.md`);

  // IconButton's variant guidance names a subset of Button's variants and marks its default.
  const [iconButton, iconButtonApi] = await Promise.all([guide('icon-button'), derivedApi('icon-button')]);
  assert.ok(bulletSubjects(iconButton, 'Choosing a variant').every((variant) => iconButtonApi.api.propDetails.variant.enum.includes(variant)));
  assert.equal(bulletDefault(iconButton, 'Choosing a variant'), iconButtonApi.api.defaults.variant);
  assert.doesNotMatch(iconButton, /disabled=\{false\}|pending=\{false\}/u, 'IconButton defaults neither disabled nor pending');

  // Image's fit guidance covers exactly the fits, in source order, and marks the default.
  const [image, imageApi] = await Promise.all([guide('image'), derivedApi('image')]);
  assert.deepEqual(bulletSubjects(image, 'Choosing a fit'), imageApi.api.propDetails.fit.enum);
  assert.equal(bulletDefault(image, 'Choosing a fit'), imageApi.api.defaults.fit);

  // Message lists exactly the senders and the default one.
  const [message, messageApi] = await Promise.all([guide('message'), derivedApi('message')]);
  const sender = /^- `sender` is (.+), and defaults to `([^`]+)`\./mu.exec(message);
  assert.ok(sender, 'the Message guide states its senders');
  assert.deepEqual([...sender[1].matchAll(/`([^`]+)`/gu)].map(([, value]) => value), messageApi.api.propDetails.sender.enum);
  assert.equal(sender[2], messageApi.api.defaults.sender);

  // Activity's group follows its items through every status.
  const [activity, activityApi] = await Promise.all([guide('activity'), derivedApi('activity')]);
  const follows = /follow its items: (.+)\./u.exec(activity)?.[1] ?? '';
  assert.deepEqual([...follows.matchAll(/`([^`]+)`/gu)].map(([, value]) => value).sort(), [...activityApi.api.propDetails.status.enum].sort());

  // DisclosureGroup lets several panels stay open by default, which the guide teaches before multiple.
  const [disclosureGroup, disclosureGroupApi] = await Promise.all([guide('disclosure-group'), derivedApi('disclosure-group')]);
  assert.match(disclosureGroup, /Let several panels stay open, which is the default, when people compare sections\. Turn `multiple` off/u);
  assert.equal(disclosureGroupApi.api.defaults.multiple, true);

  // Meter's guide and its formatOptions description both say the value text is a percentage unless formatOptions says otherwise.
  const [meter, meterApi] = await Promise.all([guide('meter'), derivedApi('meter')]);
  assert.match(meter, /By default the value text is the value's position in the range as a percent/u);
  assert.match(meterApi.api.propDetails.formatOptions.description, /Omitted, it formats the position in the range as a percentage/u);
  assert.equal(Object.hasOwn(meterApi.api.defaults, 'formatOptions'), false, 'the percent format is a behaviour, not a stated default');

  // Dialog is dismissable by default, which its guide teaches before the choice to suppress dismissal.
  const [dialog, dialogApi] = await Promise.all([guide('dialog'), derivedApi('dialog')]);
  assert.match(dialog, /A Dialog is dismissable by default,/u);
  assert.equal(dialogApi.api.defaults.dismissable, true);

  // Toast lists its variants, marks neutral as the default, and states the default duration.
  const [toast, toastApi] = await Promise.all([guide('toast'), derivedApi('toast')]);
  assert.deepEqual(bulletSubjects(toast, 'Variants'), toastApi.api.propDetails.variant.enum);
  assert.equal(bulletDefault(toast, 'Variants'), toastApi.api.defaults.variant);
  assert.equal(Number(/Duration is in milliseconds, and it defaults to (\d+)\./u.exec(toast)?.[1]), toastApi.api.defaults.duration);

  // Form validates natively by default, which its guide marks first among the timing choices.
  const [form, formApi] = await Promise.all([guide('form'), derivedApi('form')]);
  assert.equal(/^- `([^`]+)` is the default\./mu.exec(section(form, 'Validation timing'))?.[1], formApi.api.defaults.validationBehavior);
  assert.deepEqual(bulletSubjects(form, 'Validation timing').sort(), [...formApi.api.propDetails.validationBehavior.enum].sort(), 'the guide covers both validation timings');

  // CheckboxGroup stacks its options vertically by default, which its guide teaches before the horizontal choice.
  const [checkboxGroup, checkboxGroupApi] = await Promise.all([guide('checkbox-group'), derivedApi('checkbox-group')]);
  assert.equal(/Use the default (\w+) layout/u.exec(checkboxGroup)?.[1], checkboxGroupApi.api.defaults.orientation);

  // ToggleButtonGroup selects a single button by default, which its guide teaches before the multiple choice.
  const [toggleButtonGroup, toggleButtonGroupApi] = await Promise.all([guide('toggle-button-group'), derivedApi('toggle-button-group')]);
  assert.match(toggleButtonGroup, /Keep the default single selection/u);
  assert.equal(toggleButtonGroupApi.api.defaults.selectionMode, 'single');

  // Popover is modal by default, which its guide teaches before the non-modal choice.
  const [popover, popoverApi] = await Promise.all([guide('popover'), derivedApi('popover')]);
  assert.match(popover, /Popover is modal by default\./u);
  assert.equal(popoverApi.api.defaults.modal, true);

  // Lightbox's guide says looping is off by default.
  const [lightbox, lightboxApi] = await Promise.all([guide('lightbox'), derivedApi('lightbox')]);
  assert.match(lightbox, /Set `loop` to wrap around; it is off by default\./u);
  assert.equal(lightboxApi.api.defaults.loop, false);

  // CodeBlock is in code mode, shows line numbers, and scrolls long lines by default, which its guide teaches before each choice.
  const [codeBlock, codeBlockApi] = await Promise.all([guide('code-block'), derivedApi('code-block')]);
  assert.match(codeBlock, new RegExp(`Use ${codeBlockApi.api.defaults.mode} mode, the default, for a listing\\.`, 'u'));
  assert.equal(codeBlockApi.api.defaults.lineNumbers, true);
  assert.match(codeBlock, /Line numbers are on by default\./u);
  assert.equal(codeBlockApi.api.defaults.wrap, false);
  assert.match(codeBlock, /Long lines scroll sideways by default\. Set `wrap` to wrap them/u);

  // Markdown's behavior text states the fallback it renders when the content is rejected.
  const [markdownRecord, markdownApi] = await Promise.all([read('catalog/components/markdown/artifact.json').then(JSON.parse), derivedApi('markdown')]);
  assert.ok(markdownRecord.bindings['web.react'].behavior.some((line) => line.includes(`defaults to the text ${markdownApi.api.defaults.invalidFallback}.`)));

  // DataDiff states its row kinds and its description default.
  const [dataDiff, dataDiffApi] = await Promise.all([guide('data-diff'), derivedApi('data-diff')]);
  const kinds = /already marked as ([a-z, ]+), and DataDiff/u.exec(dataDiff)?.[1].split(/, (?:or )?/u) ?? [];
  assert.deepEqual(kinds.sort(), [...new Set(literals(dataDiffApi.api.types.DataDiffRow.type, dataDiffApi.api.types, 'kind'))].sort());
  assert.match(dataDiff, new RegExp(`The default is ${dataDiffApi.api.defaults.description}\\.`, 'u'));
});
