import type * as React from 'react';
/** Longest accepted source, in UTF-16 code units. */
export declare const MARKDOWN_SOURCE_LIMIT: number;
/** Most lines accepted in a source. A trailing newline starts a final blank line. */
export declare const MARKDOWN_LINE_LIMIT: number;
/** Longest accepted single line, in UTF-16 code units. */
export declare const MARKDOWN_LINE_LENGTH_LIMIT: number;
/** Deepest accepted nesting of block and inline structure. */
export declare const MARKDOWN_DEPTH_LIMIT: number;
/** Most parsed nodes accepted. */
export declare const MARKDOWN_NODE_LIMIT: number;
export type MarkdownProps = React.HTMLAttributes<HTMLDivElement> & { source: string; baseUrl?: string; invalidFallback?: React.ReactNode };
/** Renders a bounded Markdown subset. Raw HTML and unsafe URLs are removed. */
export declare const Markdown: React.ForwardRefExoticComponent<MarkdownProps & React.RefAttributes<HTMLDivElement>>;
