import React from 'react';
import type { AnchorHTMLAttributes, ComponentType, ForwardRefExoticComponent, HTMLAttributes, ReactNode, RefAttributes } from 'react';
import { Dialog as AriaDialog, DialogTrigger as AriaDialogTrigger } from 'react-aria-components';
import { AriaModal, AriaModalOverlay } from '../substrate.ts';
import type { DialogTriggerProps as AriaDialogTriggerProps } from 'react-aria-components';
import XIcon from 'lucide-react/dist/esm/icons/x.mjs';
import MenuIcon from 'lucide-react/dist/esm/icons/menu.mjs';
import { IconButton } from './icon-button.ts';
import { h, cx, nativePart } from './part-utils.ts';
import type { PartProps } from './part-utils.ts';
import { sidebarUnreachable, sidebarHandoff, SidebarDrawerExit } from './navigation-drawer.ts';

/**
 * The props Mux UI defines for HeaderNav.Root, the compound's root, which defines none: it passes the
 * header element's native attributes on. The catalog's web.react API is derived from this type (Decision 0031).
 */
type HeaderNavOwnProps = {};

/** The props Mux UI defines for HeaderNav.Logo; its API is the logo entry in the catalog's partApis. */
type HeaderNavLogoOwnProps = {
  /** Wraps the logo's content in a link to this address. */
  href?: string;
};

/** The props Mux UI defines for HeaderNav.NavButton; its API is the nav-button entry in the catalog's partApis. */
type HeaderNavNavButtonOwnProps = {
  /** Marks the link as the current page: it is styled as such and carries aria-current. */
  current?: boolean;
};

export type HeaderNavRootProps = HTMLAttributes<HTMLElement> & HeaderNavOwnProps;
export type HeaderNavNavButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & HeaderNavNavButtonOwnProps;
type HeaderNavLogoProps = PartProps<HTMLDivElement> & HeaderNavLogoOwnProps;

/* Header navigation */
const HeaderNavRoot = /*#__PURE__*/ React.forwardRef<HTMLElement, HeaderNavRootProps>(
  // Root defines no props; the object pattern is what the catalog's extraction reads.
  function HeaderNavRoot({ ...props }, ref) { return nativePart('header', 'muxui-header-nav', props, ref); },
);
const HeaderNavLogo = /*#__PURE__*/ React.forwardRef<HTMLDivElement, HeaderNavLogoProps>(function HeaderNavLogo({ href, children, className, ...props }, ref) { return nativePart('div', 'muxui-header-nav__logo', { ...props, className }, ref, href ? h('a', { href, className: 'muxui-header-nav__logo-link' }, children) : children); });
const HeaderNavButton = /*#__PURE__*/ React.forwardRef<HTMLAnchorElement, HeaderNavNavButtonProps>(function HeaderNavButton({ href, current = false, className, ...props }, ref) { return h('a', { ...props, ref, href, className: cx('muxui-header-nav__nav-button', current && 'muxui-header-nav__nav-button--current', className), 'aria-current': current ? 'page' : undefined }); });
const HeaderNavActions = /*#__PURE__*/ React.forwardRef<HTMLDivElement, PartProps<HTMLDivElement>>(function HeaderNavActions(props, ref) { return nativePart('div', 'muxui-header-nav__actions', props, ref); });
const HeaderNavSecondary = /*#__PURE__*/ React.forwardRef<HTMLElement, PartProps<HTMLElement>>(function HeaderNavSecondary(props, ref) { return nativePart('nav', 'muxui-header-nav__secondary', props, ref); });

/** What the drawer remembers about the focus it held when layout took it away. */
type DrawerHandoff = { dialog: Element | null; href: string | null; root: HTMLElement | null };

function HeaderNavMobileTrigger({ children }: { children?: ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const latest = React.useRef(open);
  latest.current = open;
  const button = React.useRef<HTMLButtonElement>(null);
  // The drawer's focused link and dialog when layout took it away, for the header link that should receive focus next.
  const handoff = React.useRef<DrawerHandoff | null>(null);
  // When layout hides the trigger (the header's own links took over), an open drawer would be stranded and Escape
  // would leave focus on the body: close it and hand focus to the header.
  React.useEffect(() => {
    const trigger = button.current;
    if (!trigger || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      if (!latest.current || trigger.getClientRects().length > 0) return;
      const dialog = document.activeElement?.closest('.muxui-header-nav__mobile-dialog') ?? null;
      handoff.current = { dialog, href: dialog ? document.activeElement?.closest('a[href]')?.getAttribute('href') ?? null : null, root: trigger.closest<HTMLElement>('.muxui-header-nav') };
      setOpen(false);
    });
    observer.observe(trigger);
    return () => observer.disconnect();
  }, []);
  // Runs after the drawer has left: the header link matching the drawer's focused link, then any visible control in the
  // header, then the header itself, which Sidebar's handoff makes focusable by script when nothing else takes focus.
  const exit = () => {
    const wanted = handoff.current;
    handoff.current = null;
    if (!wanted?.root) return;
    const { dialog, href, root } = wanted;
    // Hidden copies drop out first, so the matching link is the visible one even when a hidden link shares its destination.
    const controls = () => [...root.querySelectorAll<HTMLElement & { disabled?: boolean }>('a[href], button, input, select, textarea, [tabindex]')].filter((node) => !node.disabled && node.getAttribute('tabindex') !== '-1' && !sidebarUnreachable(node));
    sidebarHandoff(() => {
      const all = controls();
      return [all.find((node) => href !== null && node.getAttribute('href') === href), ...all, root];
    }, new Set([root]), (active) => dialog?.contains(active));
  };
  // React Aria's DialogTrigger types its children as a prop, and takes the trigger and the overlay as two children.
  return h(AriaDialogTrigger, { isOpen: open, onOpenChange: setOpen } as AriaDialogTriggerProps, h(IconButton, { ref: button, className: 'muxui-header-nav__mobile-trigger', 'aria-label': 'Open navigation' }, h(MenuIcon, { 'aria-hidden': true, focusable: 'false' })), h(AriaModalOverlay, { className: 'muxui-header-nav__mobile-overlay' }, h(AriaModal, { className: 'muxui-header-nav__mobile-drawer' }, h(AriaDialog, { 'aria-label': 'Navigation', className: 'muxui-header-nav__mobile-dialog', children: ({ close }) => h(React.Fragment, null, h(SidebarDrawerExit, { exit }), h('div', { className: 'muxui-header-nav__mobile-close-row' }, h(IconButton, { size: 'sm', onActivate: close, className: 'muxui-header-nav__mobile-close-btn', 'aria-label': 'Close navigation' }, h(XIcon, { 'aria-hidden': true, focusable: 'false' }))), children) }))));
}

export const HeaderNav: {
  Root: ForwardRefExoticComponent<HeaderNavRootProps & RefAttributes<HTMLElement>>;
  Logo: ForwardRefExoticComponent<HeaderNavLogoProps & RefAttributes<HTMLDivElement>>;
  NavButton: ForwardRefExoticComponent<HeaderNavNavButtonProps & RefAttributes<HTMLAnchorElement>>;
  Actions: ForwardRefExoticComponent<PartProps<HTMLDivElement> & RefAttributes<HTMLDivElement>>;
  Secondary: ForwardRefExoticComponent<PartProps<HTMLElement> & RefAttributes<HTMLElement>>;
  MobileTrigger: ComponentType<{ children?: ReactNode }>;
} = /*#__PURE__*/ Object.freeze({
  Root: HeaderNavRoot,
  Logo: HeaderNavLogo,
  NavButton: HeaderNavButton,
  Actions: HeaderNavActions,
  Secondary: HeaderNavSecondary,
  MobileTrigger: HeaderNavMobileTrigger,
});
