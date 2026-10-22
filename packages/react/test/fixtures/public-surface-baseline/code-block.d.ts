import type * as React from 'react';

export type CodeBlockProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'dangerouslySetInnerHTML'> & {
  /** Shiki language name or alias; missing/unsupported languages remain plain text. */
  language?: string;
  filename?: string;
  lineNumbers?: boolean;
  copyable?: boolean;
  wrap?: boolean;
} & (
  | { mode?: 'code'; source: string; before?: never; after?: never }
  | { mode: 'diff'; before: string; after: string; source?: never }
);

/** Each input accepts at most 1,000,000 UTF-16 units and 10,000 lines. */
export declare const CodeBlock: React.ForwardRefExoticComponent<CodeBlockProps & React.RefAttributes<HTMLDivElement>>;
