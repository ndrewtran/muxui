import React from 'react';
import type { ForwardRefExoticComponent, HTMLAttributes, ReactNode, RefAttributes } from 'react';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import ArrowUpRight from 'lucide-react/dist/esm/icons/arrow-up-right.mjs';
import { useCandidateMotion } from './candidate-motion.mjs';

export type MessageAction = { id: string; label: string; icon?: ReactNode; onAction: () => void; disabled?: boolean; pressed?: boolean };
export type MessageSource = { id: string; label: string; href: string; description?: string };
export type MessageFollowUp = { id: string; label: string };

/**
 * The props Mux UI defines for Message; the catalog's web.react API is derived from
 * this type (Decision 0031). The content is the children.
 * It is a type literal, not an interface, so the public props type stays assignable to
 * Record<string, unknown>, as it was before the move.
 */
type MessageOwnProps = {
  /** Who the turn is from. A user message shows its content in a filled bubble. */
  sender?: 'user' | 'assistant' | 'system';
  /** Content shown above the message, such as its author's name. */
  author?: ReactNode;
  /** Compact buttons for the message. Pressed makes one a toggle. */
  actions?: readonly MessageAction[];
  /** What the reply relied on, listed behind a count button. Only http, https, and relative links stay links. */
  sources?: readonly MessageSource[];
  /** Whether the source list is open, when the caller controls it. */
  sourcesExpanded?: boolean;
  /** Whether the source list starts open, when Message controls it. */
  defaultSourcesExpanded?: boolean;
  /** Reports the source list opening or closing. */
  onSourcesExpandedChange?: (expanded: boolean) => void;
  /** Suggested next messages. They render only with onFollowUp. */
  followUps?: readonly MessageFollowUp[];
  /** Reports the chosen follow-up. Message sends nothing. */
  onFollowUp?: (item: MessageFollowUp) => void;
  /** Adds the streaming status text while the caller updates the content. */
  streaming?: boolean;
  /** The status text announced while streaming. */
  streamingLabel?: string;
};

export type MessageProps = MessageOwnProps & Omit<HTMLAttributes<HTMLElement>, keyof MessageOwnProps | 'dangerouslySetInnerHTML'>;

const e = React.createElement;
function safeHref(href: unknown) {
  if (typeof href !== 'string' || !href.trim() || /[\u0000-\u001f\u007f]/u.test(href)) return undefined;
  try { const url = new URL(href, 'https://muxui.invalid/'); return ['https:', 'http:'].includes(url.protocol) ? href : undefined; } catch { return undefined; }
}

/** Caller-updated content; Markdown is composed through its separately imported subpath. */
export const Message: ForwardRefExoticComponent<MessageProps & RefAttributes<HTMLElement>> = React.forwardRef<HTMLElement, MessageProps>(function Message({
  sender = 'assistant', author, children, actions = [],
  sources = [], sourcesExpanded, defaultSourcesExpanded = false, onSourcesExpandedChange,
  followUps = [], onFollowUp, streaming = false, streamingLabel = 'Response in progress.',
  // Untyped callers' HTML never reaches the article.
  className, dangerouslySetInnerHTML: _html, ...props
}: MessageProps & { dangerouslySetInnerHTML?: unknown }, ref) {
  const [localExpanded, setLocalExpanded] = React.useState(defaultSourcesExpanded);
  // Controlled while sourcesExpanded is set. A conditional, not ??: extraction reads a fallback
  // on an owned prop as an executed default, and the local state is no default.
  const expanded = sourcesExpanded == null ? localExpanded : sourcesExpanded;
  const id = React.useId();
  const chevron = React.useRef<SVGSVGElement | null>(null);
  const sourcePanel = React.useRef<HTMLUListElement | null>(null);
  useCandidateMotion(chevron, expanded ? 180 : 0, { angle: expanded ? 180 : 0 });
  useCandidateMotion(sourcePanel, expanded, { active: expanded, reveal: true });
  const toggle = () => { const next = !expanded; if (sourcesExpanded === undefined) setLocalExpanded(next); onSourcesExpandedChange?.(next); };
  return e('article', { ...props, ref, className: ['muxui-message', className].filter(Boolean).join(' '), 'data-muxui-sender': sender, 'data-muxui-streaming': streaming ? true : undefined },
    author && e('header', { className: 'muxui-message__author' }, author),
    e('div', { className: 'muxui-message__content' }, children),
    (actions.length > 0 || sources.length > 0) && e('div', { className: 'muxui-message__toolbar' },
      actions.length > 0 && e('div', { className: 'muxui-message__actions', role: 'group', 'aria-label': 'Message actions' },
        actions.map((action) => e('button', { key: action.id, 'data-muxui-size': 'sm', 'data-muxui-variant': 'ghost', type: 'button', className: ['muxui-button', action.pressed !== undefined && 'muxui-toggle-button', action.icon && 'muxui-icon-button', 'muxui-message__action'].filter(Boolean).join(' '), 'data-muxui-icon-button': action.icon ? '' : undefined, 'aria-label': action.label, disabled: action.disabled, 'data-muxui-state-disabled': action.disabled || undefined, 'aria-pressed': action.pressed, 'data-muxui-state-selected': action.pressed || undefined, onClick: action.onAction }, action.icon ? e('span', { className: 'muxui-icon-button__icon', 'aria-hidden': true }, action.icon) : action.label))),
      sources.length > 0 && e('button', { 'data-muxui-size': 'sm', 'data-muxui-variant': 'ghost', type: 'button', className: 'muxui-button muxui-message__sources-trigger', 'aria-expanded': expanded, 'aria-controls': `${id}-sources`, onClick: toggle }, `${sources.length} ${sources.length === 1 ? 'source' : 'sources'}`, e(ChevronDown, { ref: chevron, className: 'muxui-message__sources-chevron', size: 16, 'aria-hidden': true, focusable: 'false' }))),
    sources.length > 0 && e('ul', { ref: sourcePanel, id: `${id}-sources`, className: 'muxui-message__sources', hidden: !expanded }, sources.map((source, index) => {
      const href = safeHref(source.href);
      return e('li', { key: source.id }, e('span', { className: 'muxui-message__source-index', 'aria-hidden': true }, index + 1),
        e('div', null, href ? e('a', { href, className: 'muxui-link' }, source.label) : e('span', null, source.label), source.description && e('span', { className: 'muxui-message__source-description' }, source.description)));
    })),
    followUps.length > 0 && onFollowUp && e('div', { className: 'muxui-message__follow-ups', role: 'group', 'aria-label': 'Follow-ups' }, e('span', { className: 'muxui-message__follow-up-label' }, 'Follow-ups'),
      followUps.map((item) => e('button', { key: item.id, 'data-muxui-size': 'sm', 'data-muxui-variant': 'neutral', className: 'muxui-button', type: 'button', onClick: () => onFollowUp(item) }, item.label, e(ArrowUpRight, { className: 'muxui-message__follow-up-icon', size: 16, 'aria-hidden': true, focusable: 'false' })))),
    e('span', { className: 'muxui-message__status', role: 'status', 'aria-live': 'polite', 'aria-atomic': true }, streaming ? streamingLabel : ''));
});
Message.displayName = 'Message';
