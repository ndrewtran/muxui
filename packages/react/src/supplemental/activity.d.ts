import type * as React from 'react';

export type ActivityStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ActivityAction = { id: string; label: string; onAction: () => void; disabled?: boolean };
export type ActivityItem = { id: string; label: string; status: ActivityStatus; details?: React.ReactNode; context?: React.ReactNode; meta?: React.ReactNode; time?: string; actions?: readonly ActivityAction[] };
export type ActivityProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'dangerouslySetInnerHTML'> & {
  label: string;
  items: readonly ActivityItem[];
  status?: ActivityStatus;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  actions?: readonly ActivityAction[];
};

/** Caller-supplied status, metadata and time; this component never starts or simulates tasks. */
export declare const Activity: React.ForwardRefExoticComponent<ActivityProps & React.RefAttributes<HTMLDivElement>>;
