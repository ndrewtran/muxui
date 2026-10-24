import React from 'react';
import {
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
} from 'react-aria-components';
import XIcon from 'lucide-react/dist/esm/icons/x.mjs';
import MenuIcon from 'lucide-react/dist/esm/icons/menu.mjs';
import { IconButton } from './icon-button.ts';
import { h, cx, nativePart } from './part-utils.ts';
import { sidebarUnreachable, sidebarHandoff, SidebarDrawerExit } from './navigation-drawer.mjs';

/* Header navigation */
export const HeaderNav = {
  Root: React.forwardRef(function HeaderNavRoot(props, ref) { return nativePart('header', 'muxui-header-nav', props, ref); }),
  Logo: React.forwardRef(function HeaderNavLogo({ href, children, className, ...props }, ref) { return nativePart('div', 'muxui-header-nav__logo', { ...props, className }, ref, href ? h('a', { href, className: 'muxui-header-nav__logo-link' }, children) : children); }),
  NavButton: React.forwardRef(function HeaderNavButton({ href, current = false, className, ...props }, ref) { return h('a', { ...props, ref, href, className: cx('muxui-header-nav__nav-btn', current && 'muxui-header-nav__nav-btn--current', className), 'aria-current': current ? 'page' : undefined }); }),
  Actions: React.forwardRef(function HeaderNavActions(props, ref) { return nativePart('div', 'muxui-header-nav__actions', props, ref); }),
  Secondary: React.forwardRef(function HeaderNavSecondary(props, ref) { return nativePart('nav', 'muxui-header-nav__secondary', props, ref); }),
  MobileTrigger: function HeaderNavMobileTrigger({ children }) {
    const [open, setOpen] = React.useState(false);
    const latest = React.useRef(open);
    latest.current = open;
    const button = React.useRef(null);
    // The drawer's focused link and dialog when layout took it away, for the header link that should receive focus next.
    const handoff = React.useRef(null);
    // When layout hides the trigger (the header's own links took over), an open drawer would be stranded and Escape
    // would leave focus on the body: close it and hand focus to the header.
    React.useEffect(() => {
      const trigger = button.current;
      if (!trigger || typeof ResizeObserver === 'undefined') return undefined;
      const observer = new ResizeObserver(() => {
        if (!latest.current || trigger.getClientRects().length > 0) return;
        const dialog = document.activeElement?.closest('.muxui-header-nav__mobile-dialog') ?? null;
        handoff.current = { dialog, href: dialog ? document.activeElement.closest('a[href]')?.getAttribute('href') ?? null : null, root: trigger.closest('.muxui-header-nav') };
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
      // Hidden copies drop out first, so the matching link is the visible one even when a hidden link shares its destination.
      const controls = () => [...wanted.root.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')].filter((node) => !node.disabled && node.getAttribute('tabindex') !== '-1' && !sidebarUnreachable(node));
      sidebarHandoff(() => {
        const all = controls();
        return [all.find((node) => wanted.href !== null && node.getAttribute('href') === wanted.href), ...all, wanted.root];
      }, new Set([wanted.root]), (active) => wanted.dialog?.contains(active));
    };
    return h(AriaDialogTrigger, { isOpen: open, onOpenChange: setOpen }, h(IconButton, { ref: button, className: 'muxui-header-nav__mobile-trigger', 'aria-label': 'Open navigation' }, h(MenuIcon, { 'aria-hidden': true, focusable: 'false' })), h(AriaModalOverlay, { className: 'muxui-header-nav__mobile-overlay' }, h(AriaModal, { className: 'muxui-header-nav__mobile-drawer' }, h(AriaDialog, { 'aria-label': 'Navigation', className: 'muxui-header-nav__mobile-dialog' }, ({ close }) => h(React.Fragment, null, h(SidebarDrawerExit, { exit }), h('div', { className: 'muxui-header-nav__mobile-close-row' }, h(IconButton, { size: 'sm', onActivate: close, className: 'muxui-header-nav__mobile-close-btn', 'aria-label': 'Close navigation' }, h(XIcon, { 'aria-hidden': true, focusable: 'false' }))), children)))));
  },
};
