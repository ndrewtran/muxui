import React from 'react';
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Focusable as AriaFocusable,
  Link as AriaLink,
  MenuTrigger as AriaMenuTrigger,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
} from 'react-aria-components';
import XIcon from 'lucide-react/dist/esm/icons/x.mjs';
import SearchIcon from 'lucide-react/dist/esm/icons/search.mjs';
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import MenuIcon from 'lucide-react/dist/esm/icons/menu.mjs';
import ChevronsUpDownIcon from 'lucide-react/dist/esm/icons/chevrons-up-down.mjs';
import PanelLeftIcon from 'lucide-react/dist/esm/icons/panel-left.mjs';
import ExternalLinkIcon from 'lucide-react/dist/esm/icons/external-link.mjs';
import { Menu } from '../collections.mjs';
import { Tooltip } from '../overlays.ts';
import { IconButton } from './icon-button.ts';
import { h, useIsomorphicLayoutEffect, cx, dataState, nativePart } from './part-utils.mjs';
import { sidebarUnreachable, sidebarFocusFirst, sidebarHandoff, SidebarDrawerExit } from './navigation-drawer.mjs';

/* Sidebar */
// Folding state lives in Sidebar.Provider so Root, Toggle, and the shortcut share it. Without a Provider every part renders as before.
const SidebarContext = React.createContext(null);
// AccountCard shares its element with AccountMenu so the menu can anchor to the card, and AccountMenu tells the card it is mounted.
const SidebarAccountContext = React.createContext(null);
function useSidebarAccount() { const account = React.useContext(SidebarAccountContext); if (!account) throw new Error('Sidebar.AccountMenu must be used inside Sidebar.AccountCard'); return account; }
function useSidebarPart(part) { const context = React.useContext(SidebarContext); if (!context) throw new Error(`Sidebar.${part} must be used inside Sidebar.Provider`); return context; }
const SIDEBAR_EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const sidebarShortcutModifier = (event) => (/mac|iphone|ipad|ipod/iu.test(navigator.userAgentData?.platform ?? navigator.platform ?? '') ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey);
// Providers that own a shortcut. One pair of document listeners serves them all, so exactly one Provider handles a chord.
const sidebarShortcuts = new Set();
let sidebarMounts = 0;
function handleSidebarShortcut(event, capturing) {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.altKey || event.shiftKey || !sidebarShortcutModifier(event)) return;
  // The composed path sees through shadow roots, where the document only sees the host.
  const path = event.composedPath?.() ?? [event.target];
  // Leave the chord to text editing, where Cmd or Ctrl plus B means bold.
  if (path[0] instanceof Element && path[0].closest(SIDEBAR_EDITABLE)) return;
  const matches = [...sidebarShortcuts].filter(({ key }) => key === event.key?.toLowerCase()).sort((a, b) => a.order - b.order);
  const holder = matches.find(({ nodes }) => nodes().some((node) => path.includes(node)));
  // A Sidebar's own controls stop keydown before it bubbles (Tooltip triggers do), so their chords are taken while
  // capturing. Every other target gets to handle the chord first: it is ours in the bubble phase, if still uncancelled,
  // for the Provider that mounted last.
  const owner = capturing ? holder : holder ?? matches.at(-1);
  if (!owner) return;
  event.preventDefault();
  owner.toggle();
}
const onSidebarShortcutCapture = (event) => handleSidebarShortcut(event, true);
const onSidebarShortcutBubble = (event) => handleSidebarShortcut(event, false);

/** The column's focus candidates after its drawer is gone: the link matching the drawer's focused link, the current link, a Toggle, then Root. */
function sidebarColumnCandidates({ roots, toggles }, href) {
  const links = [...roots].flatMap((root) => [...root.querySelectorAll('a[href]')]);
  return [links.find((link) => link.getAttribute('href') === href), links.find((link) => link.getAttribute('aria-current') === 'page'), ...toggles, ...roots];
}

/** The text a NavItem label spells out, through elements and fragments. */
function sidebarLabelText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(sidebarLabelText).join('');
  return React.isValidElement(node) ? sidebarLabelText(node.props.children) : '';
}
/** Names a folded icon with a Mux Tooltip; outside a Provider it returns the trigger untouched. */
function SidebarRailTooltip({ label, children }) {
  const sidebar = React.useContext(SidebarContext);
  if (!sidebar || label === undefined || label === null || label === '') return children;
  // Native hosts join the tooltip trigger through Focusable; React Aria links already consume it.
  const trigger = typeof children.type === 'string' ? h(AriaFocusable, null, children) : children;
  return h(Tooltip, { content: label, trigger, placement: 'end', offset: 8, disabled: !sidebar.collapsed });
}
/** The visible header of the outermost nav group around `node`: where focus goes when folding hides the nested link it was on. */
function sidebarGroupHeader(node) {
  let list = node.closest('.muxui-sidebar__nav-children');
  while (list?.parentElement?.closest('.muxui-sidebar__nav-children')) list = list.parentElement.closest('.muxui-sidebar__nav-children');
  return list?.parentElement.querySelector(':scope > summary, :scope > .muxui-sidebar__nav-row > .muxui-sidebar__nav-link');
}
/** Open state of a nav group: the caller's when `expanded` is given, otherwise kept here starting from `defaultExpanded`. */
function useSidebarExpanded({ expanded, defaultExpanded = false, onExpandedChange }) {
  const controlled = expanded !== undefined;
  const [internal, setInternal] = React.useState(defaultExpanded);
  const open = controlled ? expanded : internal;
  const setOpen = (next) => { if (next === open) return; if (!controlled) setInternal(next); onExpandedChange?.(next); };
  return [open, setOpen];
}
/**
 * One nav entry at any depth, as a link, a disclosure group, or a link group. Without `href`, items form a native
 * details group; with `href`, the link and a separate toggle button share a row, since a summary cannot hold a link.
 * `child` entries are the rows nested under a top-level NavItem: label only, no icon, mark, badge, or rail tooltip.
 */
function SidebarNavNode({ label, href, icon: Icon, badge, current = false, external = false, items, child = false, expanded, defaultExpanded, onExpandedChange }) {
  const sidebar = React.useContext(SidebarContext);
  const [open, setOpen] = useSidebarExpanded({ expanded, defaultExpanded, onExpandedChange });
  const detailsRef = React.useRef(null);
  const listRef = React.useRef(null);
  // The group's visible control: the summary of a disclosure group, the toggle of a link group.
  const controlRef = React.useRef(null);
  const listId = React.useId();
  const labelId = React.useId();
  const [, rerender] = React.useReducer((count) => count + 1, 0);
  // The browser can open a details group itself (find in page); a caller that refuses the change gets its state back.
  useIsomorphicLayoutEffect(() => { if (detailsRef.current && detailsRef.current.open !== open) detailsRef.current.open = open; });
  // Closing the group, by the user or by the caller's `expanded`, hides the links inside it. Focus on one of them moves to the group's control, which stays visible.
  useIsomorphicLayoutEffect(() => {
    const list = listRef.current;
    if (open || !list || !list.contains(list.getRootNode().activeElement)) return;
    controlRef.current?.focus({ preventScroll: true });
  }, [open]);
  // Folded, an item without an icon keeps a mark in the icon column: the first character of its label, or a dot if it has no text.
  const initial = child || Icon || !sidebar ? undefined : [...sidebarLabelText(label).trim()][0]?.toUpperCase() ?? '•';
  const leading = Icon ? h(Icon, { className: 'muxui-sidebar__nav-icon', 'aria-hidden': true }) : initial && h('span', { className: 'muxui-sidebar__nav-mark', 'aria-hidden': true }, initial);
  // A link group's toggle takes its name from the rendered label, so a label that is a component still names it. A child's label is its link's whole content.
  const linkGroup = Boolean(href && items?.length);
  const body = (...trailing) => (child ? [label, ...trailing] : [leading, h('span', { id: linkGroup ? labelId : undefined, className: 'muxui-sidebar__nav-label' }, label), badge && h('span', { className: 'muxui-sidebar__nav-badge' }, badge), ...trailing]);
  const named = (node) => (child ? node : h(SidebarRailTooltip, { label }, node));
  const className = cx('muxui-sidebar__nav-link', child && 'muxui-sidebar__nav-child-link', current && 'muxui-sidebar__nav-link--current');
  const chevron = h(ChevronDownIcon, { className: 'muxui-sidebar__nav-chevron', 'aria-hidden': true, focusable: 'false' });
  const nested = items?.length ? h('ul', { ref: listRef, id: href ? listId : undefined, className: 'muxui-sidebar__nav-children', hidden: href ? !open : undefined }, items.map((entry, index) => h(SidebarNavNode, { key: entry.id ?? entry.href ?? index, ...entry, child: true }))) : null;
  let content;
  if (!nested) {
    content = named(h(AriaLink, { href, className, 'aria-current': current ? 'page' : undefined }, ...body(external && h(ExternalLinkIcon, { className: 'muxui-sidebar__nav-external', 'aria-hidden': true, focusable: 'false' }))));
  } else if (href) {
    content = h(React.Fragment, null,
      h('div', { className: 'muxui-sidebar__nav-row' },
        named(h(AriaLink, { id: child ? labelId : undefined, href, className, 'aria-current': current ? 'page' : undefined }, ...body())),
        h(AriaButton, { ref: controlRef, className: 'muxui-sidebar__nav-btn muxui-sidebar__nav-toggle', 'aria-labelledby': labelId, 'aria-expanded': open, 'aria-controls': listId, onPress: () => setOpen(!open) }, chevron)),
      nested);
  } else {
    // Folded, the group has no room to open: activating it unfolds the sidebar and opens the group.
    const onClick = (event) => { event.preventDefault(); if (sidebar?.collapsed) { sidebar.setCollapsed(false); setOpen(true); } else setOpen(!open); };
    const onToggle = (event) => { if (event.currentTarget.open === open) return; setOpen(event.currentTarget.open); rerender(); };
    content = h('details', { ref: detailsRef, open, onToggle }, named(h('summary', { ref: controlRef, className, onClick }, ...body(chevron))), nested);
  }
  return h('li', { className: 'muxui-sidebar__nav-item' }, content);
}
export const Sidebar = {
  Provider: function SidebarProvider({ collapsed, defaultCollapsed = false, onCollapsedChange, shortcut, children }) {
    const controlled = collapsed !== undefined;
    const [internal, setInternal] = React.useState(defaultCollapsed);
    const [customRootId, setRootId] = React.useState(undefined);
    // Roots and Toggles register their elements for the shortcut's target check and for rescuing focus when folding hides it.
    const [roots] = React.useState(() => new Set());
    const [toggles] = React.useState(() => new Set());
    // The MobileTrigger menu buttons, so Root can hand focus to one when layout swaps the column for the drawer.
    const [menuButtons] = React.useState(() => new Set());
    // Counts fold requests so a pending Search focus can tell that another fold has happened since.
    const requests = React.useRef(0);
    const generatedRootId = React.useId();
    const current = controlled ? collapsed : internal;
    const latest = React.useRef({ controlled, current, onCollapsedChange });
    latest.current = { controlled, current, onCollapsedChange };
    const setCollapsed = React.useCallback((next) => { const state = latest.current; if (next === state.current) return; requests.current += 1; if (!state.controlled) setInternal(next); state.onCollapsedChange?.(next); }, []);
    const toggle = React.useCallback(() => setCollapsed(!latest.current.current), [setCollapsed]);
    // Precedence between Providers follows mount order. The sequence is assigned once, so a changed shortcut keeps it.
    const mounted = React.useRef(0);
    React.useEffect(() => {
      mounted.current ||= (sidebarMounts += 1);
      if (!shortcut) return undefined;
      const entry = { key: shortcut.toLowerCase(), toggle, order: mounted.current, nodes: () => [...roots, ...toggles] };
      if (sidebarShortcuts.size === 0) {
        document.addEventListener('keydown', onSidebarShortcutCapture, true);
        document.addEventListener('keydown', onSidebarShortcutBubble);
      }
      sidebarShortcuts.add(entry);
      return () => {
        sidebarShortcuts.delete(entry);
        if (sidebarShortcuts.size === 0) {
          document.removeEventListener('keydown', onSidebarShortcutCapture, true);
          document.removeEventListener('keydown', onSidebarShortcutBubble);
        }
      };
    }, [shortcut, toggle, roots, toggles]);
    const value = React.useMemo(() => ({ collapsed: current, setCollapsed, toggle, rootId: customRootId ?? generatedRootId, setRootId, roots, toggles, menuButtons, requests }), [current, setCollapsed, toggle, customRootId, generatedRootId, roots, toggles, menuButtons]);
    return h(SidebarContext.Provider, { value }, children);
  },
  Root: React.forwardRef(function SidebarRoot({ hideBorder = false, density = 'default', ...props }, ref) {
    const sidebar = React.useContext(SidebarContext);
    const node = React.useRef(null);
    React.useImperativeHandle(ref, () => node.current);
    const { roots, setRootId } = sidebar ?? {};
    // A caller-supplied id replaces the generated one so Toggle's aria-controls follows it.
    useIsomorphicLayoutEffect(() => { if (!setRootId || props.id === undefined) return undefined; setRootId(props.id); return () => setRootId(undefined); }, [setRootId, props.id]);
    useIsomorphicLayoutEffect(() => { const element = node.current; if (!roots) return undefined; roots.add(element); return () => roots.delete(element); }, [roots]);
    // Folding hides some content. If focus sat in it, move it to a control that survives: the group of a hidden
    // nested link, the folded Search button for the Search input, else the Toggle, else Root itself.
    useIsomorphicLayoutEffect(() => {
      const root = node.current;
      const active = root?.ownerDocument.activeElement;
      if (!sidebar?.collapsed || !root || !active || !root.contains(active) || !sidebarUnreachable(active)) return;
      const group = sidebarGroupHeader(active);
      const search = active.closest('.muxui-sidebar__search')?.querySelector('.muxui-sidebar__search-button');
      sidebarFocusFirst([group, search, ...sidebar.toggles, root], roots);
    }, [sidebar?.collapsed]);
    // When layout hides Root (the drawer took over) while focus is inside it, hand focus to the menu button if that is rendered.
    const { menuButtons } = sidebar ?? {};
    React.useEffect(() => {
      const root = node.current;
      if (!menuButtons || !root || typeof ResizeObserver === 'undefined') return undefined;
      // The browser may blur the hidden element before the observer runs, so remember that focus was inside while Root
      // rendered, starting with focus that arrived before this subscribed (autofocus). Focus a user sends elsewhere resets it.
      let inside = root.contains(document.activeElement);
      const track = (event) => {
        if (event.type === 'focusin') inside = true;
        else if (root.getClientRects().length > 0 || (event.relatedTarget && !root.contains(event.relatedTarget))) inside = false;
      };
      root.addEventListener('focusin', track);
      root.addEventListener('focusout', track);
      const observer = new ResizeObserver(() => {
        if (!inside || root.getClientRects().length > 0) return;
        inside = false;
        sidebarHandoff(() => [...menuButtons], roots, (active) => root.contains(active));
      });
      observer.observe(root);
      return () => {
        observer.disconnect();
        root.removeEventListener('focusin', track);
        root.removeEventListener('focusout', track);
      };
    }, [menuButtons, roots]);
    return h('aside', { ...props, ref: node, id: props.id ?? sidebar?.rootId, 'data-foldable': dataState(sidebar), 'data-collapsed': dataState(sidebar?.collapsed), 'data-density': density === 'compact' ? 'compact' : undefined, className: cx('muxui-sidebar', hideBorder && 'muxui-sidebar--no-border', props.className) });
  }),
  Toggle: React.forwardRef(function SidebarToggle({ onActivate, className, children, ...props }, ref) {
    const sidebar = useSidebarPart('Toggle');
    const node = React.useRef(null);
    React.useImperativeHandle(ref, () => node.current);
    const { toggles } = sidebar;
    useIsomorphicLayoutEffect(() => { const element = node.current; toggles.add(element); return () => toggles.delete(element); }, [toggles]);
    return h(IconButton, { 'aria-label': 'Toggle sidebar', ...props, ref: node, 'aria-expanded': !sidebar.collapsed, 'aria-controls': sidebar.rootId, className: cx('muxui-sidebar__toggle', className), onActivate: (event) => { onActivate?.(event); sidebar.toggle(); } }, children ?? h(PanelLeftIcon, { 'aria-hidden': true, focusable: 'false' }));
  }),
  Header: React.forwardRef(function SidebarHeader(props, ref) { return nativePart('div', 'muxui-sidebar__header', props, ref); }),
  Search: React.forwardRef(function SidebarSearch({ placeholder = 'Search', value, onChange, className, ...props }, ref) {
    const sidebar = React.useContext(SidebarContext);
    const inputRef = React.useRef(null);
    // Folded, the icon is a button that unfolds the sidebar and asks for the input's focus. A controlled parent may
    // apply the change later, so the request waits for Root to be expanded; it lapses if another fold happens or
    // the sidebar stays folded.
    const pending = React.useRef(null);
    const unfold = () => {
      sidebar.setCollapsed(false);
      clearTimeout(pending.current?.timer);
      pending.current = { request: sidebar.requests.current, timer: setTimeout(() => { pending.current = null; }, 1000) };
    };
    useIsomorphicLayoutEffect(() => {
      const wanted = pending.current;
      if (!wanted || !sidebar || sidebar.collapsed) return;
      clearTimeout(wanted.timer);
      pending.current = null;
      if (wanted.request === sidebar.requests.current) inputRef.current?.focus();
    }, [sidebar?.collapsed]);
    React.useEffect(() => () => clearTimeout(pending.current?.timer), []);
    return nativePart('div', 'muxui-sidebar__search', { ...props, className }, ref, h(React.Fragment, null,
      sidebar && h(SidebarRailTooltip, { label: placeholder }, h('button', { type: 'button', className: 'muxui-sidebar__nav-btn muxui-sidebar__search-button', 'aria-label': placeholder, onClick: unfold })),
      h(SearchIcon, { className: 'muxui-sidebar__search-icon', 'aria-hidden': true, focusable: 'false' }),
      h('input', { ref: inputRef, className: 'muxui-sidebar__search-input', placeholder, value, onChange, 'aria-label': placeholder })));
  }),
  Divider: React.forwardRef(function SidebarDivider(props, ref) { return nativePart('hr', 'muxui-sidebar__divider', props, ref); }),
  NavList: React.forwardRef(function SidebarNavList(props, ref) { return nativePart('ul', 'muxui-sidebar__nav-list', props, ref); }),
  Section: React.forwardRef(function SidebarSection({ label, className, children, ...props }, ref) { const labelId = React.useId(); return h('li', { ...props, ref, className: cx('muxui-sidebar__section', className) }, h('span', { id: labelId, className: 'muxui-sidebar__section-label' }, label), h('ul', { className: 'muxui-sidebar__section-items', 'aria-labelledby': labelId }, children)); }),
  NavItem: function SidebarNavItem({ children, ...props }) { return h(SidebarNavNode, { ...props, label: children }); },
  NavButton: React.forwardRef(function SidebarNavButton({ href, icon: Icon, label, current = false, className, ...props }, ref) { return h('a', { ...props, ref, href, 'aria-label': label, className: cx('muxui-sidebar__nav-btn', current && 'muxui-sidebar__nav-btn--current', className) }, Icon && h(Icon, { className: 'muxui-sidebar__nav-btn-icon', 'aria-hidden': true }), props.children); }),
  AccountCard: React.forwardRef(function SidebarAccountCard({ name, email, avatarSrc, avatarAlt, status, className, children, ...props }, ref) {
    const sidebar = React.useContext(SidebarContext);
    const card = React.useRef(null);
    React.useImperativeHandle(ref, () => card.current);
    const [open, setOpen] = React.useState(false);
    // A folded rail hides the options button, so a menu left open has nothing to anchor to or return focus to:
    // close it and hand focus to a Toggle, else Root.
    const collapsed = Boolean(sidebar?.collapsed);
    useIsomorphicLayoutEffect(() => {
      if (!collapsed || !open) return;
      setOpen(false);
      sidebarHandoff(() => [...sidebar.toggles, ...sidebar.roots], sidebar.roots, (active) => active.closest('[role="menu"]'));
    }, [collapsed]);
    // The options button exists to open an AccountMenu, so it shows only while one is mounted, however it is wrapped.
    // It stays in the tree, hidden, because the menu trigger around the card warns when it has no button to press.
    // One menu per card: two would open as two popovers over one trigger.
    const [hasMenu, setHasMenu] = React.useState(false);
    const registered = React.useRef(false);
    const register = React.useCallback(() => {
      if (registered.current) throw new Error('Sidebar.AccountCard takes one Sidebar.AccountMenu');
      registered.current = true;
      setHasMenu(true);
      return () => { registered.current = false; setHasMenu(false); };
    }, []);
    const account = React.useMemo(() => ({ anchor: card, register }), [register]);
    useIsomorphicLayoutEffect(() => { if (!hasMenu) setOpen(false); }, [hasMenu]);
    const content = h('div', { ...props, ref: card, className: cx('muxui-sidebar__account-card', className) }, h('div', { className: 'muxui-sidebar__account-avatar-wrap' }, avatarSrc ? h('img', { src: avatarSrc, alt: avatarAlt ?? name, className: 'muxui-sidebar__account-avatar' }) : h('div', { className: 'muxui-sidebar__account-avatar muxui-sidebar__account-avatar--placeholder', 'aria-hidden': true }, name?.charAt(0)), status && h('span', { className: `muxui-sidebar__account-status muxui-sidebar__account-status--${status}`, 'aria-label': status })), h('div', { className: 'muxui-sidebar__account-info' }, h('div', { className: 'muxui-sidebar__account-name' }, name), h('div', { className: 'muxui-sidebar__account-email' }, email)), h(IconButton, { hidden: !hasMenu, className: 'muxui-sidebar__account-trigger', 'aria-label': 'Account options' }, h(ChevronsUpDownIcon, { className: 'muxui-sidebar__account-trigger-icon', 'aria-hidden': true, focusable: 'false' })), children);
    return h(SidebarAccountContext.Provider, { value: account }, h(AriaMenuTrigger, { isOpen: open && hasMenu && !collapsed, onOpenChange: setOpen }, content));
  }),
  AccountMenu: React.forwardRef(function SidebarAccountMenu({ items, children, onAction, className }, ref) {
    const account = useSidebarAccount();
    useIsomorphicLayoutEffect(() => account.register(), [account.register]);
    // The popup opens from the card, not the small button, so it lines up with the card's edge.
    return h(Menu.Popup, { anchorRef: account.anchor, placement: 'top-start' }, h(Menu.List, { items, onAction, ref, className: cx('muxui-sidebar__account-menu', className) }, children));
  }),
  MobileTrigger: function SidebarMobileTrigger({ children, logo }) {
    const sidebar = React.useContext(SidebarContext);
    const [open, setOpen] = React.useState(false);
    const latest = React.useRef({ open, sidebar });
    latest.current = { open, sidebar };
    const header = React.useRef(null);
    const button = React.useRef(null);
    // The drawer's focused link and dialog when layout took it away, for the column link that should receive focus next.
    const handoff = React.useRef(null);
    const menuButtons = sidebar?.menuButtons;
    useIsomorphicLayoutEffect(() => { const element = button.current; if (!menuButtons) return undefined; menuButtons.add(element); return () => menuButtons.delete(element); }, [menuButtons]);
    // When layout hides this header (the column took over), an open drawer would be stranded: close it and hand focus to the column.
    React.useEffect(() => {
      if (!menuButtons || typeof ResizeObserver === 'undefined') return undefined;
      const observer = new ResizeObserver(() => {
        if (!latest.current.open || header.current.getClientRects().length > 0) return;
        const dialog = document.activeElement?.closest('.muxui-sidebar__mobile-dialog') ?? null;
        handoff.current = { dialog, href: dialog ? document.activeElement.closest('a[href]')?.getAttribute('href') ?? null : null };
        setOpen(false);
      });
      observer.observe(header.current);
      return () => observer.disconnect();
    }, [menuButtons]);
    const exit = () => {
      const wanted = handoff.current;
      handoff.current = null;
      const { sidebar: current } = latest.current;
      if (wanted && current) sidebarHandoff(() => sidebarColumnCandidates(current, wanted.href), current.roots, (active) => wanted.dialog?.contains(active));
    };
    // The drawer is always full size, so its navigation ignores the folded state of the desktop sidebar.
    return h(AriaDialogTrigger, { isOpen: open, onOpenChange: setOpen },
      h('header', { ref: header, className: 'muxui-sidebar__mobile-header' }, logo && h('div', { className: 'muxui-sidebar__mobile-logo' }, logo), h(IconButton, { ref: button, className: 'muxui-sidebar__mobile-menu-btn', 'aria-label': 'Open navigation' }, h(MenuIcon, { 'aria-hidden': true, focusable: 'false' }))),
      h(AriaModalOverlay, { className: 'muxui-sidebar__mobile-overlay' }, h(AriaModal, { className: 'muxui-sidebar__mobile-drawer' }, h(AriaDialog, { 'aria-label': 'Navigation', className: 'muxui-sidebar__mobile-dialog' }, ({ close }) => h(SidebarContext.Provider, { value: null }, h(SidebarDrawerExit, { exit }), h('div', { className: 'muxui-sidebar__mobile-close-row' }, h(IconButton, { size: 'sm', className: 'muxui-sidebar__mobile-close-btn', onActivate: close, 'aria-label': 'Close navigation' }, h(XIcon, { 'aria-hidden': true, focusable: 'false' }))), children)))));
  },
  FeatureCard: React.forwardRef(function SidebarFeatureCard({ title, description, dismissLabel, onDismiss, ...props }, ref) { return nativePart('div', 'muxui-sidebar__feature-card', props, ref, h(React.Fragment, null, title && h('div', { className: 'muxui-sidebar__feature-card-title' }, title), description && h('div', { className: 'muxui-sidebar__feature-card-description' }, description), props.children, onDismiss && h('button', { type: 'button', className: 'muxui-sidebar__feature-card-dismiss', onClick: onDismiss }, dismissLabel ?? 'Dismiss'))); }),
};
