import * as React from 'react';
import { CodeBlock, type CodeBlockProps } from '@muxui/react';

const ref = React.createRef<HTMLDivElement>();
const code = <CodeBlock ref={ref} source="<escaped>" filename="panel.ts" language="typescript" wrap lineNumbers copyable onCopy={(event) => {
  const native: React.ClipboardEvent<HTMLDivElement> = event;
  void native;
}} data-consumer="kept" aria-label="Panel source" />;
const diff = <CodeBlock mode="diff" before="old" after="new" />;
const props: CodeBlockProps = { source: '' };
void [code, diff, props];

// @ts-expect-error Code mode requires source.
const missingSource = <CodeBlock />;
// @ts-expect-error Diff requires before and after.
const missingBefore = <CodeBlock mode="diff" after="new" />;
// @ts-expect-error Input modes cannot be combined.
const mixed = <CodeBlock mode="diff" before="old" after="new" source="extra" />;
// @ts-expect-error Source mode rejects diff inputs.
const mixedDefault = <CodeBlock source="code" before="old" />;
// @ts-expect-error Content is owned by the input.
const children = <CodeBlock source="code">content</CodeBlock>;
// @ts-expect-error Source cannot be supplied as raw HTML.
const raw = <CodeBlock source="code" dangerouslySetInnerHTML={{ __html: 'x' }} />;
// @ts-expect-error Native onCopy is a ClipboardEvent, never a source string.
const stringCallback = <CodeBlock source="code" onCopy={(source: string) => { void source; }} />;
// @ts-expect-error Ref points to the native div host.
const wrongRef = <CodeBlock source="code" ref={React.createRef<HTMLPreElement>()} />;
void [missingSource, missingBefore, mixed, mixedDefault, children, raw, stringCallback, wrongRef];
