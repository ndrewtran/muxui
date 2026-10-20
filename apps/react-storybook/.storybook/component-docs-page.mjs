import React from 'react';

const h = React.createElement;
const sourceUrl = (path) => `https://github.com/ndrewtran/muxui/blob/main/${path}`;

/**
 * The sections of every component Docs page, in order. Each is an h2 with a
 * stable id. Used in blocks appears only for a component that a Block uses.
 */
const docsSections = Object.freeze([
  ['basic', 'Basic example'],
  ['installation', 'Installation and imports'],
  ['usage', 'Usage'],
  ['behavior', 'Behavior'],
  ['examples', 'Examples'],
  ['used-in-blocks', 'Used in blocks'],
  ['api-reference', 'API reference'],
  ['events', 'Events'],
  ['accessibility', 'Accessibility'],
  ['anatomy-and-styling', 'Anatomy and styling'],
  ['sources', 'Sources'],
]);

/** Headings in Markdown shown below the page's own, each rendered as the given deeper level. */
const demoting = (levels) => Object.fromEntries(Object.entries(levels).map(([from, to]) => [from, ({ children }) => h(to, null, children)]));
/** A guide's own headings sit below the page's sections. */
const headingOverrides = demoting({ h2: 'h4', h3: 'h5', h4: 'h6' });
/** The shared accessibility sections sit under an h3 each, so their own subsections are h4. */
const sectionHeadingOverrides = demoting({ h3: 'h4', h4: 'h5' });

function List({ items, fact }) {
  return h('ul', { 'data-fact': fact }, items.map((item, index) => h('li', { key: index }, item)));
}

function Codes({ items, fact }) {
  return h('p', { 'data-fact': fact, className: 'muxui-docs-codes' }, items.map((item, index) => h('code', { key: index }, item)));
}

function SourceLink({ path, children = path }) {
  return h('a', { href: sourceUrl(path), target: '_blank', rel: 'noreferrer' }, children);
}

/** True when a Storybook manager hosts this frame, so it can open another page. A server render has no frame and assumes one. */
function hasManager() {
  if (typeof window === 'undefined') return true;
  try {
    return window.parent !== window && window.parent.document.getElementById('storybook-preview-iframe')?.contentWindow === window;
  } catch {
    return false;
  }
}

/**
 * The address, in this frame, of a manager page such as `?path=/docs/<id>`. It is built from the current address, so the
 * hosting base path and the globals stay when Docs is served on its own (iframe.html) under a subpath.
 */
function standaloneAddress(managerHref) {
  const [, viewMode, id] = /^\?path=\/(docs|story)\/([^&#]+)/u.exec(managerHref) ?? [];
  if (id === undefined) return managerHref;
  const address = new URL(window.location.href);
  address.searchParams.set('viewMode', viewMode);
  address.searchParams.set('id', id);
  address.searchParams.delete('args');
  return `${address.pathname}${address.search}`;
}

/**
 * A link to another Storybook page, given as its manager address. The manager's Anchor opens the page in the whole
 * Storybook and swallows the click, which does nothing without a manager. Docs served on their own get a real link instead.
 */
function PageLink({ Anchor, href, children, ...props }) {
  return hasManager()
    ? h(Anchor, { href, ...props }, children)
    : h('a', { href: standaloneAddress(href), ...props }, children);
}

/** The catalog facts of a family, laid out as the continuous reference. Everything it shows comes from `entry`. */
export function ComponentDocs({ entry, blocks }) {
  const { Title, Primary, Controls, Source, Markdown, Anchor } = blocks;
  const [basic, ...others] = entry.examples;
  const { usage, accessibility, accessibilityGuide, styling } = entry;
  // A link to another family, written as its docs path, goes to that family's Docs page. Other links stay as written.
  const guideLink = ({ href, children, ...props }) => entry.guide.links[href] === undefined
    ? h('a', { href, ...props }, children)
    : h(PageLink, { Anchor, href: entry.guide.links[href], ...props }, children);

  // A link in the shared accessibility text to a docs site route opens the file that owns what the route shows.
  const sharedLink = ({ href, children, ...props }) => accessibilityGuide.links[href] === undefined
    ? h('a', { href, ...props }, children)
    : h('a', { ...props, href: sourceUrl(accessibilityGuide.links[href]), target: '_blank', rel: 'noreferrer' }, children);

  const bodies = {
    basic: () => [
      h(Primary, { key: 'primary' }),
      h('p', { key: 'label', className: 'muxui-docs-caption' }, 'Canonical React example, static source: ', h(SourceLink, { path: basic.source }, basic.name)),
      h(Source, { key: 'source', code: basic.code, language: 'tsx' }),
    ],
    installation: () => [
      h('p', { key: 'guidance' }, 'Package versions and installation steps: ', h(SourceLink, { path: entry.installationGuide }, 'React package guidance')),
      h(Source, { key: 'imports', code: entry.imports.code, language: 'tsx' }),
    ],
    usage: () => [
      usage.useWhen.length > 0 && h(React.Fragment, { key: 'use' }, h('h3', null, 'Use when'), h(List, { items: usage.useWhen, fact: 'intent.useWhen' })),
      usage.avoidWhen.length > 0 && h(React.Fragment, { key: 'avoid' }, h('h3', null, 'Avoid when'), h(List, { items: usage.avoidWhen, fact: 'intent.avoidWhen' })),
      usage.useWhen.length === 0 && usage.avoidWhen.length === 0 && entry.guide === null
        && h('p', { key: 'none' }, 'No usage guidance is declared for this component.'),
      entry.guide && h('div', { key: 'guide', className: 'muxui-docs-guide', 'data-guide-id': entry.guide.id },
        h('h3', null, 'Related usage guidance'),
        h('p', { className: 'muxui-docs-caption' }, `${entry.guide.name}: `, h(SourceLink, { path: entry.guide.source })),
        h(Markdown, { options: { overrides: { ...headingOverrides, a: guideLink } } }, entry.guide.markdown)),
    ],
    behavior: () => entry.behavior.length > 0
      ? h(List, { items: entry.behavior, fact: 'binding.behavior' })
      : h('p', null, 'This binding does not declare behavior notes.'),
    examples: () => others.length > 0
      ? others.map((example) => h('div', { key: example.source, className: 'muxui-docs-example' },
        h('h3', null, example.name),
        h('p', null, example.summary),
        h(Source, { code: example.code, language: 'tsx' }),
        h('p', { className: 'muxui-docs-caption' }, 'Canonical React example, static source: ', h(SourceLink, { path: example.source }))))
      : h('p', null, 'No additional named examples are declared for this component yet.'),
    'used-in-blocks': () => h('ul', null, entry.usedIn.map(({ name, storyId, roles }) => h('li', { key: storyId },
      h(PageLink, { Anchor, href: `?path=/story/${storyId}` }, name),
      h('span', { className: 'muxui-docs-roles' }, roles.map(({ role, requirement }) => requirement === 'optional' ? `${role} (optional)` : role).join(', '))))),
    // The existing Controls table is the API reference: it lists the props and edits them live.
    'api-reference': () => h(Controls),
    events: () => entry.events.length > 0
      ? h(Codes, { items: entry.events, fact: 'binding.api.events' })
      : h('p', { 'data-fact': 'binding.api.events' }, 'This binding does not declare events.'),
    accessibility: () => [
      h('p', { key: 'name', 'data-fact': 'accessibility.nameRequired' }, `Accessible name required: ${accessibility.nameRequired ? 'yes' : 'no'}`),
      h('h3', { key: 'obligations-title' }, 'Obligations'),
      h(List, { key: 'obligations', items: accessibility.obligations, fact: 'accessibility.obligations' }),
      accessibility.binding.length > 0 && h(React.Fragment, { key: 'binding' }, h('h3', null, 'React binding'), h(List, { items: accessibility.binding, fact: 'binding.accessibility' })),
      // The obligations above are this family's. What is claimed, proved and left to the consumer is the shared guide's, cut from it.
      h('div', { key: 'shared', className: 'muxui-docs-guide', 'data-shared-guide': accessibilityGuide.id },
        accessibilityGuide.sections.map(({ heading, markdown }) => h(React.Fragment, { key: heading }, h('h3', null, heading),
          h(Markdown, { options: { overrides: { ...sectionHeadingOverrides, a: sharedLink } } }, markdown))),
        h('p', { className: 'muxui-docs-caption' }, 'Full guide: ', h(SourceLink, { path: accessibilityGuide.source }))),
    ],
    'anatomy-and-styling': () => [
      h('h3', { key: 'anatomy-title' }, 'Anatomy'),
      h(Codes, { key: 'anatomy', items: styling.anatomy, fact: 'anatomy' }),
      h('h3', { key: 'states-title' }, 'States'),
      h(Codes, { key: 'states', items: styling.states, fact: 'states' }),
      h('h3', { key: 'tokens-title' }, 'Token requirements'),
      h('p', { key: 'source', 'data-fact': 'tokenRecipe.source' }, 'Token source: ', h('code', null, styling.tokenSource)),
      ...styling.tokenGroups.map((group) => h(React.Fragment, { key: group.prefix ?? 'tokens' },
        group.prefix && h('h4', { className: 'muxui-docs-token-group' }, group.prefix),
        h('ul', { className: 'muxui-docs-tokens', 'data-fact': 'tokenRecipe.requirements' }, group.tokens.map(({ token, requirement, profiles }) => h('li', { key: token },
          h('code', null, token),
          requirement !== 'required' && h('span', { className: 'muxui-docs-token-requirement' }, [requirement, ...(profiles ?? [])].join(', '))))))),
    ],
    sources: () => h('dl', { className: 'muxui-docs-sources' }, entry.sources.map(({ label, paths }) => h(React.Fragment, { key: label },
      h('dt', null, label),
      paths.map((path) => h('dd', { key: path }, h(SourceLink, { path })))))),
  };

  return h(React.Fragment, null,
    h(Title),
    h('p', { className: 'muxui-docs-summary' }, entry.summary),
    h('p', { className: 'muxui-docs-binding' }, h('code', null, 'web.react'), ` binding. Lifecycle: ${entry.lifecycle}. Import: `, h('code', null, entry.imports.specifier)),
    docsSections
      .filter(([id]) => id !== 'used-in-blocks' || entry.usedIn.length > 0)
      .map(([id, title]) => h('section', { key: id, id, className: 'muxui-docs-section', 'aria-labelledby': `${id}-title` },
        h('h2', { id: `${id}-title` }, title),
        bodies[id]())));
}
