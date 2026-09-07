import { TextEditor } from '@muxui/react/text-editor';
export function BasicTextEditor() { return <TextEditor label="Note" aria-label="Note editor" description="A short formatted note." bubbleMenu defaultValue={{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Draft' }] }] }} placeholder="Write a note" toolbar="advanced" floating />; }
