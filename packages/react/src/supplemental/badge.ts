import React from 'react';
import type { ForwardRefExoticComponent, HTMLAttributes, ReactNode, RefAttributes } from 'react';
import { cx, h } from './part-utils.ts';

/** The tones of a Badge, the same semantic tones as TagGroup's. */
export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'error';
/** How strongly a Badge is filled: a soft tint, or a solid fill for a mark that must stand out, such as a count. */
export type BadgeVariant = 'soft' | 'solid';

/**
 * The props Mux UI defines for Badge; the catalog's web.react API is derived from this type (Decision 0031).
 * A Badge is passive text: it has no role, takes no focus and does nothing when pressed.
 */
type BadgeOwnProps = {
  /** The badge's colour. Its text says what it means; the tone only supports it. */
  tone?: BadgeTone;
  /** A soft tint, or a solid fill. */
  variant?: BadgeVariant;
  /** A decorative icon before the text, hidden from assistive technology. */
  icon?: ReactNode;
  /** What assistive technology reads in place of the visible text, when the text is not enough on its own, such as 12 unread for 12. */
  label?: string;
};

export type BadgeProps = BadgeOwnProps & Omit<HTMLAttributes<HTMLSpanElement>, keyof BadgeOwnProps | 'role' | 'tabIndex' | 'dangerouslySetInnerHTML'>;

// Keyed by the types, so a value added to one must be added here too.
const TONES: Record<BadgeTone, true> = { neutral: true, brand: true, success: true, warning: true, error: true };
const VARIANTS: Record<BadgeVariant, true> = { soft: true, solid: true };

/** A small passive label for a role, a flag or a count. */
export const Badge: ForwardRefExoticComponent<BadgeProps & RefAttributes<HTMLSpanElement>> = /*#__PURE__*/ React.forwardRef<HTMLSpanElement, BadgeProps>(function Badge({
  tone = 'neutral', variant = 'soft', icon, label, className, children,
  // Not Badge props: an untyped caller's role, focus stop and HTML never reach the badge.
  role: _role, tabIndex: _tabIndex, dangerouslySetInnerHTML: _html, ...props
}: BadgeProps & { role?: unknown; tabIndex?: unknown; dangerouslySetInnerHTML?: unknown }, ref) {
  if (typeof tone !== 'string' || !Object.hasOwn(TONES, tone)) throw new TypeError(`Badge tone must be one of: ${Object.keys(TONES).join(', ')}.`);
  if (typeof variant !== 'string' || !Object.hasOwn(VARIANTS, variant)) throw new TypeError(`Badge variant must be one of: ${Object.keys(VARIANTS).join(', ')}.`);
  // With a label, the visible text is hidden from assistive technology and the label is read in its place.
  const named = typeof label === 'string' && label.length > 0;
  return h('span', { ...props, ref, className: cx('muxui-badge', className), 'data-muxui-tone': tone, 'data-muxui-variant': variant },
    icon != null && icon !== false && h('span', { className: 'muxui-badge__icon', 'aria-hidden': true }, icon),
    children != null && children !== false && h('span', { className: 'muxui-badge__text', 'aria-hidden': named || undefined }, children),
    named && h('span', { className: 'muxui-badge__label' }, label));
});
