import type * as React from 'react';

export type MessageAction = { id: string; label: string; icon?: React.ReactNode; onAction: () => void; disabled?: boolean; pressed?: boolean };
export type MessageSource = { id: string; label: string; href: string; description?: string };
export type MessageFollowUp = { id: string; label: string };
export type MessageProps = Omit<React.HTMLAttributes<HTMLElement>, 'dangerouslySetInnerHTML'> & {
  sender?: 'user' | 'assistant' | 'system';
  author?: React.ReactNode;
  actions?: readonly MessageAction[];
  sources?: readonly MessageSource[];
  sourcesExpanded?: boolean;
  defaultSourcesExpanded?: boolean;
  onSourcesExpandedChange?: (expanded: boolean) => void;
  followUps?: readonly MessageFollowUp[];
  onFollowUp?: (item: MessageFollowUp) => void;
  streaming?: boolean;
  streamingLabel?: string;
};

/** Caller-updated content; Markdown is composed through its separately imported subpath. */
export declare const Message: React.ForwardRefExoticComponent<MessageProps & React.RefAttributes<HTMLElement>>;
