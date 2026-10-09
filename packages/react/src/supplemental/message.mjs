import React from 'react';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import ArrowUpRight from 'lucide-react/dist/esm/icons/arrow-up-right.mjs';
import { useCandidateMotion } from './candidate-motion.mjs';

const e = React.createElement;
function safeHref(href) {
  if (typeof href !== 'string' || !href.trim() || /[\u0000-\u001f\u007f]/u.test(href)) return undefined;
  try { const url = new URL(href, 'https://muxui.invalid/'); return ['https:', 'http:'].includes(url.protocol) ? href : undefined; } catch { return undefined; }
}
export const Message = React.forwardRef(function Message({
  sender = 'assistant', author, children, actions = [],
  sources = [], sourcesExpanded, defaultSourcesExpanded = false, onSourcesExpandedChange,
  followUps = [], onFollowUp, streaming = false, streamingLabel = 'Response in progress.',
  className, dangerouslySetInnerHTML, ...props
}, ref) {
  const [localExpanded, setLocalExpanded] = React.useState(defaultSourcesExpanded);
  const expanded = sourcesExpanded ?? localExpanded;
  const id = React.useId();
  const chevron = React.useRef(null);
  const sourcePanel = React.useRef(null);
  useCandidateMotion(chevron, expanded ? 180 : 0, { angle: expanded ? 180 : 0 });
  useCandidateMotion(sourcePanel, expanded, { active: expanded, reveal: true });
  const toggle = () => { const next = !expanded; if (sourcesExpanded === undefined) setLocalExpanded(next); onSourcesExpandedChange?.(next); };
  return e('article', { ...props, ref, className: ['muxui-message', className].filter(Boolean).join(' '), 'data-sender': sender, 'data-streaming': streaming || undefined },
    author && e('header', { className: 'muxui-message-author' }, author),
    e('div', { className: 'muxui-message-content' }, children),
    (actions.length > 0 || sources.length > 0) && e('div', { className: 'muxui-message-toolbar' },
      actions.length > 0 && e('div', { className: 'muxui-message-actions', role: 'group', 'aria-label': 'Message actions' },
        actions.map((action) => e('button', { key: action.id, 'data-size': 'sm', 'data-variant': 'ghost', type: 'button', className: ['muxui-button', action.pressed !== undefined && 'muxui-toggle-button', action.icon && 'muxui-icon-button', 'muxui-message-action'].filter(Boolean).join(' '), 'data-muxui-icon-button': action.icon ? '' : undefined, 'aria-label': action.label, disabled: action.disabled, 'data-disabled': action.disabled || undefined, 'aria-pressed': action.pressed, 'data-selected': action.pressed || undefined, onClick: action.onAction }, action.icon ? e('span', { className: 'muxui-icon-button-icon', 'aria-hidden': true }, action.icon) : action.label))),
      sources.length > 0 && e('button', { 'data-size': 'sm', 'data-variant': 'ghost', type: 'button', className: 'muxui-button muxui-message-sources-trigger', 'aria-expanded': expanded, 'aria-controls': `${id}-sources`, onClick: toggle }, `${sources.length} ${sources.length === 1 ? 'source' : 'sources'}`, e(ChevronDown, { ref: chevron, className: 'muxui-message-sources-chevron', size: 16, 'aria-hidden': true, focusable: 'false' }))),
    sources.length > 0 && e('ul', { ref: sourcePanel, id: `${id}-sources`, className: 'muxui-message-sources', hidden: !expanded }, sources.map((source, index) => {
      const href = safeHref(source.href);
      return e('li', { key: source.id }, e('span', { className: 'muxui-message-source-index', 'aria-hidden': true }, index + 1),
        e('div', null, href ? e('a', { href, className: 'muxui-link' }, source.label) : e('span', null, source.label), source.description && e('span', { className: 'muxui-message-source-description' }, source.description)));
    })),
    followUps.length > 0 && onFollowUp && e('div', { className: 'muxui-message-follow-ups', role: 'group', 'aria-label': 'Follow-ups' }, e('span', { className: 'muxui-message-follow-up-label' }, 'Follow-ups'),
      followUps.map((item) => e('button', { key: item.id, 'data-size': 'sm', 'data-variant': 'neutral', className: 'muxui-button', type: 'button', onClick: () => onFollowUp(item) }, item.label, e(ArrowUpRight, { className: 'muxui-message-follow-up-icon', size: 16, 'aria-hidden': true, focusable: 'false' })))),
    e('span', { className: 'muxui-message-sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': true }, streaming ? streamingLabel : ''));
});
Message.displayName = 'Message';
