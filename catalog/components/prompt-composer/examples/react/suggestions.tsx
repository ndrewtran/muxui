import * as React from 'react';
import { PromptComposer, type PromptComposerAttachment } from '@muxui/react';

export function Example() {
  const [value, setValue] = React.useState('');
  const [model, setModel] = React.useState('standard');
  const [attachments, setAttachments] = React.useState<PromptComposerAttachment[]>([]);
  const [result, setResult] = React.useState('');
  return <div>
    <PromptComposer value={value} onValueChange={setValue} inputProps={{ placeholder: 'Write a message, @ source, / command…' }}
      sources={[{ id: 'notes', label: 'Workspace notes', description: 'Selected local notes', insertText: '@notes ' }]}
      commands={[{ id: 'summarize', label: 'Summarize', description: 'Insert a summary prompt', insertText: 'Summarize these notes: ' }]}
      models={[{ id: 'standard', label: 'Standard' }, { id: 'detailed', label: 'Detailed' }]} selectedModel={model} onModelChange={setModel}
      attachments={attachments} onFilesSelected={(files) => setAttachments((previous) => [...previous, ...files.map((file, index) => ({ id: `${previous.length + index}-${file.name}`, label: file.name }))])}
      onRemoveAttachment={(id) => setAttachments((previous) => previous.filter((item) => item.id !== id))}
      onSend={(message) => { setResult(`Saved locally with ${model}: ${message}`); setValue(''); }} />
    <p role="status">{result}</p>
  </div>;
}
