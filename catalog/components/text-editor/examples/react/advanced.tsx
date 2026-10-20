import { useState } from 'react';
import { TextEditor } from '@muxui/react/text-editor';

export function AdvancedTextEditorExample() {
  const [status, setStatus] = useState('');
  return (
    <div>
      <TextEditor
        label="Article"
        toolbar="advanced"
        // The advanced toolbar needs all three handlers. Without them, Link and Image fall back to a browser prompt
        // and Generate with AI does nothing. Each handler below is a stand-in for the application's own flow.
        onLinkRequest={({ setLink }) => {
          // Open your own link form, then call setLink with the address it returns.
          setLink('https://example.com/guide');
        }}
        onImageRequest={({ insertImage }) => {
          // Upload the file yourself, then insert its durable https address.
          insertImage('https://example.com/photo.png', 'Team photo');
        }}
        onGenerate={() => setStatus('Generate requested. The application starts its own request.')}
      />
      <p role="status">{status}</p>
    </div>
  );
}
