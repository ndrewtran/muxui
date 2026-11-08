// Every element a Mux UI component renders carries a Mux UI class. The base stylesheet gives the body's typography to a Mux UI
// element whose parent is not one (`:where([class^='muxui-']...):not(... > *)`), and an element without a class is reached by the
// host's element-type rules (`li { font: ... }`), so one unclassed element in a component's own markup lets the page into it, or
// makes a part below it take the body's typography in place of its component's. A rendered fixture tells the caller's elements from
// the component's with a mark (see caller-marked-jsx-runtime.mjs and the marked `h` below): an element without the mark and without
// a Mux UI class was rendered by Mux UI, or by a library Mux UI renders with.
import { callerAttribute } from './caller-marked-jsx-runtime.mjs';

/** `h` (React.createElement) that marks the native elements it creates as the caller's, for the fixtures that build their own content. */
export const markCaller = (createElement) => (type, props, ...children) => createElement(type, typeof type === 'string' ? { ...props, [callerAttribute]: '' } : props, ...children);

const attribute = (element, name) => element.getAttribute(name) ?? '';

/**
 * The elements Mux UI cannot give a class, each with why. The other kinds are the internals of a classed svg, and the caller's own
 * elements (marked).
 *
 * An entry covers one element, and says how the host's element-type rules (`li { font: ... }`) are kept out of it:
 * - `hidden` also covers everything below the element, because nothing there is visible: the element holds no text and no Mux UI
 *   class that could show.
 * - `rules` lists the Mux UI rules (selectors, as authored in the family's stylesheet) that make a library wrapper that holds text or
 *   content take the typography of the Mux UI element it sits in (or state the browser's own value for it), so its text and its line
 *   box never come from the host. The emission test finds each selector in the source CSS; the host-independence guard compares the
 *   wrapper on a bare and a host page.
 * - `boxless` marks a wrapper with no text and no box of its own around Mux UI parts (`display: contents`, or a block that holds only
 *   positioned parts). Each part below it has a parent that is not a Mux UI element, so it takes the body defaults from the boundary
 *   rule of base.css, whatever the wrapper's own font is; the guard compares those parts and skips the wrapper.
 * @type {readonly { name: string, reason: string, matches: (element: Element) => boolean, hidden?: true, rules?: readonly string[], boxless?: true }[]}
 */
export const unclassableElements = [
  {
    name: 'template', hidden: true,
    reason: 'React and React Aria Components emit inert <template> markers (hoisted collections, portals); their content is never rendered.',
    matches: (element) => element.localName === 'template',
  },
  {
    name: 'preload link', hidden: true,
    reason: 'React hoists a <link rel="preload"> ahead of an <img>; it renders nothing and takes no attributes from the component.',
    matches: (element) => element.localName === 'link' && attribute(element, 'rel') === 'preload',
  },
  {
    name: 'focus scope sentinel', hidden: true,
    reason: 'React Aria Components bracket a focus scope (a popover, a dialog, a listbox) with two empty hidden <span>s that take no className.',
    matches: (element) => element.localName === 'span' && (element.hasAttribute('data-focus-scope-start') || element.hasAttribute('data-focus-scope-end')),
  },
  {
    name: 'visually hidden box', hidden: true,
    reason: 'React Aria Components clip a VisuallyHidden box (the input of a checkbox, the native select behind Select, a screen-reader heading) with inline styles and take no className on it; nothing in it is visible.',
    matches: (element) => /clip-path:\s*inset\(50%\)/u.test(attribute(element, 'style')),
  },
  {
    name: 'popover underlay', hidden: true,
    reason: 'React Aria Components lay an empty fixed <div data-testid="underlay"> behind a non-modal popover; it takes no className.',
    matches: (element) => element.localName === 'div' && attribute(element, 'data-testid') === 'underlay',
  },
  {
    name: 'hidden file input', hidden: true,
    reason: 'React Aria Components\' FileTrigger renders a display:none <input type="file"> and takes no className on it.',
    matches: (element) => element.localName === 'input' && attribute(element, 'type') === 'file' && /display:\s*none/u.test(attribute(element, 'style')),
  },
  {
    name: 'hidden date input', hidden: true,
    reason: 'React Aria Components\' DateInput renders a hidden <input> that carries the field\'s value and takes no className.',
    matches: (element) => element.localName === 'input' && element.hasAttribute('hidden') && element.hasAttribute('data-rac'),
  },
  {
    name: 'serialised field name', hidden: true,
    reason: 'React Aria Components write the name of a NumberField or ComboBox into a bare <input type="hidden"> with no className. Mux UI\'s own hidden inputs are aria-hidden and carry muxui-form__value or muxui-form__reset-anchor.',
    matches: (element) => element.localName === 'input' && attribute(element, 'type') === 'hidden' && !element.hasAttribute('aria-hidden'),
  },
  {
    name: 'display: contents wrapper', boxless: true,
    reason: 'React Aria Components wrap a tooltip in <div data-overlay-container>, a popover in <div style="display: contents">, and a ListBox\'s empty state in <div role="option" style="display: contents">; none takes a className, and none has text of its own.',
    matches: (element) => element.localName === 'div' && attribute(element, 'role') !== 'gridcell'
      && (element.hasAttribute('data-overlay-container') || attribute(element, 'style').replace(/\s/gu, '') === 'display:contents;'),
  },
  {
    name: 'virtualizer layout',
    reason: 'React Aria Components\' Virtualizer sizes its scroll area with a relative <div role="presentation"> and positions each item in an absolute one, with no className on either.',
    rules: [
      ':where(.muxui-virtualizer, .muxui-grid-list[data-muxui-virtualized]) > :where([role=\'presentation\'])',
      ':where(.muxui-virtualizer, .muxui-grid-list[data-muxui-virtualized]) > :where([role=\'presentation\']) > :where([role=\'presentation\'])',
    ],
    matches: (element) => element.localName === 'div' && attribute(element, 'role') === 'presentation' && /position:\s*(?:absolute|relative)/u.test(attribute(element, 'style')),
  },
  {
    name: 'collection cell',
    reason: 'React Aria Components wrap the children of a GridList, TagGroup, Tree or InputTags row in <div role="gridcell" style="display: contents"> and take no className on it. A data-driven label is text in it.',
    rules: [
      ':where(.muxui-grid-list__item) > :where([role=\'gridcell\'])',
      ':where(.muxui-tag-group__tag) > :where([role=\'gridcell\'])',
      ':where(.muxui-tree__item) > :where([role=\'gridcell\'])',
      ':where(.muxui-input-tags__tag) > :where([role=\'gridcell\'])',
    ],
    matches: (element) => element.localName === 'div' && attribute(element, 'role') === 'gridcell' && attribute(element, 'style').replace(/\s/gu, '').startsWith('display:contents'),
  },
  {
    name: 'toast list',
    reason: 'React Aria Components\' ToastRegion renders <ol class="react-aria-ToastList"> and an <li style="display: contents"> per toast, and take no className.',
    rules: [
      ':where(.muxui-toast__region) > :where(ol)',
      ':where(.muxui-toast__region) > :where(ol) > :where(li)',
    ],
    matches: (element) => (element.localName === 'ol' && element.classList.contains('react-aria-ToastList'))
      || (element.localName === 'li' && element.parentElement?.classList.contains('react-aria-ToastList') === true),
  },
  {
    name: 'grid row and cell',
    reason: 'React Aria Components render the rows and cells of a Calendar grid, and the header row of a Table, as <tr> and <td> with no className; the Mux UI cell or column sits inside.',
    rules: [
      ':where(.muxui-calendar__grid-header, .muxui-calendar__grid-body) > :where(tr)',
      ':where(.muxui-calendar__grid-body) > :where(tr) > :where(td)',
      ':where(.muxui-table__header) > :where(tr)',
    ],
    matches: (element) => (element.localName === 'tr' || element.localName === 'td') && element.closest('table')?.matches('.muxui-calendar__grid, .muxui-table') === true,
  },
  {
    name: 'token segment',
    reason: 'React Aria Components\' TokenInput wraps each token and the text around it in a <span> with no className.',
    rules: [':where(.muxui-token-field__input) > :where(span)'],
    matches: (element) => element.localName === 'span' && element.parentElement?.classList.contains('muxui-token-field__input') === true,
  },
  {
    name: 'editor document',
    reason: 'Tiptap renders the editor\'s contenteditable surface and, from the caller\'s document, its paragraphs, headings, lists and marks, plus ProseMirror\'s own trailing break. The editor styles them from the surface (`.muxui-text-editor__content .ProseMirror <tag>`).',
    rules: [
      ':where(.muxui-text-editor__content .ProseMirror) :where(:not(h1, h2, h3, h4, h5, h6, pre))',
      '.muxui-text-editor__content .ProseMirror pre {',
      ':where(.muxui-text-editor__content .ProseMirror) :where(hr)',
    ],
    matches: (element) => element.closest('.ProseMirror') !== null,
  },
];

/** True for an svg internal (path, rect, g, ...) whose svg carries a class of its own, or the caller's mark. */
const insideClassedSvg = (element, isClass) => {
  const svg = element.parentElement?.closest('svg');
  return element.namespaceURI === 'http://www.w3.org/2000/svg' && element.localName !== 'svg' && svg != null
    && (svg.hasAttribute(callerAttribute) || [...svg.classList].some(isClass));
};

/** The entry that excepts `element`, itself or through an ancestor of a `hidden` entry. */
export const exceptionFor = (element) => unclassableElements.find((entry) => {
  for (let node = element; node; node = node.parentElement) if (entry.matches(node) && (node === element || entry.hidden)) return true;
  return false;
});

/** `<tag> in <parent.classes>`: where an element is, for a failure message. */
export function describe(element) {
  const parent = element.parentElement;
  const where = parent ? `${parent.localName}${parent.classList.length ? `.${[...parent.classList].join('.')}` : ''}` : 'root';
  return `<${element.localName}> in <${where}>`;
}

/**
 * The elements under `root` that are not the caller's, have no Mux UI class, and are not inside a classed svg: what Mux UI or a library
 * rendered without a class. `isClass` is the class-vocabulary predicate.
 * @param {ParentNode} root
 * @param {{ isClass: (name: string) => boolean }} options
 */
export const unclassedNodes = (root, { isClass }) => [...root.querySelectorAll('*')]
  .filter((element) => !element.hasAttribute(callerAttribute) && ![...element.classList].some(isClass) && !insideClassedSvg(element, isClass));

/**
 * The unclassed elements under `root` that are not excepted, one string per element, `<tag> in <parent.classes>`.
 * @param {ParentNode} root
 * @param {{ isClass: (name: string) => boolean }} options
 */
export const unclassedElements = (root, options) => unclassedNodes(root, options).filter((element) => exceptionFor(element) === undefined).map(describe);
