import { useState } from 'react';
import { Button, Disclosure, PreviewTrigger, Text } from '@muxui/react';

// One stroke path per icon.
const icon = (path: string) => ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);
const Chevron = icon('m6 9 6 6 6-6');
const Think = icon('M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z');
const Write = icon('M4 20l1-4L16 5l3 3L8 19zM14 7l3 3');
const Run = icon('M4 7l5 5-5 5M12 18h8');
const File = icon('M6 3h8l4 4v14H6zM14 3v4h4');

const calls = [
  { id: 'c1', icon: Think, verb: 'Sketch a plan', target: 'Ordering the rollout steps', preview: 'Order: billing copy, export fix, announcement.' },
  { id: 'c2', icon: Write, verb: 'Update the page', target: 'rollout.tsx', mono: true, preview: 'export function Rollout() { return null; }' },
  { id: 'c3', icon: Run, verb: 'Check the release', target: 'run-checks release', mono: true, preview: 'All checks passed.' },
  { id: 'c4', icon: File, verb: 'Open the timeline', target: 'timeline.png', mono: true, preview: 'Timeline with four milestones.' },
];

export function AgentTraceToolCallsExample() {
  // Local presentation state only: the calls are placeholders and nothing runs.
  const [open, setOpen] = useState(true);
  return (
    <section className="calls" aria-label="Tool calls">
      <style>{`
        .calls {
          max-inline-size: 30rem;
          margin-inline: auto;
          padding: var(--muxui-semantic-layout-inset-xlarge) var(--muxui-semantic-layout-viewport-inset);
        }

        /* The header and the chips rest as plain text; the Disclosure fills its trigger and the Button
           fills a chip, so this block clears both. Unlayered CSS beats Mux UI whatever its specificity,
           so the header's hover and press fills are restated below. */
        .calls .calls-disclosure button[aria-expanded] {
          background-color: transparent;
        }

        .calls .calls-disclosure > button[aria-expanded]:hover {
          background-color: var(--muxui-semantic-action-neutral-background-hover);
        }

        .calls .calls-disclosure > button[aria-expanded]:active {
          background-color: var(--muxui-semantic-action-neutral-background-pressed);
        }

        .calls-title {
          display: inline-flex;
          align-items: center;
          gap: var(--muxui-semantic-layout-control-gap);
        }

        .calls-icon {
          flex: none;
          inline-size: 1rem;
          block-size: 1rem;
        }

        .calls-title[data-open='false'] .calls-icon {
          transform: rotate(-90deg);
        }

        .calls-list {
          display: grid;
          gap: var(--muxui-semantic-layout-group-gap);
          margin: 0;
          padding: var(--muxui-semantic-layout-inset-small) 0 0;
          list-style: none;
        }

        .calls-row {
          display: flex;
          align-items: center;
          gap: var(--muxui-semantic-layout-control-content-gap);
          min-inline-size: 0;
        }

        .calls-row .calls-chip {
          min-inline-size: 0;
          max-inline-size: 100%;
        }
      `}</style>
      <Disclosure
        className="calls-disclosure"
        expanded={open}
        onExpandedChange={setOpen}
        title={<span className="calls-title" data-open={open}><Chevron className="calls-icon" />4 steps</span>}
      >
        <ul className="calls-list">
          {calls.map(({ id, icon: Icon, verb, target, mono, preview }) => (
            <li className="calls-row" key={id}>
              <Icon className="calls-icon" />
              <Text variant="label">{verb}</Text>
              <PreviewTrigger
                aria-label={`${verb} preview`}
                trigger={<Button className="calls-chip" variant="neutral" size="sm"><Text as="span" size="sm" variant={mono ? 'mono' : 'body'} color="muted" truncate>{target}</Text></Button>}
              >
                {mono ? <Text as="span" size="sm" variant="mono">{preview}</Text> : preview}
              </PreviewTrigger>
            </li>
          ))}
        </ul>
      </Disclosure>
    </section>
  );
}
