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

/** The bullet value a section marks as the default: "- `a`, the default, ...". */
const bulletDefault = (markdown, heading) => /^- `([^`]+)`, the default,/mu.exec(section(markdown, heading))?.[1];

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

// Code spans a guide may state that no derived block owns: native attributes and their
// values, DOM and web APIs, and JavaScript values.
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
};

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
  const componentNames = new Set(await Promise.all(components.map((slug) => read(`catalog/components/${slug}/artifact.json`).then((text) => JSON.parse(text).name, () => undefined))));
  const importPaths = Object.keys(reactPackage.exports).map((path) => `${reactPackage.name}${path.slice(1)}`);
  // The stylesheet's layer order, as the generated README states it.
  const layerOrder = /^@layer reset, [^\n]+;$/mu.exec(readme)?.[0];
  assert.ok(layerOrder, 'the React README states the layer order');

  for (const [slug, { native = [] }] of Object.entries(GUIDES)) {
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
    const checked = new Set([
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
    // `name="value"` or `name={value}` names a prop and, where the prop is finite, one of its values.
    const attribute = (span) => {
      const match = /^([a-zA-Z-]+)=(?:"([^"]*)"|\{(.+)\})$/u.exec(span);
      if (!match || native.includes(span)) return false;
      const values = api.propDetails[match[1]]?.enum;
      return props.has(match[1]) && (values === undefined || values.includes(match[2] ?? JSON.parse(match[3])));
    };
    const fences = [...guide.matchAll(/^```[a-z]*\n([\s\S]*?)^```$/gmu)].map(([, code]) => code);
    const prose = guide.replace(FENCE, '');
    const unchecked = [...prose.matchAll(/`([^`]+)`/gu)].map(([, span]) => span.replace(/\s+/gu, ' '))
      .filter((span) => !checked.has(span) && !attribute(span) && span !== layerOrder && !absent.includes(span));
    assert.deepEqual(unchecked, [], `${slug} guide`);
    // An example imports from the package and gives the component only checked attributes.
    for (const code of fences) {
      for (const [, names, path] of code.matchAll(/^import \{ ([^}]+) \} from '([^']+)';$/gmu)) {
        assert.ok(importPaths.includes(path), `${slug} guide imports ${path}`);
        for (const name of names.split(',').map((value) => value.trim())) assert.ok(componentNames.has(name), `${slug} guide imports ${name}`);
      }
      for (const [, attributes] of code.matchAll(new RegExp(`<${derived.export}\\b([^>]*)>`, 'gu'))) {
        const names = [...attributes.matchAll(/([a-zA-Z-]+)=/gu)].map(([, name]) => name);
        assert.deepEqual(names.filter((name) => !checked.has(name)), [], `${slug} guide example attributes`);
      }
    }
  }
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

  // DataDiff states its row kinds and its description default.
  const [dataDiff, dataDiffApi] = await Promise.all([guide('data-diff'), derivedApi('data-diff')]);
  const kinds = /already marked as ([a-z, ]+), and DataDiff/u.exec(dataDiff)?.[1].split(/, (?:or )?/u) ?? [];
  assert.deepEqual(kinds.sort(), [...new Set(literals(dataDiffApi.api.types.DataDiffRow.type, dataDiffApi.api.types, 'kind'))].sort());
  assert.match(dataDiff, new RegExp(`The default is ${dataDiffApi.api.defaults.description}\\.`, 'u'));
});
