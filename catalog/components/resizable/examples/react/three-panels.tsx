import { useState } from 'react';
import { Resizable, ResizableHandle, ResizablePanel } from '@muxui/react';
import type { ResizableChange, ResizableSizes } from '@muxui/react';

export function ThreePanelResizableExample() {
  const [sizes, setSizes] = useState<ResizableSizes>({ preview: 30, editor: 50, console: 20 });
  const [change, setChange] = useState<ResizableChange | null>(null);
  return (
    <div style={{ display: 'grid', gap: 'var(--muxui-semantic-layout-control-gap)', width: '100%' }}>
      {/* A vertical Resizable fills the height of its container, so the container needs a height. */}
      <div style={{ blockSize: '16rem' }}>
        <Resizable
          aria-label="Workspace"
          orientation="vertical"
          sizes={sizes}
          onSizesChange={(next, meta) => {
            setSizes(next);
            setChange(meta);
          }}
        >
          <ResizablePanel id="preview" minSize={15} maxSize={50}>Preview</ResizablePanel>
          <ResizableHandle id="preview-editor" before="preview" after="editor" aria-label="Resize preview and editor" />
          <ResizablePanel id="editor" minSize={30}>Editor</ResizablePanel>
          <ResizableHandle id="editor-console" before="editor" after="console" aria-label="Resize editor and console" />
          <ResizablePanel id="console" minSize={10}>Console</ResizablePanel>
        </Resizable>
      </div>
      <p>
        Preview {sizes.preview}%, editor {sizes.editor}%, console {sizes.console}%
        {change ? `. Last change: ${change.source} on ${change.handleId}.` : ''}
      </p>
    </div>
  );
}
