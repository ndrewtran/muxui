import { TextEditor } from '@muxui/react/text-editor';

// The simple toolbar is the default and suits a short formatted note. It needs no handlers from the application.
export function BasicTextEditor() {
  return (
    <TextEditor
      label="Note"
      description="A short formatted note."
      placeholder="Write a note"
      defaultValue={{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Draft' }] }] }}
    />
  );
}
