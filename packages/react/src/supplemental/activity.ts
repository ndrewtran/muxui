import React from 'react';
import type { ForwardRefExoticComponent, HTMLAttributes, MouseEvent, ReactNode, RefAttributes, SyntheticEvent } from 'react';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import Clock from 'lucide-react/dist/esm/icons/clock.mjs';
import CircleDot from 'lucide-react/dist/esm/icons/circle-dot.mjs';
import CircleCheck from 'lucide-react/dist/esm/icons/circle-check.mjs';
import CircleAlert from 'lucide-react/dist/esm/icons/circle-alert.mjs';
import CircleMinus from 'lucide-react/dist/esm/icons/circle-minus.mjs';
import { useCandidateMotion } from './candidate-motion.mjs';
import { MotionHeight, useDisclosureIconMotion } from '../motion-components.mjs';

export type ActivityStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ActivityAction = { id: string; label: string; onAction: () => void; disabled?: boolean };
export type ActivityItem = {
  id: string;
  label: string;
  status: ActivityStatus;
  details?: ReactNode;
  context?: ReactNode;
  meta?: ReactNode;
  time?: string;
  actions?: readonly ActivityAction[];
  /** Starts the item's disclosure open. Read at mount, so later changes do not open or close it; an item without details, context, or actions ignores it. */
  defaultExpanded?: boolean;
};

/**
 * The props Mux UI defines for Activity; the catalog's web.react API is derived from
 * this interface (Decision 0031).
 */
interface ActivityOwnProps {
  /** Names the group of tasks. */
  label: string;
  /** The tasks, each with the status the application supplies. Each id is unique and nonempty. */
  items: readonly ActivityItem[];
  /** The group status. Without it the group follows its items: failed first, then running, queued, cancelled, and completed. */
  status?: ActivityStatus;
  /** Whether the group is open, when the caller controls it. */
  expanded?: boolean;
  /** Whether the group starts open, when Activity controls it. */
  defaultExpanded?: boolean;
  /** Reports the group opening or closing. */
  onExpandedChange?: (expanded: boolean) => void;
  /** Buttons that act on the whole group. */
  actions?: readonly ActivityAction[];
}

export type ActivityProps = ActivityOwnProps & Omit<HTMLAttributes<HTMLDivElement>, keyof ActivityOwnProps | 'children' | 'dangerouslySetInnerHTML'>;

const e = React.createElement;
const statuses: readonly ActivityStatus[] = ['queued', 'running', 'completed', 'failed', 'cancelled'];
const labels: Readonly<Record<ActivityStatus, string>> = { queued: 'Queued', running: 'Running', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled' };
const marks = { queued: Clock, running: CircleDot, completed: CircleCheck, failed: CircleAlert, cancelled: CircleMinus } satisfies Record<ActivityStatus, unknown>;
function statusOf(items: readonly ActivityItem[]) {
  return (['failed', 'running', 'queued', 'cancelled'] as const).find((status) => items.some((item) => item.status === status)) ?? (items.length ? 'completed' : undefined);
}
function actionsOf(actions: readonly ActivityAction[] | undefined, key: string) {
  return actions != null && actions.length > 0 && e('div', { className: 'muxui-activity-actions', key, role: 'group', 'aria-label': 'Activity actions' }, actions.map((action) => e('button', { key: action.id, 'data-size': 'sm', 'data-variant': 'neutral', className: 'muxui-button', type: 'button', disabled: action.disabled, 'data-disabled': action.disabled || undefined, onClick: action.onAction }, action.label)));
}
// Retain native details during exit; the requested state owns accessibility. defaultExpanded seeds both states at mount only.
function ActivityDetails({ item, summary }: { item: ActivityItem; summary: ReactNode[] }) {
  const [detailsOpen, setDetailsOpen] = React.useState(item.defaultExpanded ?? false);
  const [physicalOpen, setPhysicalOpen] = React.useState(detailsOpen);
  const chevron = React.useRef<SVGSVGElement | null>(null);
  const summaryRef = React.useRef<HTMLElement | null>(null);
  const detailsHost = React.useRef<HTMLDivElement | null>(null);
  const detailsId = React.useId();
  useDisclosureIconMotion(chevron, detailsOpen, true);
  function toggle(event: MouseEvent<HTMLElement>) {
    if (event.defaultPrevented) return;
    // The target may be a node without closest, such as text.
    const interactive = (event.target as Partial<Element>).closest?.('a[href], button, input, select, textarea, label, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], [tabindex]');
    if (interactive && interactive !== event.currentTarget && event.currentTarget.contains(interactive)) return;
    event.preventDefault();
    const next = !detailsOpen;
    if (next) setPhysicalOpen(true);
    setDetailsOpen(next);
  }
  function syncNative(event: SyntheticEvent<HTMLDetailsElement>) {
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
// Named for the item it renders; the binding differs only from the exported ActivityItem type.
const ActivityItemRow = function ActivityItem({ item, visible }: { item: ActivityItem; visible: boolean }) {
  const mark = React.useRef<HTMLSpanElement | null>(null);
  const statusLabel = React.useRef<HTMLSpanElement | null>(null);
  useCandidateMotion(mark, item.status, { active: visible });
  useCandidateMotion(statusLabel, item.status, { active: visible });
  const summary = [e('span', { key: 'mark', ref: mark, className: 'muxui-activity-mark', 'aria-hidden': true }, e(marks[item.status], { size: 20, 'aria-hidden': true, focusable: 'false' })), e('span', { key: 'label', className: 'muxui-activity-item-label' }, item.label),
    e('span', { key: 'metadata', className: 'muxui-activity-item-metadata' }, item.meta && e('span', { className: 'muxui-activity-meta' }, item.meta), e('span', { className: 'muxui-activity-status-time' }, e('span', { ref: statusLabel, className: 'muxui-activity-status' }, labels[item.status]), item.time && e('span', { className: 'muxui-activity-time' }, ' in ', item.time)))];
  const hasDetails = item.details || item.context || item.actions?.length;
  return e('li', { className: 'muxui-activity-item', 'data-status': item.status }, hasDetails
    ? e(ActivityDetails, { item, summary })
    : e('div', { className: 'muxui-activity-row' }, ...summary));
};
/** Caller-supplied status, metadata and time; this component never starts or simulates tasks. */
export const Activity: ForwardRefExoticComponent<ActivityProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, ActivityProps>(function Activity({
  label, items, status, variant: _variant, expanded, defaultExpanded = true, onExpandedChange,
  // Not Activity props: an untyped caller's variant, children, and HTML never reach the root.
  actions, className, children: _children, dangerouslySetInnerHTML: _html, ...props
}: ActivityProps & { variant?: unknown; children?: unknown; dangerouslySetInnerHTML?: unknown }, ref) {
  // Without a status the group follows its items. A conditional, not ??: extraction reads a fallback
  // on an owned prop as an executed default, and this one is computed from the items, not static.
  const groupStatus = status === undefined ? statusOf(items) : status;
  if (groupStatus !== undefined && !statuses.includes(groupStatus) || items.some((item) => !statuses.includes(item.status))) throw new TypeError('Activity status must be queued, running, completed, failed or cancelled.');
  if (new Set(items.map((item) => item.id)).size !== items.length || items.some((item) => !item.id)) throw new TypeError('Activity items require unique nonempty IDs.');
  const [localExpanded, setLocalExpanded] = React.useState(defaultExpanded);
  // Controlled while expanded is set, with the same conditional in place of ??.
  const open = expanded == null ? localExpanded : expanded;
  const id = React.useId();
  const chevron = React.useRef<SVGSVGElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const itemsHost = React.useRef<HTMLDivElement | null>(null);
  const statusLabel = React.useRef<HTMLSpanElement | null>(null);
  useDisclosureIconMotion(chevron, open, true);
  useCandidateMotion(statusLabel, groupStatus);
  function toggle() { const next = !open; if (expanded === undefined) setLocalExpanded(next); onExpandedChange?.(next); }
  return e('div', { ...props, ref, className: ['muxui-activity', className].filter(Boolean).join(' '), 'data-status': groupStatus },
    e('div', { className: 'muxui-activity-header' }, e('button', { ref: triggerRef, 'data-size': 'sm', 'data-variant': 'ghost', type: 'button', className: 'muxui-button muxui-activity-trigger', 'aria-expanded': open, 'aria-controls': `${id}-items`, onClick: toggle },
      e(ChevronDown, { ref: chevron, className: 'muxui-activity-chevron', size: 16, 'aria-hidden': true, focusable: 'false' }), e('span', { className: 'muxui-activity-label' }, label), groupStatus && e('span', { ref: statusLabel, className: 'muxui-activity-status' }, labels[groupStatus]), e('span', { className: 'muxui-activity-count' }, `${items.length} ${items.length === 1 ? 'item' : 'items'}`)), actionsOf(actions, 'aggregate')),
    e('div', { ref: itemsHost, className: 'muxui-activity-items-host', hidden: !open ? 'until-found' : undefined },
      e(MotionHeight, { isOpen: open, triggerRef, hostRef: itemsHost, className: 'muxui-activity-motion-panel', contentClassName: 'muxui-activity-motion-content', grouped: true },
        e('ul', { className: 'muxui-activity-items', id: `${id}-items` }, items.length ? items.map((item) => e(ActivityItemRow, { key: item.id, item, visible: open })) : e('li', { className: 'muxui-activity-empty' }, 'No activity.')))),
    e('span', { className: 'muxui-activity-sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': true }, `${label}: ${groupStatus ? labels[groupStatus] : 'No activity'}.`));
});
Activity.displayName = 'Activity';
