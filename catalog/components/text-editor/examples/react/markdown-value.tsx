import { useState } from 'react';
import { TextEditor } from '@muxui/react/text-editor';
import { fromMarkdown, toMarkdown } from '@muxui/react/text-editor/markdown';

// The note as the application stores it: Markdown text.
const saved = '## Release notes\n\n- **Faster** search\n- Fixed ~~flaky~~ uploads\n\nSee [the changelog](https://example.com/changelog).';

export function MarkdownValueTextEditorExample() {
  const [note, setNote] = useState(saved);
  // The editor reads the note with fromMarkdown and reports each change with toMarkdown, so the state holds Markdown.
  return (
    <div>
      <TextEditor label="Release notes" markdown={{ fromMarkdown, toMarkdown, value: note, onChange: setNote }} />
      <pre>{note}</pre>
    </div>
  );
}
