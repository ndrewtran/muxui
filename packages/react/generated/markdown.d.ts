// @generated-from: packages/react/src/markdown/index.d.ts
// @generated-content-sha256: sha256:2219a7f42dfc7e797c60b575a0f512420b2d546cdddb64d0a6975f5321da9d83
import type * as React from 'react';
export type MarkdownProps = React.HTMLAttributes<HTMLDivElement> & { source: string; baseUrl?: string; invalidFallback?: React.ReactNode };
/** Renders a bounded Markdown subset. Raw HTML and unsafe URLs are removed. */
export declare const Markdown: React.ForwardRefExoticComponent<MarkdownProps & React.RefAttributes<HTMLDivElement>>;
