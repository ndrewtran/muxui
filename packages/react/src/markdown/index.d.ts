import type * as React from 'react';
export type MarkdownProps = React.HTMLAttributes<HTMLDivElement> & { source: string; baseUrl?: string; invalidFallback?: React.ReactNode };
/** Renders a bounded Markdown subset. Raw HTML and unsafe URLs are removed. */
export declare const Markdown: React.ForwardRefExoticComponent<MarkdownProps & React.RefAttributes<HTMLDivElement>>;
