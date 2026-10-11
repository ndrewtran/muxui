import { useState } from 'react';
import { Card, ListBox, SearchField, Text } from '@muxui/react';

type Item = { id: string; title: string; hint?: string };

const groups: { id: string; title: string; items: Item[] }[] = [
  { id: 'jump', title: 'Jump to', items: [{ id: 'plan', title: 'Open launch plan', hint: 'Plans' }, { id: 'issues', title: 'Review open issues', hint: 'Support' }] },
  { id: 'ask', title: 'Ask the assistant', items: [{ id: 'options', title: 'Compare rollout options' }, { id: 'notes', title: 'Draft release notes' }, { id: 'export', title: 'Check export status' }] },
];

export function QuickFindInlineExample() {
  // Local presentation state only: the query filters placeholder items already in memory.
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState('');
  const needle = query.trim().toLowerCase();
  const shown = groups.map((group) => ({ ...group, items: group.items.filter((item) => item.title.toLowerCase().includes(needle)) })).filter((group) => group.items.length > 0);
  const count = shown.reduce((total, group) => total + group.items.length, 0);
  return (
    <section className="find" aria-label="Quick find">
      <style>{`
        .find {
          max-inline-size: 26rem;
          margin-inline: auto;
          padding: var(--muxui-semantic-layout-inset-xlarge) var(--muxui-semantic-layout-viewport-inset);
        }

        /* The card keeps its own surface and border; the field and the list carry the padding. */
        .find .find-card {
          padding: 0;
        }

        .find-field {
          padding: var(--muxui-semantic-layout-inset-small);
          border-block-end: 1px solid var(--muxui-semantic-border-default);
        }

        .find-item {
          display: flex;
          justify-content: space-between;
          gap: var(--muxui-semantic-layout-action-gap);
        }

        .find-empty {
          display: grid;
          justify-items: center;
          gap: var(--muxui-semantic-layout-control-gap);
          padding: var(--muxui-semantic-layout-inset-xlarge);
          text-align: center;
        }

        .find-status {
          padding: var(--muxui-semantic-layout-inset-small) var(--muxui-semantic-layout-inset-medium);
        }
      `}</style>
      <Card.Root className="find-card" variant="outlined">
        <div className="find-field">
          <SearchField aria-label="Find" placeholder="Find a plan, issue, or action" value={query} onChange={(next) => { setQuery(next); setChosen(''); }} />
        </div>
        {count > 0 ? (
          <ListBox aria-label="Results" selectionMode="none" onAction={(item) => setChosen(groups.flatMap((group) => group.items).find(({ id }) => id === item?.id)?.title ?? '')}>
            {shown.map((group) => (
              <ListBox.Section key={group.id} title={group.title}>
                {group.items.map((item) => (
                  <ListBox.Item key={item.id} id={item.id} textValue={item.title}>
                    <span className="find-item"><Text slot="label">{item.title}</Text>{item.hint && <Text slot="description" size="sm" color="muted">{item.hint}</Text>}</span>
                  </ListBox.Item>
                ))}
              </ListBox.Section>
            ))}
          </ListBox>
        ) : (
          <div className="find-empty"><Text variant="label">No results found</Text><Text size="sm" color="muted">Adjust your search to try again</Text></div>
        )}
        <Text className="find-status" size="sm" color="muted" role="status">{chosen ? `Chose ${chosen}` : `${count} ${count === 1 ? 'result' : 'results'}`}</Text>
      </Card.Root>
    </section>
  );
}
