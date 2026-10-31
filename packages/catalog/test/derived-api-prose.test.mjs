import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const read = (path) => readFile(resolve(repositoryRoot, path), 'utf8');
const reactRequire = createRequire(resolve(repositoryRoot, 'packages/react/package.json'));
const ts = reactRequire('typescript-6');
const reference = (slug) => read(`packages/react/reference/${slug}.json`).then(JSON.parse);
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

// `native` lists native attributes, web APIs and JavaScript values. `reference` lists
// finite prose spans checked below against a named declaration surface. It never excuses
// an example's attributes. A neighbour's API is checked through `from`.
// `from` lists, by slug, the spans a guide states about a neighbouring component's API, such as the slider
// props a picker's advice names; each must be a prop, event prop, or finite value of that component's derived
// API, so the claim moves with the neighbour. It excuses prose spans only, like `reference`.
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
  // FormData.getAll and FormData.get read a named field's entries, and user:42 is the example token the common mistake warns against.
  'token-field': { native: ['FormData.getAll', 'FormData.get', 'user:42'] },
  // ToggleButtonGroup's guide words its missing form name as "no `name` prop", which the check reads.
  'toggle-button-group': {},
  toolbar: {},
  'list-box': {},
  menu: {},
  // className and style are the native attributes of the item and the list. The rest are CSS the guide teaches (a responsive column track, a size container, the card's gap and sizing) and the width and height attributes of the Image it names.
  'grid-list': { native: ['className', 'style', 'grid-template-columns', '@container', '@media', 'container-type: inline-size', 'gap', 'width', 'height', 'inline-size: 100%', 'overflow: hidden'] },
  // The two JSX snippets show the grid composition, whose GridList carries its own layout; the rest are CSS (the gap and column tracks, the container and media queries), the browser APIs the column-count advice names, and the GridList's block size.
  virtualizer: { native: ['<GridList layout="grid">', '<Virtualizer layout="grid">', 'gap', 'grid-template-columns', '@container', '@media', 'column-gap', 'row-gap', 'matchMedia', 'ResizeObserver', 'window', 'rem', "style={{ blockSize: '40rem' }}"] },
  // #fff and #ffffff are two spellings of one color, which the guide's common mistake says still count as a duplicate.
  'color-swatch-picker': { native: ['#fff', '#ffffff'] },
  // aria-label and aria-labelledby are the native attributes that name the tabs, which the public type offers beside the derived props.
  tabs: { native: ['aria-label', 'aria-labelledby'] },
  'tag-group': {},
  table: {},
  tree: {},
  // **bold** is the Markdown a paste is measured after; the two helpers are exports of the module whose declarations the derived API does not read.
  'text-editor': { native: ['**bold**', 'isTextEditorDocument', 'normalizeTextEditorDocument'] },
  // null is the value a controlled selectedId takes to mean nothing selected.
  'combo-box': { native: ['null'] },
  // onSubmit is the form's native event, @ and / are the characters that open suggestions, and placeholder and maxLength are the native textarea attributes inputProps takes.
  'prompt-composer': { native: ['onSubmit', '@', '/', 'inputProps.placeholder', 'inputProps.maxLength'] },
  // item.value is a field of an item record, which the guide says a named Select does not submit.
  select: { native: ['item.value'] },
  toast: { reference: { ToastProvider: ['maxVisible', 'placement', 'top-start', 'top-end', 'bottom-start', 'bottom-end', 'className'] }, from: { button: ['pending'] } },
  // aria-label and aria-labelledby name the group, which the public type offers beside the derived props; neutral is the Button variant the guide advises for attached buttons.
  'button-group': { native: ['aria-label', 'aria-labelledby'], from: { button: ['neutral'] } },
  // null and 0 are the values the guide states for an indeterminate and an empty circle.
  'progress-circle': { native: ['null', '0'] },
  'input-tags': {},
  // The card numbers are the guide's sample input and their formatted output; aria-hidden, data-muxui-card-type and autoComplete are the DOM attributes the guide names.
  'payment-input': { native: ['378282246310005', '3782 822463 10005', '4111111111111111', '4111 1111 1111 1111', '9999999999999999', '9999 9999 9999 9999', 'aria-hidden', 'data-muxui-card-type', 'autoComplete="cc-number"'] },
  // attempted and accepted are the guide's own example state.
  'checkbox-field': { native: ['attempted', 'attempted && !accepted'] },
  'switch-field': {},
  // options is the RadioGroup prop the guide contrasts RadioField with.
  'radio-field': { from: { 'radio-group': ['options'] } },
  // name, type and placeholder are the native attributes Input.Input takes; the root owns none of them.
  input: { native: ['name', 'type', 'placeholder'] },
  // rows, maxLength, placeholder, onKeyDown and name are the native attributes and handlers TextArea.TextArea takes; the root owns none of them.
  'text-area': { native: ['rows', 'maxLength', 'placeholder', 'onKeyDown', 'name'] },
  card: {},
  'multi-select': {},
  'tag-select': {},
  // htmlFor is the native attribute of the label element Text renders when `as` is label.
  text: { native: ['htmlFor'] },
  // `display: none` is the CSS the guide tells an application to hide the MobileTrigger's wrapper with, not a prop.
  'header-nav': { native: ['display: none'] },
  // primary, danger and neutral are the variants of Button, which the guide says the dialog's actions use.
  'alert-dialog': { from: { button: ['primary', 'danger', 'neutral'] } },
  sidebar: {},
  // The command and hook option fields belong to these declaration types, not the root block.
  'command-palette': { reference: { CommandPaletteCommand: ['subtitle', 'keywords'], UseCommandPaletteOptions: ['onError', 'close'] } },
};

// Derived components with no usage guide yet, which this check cannot read. ColorModeToggle's guide is separate documentation work.
const WITHOUT_GUIDE = ['color-mode-toggle'];

/** Finite spans missing from their exact declaration owner (never a component-wide bag). */
function missingFromReference(file, surfaces) {
  return Object.entries(surfaces).flatMap(([name, spans]) => {
    const members = file.exports.find((item) => item.name === name)?.parts?.flatMap((part) => part.members ?? [])
      ?? file.types.find((item) => item.name === name)?.members ?? [];
    const names = new Set(members.flatMap((member) => [member.name, ...(member.values ?? [])]));
    return spans.filter((span) => !names.has(span)).map((span) => `${name}: ${span}`);
  });
}

/** Every name one block owns: its props, events, event props, finite values, and the members of its object types. */
const blockNames = (block) => [
  ...block.props,
  ...block.events,
  ...Object.values(block.eventDetails).map(({ prop }) => prop),
  ...Object.values(block.propDetails).flatMap(({ enum: values = [] }) => values),
  ...memberNames(block.types),
  ...memberNames(block.propDetails),
];

/** A derived API's blocks: the root's, then each part's (`partApis`), which owns its own props. */
const blocksOf = (api) => [api, ...Object.values(api.partApis ?? {})];

/**
 * The names a guide may state for a component: its block, its anatomy, its native values, and the
 * package's own names. An example's attributes are checked against `attributes`, and the attributes
 * of a part's element (`<ListBox.Item>`) against that part's names (`partAttributes`, by member), so
 * a part's prop is not the root's; the guide's prose gets every block's names and also the checked `reference` spans.
 */
function guideNames({ derived, record, entry: { native = [], reference: surfaces = {}, from = {}, described = {} }, importPaths, componentNames }) {
  const { api } = derived;
  const shared = [
    ...importPaths,
    ...componentNames,
    ...record.anatomy.map((part) => `${derived.export}.${part[0].toUpperCase()}${part.slice(1)}`),
    ...native,
  ];
  const attributes = new Set([...shared, ...blockNames(api)]);
  const partAttributes = new Map(Object.values(api.partApis ?? {}).map((part) => [part.member, new Set([...shared, ...blockNames(part)])]));
  const partNames = Object.values(api.partApis ?? {}).flatMap(blockNames);
  return { attributes, partAttributes, prose: new Set([...attributes, ...partNames, ...Object.values(surfaces).flat(), ...Object.values(from).flat(), ...Object.values(described).flat()]) };
}

/** The spans of `spans` that `api` (another component's derived API) does not own as a prop, event prop, or finite value. */
function missingFromOwner(api, spans) {
  const owned = new Set(blocksOf(api).flatMap((block) => [
    ...block.props,
    ...Object.values(block.eventDetails).map(({ prop }) => prop),
    ...Object.values(block.propDetails).flatMap(({ enum: values = [] }) => values),
    ...memberNames(block.types),
  ]));
  return spans.filter((span) => !owned.has(span));
}

/** The `Type: span` pairs of `described` whose span `api`'s description of that derived type does not contain. */
const missingFromDescription = (api, described) => Object.entries(described)
  .flatMap(([type, spans]) => spans.filter((span) => !api.types[type]?.description.includes(span)).map((span) => `${type}: ${span}`));

/**
 * The attribute names an example gives the component that `checked` does not hold. The element of a
 * part (`<ListBox.Item ...>`) is held to that part's names in `partAttributes`, by member, when the
 * part has an entry there; any other element of the export is held to `checked`.
 */
function unknownExampleAttributes(code, exportName, checked, partAttributes = new Map()) {
  return [...code.matchAll(new RegExp(`<${exportName}(?:\\.([A-Z][A-Za-z0-9]*))?\\b([^>]*)>`, 'gu'))]
    .flatMap(([, member, attributes]) => [...attributes.matchAll(/([a-zA-Z-]+)=/gu)]
      .map(([, name]) => name)
      .filter((name) => !(partAttributes.get(member) ?? checked).has(name)));
}

/** Static JSX literals only: bind a finite value to the actual element/part and prop.
 * Expressions, spreads and native props are outside this comparison, not guessed.
 */
function invalidExampleLiterals(code, derived) {
  const source = ts.createSourceFile('guide.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const problems = [];
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      const part = tag.startsWith(`${derived.export}.`) ? tag.slice(derived.export.length + 1) : undefined;
      const block = tag === derived.export || part === 'Root' ? derived.api
        : Object.values(derived.api.partApis ?? {}).find(({ member }) => member === part);
      if (block) for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute)) continue;
        const name = attribute.name.getText(source);
        const values = block.propDetails[name]?.enum;
        if (values === undefined) continue;
        const initializer = attribute.initializer;
        const expression = initializer && ts.isJsxExpression(initializer) ? initializer.expression : initializer;
        let value;
        if (expression === undefined && initializer === undefined) value = true;
        else if (expression && (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))) value = expression.text;
        else if (expression && ts.isNumericLiteral(expression)) value = Number(expression.text);
        else if (expression && ts.isPrefixUnaryExpression(expression) && ts.isNumericLiteral(expression.operand) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(expression.operator)) value = Number(expression.operand.text) * (expression.operator === ts.SyntaxKind.MinusToken ? -1 : 1);
        else if (expression?.kind === ts.SyntaxKind.TrueKeyword) value = true;
        else if (expression?.kind === ts.SyntaxKind.FalseKeyword) value = false;
        else if (expression?.kind === ts.SyntaxKind.NullKeyword) value = null;
        else continue;
        if (!values.includes(value)) problems.push(`${tag}.${name}=${JSON.stringify(value)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return problems;
}

/** Whether a prose span `name="value"` or `name={value}` names a prop of the root or of a part and, where the prop is finite, one of its values. */
function statedAttribute(api, native, span) {
  const match = /^([a-zA-Z-]+)=(?:"([^"]*)"|\{(.+)\})$/u.exec(span);
  if (!match || native.includes(span)) return false;
  return blocksOf(api).filter((block) => block.props.includes(match[1])).some((block) => {
    const values = block.propDetails[match[1]].enum;
    return values === undefined || values.includes(match[2] ?? JSON.parse(match[3]));
  });
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

/** The props a guide claims are absent that its derived API has, in the root's block or a part's, as props or event props. */
const contradictedAbsences = (markdown, api) => absenceClaims(markdown).claimed
  .filter((name) => blocksOf(api).some((block) => block.props.includes(name) || Object.values(block.eventDetails).some(({ prop }) => prop === name)));

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
  assert.deepEqual(Object.keys(GUIDES).sort(), derivedSlugs.filter((slug) => !WITHOUT_GUIDE.includes(slug)), 'each derived component\'s guide is checked');
  const componentNames = new Set(await Promise.all(components.map((slug) => read(`catalog/components/${slug}/artifact.json`).then((text) => JSON.parse(text).name, () => undefined))));
  const importPaths = Object.keys(reactPackage.exports).map((path) => `${reactPackage.name}${path.slice(1)}`);
  // The stylesheet's layer order, as the generated README states it.
  const layerOrder = /^@layer reset, [^\n]+;$/mu.exec(readme)?.[0];
  assert.ok(layerOrder, 'the React README states the layer order');

  for (const [slug, { native = [], reference: surfaces = {}, from = {}, described = {} }] of Object.entries(GUIDES)) {
    const [guide, derived, record] = await Promise.all([
      read(`catalog/guides/${slug}-usage.md`),
      derivedApi(slug),
      read(`catalog/components/${slug}/artifact.json`).then(JSON.parse),
    ]);
    const { api } = derived;
    // Each absence claim is worded so the check reads it, and the block has no such prop.
    const { claimed: absent, unread } = absenceClaims(guide);
    assert.deepEqual(unread, [], `${slug} guide words an absence the check cannot read; write "no \`name\` prop"`);
    assert.deepEqual(contradictedAbsences(guide, api), [], `${slug} guide claims a prop the derived API has is absent`);
    const { attributes: checked, partAttributes, prose: proseChecked } = guideNames({ derived, record, entry: GUIDES[slug], importPaths, componentNames });
    const attribute = (span) => statedAttribute(api, native, span);
    const fences = [...guide.matchAll(/^```[a-z]*\n([\s\S]*?)^```$/gmu)].map(([, code]) => code);
    const prose = guide.replace(FENCE, '');
    // The list names only what the guide still states.
    const stated = new Set([...prose.matchAll(/`([^`]+)`/gu)].map(([, span]) => span.replace(/\s+/gu, ' ')));
    assert.deepEqual(Object.values(surfaces).flat().filter((span) => !stated.has(span)), [], `${slug} references spans its guide no longer states`);
    if (Object.keys(surfaces).length) assert.deepEqual(missingFromReference(await reference(slug), surfaces), [], `${slug} guide declaration spans`);
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
      assert.deepEqual(unknownExampleAttributes(code, derived.export, checked, partAttributes), [], `${slug} guide example attributes`);
      assert.deepEqual(invalidExampleLiterals(code, derived), [], `${slug} guide finite example values`);
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

// A compound's parts own their props (Decision 0031 D2), and a guide may state them. Each part's names are
// checked like the root's, and a part's element is held to its own part's, not the root's.
test('a part\'s props, finite values, and element attributes are checked against that part\'s derived block', () => {
  const quiet = { type: { kind: 'union', members: [{ kind: 'literal', value: 'quiet' }, { kind: 'literal', value: 'loud' }] }, required: false, enum: ['quiet', 'loud'] };
  const block = (propDetails, eventDetails = {}) => ({ props: Object.keys(propDetails), events: Object.keys(eventDetails), propDetails, eventDetails, types: {} });
  const root = block({ size: { type: { kind: 'string' }, required: false } });
  const item = { member: 'Item', ...block({ value: { type: { kind: 'string' }, required: true }, tone: quiet }, { pick: { prop: 'onPick', type: { kind: 'function', parameters: [], returns: { kind: 'void' } }, required: false } }), defaults: {} };
  const api = { ...root, partApis: { item } };
  const record = { anatomy: ['root', 'item'] };
  const names = (derived, entry = {}) => guideNames({ derived: { export: 'Thing', api: derived }, record, entry, importPaths: [], componentNames: [] });
  const { attributes, partAttributes, prose } = names(api, { native: ['className'] });

  // Prose may state a part\'s props, event props, and values, which the root\'s attribute names do not hold.
  for (const span of ['value', 'tone', 'onPick', 'quiet', 'loud', 'size', 'Thing.Item']) assert.equal(prose.has(span), true, span);
  assert.equal(attributes.has('tone'), false);
  assert.equal(partAttributes.get('Item').has('tone'), true);
  assert.equal(partAttributes.get('Item').has('className'), true, 'a native value serves a part\'s element too');
  assert.equal(partAttributes.get('Item').has('size'), false, 'the root\'s props are not a part\'s');
  // A part that drops a prop stops excusing the span.
  const dropped = { ...api, partApis: { item: { ...item, props: ['value'], propDetails: { value: item.propDetails.value } } } };
  assert.equal(names(dropped).prose.has('tone'), false);
  assert.equal(names(dropped).prose.has('quiet'), false);
  // An example holds a part\'s element to that part\'s names, and any other element of the export to the root\'s.
  assert.deepEqual(unknownExampleAttributes('<Thing size="sm"><Thing.Item value="a" tone="loud" onPick={pick} /></Thing>', 'Thing', attributes, partAttributes), []);
  assert.deepEqual(unknownExampleAttributes('<Thing tone="loud" />', 'Thing', attributes, partAttributes), ['tone'], 'a part prop on the root');
  assert.deepEqual(unknownExampleAttributes('<Thing.Item size="sm" />', 'Thing', attributes, partAttributes), ['size'], 'a root prop on a part');
  assert.deepEqual(unknownExampleAttributes('<Thing.Item gone="sm" />', 'Thing', attributes, partAttributes), ['gone']);
  assert.deepEqual(unknownExampleAttributes('<Thing.Header size="sm" />', 'Thing', attributes, partAttributes), [], 'a part with no entry is held to the root\'s names');
  // A prose attribute span names a prop of the root or of any part, and one of that prop\'s finite values.
  assert.equal(statedAttribute(api, [], 'tone="loud"'), true);
  assert.equal(statedAttribute(api, [], 'tone="louder"'), false, 'a value the part does not admit');
  assert.equal(statedAttribute(api, [], 'tone={"quiet"}'), true);
  assert.equal(statedAttribute(api, [], 'value="a"'), true);
  assert.equal(statedAttribute(api, [], 'size="sm"'), true);
  assert.equal(statedAttribute(api, [], 'gone="sm"'), false);
  assert.equal(statedAttribute({ ...api, partApis: undefined }, [], 'tone="loud"'), false, 'the root alone does not own tone');
  // An absence claim fails once any block gains the prop or event prop, and a neighbour\'s span is owned by its parts too.
  assert.deepEqual(contradictedAbsences('Thing has no `tone` prop and no `onPick` prop.', api), ['tone', 'onPick']);
  assert.deepEqual(contradictedAbsences('Thing has no `tone` prop.', { ...api, partApis: undefined }), []);
  assert.deepEqual(missingFromOwner(api, ['tone', 'onPick', 'loud', 'size', 'gone']), ['gone']);
  assert.deepEqual(missingFromOwner({ ...api, partApis: undefined }, ['tone']), ['tone']);
});

test('declaration spans are compared with their exact surface and never excuse example attributes', async () => {
  const [derived, record, toast, command] = await Promise.all([
    derivedApi('toast'), read('catalog/components/toast/artifact.json').then(JSON.parse), reference('toast'), reference('command-palette'),
  ]);
  assert.deepEqual(missingFromReference(toast, GUIDES.toast.reference), []);
  assert.deepEqual(missingFromReference(command, GUIDES['command-palette'].reference), []);
  const withoutPlacement = structuredClone(toast);
  withoutPlacement.exports.find(({ name }) => name === 'ToastProvider').parts[0].members.find(({ name }) => name === 'placement').values.pop();
  assert.deepEqual(missingFromReference(withoutPlacement, GUIDES.toast.reference), ['ToastProvider: bottom-end']);
  const renamed = structuredClone(command);
  renamed.types.find(({ name }) => name === 'UseCommandPaletteOptions').members.find(({ name }) => name === 'onError').name = 'onFailure';
  assert.deepEqual(missingFromReference(renamed, GUIDES['command-palette'].reference), ['UseCommandPaletteOptions: onError']);
  const { attributes: checked, prose } = guideNames({ derived, record, entry: GUIDES.toast, importPaths: [], componentNames: [] });
  for (const span of GUIDES.toast.reference.ToastProvider) assert.equal(prose.has(span), true);
  assert.deepEqual(unknownExampleAttributes('<Toast message="Saved" maxVisible={5} pending={true} />', 'Toast', checked), ['maxVisible', 'pending']);
  // The manager and hook signatures link these prose fields to the public declarations too.
  assert.equal(toast.exports.find(({ name }) => name === 'useToast').returns.type, 'ToastManager');
  assert.deepEqual(toast.types.find(({ name }) => name === 'ToastManager').members.map(({ name }) => name), ['add', 'remove']);
  assert.ok(command.exports.find(({ name }) => name === 'useCommandPalette').parameters.some(({ type }) => type === 'UseCommandPaletteOptions<T>'));
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

function assertCardChoices(guide, api) {
  assert.deepEqual(bulletSubjects(guide, 'Choosing a surface').sort(), [...api.propDetails.variant.enum].sort(), 'Card.variant choices');
  const padding = /- `padding` is ([^.]+)\./u.exec(guide)?.[1] ?? '';
  assert.deepEqual([...padding.matchAll(/`([^`]+)`/gu)].map(([, value]) => value).sort(), [...api.propDetails.padding.enum].sort(), 'Card.padding choices');
}

test('finite guide JSX values and Card lists keep their element, part and prop association', async () => {
  const [swatch, card, guide, cardGuide] = await Promise.all([derivedApi('color-swatch'), derivedApi('card'), read('catalog/guides/color-swatch-usage.md'), read('catalog/guides/card-usage.md')]);
  const example = /^```tsx\n([\s\S]*?)^```$/mu.exec(guide)?.[1];
  assert.ok(example, 'the existing ColorSwatch JSX example');
  assert.deepEqual(invalidExampleLiterals(example, swatch), []);
  assert.deepEqual(invalidExampleLiterals(example.replace('shape="circle"', 'shape="triangle"'), swatch), ['ColorSwatch.shape="triangle"']);
  assertCardChoices(cardGuide, card.api);
  assert.throws(() => assertCardChoices(cardGuide.replace('`padding` is `sm`, `md`, or `lg`', '`padding` is `outlined`, `filled`, or `elevated`'), card.api), /Card.padding/u);
  assert.deepEqual(invalidExampleLiterals('<Card.Root padding="filled" />', card), ['Card.Root.padding="filled"']);
  const finite = (...values) => ({ enum: values });
  const derived = { export: 'Thing', api: { propDetails: { tone: finite('quiet', 'loud') }, partApis: { item: { member: 'Item', propDetails: { tone: finite('soft', 'strong') } } } } };
  assert.deepEqual(invalidExampleLiterals('<Thing tone="quiet"><Thing.Item tone={"soft"} /></Thing>', derived), []);
  assert.deepEqual(invalidExampleLiterals('<Thing tone="soft"><Thing.Item tone="quiet" /></Thing>', derived), ['Thing.tone="soft"', 'Thing.Item.tone="quiet"']);
});

// The finite existing statements identified by the X-015 inspection. Patterns read each
// statement's value, not a bag of legal words; semantic defaults name their precise wording.
const DEFAULT_STATEMENTS = [
  ['card', 'variant', /- `([^`]+)`, the default,/u, 'filled'],
  ['button-group', 'orientation', /- `([^`]+)` is the default\./u, 'vertical'],
  ['input-tags', 'tagPlacement', /- `([^`]+)`, the default,/u, 'below'],
  ['multi-select', 'placeholder', /and defaults to ([^.]+)\./u, 'Pick'],
  ['tree', 'expansionTrigger', /Keep the default `expansionTrigger="([^"]+)"`/u, 'chevron'],
  ['tree', 'selectionMode', /Tree defaults to (\w+) selection/u, 'multiple'],
  ['grid-list', 'layout', /The default `layout="([^"]+)"`/u, 'grid'],
  ['grid-list', 'selectionMode', /GridList defaults to (\w+) selection/u, 'multiple'],
  ['tabs', 'variant', /The `variant` defaults to `([^`]+)`/u, 'pill'],
  ['tabs', 'keyboardActivation', /Keeping the (\w+) default for panels/u, 'manual'],
  ['prompt-composer', 'inputLabel', /`inputLabel`, which defaults to ([^.]+)\./u, 'Send'],
  ['color-swatch', 'shape', /default `shape="([^"]+)"`/u, 'circle'],
  ['tag-group', 'color', /`([^`]+)` is the default, `brand`/u, 'brand'],
  ['tag-group', 'variant', /`variant` sets the treatment of every tag: `([^`]+)` by default/u, 'outline'],
  ['text-editor', 'toolbar', /Use the (\w+) toolbar, the default/u, 'advanced'],
  ['virtualizer', 'layout', /The default (\w+) layout renders/u, 'grid'],
  ['virtualizer', 'layout', /The default (\w+) layout is a list/u, 'grid'],
  ['text', 'variant', /\| Body text \| `p` \| `([^`]+)`, the default/u, 'label'],
  ['alert-dialog', 'variant', /keeps the default `([^`]+)` variant/u, 'neutral', 'button'],
];

function assertDefaultStatement(guide, api, prop, pattern) {
  const match = pattern.exec(guide);
  assert.ok(match, `the guide retains its checked ${prop} default statement`);
  assert.equal(match[1], api.defaults[prop], `${prop} prose default`);
}

test('the remaining inspected guide defaults equal their executed API defaults, including legal-value mutants', async () => {
  for (const [slug, prop, pattern, alternative, owner = slug] of DEFAULT_STATEMENTS) {
    const [guide, { api }] = await Promise.all([read(`catalog/guides/${slug}-usage.md`), derivedApi(owner)]);
    assertDefaultStatement(guide, api, prop, pattern);
    const match = pattern.exec(guide);
    assert.notEqual(alternative, api.defaults[prop], `${slug}.${prop} mutation changes the default`);
    if (api.propDetails[prop].enum) assert.ok(api.propDetails[prop].enum.includes(alternative), `${slug}.${prop} mutant remains legal`);
    const mutant = guide.replace(match[0], match[0].replace(match[1], alternative));
    assert.throws(() => assertDefaultStatement(mutant, api, prop, pattern), /prose default/u, `${slug}.${prop} rejects another legal default`);
  }
  const [tabs, tabsApi, sidebar, sidebarApi] = await Promise.all([read('catalog/guides/tabs-usage.md'), derivedApi('tabs'), read('catalog/guides/sidebar-usage.md'), derivedApi('sidebar')]);
  assert.match(tabs, /By default, an arrow key selects the tab it reaches/u);
  assert.equal(tabsApi.api.defaults.keyboardActivation, 'automatic');
  const assertSidebarDefault = (guide) => assert.equal(/A group starts (\w+),/u.exec(guide)?.[1], sidebarApi.api.partApis['nav-item'].defaults.defaultExpanded ? 'open' : 'closed', 'Sidebar.NavItem initial state');
  assertSidebarDefault(sidebar);
  assert.throws(() => assertSidebarDefault(sidebar.replace('A group starts closed,', 'A group starts open,')), /Sidebar.NavItem initial state/u);
});

function assertProviderDefaults(guide, { maxVisible, placement }) {
  assert.equal(Number(/`maxVisible`[^\n]+It defaults to (\d+)/u.exec(guide)?.[1]), maxVisible, 'ToastProvider.maxVisible prose default');
  assert.equal(/`placement`[^\n]+It defaults to `([^`]+)`/u.exec(guide)?.[1], placement, 'ToastProvider.placement prose default');
}

// Observe the provider itself with omitted props: declaration types cannot prove defaults.
// Reuse the renderer's DOM harness; no test-only default extractor or alternate API block.
test('ToastProvider prose defaults match its executed omitted-prop behavior', async () => {
  const { createDom } = await import('../../react/test/support/dom.mjs');
  const env = createDom('<div id="root"></div>', { layoutStubs: true });
  const React = reactRequire('react');
  const { act } = React;
  const { createRoot } = reactRequire('react-dom/client');
  const { ToastProvider, useToast } = await import('../../react/src/overlays.ts');
  const root = createRoot(document.getElementById('root'));
  let manager;
  function CaptureManager() { manager = useToast(); return null; }
  try {
    await act(async () => root.render(React.createElement(ToastProvider, null, React.createElement(CaptureManager))));
    const guide = await read('catalog/guides/toast-usage.md');
    const count = Number(/`maxVisible`[^\n]+It defaults to (\d+)/u.exec(guide)?.[1]);
    assert.ok(Number.isSafeInteger(count) && count > 0 && count < 100, 'a bounded stated queue count');
    // Add one beyond the prose limit so a larger executed default cannot appear to agree.
    await act(async () => { for (let index = 0; index <= count; index += 1) manager.add(`Notification ${index}`, { duration: 0 }); });
    const observed = {
      maxVisible: document.querySelectorAll('.muxui-toast').length,
      placement: document.querySelector('.muxui-toast__region')?.getAttribute('data-muxui-placement'),
    };
    assertProviderDefaults(guide, observed);
    assert.throws(() => assertProviderDefaults(guide.replace(`It defaults to ${count},`, `It defaults to ${count + 1},`), observed), /ToastProvider.maxVisible/u);
    assert.throws(() => assertProviderDefaults(guide.replace('It defaults to `top-end`.', 'It defaults to `bottom-end`.'), observed), /ToastProvider.placement/u);
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
});
