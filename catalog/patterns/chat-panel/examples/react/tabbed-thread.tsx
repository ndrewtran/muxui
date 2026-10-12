import { useState } from 'react';
import { Card, IconButton, Menu, Message, PromptComposer, Tabs, Text } from '@muxui/react';
import { Markdown } from '@muxui/react/markdown';

// One stroke path per icon.
const icon = (path: string) => () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);
const Plus = icon('M12 5v14M5 12h14');
const History = icon('M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2');
const More = icon('M5 12h.01M12 12h.01M19 12h.01');

// Assistant replies are Markdown, each with the trace line that led to it.
const threads = [
  {
    id: 'plan',
    label: 'Plan',
    question: 'What is still blocking the beta launch?',
    replies: [
      { id: 'p1', text: 'Two items are open: the **billing copy review** and the export fix.', step: ['Checklist', 'Launch notes', 'for 3s'] },
      { id: 'p2', text: 'The export fix has an owner and is due Friday.', step: ['Triage', 'Issue labels', 'for 2s'] },
    ],
  },
  {
    id: 'support',
    label: 'Support',
    question: 'How many tickets are waiting?',
    replies: [{ id: 's1', text: 'Nine tickets are waiting, three of them **older than two days**.', step: ['Queue', 'Ticket counts', 'for 2s'] }],
  },
];

export function ChatPanelTabbedThreadExample() {
  // Local presentation state only: sending adds your text to the open thread and never contacts a service.
  const [tab, setTab] = useState('plan');
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState<Record<string, string[]>>({});
  return (
    <section className="chat" aria-label="Chat panel">
      <style>{`
        .chat {
          max-inline-size: 34rem;
          margin-inline: auto;
          padding: var(--muxui-semantic-layout-inset-xlarge) var(--muxui-semantic-layout-viewport-inset);
        }

        /* The card keeps its own surface and border; the header, thread, and composer carry the padding. */
        .chat .chat-card {
          padding: 0;
        }

        .chat-main {
          position: relative;
        }

        .chat-main .chat-tabs {
          padding-inline: var(--muxui-semantic-layout-inset-small);
        }

        /* The actions sit on the tab row; Tabs owns its list and panel, so they cannot be placed inside it. */
        .chat-actions {
          position: absolute;
          inset-block-start: 0;
          inset-inline-end: var(--muxui-semantic-layout-inset-small);
          display: flex;
          align-items: center;
          gap: var(--muxui-semantic-layout-micro-gap);
          block-size: 2.125rem;
        }

        .chat-menu {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          inline-size: 2rem;
          block-size: 2rem;
          padding: 0;
          border: 0;
          border-radius: var(--muxui-semantic-control-radius);
          background: transparent;
          color: var(--muxui-semantic-content-default);
        }

        .chat-menu:hover {
          background-color: var(--muxui-semantic-surface-hover);
        }

        .chat-thread {
          display: flex;
          flex-direction: column;
          gap: var(--muxui-semantic-layout-group-gap);
          min-block-size: 12rem;
          padding-inline: var(--muxui-semantic-layout-inset-medium);
        }

        /* Right alignment for your own messages. */
        .chat-thread .chat-user {
          align-self: flex-end;
          text-align: end;
        }

        .chat-step {
          display: flex;
          flex-wrap: wrap;
          gap: var(--muxui-semantic-layout-control-gap);
          align-items: baseline;
        }

        .chat-foot {
          padding: var(--muxui-semantic-layout-inset-small);
        }
      `}</style>
      <Card.Root className="chat-card" variant="outlined">
        <div className="chat-main">
          <Tabs
            className="chat-tabs"
            aria-label="Chats"
            size="sm"
            value={tab}
            onChange={setTab}
            items={threads.map(({ id, label, question, replies }) => ({
              id,
              label,
              panel: (
                <div className="chat-thread" role="log" aria-label={`${label} thread`}>
                  <Message className="chat-user" sender="user"><p>{question}</p></Message>
                  {replies.map(({ id: reply, text, step }) => (
                    <Message key={reply}>
                      <div className="chat-step"><Text size="sm" variant="label">{step[0]}</Text><Text size="sm" color="muted">{step[1]}</Text><Text size="sm">{step[2]}</Text></div>
                      <Markdown source={text} />
                    </Message>
                  ))}
                  {(sent[id] ?? []).map((text, index) => <Message key={index} className="chat-user" sender="user"><p>{text}</p></Message>)}
                </div>
              ),
            }))}
          />
          <div className="chat-actions">
            <IconButton aria-label="New chat" variant="ghost" size="sm"><Plus /></IconButton>
            <IconButton aria-label="History" variant="ghost" size="sm"><History /></IconButton>
            <Menu.Root>
              <Menu.Trigger className="chat-menu" aria-label="More actions"><More /></Menu.Trigger>
              <Menu.Popup><Menu.List items={['Rename chat', 'Clear thread']} /></Menu.Popup>
            </Menu.Root>
          </div>
        </div>
        <footer className="chat-foot">
          <PromptComposer
            value={draft}
            onValueChange={setDraft}
            inputProps={{ name: 'message', placeholder: 'Write a follow-up' }}
            onSend={(text) => {
              setSent({ ...sent, [tab]: [...(sent[tab] ?? []), text] });
              setDraft('');
            }}
          />
        </footer>
      </Card.Root>
    </section>
  );
}
