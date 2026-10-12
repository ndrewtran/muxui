import { Activity, ProgressBar, Text } from '@muxui/react';

type Detail = [label: string, value: string];

const facts = (rows: Detail[]) => (
  <div className="rows-facts">
    {rows.map(([label, value]) => (
      <div className="rows-fact" key={label}>
        <Text size="sm" color="muted">{label}</Text>
        <Text size="sm" variant="mono" color="muted">{value}</Text>
      </div>
    ))}
  </div>
);

export function AgentTraceTaskRowsExample() {
  // Status, counts, and times are placeholders for your own task data; nothing here runs a task.
  return (
    <section className="rows" aria-label="Task rows">
      <style>{`
        .rows {
          max-inline-size: 34rem;
          margin-inline: auto;
          padding: var(--muxui-semantic-layout-inset-xlarge) var(--muxui-semantic-layout-viewport-inset);
        }

        .rows-facts {
          display: grid;
          gap: var(--muxui-semantic-layout-control-gap);
        }

        .rows-fact {
          display: flex;
          justify-content: space-between;
          gap: var(--muxui-semantic-layout-action-gap);
        }
      `}</style>
      <Activity
        label="Supplier follow-up"
        items={[
          { id: 'a', label: 'Verified vendor records', status: 'completed', meta: '12 vendors', time: '4s', details: facts([['Matched contact records', '12/12'], ['Flagged stale records', '0']]) },
          { id: 'b', label: 'Build reorder list', status: 'running', meta: '7 items', details: <><ProgressBar label="Scoring stock risk" value={68} />{facts([['Reading the export', '3 files']])}</> },
          { id: 'c', label: 'Draft vendor emails', status: 'queued', meta: '2 messages' },
        ]}
      />
    </section>
  );
}
