import * as React from 'react';
import { Message, type MessageProps } from '@muxui/react';
const props: MessageProps = { sender: 'assistant', content: 'native RDFa', title: 'native title', children: <p>Content</p>, actions: [{ id: 'help', label: 'Helpful', pressed: true, onAction() {} }] };
const message = <Message {...props} ref={React.createRef<HTMLElement>()} role="article" onCopy={(event) => { const native: React.ClipboardEvent<HTMLElement> = event; void native; }} onFollowUp={(item) => item.label.toUpperCase()} />;
// @ts-expect-error Native content RDFa remains a string, not a React content slot.
const wrongContent = <Message content={<p>Wrong</p>} />;
// @ts-expect-error Sender does not replace native role.
const wrongSender = <Message sender="article" />;
// @ts-expect-error An action must have its callback and accessible label.
const deadAction = <Message actions={[{ id: 'dead', label: 'Dead' }]} />;
void [message, wrongContent, wrongSender, deadAction];
