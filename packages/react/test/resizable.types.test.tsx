import * as React from 'react';
import { Resizable, ResizableHandle, ResizablePanel, type ResizableChange, type ResizableProps, type ResizableSizes } from '@muxui/react';

const sizes: ResizableSizes = { editor: 60, preview: 40 };
const panels = [
  <ResizablePanel key="editor" id="editor" minSize={20} />,
  <ResizableHandle key="handle" id="split" before="editor" after="preview" aria-label="Resize editor and preview" />,
  <ResizablePanel key="preview" id="preview" maxSize={80} />,
];
const onSizes = (next: ResizableSizes, meta: ResizableChange) => {
  const percent: number | undefined = next.editor;
  const source: 'pointer' | 'keyboard' = meta.source;
  void [percent, source, meta.handleId];
};

const controlled = <Resizable sizes={sizes} onSizesChange={onSizes} onSizesCommit={onSizes} orientation="vertical" precision={2} data-consumer="kept">{panels}</Resizable>;
const uncontrolled = <Resizable defaultSizes={sizes} keyboardStep={2} keyboardLargeStep={20} disabled readOnly>{panels}</Resizable>;
const neither: ResizableProps = {};
void [controlled, uncontrolled, neither];

// @ts-expect-error Sizes are controlled or default, not both.
const both = <Resizable sizes={sizes} defaultSizes={sizes}>{panels}</Resizable>;
// @ts-expect-error Orientation is horizontal or vertical.
const diagonal = <Resizable orientation="diagonal">{panels}</Resizable>;
// @ts-expect-error A panel needs an id.
const unnamedPanel = <ResizablePanel />;
// @ts-expect-error A handle names the panels on either side.
const looseHandle = <ResizableHandle id="split" />;
void [both, diagonal, unnamedPanel, looseHandle];
