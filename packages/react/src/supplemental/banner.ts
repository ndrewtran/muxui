import React from 'react';
import type { CSSProperties, ForwardRefExoticComponent, HTMLAttributes, ReactNode, RefAttributes } from 'react';
import XIcon from 'lucide-react/dist/esm/icons/x.mjs';
import { Button } from '../button.ts';
import { Link } from '../components.ts';
import { IconButton } from './icon-button.ts';
import { cx, h } from './part-utils.ts';

/** The named colours of a Banner. */
export type BannerTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
/** How strongly a Banner is coloured: a tint of its tone over the surface, or the tone's solid fill. */
export type BannerEmphasis = 'subtle' | 'solid';
/** Where a Banner's icon, text and actions sit. */
export type BannerAlign = 'start' | 'center';
/** One action Button on a Banner. The first is filled, the second outlined. */
export type BannerAction = { id: string; label: string; onAction: () => void };
/** The Link on a Banner, after its actions. */
export type BannerLink = { label: string; href: string };

/**
 * The props Mux UI defines for Banner; the catalog's web.react API is derived from this type (Decision 0031). The message
 * is the children. It is a type literal, not an interface, so the public props type stays assignable to Record<string, unknown>.
 */
type BannerOwnProps = {
  /** A short lead-in shown before the message in the label weight. It names the region when no label is given. */
  title?: ReactNode;
  /** A decorative icon before the text, hidden from assistive technology. */
  icon?: ReactNode;
  /** The named colour. A valid customColor takes its place. */
  tone?: BannerTone;
  /** A tint of the colour over the surface, or the colour as a solid fill. */
  emphasis?: BannerEmphasis;
  /**
   * An opaque colour, as #rgb, #rrggbb or rgb(), in place of the tone. Text and controls on it are white or black, whichever
   * contrasts more. A colour that cannot be read or is not opaque falls back to the tone.
   */
  customColor?: string;
  /** Where the icon, text and actions sit: at the start, or centred as a group. */
  align?: BannerAlign;
  /** Up to two action Buttons. */
  actions?: readonly BannerAction[];
  /** A Link after the actions. */
  link?: BannerLink;
  /** Shows the dismiss button. */
  dismissible?: boolean;
  /** Whether the Banner is dismissed, when the caller controls it. A dismissed Banner renders nothing. */
  dismissed?: boolean;
  /** Whether the Banner starts dismissed, when Banner controls it. */
  defaultDismissed?: boolean;
  /** Reports the dismiss button being pressed. Banner stores nothing. */
  onDismiss?: () => void;
  /** The dismiss button's accessible name. */
  dismissLabel?: string;
  /** The region's accessible name. Without it the title names the region, and without a title it is Notice. */
  label?: string;
  /** Announces the Banner as an alert instead of a named region, for a notice that needs attention at once. */
  alert?: boolean;
};

export type BannerProps = BannerOwnProps & Omit<HTMLAttributes<HTMLElement>, keyof BannerOwnProps | 'role' | 'dangerouslySetInnerHTML'>;

// Keyed by the types, so a value added to one must be added here too.
const TONES: Record<BannerTone, true> = { neutral: true, brand: true, success: true, warning: true, danger: true };
const EMPHASES: Record<BannerEmphasis, true> = { subtle: true, solid: true };
const ALIGNS: Record<BannerAlign, true> = { start: true, center: true };

function oneOf<T extends string>(name: string, value: unknown, values: Record<T, true>): T {
  if (typeof value !== 'string' || !Object.hasOwn(values, value)) throw new TypeError(`Banner ${name} must be one of: ${Object.keys(values).join(', ')}.`);
  return value as T;
}

type Rgb = readonly [number, number, number];

/** An opaque #rgb, #rrggbb, rgb() or rgba() colour as 0 to 255 channels; anything else, or any transparency, is null. */
function parseBannerColor(value: string): Rgb | null {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/u.exec(text)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
    return [0, 2, 4].map((at) => Number.parseInt(full.slice(at, at + 2), 16)) as unknown as Rgb;
  }
  const rgb = /^rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/u.exec(text);
  if (!rgb) return null;
  const channels = rgb.slice(1, 4).map(Number);
  const alpha = rgb[4] === undefined ? 1 : rgb[4].endsWith('%') ? Number.parseFloat(rgb[4]) / 100 : Number(rgb[4]);
  return channels.every((channel) => channel <= 255) && alpha === 1 ? channels as unknown as Rgb : null;
}

/** WCAG 2 relative luminance. */
function luminance(rgb: Rgb) {
  const [r, g, b] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as unknown as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The text colour on a custom fill: white or black, whichever has the higher WCAG 2 contrast ratio. One of them always
 * reaches at least 4.58:1 on an opaque fill, so a custom colour never needs a third colour.
 */
function bannerForeground(rgb: Rgb): '#ffffff' | '#000000' {
  const fill = luminance(rgb);
  return 1.05 / (fill + 0.05) >= (fill + 0.05) / 0.05 ? '#ffffff' : '#000000';
}

/**
 * A page-level notice: a message with an optional title and icon, up to two actions, a link and a dismiss button. It is a
 * named region, or an alert when asked. Its controls draw only the Banner's own two colours, so they keep the message's
 * contrast at rest, hover and press.
 */
export const Banner: ForwardRefExoticComponent<BannerProps & RefAttributes<HTMLElement>> = /*#__PURE__*/ React.forwardRef<HTMLElement, BannerProps>(function Banner({
  title, icon, tone = 'neutral', emphasis = 'subtle', customColor, align = 'start', actions = [], link,
  dismissible = false, dismissed, defaultDismissed = false, onDismiss, dismissLabel = 'Dismiss notice', label, alert = false,
  // Untyped callers' HTML and role never reach the section.
  className, style, children, dangerouslySetInnerHTML: _html, role: _role, ...props
}: BannerProps & { dangerouslySetInnerHTML?: unknown; role?: unknown }, ref) {
  const named = oneOf('tone', tone, TONES);
  const shown = oneOf('emphasis', emphasis, EMPHASES);
  const placed = oneOf('align', align, ALIGNS);
  if (actions.length > 2) throw new TypeError('Banner takes at most two actions.');
  const [localDismissed, setLocalDismissed] = React.useState(defaultDismissed);
  const titleId = `${React.useId()}-title`;
  // Controlled while dismissed is set. A conditional, not ??: extraction reads a fallback on an owned prop as an executed default.
  const isDismissed = dismissed == null ? localDismissed : dismissed;
  if (isDismissed) return null;
  const custom = customColor === undefined ? null : parseBannerColor(customColor);
  const colors = custom ? {
    '--muxui-banner-custom': `rgb(${custom.join(' ')})`,
    '--muxui-banner-custom-foreground': bannerForeground(custom),
  } as CSSProperties : undefined;
  const dismiss = () => {
    if (dismissed === undefined) setLocalDismissed(true);
    onDismiss?.();
  };
  const name = label ? { 'aria-label': label } : title ? { 'aria-labelledby': titleId } : { 'aria-label': 'Notice' };
  return h('section', {
    ...props,
    ...name,
    ref,
    role: alert ? 'alert' : 'region',
    className: cx('muxui-banner', className),
    style: colors ? { ...style, ...colors } : style,
    'data-muxui-tone': custom ? 'custom' : named,
    'data-muxui-emphasis': shown,
    'data-muxui-align': placed,
  },
  h('div', { className: 'muxui-banner__body' },
    icon ? h('span', { className: 'muxui-banner__icon', 'aria-hidden': true }, icon) : null,
    h('div', { className: 'muxui-banner__text' },
      title ? h('span', { id: titleId, className: 'muxui-banner__title' }, title) : null,
      title && children != null ? ' ' : null,
      children != null ? h('span', { className: 'muxui-banner__message' }, children) : null),
    actions.length > 0 || link ? h('div', { className: 'muxui-banner__actions' },
      // The first action is filled and the second outlined; the stylesheet tells them apart by order.
      actions.map((action) => h(Button, { key: action.id, size: 'sm', variant: 'neutral', className: 'muxui-banner__action', onActivate: () => action.onAction() }, action.label)),
      link ? h(Link, { className: 'muxui-banner__link', href: link.href }, link.label) : null) : null),
  dismissible ? h(IconButton, { className: 'muxui-banner__dismiss', size: 'sm', variant: 'ghost', 'aria-label': dismissLabel, onActivate: dismiss },
    h(XIcon, { className: 'muxui-banner__dismiss-icon', 'aria-hidden': 'true', focusable: 'false', size: 16 })) : null);
});
Banner.displayName = 'Banner';
