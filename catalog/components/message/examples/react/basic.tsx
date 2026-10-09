import * as React from 'react';
import { Message } from '@muxui/react';
import { Markdown } from '@muxui/react/markdown';

export function Example() {
  const [helpful, setHelpful] = React.useState(false);
  const [followUp, setFollowUp] = React.useState('');
  return <div>
    <Message author="Assistant" sources={[{ id: 'react', label: 'React documentation', href: 'https://react.dev/', description: 'react.dev' }]}
      actions={[{ id: 'helpful', label: 'Helpful', pressed: helpful, onAction: () => setHelpful(!helpful) }]}
      followUps={[{ id: 'explain', label: 'Explain the example' }]} onFollowUp={(item) => setFollowUp(item.label)}>
      <Markdown source="Keep **request state** in your application. This message renders supplied content." />
    </Message>
    <p role="status">{followUp && `Selected: ${followUp}`}</p>
  </div>;
}
