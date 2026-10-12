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
        label="Release prep"
        items={[
          { id: 'a', label: 'Checked export settings', status: 'completed', meta: '9 settings', time: '6s', details: facts([['Settings updated', '4'], ['Settings kept', '5']]) },
          { id: 'b', label: 'Draft the changelog', status: 'running', meta: '10 entries', defaultExpanded: true, details: <><ProgressBar label="Grouping entries" value={40} />{facts([['Areas found', '6']])}</> },
          { id: 'c', label: 'Prepare the announcement', status: 'queued', meta: '1 post' },
        ]}
      />
    </section>
  );
}
