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
 * An entry covers one element. With `hidden` it covers everything below the element too, because nothing there is visible, so
 * the element holds no text and no Mux UI class that could show. Without it the element is a library wrapper that Mux UI's parts or
 * the caller's content sit in, and the entry says what it `holds`; the host's element-type rules reach the wrapper, so a part below
 * it takes its typography from the boundary rule and not from the wrapper (see base.css).
 * @type {readonly { name: string, reason: string, matches: (element: Element) => boolean, hidden?: boolean, holds?: string }[]}
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
    name: 'overlay container',
    reason: 'React Aria Components wrap a tooltip in <div data-overlay-container> and a popover in <div style="display: contents">; neither takes a className.',
    holds: 'the popup or tooltip, a Mux UI part',
    matches: (element) => element.localName === 'div' && (element.hasAttribute('data-overlay-container') || attribute(element, 'style').replace(/\s/gu, '') === 'display:contents;'),
  },
  {
    name: 'virtualizer layout',
    reason: 'React Aria Components\' Virtualizer sizes its scroll area with a relative <div role="presentation"> and positions each item in an absolute one, with no className on either.',
    holds: 'the items, Mux UI parts',
    matches: (element) => element.localName === 'div' && attribute(element, 'role') === 'presentation' && /position:\s*(?:absolute|relative)/u.test(attribute(element, 'style')),
  },
  {
    name: 'collection cell',
    reason: 'React Aria Components wrap the children of a GridList, TagGroup or Tree row in <div role="gridcell" style="display: contents"> and take no className on it.',
    holds: 'the row\'s content, which the caller supplies',
    matches: (element) => element.localName === 'div' && attribute(element, 'role') === 'gridcell' && attribute(element, 'style').replace(/\s/gu, '').startsWith('display:contents'),
  },
  {
    name: 'toast list',
    reason: 'React Aria Components\' ToastRegion renders <ol class="react-aria-ToastList"> and an <li style="display: contents"> per toast, and take no className.',
    holds: 'the toasts, Mux UI parts',
    matches: (element) => (element.localName === 'ol' && element.classList.contains('react-aria-ToastList'))
      || (element.localName === 'li' && element.parentElement?.classList.contains('react-aria-ToastList') === true),
  },
  {
    name: 'grid row and cell',
    reason: 'React Aria Components render the rows and cells of a Calendar grid, and the header row of a Table, as <tr> and <td> with no className; the Mux UI cell or column sits inside.',
    holds: 'the Mux UI cells and columns',
    matches: (element) => (element.localName === 'tr' || element.localName === 'td') && element.closest('table')?.matches('.muxui-calendar__grid, .muxui-table') === true,
  },
  {
    name: 'token segment',
    reason: 'React Aria Components\' TokenInput wraps each token and the text around it in a <span> with no className.',
    holds: 'a Mux UI token and the field\'s text',
    matches: (element) => element.localName === 'span' && element.parentElement?.classList.contains('muxui-token-field__input') === true,
  },
  {
    name: 'editor document',
    reason: 'Tiptap renders the editor\'s contenteditable surface and, from the caller\'s document, its paragraphs, headings, lists and marks, plus ProseMirror\'s own trailing break. The editor styles them from the surface (`.muxui-text-editor__content .ProseMirror <tag>`).',
    holds: 'the caller\'s document',
    matches: (element) => element.closest('.ProseMirror') !== null,
  },
];

/** True for an svg internal (path, rect, g, ...) whose svg carries a class of its own, or the caller's mark. */
const insideClassedSvg = (element, isClass) => {
  const svg = element.parentElement?.closest('svg');
  return element.namespaceURI === 'http://www.w3.org/2000/svg' && element.localName !== 'svg' && svg != null
    && (svg.hasAttribute(callerAttribute) || [...svg.classList].some(isClass));
};

/** True when an entry excepts `element`, itself or through an ancestor of a `hidden` entry. */
const exceptionFor = (element) => unclassableElements.some((entry) => {
  for (let node = element; node; node = node.parentElement) if (entry.matches(node) && (node === element || entry.hidden)) return true;
  return false;
});

/**
 * The elements under `root` that are not the caller's, have no Mux UI class, and are not excepted. `isClass` is the class-vocabulary
 * predicate. One string per element, `<tag> in <parent.classes>`.
 * @param {ParentNode} root
 * @param {{ isClass: (name: string) => boolean }} options
 */
export function unclassedElements(root, { isClass }) {
  const found = [];
  const describe = (element) => {
    const parent = element.parentElement;
    const where = parent ? `${parent.localName}${parent.classList.length ? `.${[...parent.classList].join('.')}` : ''}` : 'root';
    return `<${element.localName}> in <${where}>`;
  };
  for (const element of root.querySelectorAll('*')) {
    if (element.hasAttribute(callerAttribute) || [...element.classList].some(isClass) || insideClassedSvg(element, isClass)) continue;
    if (!exceptionFor(element)) found.push(describe(element));
  }
  return found;
}
