import { useId, useState, type ReactNode } from 'react';
import { Activity, Avatar, Button, CodeBlock, Disclosure, Link, Tabs, Text } from '@muxui/react';
import { Markdown } from '@muxui/react/markdown';

// One stroke path per icon.
const icon = (path: string) => ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);
const Spark = icon('M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z');
const Chevron = icon('m6 15 6-6 6 6');
const Magnifier = icon('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4');

const results = [
  { id: 'r1', title: 'Rollout checklist basics', host: 'checklists.example.net', mark: 'R' },
  { id: 'r2', title: 'Staged release runbook', host: 'runbooks.example.org', mark: 'S' },
];

const before = 'const owners = [\n  "billing"\n];';
const after = 'const owners = [\n  "billing",\n  "export",\n];';

// A Disclosure shows no chevron on its own, so the title carries one that follows the open state.
function Step({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="trace-step">
      <Disclosure
        expanded={open}
        onExpandedChange={setOpen}
        title={<span className="trace-title" data-open={open}><Spark className="trace-icon" />{title}<Chevron className="trace-icon trace-chevron" /></span>}
      >
        <div className="trace-detail">{children}</div>
      </Disclosure>
    </div>
  );
}

export function AgentTraceThinkingExample() {
  // Local presentation state only: the trace shows placeholder steps and never runs a task.
  const [diff, setDiff] = useState(true);
  const diffId = useId();
  const panels = {
    steps: (
      <Activity
        label="Thinking"
        items={[
          { id: 'a', label: 'Reading the launch notes', status: 'completed', meta: '3 files', time: '3s' },
          { id: 'b', label: 'Scanning open issues', status: 'running', meta: '14 issues' },
        ]}
      />
    ),
    reasoning: (
      <Step title="Thinking">
        <Markdown source={'Two items gate the launch:\n\n- The **billing copy** still needs review.\n- The **export fix** has a failing check.\n\nOwnership is clear for both, so the next step is to confirm the review date.'} />
      </Step>
    ),
    search: (
      <Step title="Searching the web">
        <div className="trace-row"><Magnifier className="trace-icon" /><Text size="sm" color="muted">staged rollout checklist</Text></div>
        <ul className="trace-results">
          {results.map((result) => (
            <li className="trace-row" key={result.id}>
              <Avatar.Root size="sm" aria-hidden="true"><Avatar.Fallback>{result.mark}</Avatar.Fallback></Avatar.Root>
              <Link href="#result">{result.title}</Link>
              <Text size="sm" color="muted">{result.host}</Text>
            </li>
          ))}
        </ul>
      </Step>
    ),
    coding: (
      <Step title="Running tools">
        <div className="trace-row"><Text size="sm" variant="label">Read</Text><Text size="sm" variant="mono" color="muted">launch-plan.md</Text></div>
        <div className="trace-row">
          <Text size="sm" variant="label">Edit</Text>
          <Button variant="neutral" size="sm" aria-expanded={diff} aria-controls={diffId} onActivate={() => setDiff(!diff)}>
            <span className="trace-chip">
              <Text as="span" size="sm" variant="mono" color="muted">checklist.ts</Text>
              <Text as="span" size="sm" variant="mono" color="muted">+2</Text>
              <Text as="span" size="sm" variant="mono" color="muted">-1</Text>
            </span>
          </Button>
        </div>
        <div id={diffId} hidden={!diff}>
          <CodeBlock mode="diff" filename="checklist.ts" language="typescript" before={before} after={after} />
        </div>
      </Step>
    ),
  };
  return (
    <section className="trace" aria-label="Thinking trace">
      <style>{`
        .trace {
          max-inline-size: 32rem;
          margin-inline: auto;
          padding: var(--muxui-semantic-layout-inset-xlarge) var(--muxui-semantic-layout-viewport-inset);
        }

        /* The four kinds need more than a narrow page offers in one row, so the list wraps instead of overflowing. */
        .trace-kinds [role='tablist'] {
          flex-wrap: wrap;
        }

        .trace-step {
          padding-block-end: var(--muxui-semantic-layout-group-gap);
          border-block-end: 1px solid var(--muxui-semantic-border-faint);
        }

        .trace-title {
          display: inline-flex;
          align-items: center;
          gap: var(--muxui-semantic-layout-control-gap);
        }

        .trace-icon {
          flex: none;
          inline-size: 1rem;
          block-size: 1rem;
        }

        .trace-title[data-open='false'] .trace-chevron {
          transform: rotate(180deg);
        }

        .trace-detail {
          display: flex;
          flex-direction: column;
          gap: var(--muxui-semantic-layout-group-gap);
          padding-block-start: var(--muxui-semantic-layout-control-gap);
        }

        .trace-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--muxui-semantic-layout-control-content-gap);
        }

        .trace-chip {
          display: inline-flex;
          align-items: center;
          gap: var(--muxui-semantic-layout-control-content-gap);
        }

        .trace-results {
          display: flex;
          flex-direction: column;
          gap: var(--muxui-semantic-layout-control-gap);
          margin: 0;
          padding: 0;
          list-style: none;
        }
      `}</style>
      <Tabs
        className="trace-kinds"
        aria-label="Trace kind"
        variant="pill"
        size="sm"
        items={[
          { id: 'steps', label: 'Steps', panel: panels.steps },
          { id: 'reasoning', label: 'Reasoning', panel: panels.reasoning },
          { id: 'search', label: 'Search', panel: panels.search },
          { id: 'coding', label: 'Coding', panel: panels.coding },
        ]}
      />
    </section>
  );
}
