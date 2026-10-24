import React from 'react';
import type { AnchorHTMLAttributes, ChangeEventHandler, ComponentType, ForwardRefExoticComponent, HTMLAttributes, ReactElement, ReactNode, RefAttributes, RefObject } from 'react';
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
import type { DialogTriggerProps as AriaDialogTriggerProps } from 'react-aria-components';
import XIcon from 'lucide-react/dist/esm/icons/x.mjs';
import SearchIcon from 'lucide-react/dist/esm/icons/search.mjs';
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import MenuIcon from 'lucide-react/dist/esm/icons/menu.mjs';
import ChevronsUpDownIcon from 'lucide-react/dist/esm/icons/chevrons-up-down.mjs';
import PanelLeftIcon from 'lucide-react/dist/esm/icons/panel-left.mjs';
import ExternalLinkIcon from 'lucide-react/dist/esm/icons/external-link.mjs';
import type { MuxUICollectionItem, MuxUIItems } from '../collection-items.ts';
import { Menu } from '../menu.ts';
import type { MenuListProps } from '../menu.ts';
import { Tooltip } from '../overlays.ts';
import { IconButton } from './icon-button.ts';
import type { IconButtonProps } from './icon-button.ts';
import { h, useIsomorphicLayoutEffect, cx, dataState, nativePart } from './part-utils.ts';
import type { PartProps } from './part-utils.ts';
import { sidebarUnreachable, sidebarFocusFirst, sidebarHandoff, SidebarDrawerExit } from './navigation-drawer.ts';

/**
 * The props Mux UI defines for Sidebar.Root, the compound's root; the catalog's web.react API is derived from
 * this type (Decision 0031). Provider, Search, Section, NavItem, NavButton, AccountCard, AccountMenu, MobileTrigger and
 * FeatureCard define theirs in the OwnProps types below, and Toggle, Header, Divider and NavList define none.
 * They are type literals, not interfaces, so the public props types stay assignable to Record<string, unknown>.
 */
type SidebarOwnProps = {
  /** Removes the border on the column's edge. */
  hideBorder?: boolean;
  /** `compact` tightens nav rows, gaps, section labels, and nesting; text sizes and focus rings are unchanged. */
  density?: 'default' | 'compact';
};

/** The props Mux UI defines for Sidebar.Provider; its API is the provider entry in the catalog's partApis. */
type SidebarProviderOwnProps = {
  /** Folded state; supply it with `onCollapsedChange` to control the rail. */
  collapsed?: boolean;
  /** Whether the rail starts folded, when it controls itself. */
  defaultCollapsed?: boolean;
  /** Called with the new folded state each time the rail folds or unfolds. */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** A key that toggles the rail with Cmd on macOS or Ctrl elsewhere; ignored while typing in a text field or editor. */
  shortcut?: string;
};

/** The props Mux UI defines for Sidebar.Search; its API is the search entry in the catalog's partApis. */
type SidebarSearchOwnProps = {
  /** The input's placeholder and accessible name; folded, it also names the button that unfolds the rail. */
  placeholder?: string;
  /** The input's value, when the caller controls it. */
  value?: string;
  /** Called with the change event of the input each time its value changes. */
  onChange?: ChangeEventHandler<HTMLInputElement>;
};

/** The props Mux UI defines for Sidebar.Section; its API is the section entry in the catalog's partApis. */
type SidebarSectionOwnProps = {
  /** The section's visible heading, which also names its list. */
  label: ReactNode;
};

/** The icon a nav item or button draws: a component that takes a class name, such as one from an icon library. */
type SidebarIconProps = { className?: string };

/** Open state shared by every nav group: supply `expanded` with `onExpandedChange` to control it, or `defaultExpanded` to start it open. */
export type SidebarExpandedProps = {
  /** Whether the group is open, when the caller controls it. */
  expanded?: boolean;
  /** Whether the group starts open, when it controls itself. */
  defaultExpanded?: boolean;
  /** Called with the new open state each time the group opens or closes. */
  onExpandedChange?: (expanded: boolean) => void;
};

/**
 * A nested nav entry. An entry with `items` and no `href` is a disclosure group; with both, it is a link beside a
 * toggle button. `id` is a stable React key and defaults to `href`.
 */
// The two arms repeat SidebarExpandedProps and the fields they share, since the derivation reads no intersection with a union.
export type SidebarNavEntry =
  | { expanded?: boolean; defaultExpanded?: boolean; onExpandedChange?: (expanded: boolean) => void; id?: string; label: ReactNode; current?: boolean; href: string; items?: SidebarNavEntry[] }
  | { expanded?: boolean; defaultExpanded?: boolean; onExpandedChange?: (expanded: boolean) => void; id?: string; label: ReactNode; current?: boolean; href?: string; items: SidebarNavEntry[] };

/** The props Mux UI defines for Sidebar.NavItem; its API is the nav-item entry in the catalog's partApis. */
// The open-state fields repeat SidebarExpandedProps, which the derivation does not read through an intersection.
type SidebarNavItemOwnProps = {
  /** The destination. Without it, `items` make a disclosure group. */
  href?: string;
  /** An icon drawn before the label. Folded, an item without one keeps the first character of its label. */
  icon?: ComponentType<SidebarIconProps>;
  /** A count or short mark shown after the label. */
  badge?: ReactNode;
  /** Marks the item's page with `aria-current="page"`; on a group without `href` it only styles the header. */
  current?: boolean;
  /** The entries nested under the item. */
  items?: SidebarNavEntry[];
  /** Marks the link as leaving the application, with an icon that says so. */
  external?: boolean;
  /** Whether the group is open, when the caller controls it. */
  expanded?: boolean;
  /** Whether the group starts open, when it controls itself. */
  defaultExpanded?: boolean;
  /** Called with the new open state each time the group opens or closes. */
  onExpandedChange?: (expanded: boolean) => void;
};

/** The props Mux UI defines for Sidebar.NavButton; its API is the nav-button entry in the catalog's partApis. */
type SidebarNavButtonOwnProps = {
  /** An icon drawn inside the button. */
  icon?: ComponentType<SidebarIconProps>;
  /** The button's accessible name. */
  label?: string;
  /** Marks the link as the current page: it is styled as such. */
  current?: boolean;
};

/** The props Mux UI defines for Sidebar.AccountCard; its API is the account-card entry in the catalog's partApis. */
type SidebarAccountCardOwnProps = {
  /** The account's name. */
  name: string;
  /** The account's email address. */
  email: string;
  /** The avatar image. Without it, the card shows the first letter of the name. */
  avatarSrc?: string;
  /** The avatar image's text alternative; without it, the name. */
  avatarAlt?: string;
  /** Marks the account online or offline with a dot on the avatar. */
  status?: 'online' | 'offline';
};

/** The props Mux UI defines for Sidebar.AccountMenu; its API is the account-menu entry in the catalog's partApis. */
type SidebarAccountMenuOwnProps = {
  /** The menu's options as data, as Menu.List takes them. Children take precedence. */
  items?: MuxUIItems;
  /** Called when the user activates an option, with the item record for a list built from `items`. */
  onAction?: (item?: MuxUICollectionItem) => void;
};

/** The props Mux UI defines for Sidebar.MobileTrigger; its API is the mobile-trigger entry in the catalog's partApis. */
type SidebarMobileTriggerOwnProps = {
  /** A mark or name shown beside the button that opens the drawer. */
  logo?: ReactNode;
};

/** The props Mux UI defines for Sidebar.FeatureCard; its API is the feature-card entry in the catalog's partApis. */
type SidebarFeatureCardOwnProps = {
  /** The card's heading. */
  title?: string;
  /** The card's supporting text. */
  description?: string;
  /** The dismiss button's label. */
  dismissLabel?: string;
  /** Called when the dismiss button is pressed; without it the card has no button. */
  onDismiss?: () => void;
};

export type SidebarProps = HTMLAttributes<HTMLElement> & SidebarOwnProps;
export type SidebarProviderProps = SidebarProviderOwnProps & { children?: ReactNode };
/** Names the control "Toggle sidebar" unless `aria-label` or `aria-labelledby` says otherwise. */
export type SidebarToggleProps = Omit<IconButtonProps, 'aria-label' | 'aria-labelledby'> & { 'aria-label'?: string; 'aria-labelledby'?: string };
type SidebarSearchProps = PartProps<HTMLDivElement> & SidebarSearchOwnProps;
export type SidebarSectionProps = PartProps<HTMLLIElement> & SidebarSectionOwnProps;
export type SidebarNavItemProps = SidebarNavItemOwnProps & { children?: ReactNode };
type SidebarNavButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & SidebarNavButtonOwnProps;
type SidebarAccountCardProps = PartProps<HTMLDivElement> & SidebarAccountCardOwnProps;
/** The part of Menu's list props that AccountMenu supports. The card's button names the menu and owns its open state. */
export type SidebarAccountMenuProps = SidebarAccountMenuOwnProps & Pick<MenuListProps, 'children' | 'className'>;
type SidebarMobileTriggerProps = SidebarMobileTriggerOwnProps & { children?: ReactNode };
type SidebarFeatureCardProps = PartProps<HTMLDivElement> & SidebarFeatureCardOwnProps;

/* Sidebar */
/** What Provider shares with Root, Toggle, Search and the nav parts. */
type SidebarContextValue = {
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
  toggle: () => void;
  rootId: string;
  setRootId: (id: string | undefined) => void;
  roots: Set<HTMLElement>;
  toggles: Set<HTMLElement>;
  menuButtons: Set<HTMLElement>;
  requests: RefObject<number>;
};
/** What AccountCard shares with the AccountMenu inside it. */
type SidebarAccountValue = { anchor: RefObject<HTMLDivElement | null>; register: () => () => void };
// Folding state lives in Sidebar.Provider so Root, Toggle, and the shortcut share it. Without a Provider every part renders as before.
const SidebarContext = React.createContext<SidebarContextValue | null>(null);
// AccountCard shares its element with AccountMenu so the menu can anchor to the card, and AccountMenu tells the card it is mounted.
const SidebarAccountContext = React.createContext<SidebarAccountValue | null>(null);
function useSidebarAccount() { const account = React.useContext(SidebarAccountContext); if (!account) throw new Error('Sidebar.AccountMenu must be used inside Sidebar.AccountCard'); return account; }
function useSidebarPart(part: string) { const context = React.useContext(SidebarContext); if (!context) throw new Error(`Sidebar.${part} must be used inside Sidebar.Provider`); return context; }
const SIDEBAR_EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
// userAgentData is not in the DOM library yet.
const sidebarShortcutModifier = (event: KeyboardEvent) => (/mac|iphone|ipad|ipod/iu.test((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? '') ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey);
// Providers that own a shortcut. One pair of document listeners serves them all, so exactly one Provider handles a chord.
const sidebarShortcuts = new Set<{ key: string; toggle: () => void; order: number; nodes: () => Element[] }>();
let sidebarMounts = 0;
function handleSidebarShortcut(event: KeyboardEvent, capturing: boolean) {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.altKey || event.shiftKey || !sidebarShortcutModifier(event)) return;
  // The composed path sees through shadow roots, where the document only sees the host.
  const path: (EventTarget | null)[] = event.composedPath?.() ?? [event.target];
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
const onSidebarShortcutCapture = (event: KeyboardEvent) => handleSidebarShortcut(event, true);
const onSidebarShortcutBubble = (event: KeyboardEvent) => handleSidebarShortcut(event, false);

/** The column's focus candidates after its drawer is gone: the link matching the drawer's focused link, the current link, a Toggle, then Root. */
function sidebarColumnCandidates({ roots, toggles }: SidebarContextValue, href: string | null) {
  const links = [...roots].flatMap((root) => [...root.querySelectorAll<HTMLAnchorElement>('a[href]')]);
  return [links.find((link) => link.getAttribute('href') === href), links.find((link) => link.getAttribute('aria-current') === 'page'), ...toggles, ...roots];
}

/** The text a NavItem label spells out, through elements and fragments. */
function sidebarLabelText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(sidebarLabelText).join('');
  return React.isValidElement<{ children?: ReactNode }>(node) ? sidebarLabelText(node.props.children) : '';
}
/** Names a folded icon with a Mux Tooltip; outside a Provider it returns the trigger untouched. */
function SidebarRailTooltip({ label, children }: { label: ReactNode; children: ReactElement }) {
  const sidebar = React.useContext(SidebarContext);
  if (!sidebar || label === undefined || label === null || label === '') return children;
  // Native hosts join the tooltip trigger through Focusable; React Aria links already consume it.
  const trigger = typeof children.type === 'string' ? h(AriaFocusable, null, children) : children;
  // The checks above leave content that renders something, which the Tooltip's own type cannot see.
  return h(Tooltip, { content: label as Exclude<ReactNode, null | undefined | boolean>, trigger, placement: 'end', offset: 8, disabled: !sidebar.collapsed });
}
/** The visible header of the outermost nav group around `node`: where focus goes when folding hides the nested link it was on. */
function sidebarGroupHeader(node: Element) {
  let list = node.closest('.muxui-sidebar__nav-children');
  while (list?.parentElement?.closest('.muxui-sidebar__nav-children')) list = list.parentElement.closest('.muxui-sidebar__nav-children');
  return list?.parentElement!.querySelector<HTMLElement>(':scope > summary, :scope > .muxui-sidebar__nav-row > .muxui-sidebar__nav-link');
}
/** Open state of a nav group: the caller's when `expanded` is given, otherwise kept here starting from `defaultExpanded`. */
function useSidebarExpanded({ expanded, defaultExpanded = false, onExpandedChange }: SidebarExpandedProps): [boolean, (next: boolean) => void] {
  const controlled = expanded !== undefined;
  const [internal, setInternal] = React.useState(defaultExpanded);
  const open = controlled ? expanded : internal;
  const setOpen = (next: boolean) => { if (next === open) return; if (!controlled) setInternal(next); onExpandedChange?.(next); };
  return [open, setOpen];
}
type SidebarNavNodeProps = SidebarExpandedProps & {
  label: ReactNode;
  href?: string;
  icon?: ComponentType<SidebarIconProps>;
  badge?: ReactNode;
  current?: boolean;
  external?: boolean;
  items?: SidebarNavEntry[];
  child?: boolean;
};
/**
 * One nav entry at any depth, as a link, a disclosure group, or a link group. Without `href`, items form a native
 * details group; with `href`, the link and a separate toggle button share a row, since a summary cannot hold a link.
 * `child` entries are the rows nested under a top-level NavItem: label only, no icon, mark, badge, or rail tooltip.
 */
function SidebarNavNode({ label, href, icon: Icon, badge, current = false, external = false, items, child = false, expanded, defaultExpanded, onExpandedChange }: SidebarNavNodeProps): ReactElement {
  const sidebar = React.useContext(SidebarContext);
  const [open, setOpen] = useSidebarExpanded({ expanded, defaultExpanded, onExpandedChange });
  const detailsRef = React.useRef<HTMLDetailsElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  // The group's visible control: the summary of a disclosure group, the toggle of a link group. Only focus is called on it.
  const controlRef = React.useRef<HTMLButtonElement>(null);
  const listId = React.useId();
  const labelId = React.useId();
  const [, rerender] = React.useReducer((count: number) => count + 1, 0);
  // The browser can open a details group itself (find in page); a caller that refuses the change gets its state back.
  useIsomorphicLayoutEffect(() => { if (detailsRef.current && detailsRef.current.open !== open) detailsRef.current.open = open; });
  // Closing the group, by the user or by the caller's `expanded`, hides the links inside it. Focus on one of them moves to the group's control, which stays visible.
  useIsomorphicLayoutEffect(() => {
    const list = listRef.current;
    if (open || !list || !list.contains((list.getRootNode() as Document | ShadowRoot).activeElement)) return;
    controlRef.current?.focus({ preventScroll: true });
  }, [open]);
  // Folded, an item without an icon keeps a mark in the icon column: the first character of its label, or a dot if it has no text.
  const initial = child || Icon || !sidebar ? undefined : [...sidebarLabelText(label).trim()][0]?.toUpperCase() ?? '•';
  // A component the item is given may take more than a class name, so the spread keeps aria-hidden out of SidebarIconProps.
  const leading = Icon ? h(Icon, { className: 'muxui-sidebar__nav-icon', ...{ 'aria-hidden': true } }) : initial && h('span', { className: 'muxui-sidebar__nav-mark', 'aria-hidden': true }, initial);
  // A link group's toggle takes its name from the rendered label, so a label that is a component still names it. A child's label is its link's whole content.
  const linkGroup = Boolean(href && items?.length);
  const body = (...trailing: ReactNode[]) => (child ? [label, ...trailing] : [leading, h('span', { id: linkGroup ? labelId : undefined, className: 'muxui-sidebar__nav-label' }, label), badge && h('span', { className: 'muxui-sidebar__nav-badge' }, badge), ...trailing]);
  const named = (node: ReactElement) => (child ? node : h(SidebarRailTooltip, { label, children: node }));
  const className = cx('muxui-sidebar__nav-link', child && 'muxui-sidebar__nav-child-link', current && 'muxui-sidebar__nav-link--current');
  const chevron = h(ChevronDownIcon, { className: 'muxui-sidebar__nav-chevron', 'aria-hidden': true, focusable: 'false' });
  const nested = items?.length ? h('ul', { ref: listRef, id: href ? listId : undefined, className: 'muxui-sidebar__nav-children', hidden: href ? !open : undefined }, items.map((entry, index) => h(SidebarNavNode, { key: entry.id ?? entry.href ?? index, ...entry, child: true }))) : null;
  let content;
  if (!nested) {
    content = named(h(AriaLink, { href, className, ...{ 'aria-current': current ? 'page' : undefined } }, ...body(external && h(ExternalLinkIcon, { className: 'muxui-sidebar__nav-external', 'aria-hidden': true, focusable: 'false' }))));
  } else if (href) {
    content = h(React.Fragment, null,
      h('div', { className: 'muxui-sidebar__nav-row' },
        named(h(AriaLink, { id: child ? labelId : undefined, href, className, ...{ 'aria-current': current ? 'page' : undefined } }, ...body())),
        h(AriaButton, { ref: controlRef, className: 'muxui-sidebar__nav-btn muxui-sidebar__nav-toggle', 'aria-labelledby': labelId, 'aria-expanded': open, 'aria-controls': listId, onPress: () => setOpen(!open) }, chevron)),
      nested);
  } else {
    // Folded, the group has no room to open: activating it unfolds the sidebar and opens the group.
    const onClick = (event: React.MouseEvent) => { event.preventDefault(); if (sidebar?.collapsed) { sidebar.setCollapsed(false); setOpen(true); } else setOpen(!open); };
    const onToggle = (event: React.SyntheticEvent<HTMLDetailsElement>) => { if (event.currentTarget.open === open) return; setOpen(event.currentTarget.open); rerender(); };
    content = h('details', { ref: detailsRef, open, onToggle }, named(h('summary', { ref: controlRef, className, onClick }, ...body(chevron))), nested);
  }
  return h('li', { className: 'muxui-sidebar__nav-item' }, content);
}

const SidebarProvider = function SidebarProvider({ collapsed, defaultCollapsed = false, onCollapsedChange, shortcut, children }: SidebarProviderProps) {
  const controlled = collapsed !== undefined;
  const [internal, setInternal] = React.useState(defaultCollapsed);
  const [customRootId, setRootId] = React.useState<string | undefined>(undefined);
  // Roots and Toggles register their elements for the shortcut's target check and for rescuing focus when folding hides it.
  const [roots] = React.useState(() => new Set<HTMLElement>());
  const [toggles] = React.useState(() => new Set<HTMLElement>());
  // The MobileTrigger menu buttons, so Root can hand focus to one when layout swaps the column for the drawer.
  const [menuButtons] = React.useState(() => new Set<HTMLElement>());
  // Counts fold requests so a pending Search focus can tell that another fold has happened since.
  const requests = React.useRef(0);
  const generatedRootId = React.useId();
  const current = controlled ? collapsed : internal;
  const latest = React.useRef({ controlled, current, onCollapsedChange });
  latest.current = { controlled, current, onCollapsedChange };
  const setCollapsed = React.useCallback((next: boolean) => { const state = latest.current; if (next === state.current) return; requests.current += 1; if (!state.controlled) setInternal(next); state.onCollapsedChange?.(next); }, []);
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
};
const SidebarRoot = /*#__PURE__*/ React.forwardRef<HTMLElement, SidebarProps>(function SidebarRoot({ hideBorder = false, density = 'default', ...props }, ref) {
  const sidebar = React.useContext(SidebarContext);
  const node = React.useRef<HTMLElement>(null);
  React.useImperativeHandle(ref, () => node.current as HTMLElement);
  const { roots, setRootId } = (sidebar ?? {}) as Partial<SidebarContextValue>;
  // A caller-supplied id replaces the generated one so Toggle's aria-controls follows it.
  useIsomorphicLayoutEffect(() => { if (!setRootId || props.id === undefined) return undefined; setRootId(props.id); return () => setRootId(undefined); }, [setRootId, props.id]);
  useIsomorphicLayoutEffect(() => { const element = node.current as HTMLElement; if (!roots) return undefined; roots.add(element); return () => { roots.delete(element); }; }, [roots]);
  // Folding hides some content. If focus sat in it, move it to a control that survives: the group of a hidden
  // nested link, the folded Search button for the Search input, else the Toggle, else Root itself.
  useIsomorphicLayoutEffect(() => {
    const root = node.current;
    const active = root?.ownerDocument.activeElement;
    if (!sidebar?.collapsed || !root || !active || !root.contains(active) || !sidebarUnreachable(active)) return;
    const group = sidebarGroupHeader(active);
    const search = active.closest('.muxui-sidebar__search')?.querySelector<HTMLElement>('.muxui-sidebar__search-button');
    sidebarFocusFirst([group, search, ...sidebar.toggles, root], sidebar.roots);
  }, [sidebar?.collapsed]);
  // When layout hides Root (the drawer took over) while focus is inside it, hand focus to the menu button if that is rendered.
  const { menuButtons } = (sidebar ?? {}) as Partial<SidebarContextValue>;
  React.useEffect(() => {
    const root = node.current;
    if (!menuButtons || !root || typeof ResizeObserver === 'undefined') return undefined;
    // The browser may blur the hidden element before the observer runs, so remember that focus was inside while Root
    // rendered, starting with focus that arrived before this subscribed (autofocus). Focus a user sends elsewhere resets it.
    let inside = root.contains(document.activeElement);
    const track = (event: FocusEvent) => {
      if (event.type === 'focusin') inside = true;
      else if (root.getClientRects().length > 0 || (event.relatedTarget && !root.contains(event.relatedTarget as Node))) inside = false;
    };
    root.addEventListener('focusin', track);
    root.addEventListener('focusout', track);
    const observer = new ResizeObserver(() => {
      if (!inside || root.getClientRects().length > 0) return;
      inside = false;
      sidebarHandoff(() => [...menuButtons], roots!, (active) => root.contains(active));
    });
    observer.observe(root);
    return () => {
      observer.disconnect();
      root.removeEventListener('focusin', track);
      root.removeEventListener('focusout', track);
    };
  }, [menuButtons, roots]);
  return h('aside', { ...props, ref: node, id: props.id ?? sidebar?.rootId, 'data-foldable': dataState(sidebar), 'data-collapsed': dataState(sidebar?.collapsed), 'data-density': density === 'compact' ? 'compact' : undefined, className: cx('muxui-sidebar', hideBorder && 'muxui-sidebar--no-border', props.className) });
});
const SidebarToggle = /*#__PURE__*/ React.forwardRef<HTMLButtonElement, SidebarToggleProps>(function SidebarToggle({ onActivate, className, children, ...props }, ref) {
  const sidebar = useSidebarPart('Toggle');
  const node = React.useRef<HTMLButtonElement>(null);
  React.useImperativeHandle(ref, () => node.current as HTMLButtonElement);
  const { toggles } = sidebar;
  useIsomorphicLayoutEffect(() => { const element = node.current as HTMLButtonElement; toggles.add(element); return () => { toggles.delete(element); }; }, [toggles]);
  return h(IconButton, { 'aria-label': 'Toggle sidebar', ...props, ref: node, 'aria-expanded': !sidebar.collapsed, 'aria-controls': sidebar.rootId, className: cx('muxui-sidebar__toggle', className), onActivate: (event) => { onActivate?.(event); sidebar.toggle(); } }, children ?? h(PanelLeftIcon, { 'aria-hidden': true, focusable: 'false' }));
});
const SidebarHeader = /*#__PURE__*/ React.forwardRef<HTMLDivElement, PartProps<HTMLDivElement>>(function SidebarHeader(props, ref) { return nativePart('div', 'muxui-sidebar__header', props, ref); });
const SidebarSearch = /*#__PURE__*/ React.forwardRef<HTMLDivElement, SidebarSearchProps>(function SidebarSearch({ placeholder = 'Search', value, onChange, className, ...props }, ref) {
  const sidebar = React.useContext(SidebarContext);
  const inputRef = React.useRef<HTMLInputElement>(null);
  // Folded, the icon is a button that unfolds the sidebar and asks for the input's focus. A controlled parent may
  // apply the change later, so the request waits for Root to be expanded; it lapses if another fold happens or
  // the sidebar stays folded.
  const pending = React.useRef<{ request: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const unfold = () => {
    // The button renders only inside a Provider.
    sidebar!.setCollapsed(false);
    clearTimeout(pending.current?.timer);
    pending.current = { request: sidebar!.requests.current, timer: setTimeout(() => { pending.current = null; }, 1000) };
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
    sidebar && h(SidebarRailTooltip, { label: placeholder, children: h('button', { type: 'button', className: 'muxui-sidebar__nav-btn muxui-sidebar__search-button', 'aria-label': placeholder, onClick: unfold }) }),
    h(SearchIcon, { className: 'muxui-sidebar__search-icon', 'aria-hidden': true, focusable: 'false' }),
    h('input', { ref: inputRef, className: 'muxui-sidebar__search-input', placeholder, value, onChange, 'aria-label': placeholder })));
});
const SidebarDivider = /*#__PURE__*/ React.forwardRef<HTMLHRElement, PartProps<HTMLHRElement>>(function SidebarDivider(props, ref) { return nativePart('hr', 'muxui-sidebar__divider', props, ref); });
const SidebarNavList = /*#__PURE__*/ React.forwardRef<HTMLUListElement, PartProps<HTMLUListElement>>(function SidebarNavList(props, ref) { return nativePart('ul', 'muxui-sidebar__nav-list', props, ref); });
const SidebarSection = /*#__PURE__*/ React.forwardRef<HTMLLIElement, SidebarSectionProps>(function SidebarSection({ label, className, children, ...props }, ref) { const labelId = React.useId(); return h('li', { ...props, ref, className: cx('muxui-sidebar__section', className) }, h('span', { id: labelId, className: 'muxui-sidebar__section-label' }, label), h('ul', { className: 'muxui-sidebar__section-items', 'aria-labelledby': labelId }, children)); });
// The item hands each owned prop to the node, which also draws the nested entries, and the attributes it does not know go along.
const SidebarNavItem = function SidebarNavItem({ children, href, icon, badge, current = false, external = false, items, expanded, defaultExpanded = false, onExpandedChange, ...props }: SidebarNavItemProps) { return h(SidebarNavNode, { ...props, href, icon, badge, current, external, items, expanded, defaultExpanded, onExpandedChange, label: children }); };
const SidebarNavButton = /*#__PURE__*/ React.forwardRef<HTMLAnchorElement, SidebarNavButtonProps>(function SidebarNavButton({ href, icon: Icon, label, current = false, className, ...props }, ref) { return h('a', { ...props, ref, href, 'aria-label': label, className: cx('muxui-sidebar__nav-btn', current && 'muxui-sidebar__nav-btn--current', className) }, Icon && h(Icon, { className: 'muxui-sidebar__nav-btn-icon', ...{ 'aria-hidden': true } }), props.children); });
const SidebarAccountCard = /*#__PURE__*/ React.forwardRef<HTMLDivElement, SidebarAccountCardProps>(function SidebarAccountCard({ name, email, avatarSrc, avatarAlt, status, className, children, ...props }, ref) {
  const sidebar = React.useContext(SidebarContext);
  const card = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(ref, () => card.current as HTMLDivElement);
  const [open, setOpen] = React.useState(false);
  // A folded rail hides the options button, so a menu left open has nothing to anchor to or return focus to:
  // close it and hand focus to a Toggle, else Root.
  const collapsed = Boolean(sidebar?.collapsed);
  useIsomorphicLayoutEffect(() => {
    if (!collapsed || !open) return;
    setOpen(false);
    sidebarHandoff(() => [...sidebar!.toggles, ...sidebar!.roots], sidebar!.roots, (active) => active.closest('[role="menu"]'));
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
  const content = h('div', { ...props, ref: card, className: cx('muxui-sidebar__account-card', className) }, h('div', { className: 'muxui-sidebar__account-avatar-wrap' }, avatarSrc ? h('img', { src: avatarSrc, alt: avatarAlt == null ? name : avatarAlt, className: 'muxui-sidebar__account-avatar' }) : h('div', { className: 'muxui-sidebar__account-avatar muxui-sidebar__account-avatar--placeholder', 'aria-hidden': true }, name?.charAt(0)), status && h('span', { className: `muxui-sidebar__account-status muxui-sidebar__account-status--${status}`, 'aria-label': status })), h('div', { className: 'muxui-sidebar__account-info' }, h('div', { className: 'muxui-sidebar__account-name' }, name), h('div', { className: 'muxui-sidebar__account-email' }, email)), h(IconButton, { hidden: !hasMenu, className: 'muxui-sidebar__account-trigger', 'aria-label': 'Account options' }, h(ChevronsUpDownIcon, { className: 'muxui-sidebar__account-trigger-icon', 'aria-hidden': true, focusable: 'false' })), children);
  return h(SidebarAccountContext.Provider, { value: account }, h(AriaMenuTrigger, { isOpen: open && hasMenu && !collapsed, onOpenChange: setOpen, children: content }));
});
const SidebarAccountMenu = /*#__PURE__*/ React.forwardRef<HTMLDivElement, SidebarAccountMenuProps>(function SidebarAccountMenu({ items, children, onAction, className }, ref) {
  const account = useSidebarAccount();
  useIsomorphicLayoutEffect(() => account.register(), [account.register]);
  // The popup opens from the card, not the small button, so it lines up with the card's edge.
  return h(Menu.Popup, { anchorRef: account.anchor, placement: 'top-start' }, h(Menu.List, { items, onAction, ref, className: cx('muxui-sidebar__account-menu', className) }, children));
});
const SidebarMobileTrigger = function SidebarMobileTrigger({ children, logo }: SidebarMobileTriggerProps) {
  const sidebar = React.useContext(SidebarContext);
  const [open, setOpen] = React.useState(false);
  const latest = React.useRef({ open, sidebar });
  latest.current = { open, sidebar };
  const header = React.useRef<HTMLElement>(null);
  const button = React.useRef<HTMLButtonElement>(null);
  // The drawer's focused link and dialog when layout took it away, for the column link that should receive focus next.
  const handoff = React.useRef<{ dialog: Element | null; href: string | null } | null>(null);
  const menuButtons = sidebar?.menuButtons;
  useIsomorphicLayoutEffect(() => { const element = button.current as HTMLButtonElement; if (!menuButtons) return undefined; menuButtons.add(element); return () => { menuButtons.delete(element); }; }, [menuButtons]);
  // When layout hides this header (the column took over), an open drawer would be stranded: close it and hand focus to the column.
  React.useEffect(() => {
    if (!menuButtons || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      if (!latest.current.open || header.current!.getClientRects().length > 0) return;
      const dialog = document.activeElement?.closest('.muxui-sidebar__mobile-dialog') ?? null;
      handoff.current = { dialog, href: dialog ? document.activeElement!.closest('a[href]')?.getAttribute('href') ?? null : null };
      setOpen(false);
    });
    observer.observe(header.current!);
    return () => observer.disconnect();
  }, [menuButtons]);
  const exit = () => {
    const wanted = handoff.current;
    handoff.current = null;
    const { sidebar: current } = latest.current;
    if (wanted && current) sidebarHandoff(() => sidebarColumnCandidates(current, wanted.href), current.roots, (active) => wanted.dialog?.contains(active));
  };
  // The drawer is always full size, so its navigation ignores the folded state of the desktop sidebar.
  // React Aria's DialogTrigger types its children as a prop, and takes the trigger and the overlay as two children.
  return h(AriaDialogTrigger, { isOpen: open, onOpenChange: setOpen } as AriaDialogTriggerProps,
    h('header', { ref: header, className: 'muxui-sidebar__mobile-header' }, logo && h('div', { className: 'muxui-sidebar__mobile-logo' }, logo), h(IconButton, { ref: button, className: 'muxui-sidebar__mobile-menu-btn', 'aria-label': 'Open navigation' }, h(MenuIcon, { 'aria-hidden': true, focusable: 'false' }))),
    h(AriaModalOverlay, { className: 'muxui-sidebar__mobile-overlay' }, h(AriaModal, { className: 'muxui-sidebar__mobile-drawer' }, h(AriaDialog, { 'aria-label': 'Navigation', className: 'muxui-sidebar__mobile-dialog', children: ({ close }) => h(SidebarContext.Provider, { value: null }, h(SidebarDrawerExit, { exit }), h('div', { className: 'muxui-sidebar__mobile-close-row' }, h(IconButton, { size: 'sm', className: 'muxui-sidebar__mobile-close-btn', onActivate: close, 'aria-label': 'Close navigation' }, h(XIcon, { 'aria-hidden': true, focusable: 'false' }))), children) }))));
};
const SidebarFeatureCard = /*#__PURE__*/ React.forwardRef<HTMLDivElement, SidebarFeatureCardProps>(function SidebarFeatureCard({ title, description, dismissLabel, onDismiss, ...props }, ref) { return nativePart('div', 'muxui-sidebar__feature-card', props, ref, h(React.Fragment, null, title && h('div', { className: 'muxui-sidebar__feature-card-title' }, title), description && h('div', { className: 'muxui-sidebar__feature-card-description' }, description), props.children, onDismiss && h('button', { type: 'button', className: 'muxui-sidebar__feature-card-dismiss', onClick: onDismiss }, dismissLabel == null ? 'Dismiss' : dismissLabel))); });

export const Sidebar: {
  Provider: ComponentType<SidebarProviderProps>;
  Root: ForwardRefExoticComponent<SidebarProps & RefAttributes<HTMLElement>>;
  Toggle: ForwardRefExoticComponent<SidebarToggleProps & RefAttributes<HTMLButtonElement>>;
  Header: ForwardRefExoticComponent<PartProps<HTMLDivElement> & RefAttributes<HTMLDivElement>>;
  Search: ForwardRefExoticComponent<SidebarSearchProps & RefAttributes<HTMLDivElement>>;
  Divider: ForwardRefExoticComponent<PartProps<HTMLHRElement> & RefAttributes<HTMLHRElement>>;
  NavList: ForwardRefExoticComponent<PartProps<HTMLUListElement> & RefAttributes<HTMLUListElement>>;
  Section: ForwardRefExoticComponent<SidebarSectionProps & RefAttributes<HTMLLIElement>>;
  NavItem: ComponentType<SidebarNavItemProps>;
  NavButton: ForwardRefExoticComponent<SidebarNavButtonProps & RefAttributes<HTMLAnchorElement>>;
  /** Shows the account. While an `AccountMenu` is mounted inside it, its Account options button opens that menu; without one the card has no button. */
  AccountCard: ForwardRefExoticComponent<SidebarAccountCardProps & RefAttributes<HTMLDivElement>>;
  /** The menu the card's Account options button opens: pass `Menu.Item`, `Menu.Section`, and `Menu.Separator` children, or `items`, and read the chosen item from `onAction`. Only valid inside `AccountCard`, one per card. */
  AccountMenu: ForwardRefExoticComponent<SidebarAccountMenuProps & RefAttributes<HTMLDivElement>>;
  MobileTrigger: ComponentType<SidebarMobileTriggerProps>;
  FeatureCard: ForwardRefExoticComponent<SidebarFeatureCardProps & RefAttributes<HTMLDivElement>>;
} = /*#__PURE__*/ Object.freeze({
  Provider: SidebarProvider,
  Root: SidebarRoot,
  Toggle: SidebarToggle,
  Header: SidebarHeader,
  Search: SidebarSearch,
  Divider: SidebarDivider,
  NavList: SidebarNavList,
  Section: SidebarSection,
  NavItem: SidebarNavItem,
  NavButton: SidebarNavButton,
  AccountCard: SidebarAccountCard,
  AccountMenu: SidebarAccountMenu,
  MobileTrigger: SidebarMobileTrigger,
  FeatureCard: SidebarFeatureCard,
});
