import React from 'react';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import Clock from 'lucide-react/dist/esm/icons/clock.mjs';
import CircleDot from 'lucide-react/dist/esm/icons/circle-dot.mjs';
import CircleCheck from 'lucide-react/dist/esm/icons/circle-check.mjs';
import CircleAlert from 'lucide-react/dist/esm/icons/circle-alert.mjs';
import CircleMinus from 'lucide-react/dist/esm/icons/circle-minus.mjs';
import { useCandidateMotion } from './candidate-motion.mjs';
import { MotionHeight, useDisclosureIconMotion } from '../motion-components.mjs';

const e = React.createElement;
const statuses = ['queued', 'running', 'completed', 'failed', 'cancelled'];
const labels = { queued: 'Queued', running: 'Running', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled' };
const marks = { queued: Clock, running: CircleDot, completed: CircleCheck, failed: CircleAlert, cancelled: CircleMinus };
function statusOf(items) {
  return ['failed', 'running', 'queued', 'cancelled'].find((status) => items.some((item) => item.status === status)) ?? (items.length ? 'completed' : undefined);
}
function actionsOf(actions, key) {
  return actions?.length > 0 && e('div', { className: 'muxui-activity-actions', key, role: 'group', 'aria-label': 'Activity actions' }, actions.map((action) => e('button', { key: action.id, 'data-size': 'sm', 'data-variant': 'neutral', className: 'muxui-button', type: 'button', disabled: action.disabled, 'data-disabled': action.disabled || undefined, onClick: action.onAction }, action.label)));
}
// Retain native details during exit; the requested state owns accessibility.
function ActivityDetails({ item, summary }) {
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [physicalOpen, setPhysicalOpen] = React.useState(false);
  const chevron = React.useRef(null);
  const summaryRef = React.useRef(null);
  const detailsHost = React.useRef(null);
  const detailsId = React.useId();
  useDisclosureIconMotion(chevron, detailsOpen, true);
  function toggle(event) {
    if (event.defaultPrevented) return;
    const interactive = event.target.closest?.('a[href], button, input, select, textarea, label, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], [tabindex]');
    if (interactive && interactive !== event.currentTarget && event.currentTarget.contains(interactive)) return;
    event.preventDefault();
    const next = !detailsOpen;
    if (next) setPhysicalOpen(true);
    setDetailsOpen(next);
  }
  function syncNative(event) {
    const nativeOpen = event.currentTarget.open;
    if (nativeOpen === physicalOpen) return;
    if (nativeOpen) setPhysicalOpen(true);
    else event.currentTarget.open = true;
    setDetailsOpen(nativeOpen);
  }
  return e('details', { open: physicalOpen, onToggle: syncNative }, e('summary', { ref: summaryRef, onClick: toggle, 'aria-expanded': detailsOpen, 'aria-controls': detailsId }, ...summary, e(ChevronDown, { ref: chevron, className: 'muxui-activity-item-chevron', size: 16, 'aria-hidden': true, focusable: 'false' })),
      e('div', { ref: detailsHost, className: 'muxui-activity-details-host', hidden: !detailsOpen ? 'until-found' : undefined },
        e(MotionHeight, { isOpen: detailsOpen, triggerRef: summaryRef, hostRef: detailsHost, id: detailsId, className: 'muxui-activity-motion-panel', contentClassName: 'muxui-activity-motion-content', grouped: true, onCloseComplete: () => setPhysicalOpen(false) },
          e('div', { className: 'muxui-activity-details' }, item.context && e('div', { className: 'muxui-activity-context' }, item.context), item.details && e('div', null, item.details), actionsOf(item.actions, 'item')))));
}
function ActivityItem({ item, visible }) {
  const mark = React.useRef(null);
  const statusLabel = React.useRef(null);
  useCandidateMotion(mark, item.status, { active: visible });
  useCandidateMotion(statusLabel, item.status, { active: visible });
  const summary = [e('span', { key: 'mark', ref: mark, className: 'muxui-activity-mark', 'aria-hidden': true }, e(marks[item.status], { size: 20, 'aria-hidden': true, focusable: 'false' })), e('span', { key: 'label', className: 'muxui-activity-item-label' }, item.label),
    e('span', { key: 'metadata', className: 'muxui-activity-item-metadata' }, item.meta && e('span', { className: 'muxui-activity-meta' }, item.meta), e('span', { className: 'muxui-activity-status-time' }, e('span', { ref: statusLabel, className: 'muxui-activity-status' }, labels[item.status]), item.time && e('span', { className: 'muxui-activity-time' }, ' in ', item.time)))];
  const hasDetails = item.details || item.context || item.actions?.length;
  return e('li', { className: 'muxui-activity-item', 'data-status': item.status }, hasDetails
    ? e(ActivityDetails, { item, summary })
    : e('div', { className: 'muxui-activity-row' }, ...summary));
}
export const Activity = React.forwardRef(function Activity({
  label, items, status = statusOf(items), variant, expanded, defaultExpanded = true, onExpandedChange,
  actions, className, children, dangerouslySetInnerHTML, ...props
}, ref) {
  if (status !== undefined && !statuses.includes(status) || items.some((item) => !statuses.includes(item.status))) throw new TypeError('Activity status must be queued, running, completed, failed or cancelled.');
  if (new Set(items.map((item) => item.id)).size !== items.length || items.some((item) => !item.id)) throw new TypeError('Activity items require unique nonempty IDs.');
  const [localExpanded, setLocalExpanded] = React.useState(defaultExpanded);
  const open = expanded ?? localExpanded;
  const id = React.useId();
  const chevron = React.useRef(null);
  const triggerRef = React.useRef(null);
  const itemsHost = React.useRef(null);
  const statusLabel = React.useRef(null);
  useDisclosureIconMotion(chevron, open, true);
  useCandidateMotion(statusLabel, status);
  function toggle() { const next = !open; if (expanded === undefined) setLocalExpanded(next); onExpandedChange?.(next); }
  return e('div', { ...props, ref, className: ['muxui-activity', className].filter(Boolean).join(' '), 'data-status': status },
    e('div', { className: 'muxui-activity-header' }, e('button', { ref: triggerRef, 'data-size': 'sm', 'data-variant': 'ghost', type: 'button', className: 'muxui-button muxui-activity-trigger', 'aria-expanded': open, 'aria-controls': `${id}-items`, onClick: toggle },
      e(ChevronDown, { ref: chevron, className: 'muxui-activity-chevron', size: 16, 'aria-hidden': true, focusable: 'false' }), e('span', { className: 'muxui-activity-label' }, label), status && e('span', { ref: statusLabel, className: 'muxui-activity-status' }, labels[status]), e('span', { className: 'muxui-activity-count' }, `${items.length} ${items.length === 1 ? 'item' : 'items'}`)), actionsOf(actions, 'aggregate')),
    e('div', { ref: itemsHost, className: 'muxui-activity-items-host', hidden: !open ? 'until-found' : undefined },
      e(MotionHeight, { isOpen: open, triggerRef, hostRef: itemsHost, className: 'muxui-activity-motion-panel', contentClassName: 'muxui-activity-motion-content', grouped: true },
        e('ul', { className: 'muxui-activity-items', id: `${id}-items` }, items.length ? items.map((item) => e(ActivityItem, { key: item.id, item, visible: open })) : e('li', { className: 'muxui-activity-empty' }, 'No activity.')))),
    e('span', { className: 'muxui-activity-sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': true }, `${label}: ${status ? labels[status] : 'No activity'}.`));
});
Activity.displayName = 'Activity';
