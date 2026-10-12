import { useId } from 'react';
import { Avatar, Card, Link, PreviewTrigger, Separator, Text } from '@muxui/react';

// One stroke path per icon.
const icon = (path: string) => ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);
const Lines = icon('M4 6h16M4 12h16M4 18h10');
const Out = icon('M7 17 17 7M8 7h9v9');

const chunks = [
  { id: 'k1', title: 'Rollout approval rule', size: '312 characters', text: 'A rollout needs sign-off from billing and support before the announcement goes out to customers.', file: 'Rollout Policy.pdf', kind: 'PDF', where: 'Policies, page 4' },
  { id: 'k2', title: 'Ticket age summary', size: '1,180 characters', text: 'Open tickets older than two days: billing 3, export 2, sign-in 1. Escalate anything older than five days.', file: 'Ticket Ages.csv', kind: 'CSV', where: 'Support exports, rows 2 to 9' },
];

export function ContextSourcesExcerptsExample() {
  const titleId = useId();
  // The excerpts and the count are placeholders for your own retrieved text; nothing is fetched.
  return (
    <section className="context" aria-labelledby={titleId}>
      <style>{`
        .context {
          display: flex;
          flex-direction: column;
          gap: var(--muxui-semantic-layout-group-gap);
          max-inline-size: 32rem;
          margin-inline: auto;
          padding: var(--muxui-semantic-layout-inset-xlarge) var(--muxui-semantic-layout-viewport-inset);
        }

        .context-head {
          display: flex;
          align-items: center;
          gap: var(--muxui-semantic-layout-control-content-gap);
        }

        .context-count {
          padding: 0 var(--muxui-semantic-layout-inset-tight);
          border: 1px solid var(--muxui-semantic-border-default);
          border-radius: var(--muxui-semantic-shape-radius-s);
          font-variant-numeric: tabular-nums;
        }

        .context-list {
          display: grid;
          gap: var(--muxui-semantic-layout-group-gap);
          margin: 0;
          padding: 0;
          list-style: none;
        }

        /* The card keeps its own surface and border; the rows inside carry the padding. */
        .context-list .context-card {
          padding: 0;
        }

        .context-top {
          display: flex;
          align-items: center;
          gap: var(--muxui-semantic-layout-control-content-gap);
          padding: var(--muxui-semantic-layout-inset-small) var(--muxui-semantic-layout-inset-medium);
        }

        .context-icon {
          flex: none;
          inline-size: 1rem;
          block-size: 1rem;
        }

        .context-size {
          margin-inline-start: auto;
          text-align: end;
        }

        .context-body {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: var(--muxui-semantic-layout-group-gap);
          padding: var(--muxui-semantic-layout-inset-medium);
        }

        .context-body .context-source {
          display: inline-flex;
          align-items: center;
          gap: var(--muxui-semantic-layout-control-gap);
          max-inline-size: 100%;
          padding: var(--muxui-semantic-layout-micro-gap) var(--muxui-semantic-layout-inset-small) var(--muxui-semantic-layout-micro-gap) var(--muxui-semantic-layout-micro-gap);
          border: 1px solid var(--muxui-semantic-border-default);
          border-radius: var(--muxui-semantic-shape-pill-radius);
          text-decoration: none;
        }

        .context-source .context-file {
          text-decoration: underline;
        }

        /* The file type reads as a short label, so the mark grows to fit it. */
        .context-source .context-kind {
          inline-size: auto;
          min-inline-size: var(--muxui-semantic-control-size-sm);
          padding-inline: var(--muxui-semantic-layout-inset-tight);
        }
      `}</style>
      <div className="context-head">
        <Text as="h2" id={titleId} variant="title" size="md">All chunks</Text>
        <Text as="span" size="sm" className="context-count">32</Text>
      </div>
      <ul className="context-list">
        {chunks.map((chunk) => (
          <li key={chunk.id}>
            <Card.Root className="context-card" variant="outlined">
              <div className="context-top">
                <Lines className="context-icon" />
                <Text as="h3" variant="label">{chunk.title}</Text>
                <Text size="sm" color="muted" className="context-size">{chunk.size}</Text>
              </div>
              <Separator />
              <div className="context-body">
                <Text color="muted">{chunk.text}</Text>
                <PreviewTrigger
                  aria-label={`${chunk.file} location`}
                  trigger={(
                    <Link className="context-source" href="#source">
                      <Avatar.Root className="context-kind" size="sm" aria-hidden="true"><Avatar.Fallback>{chunk.kind}</Avatar.Fallback></Avatar.Root>
                      <span className="context-file">{chunk.file}</span>
                      <Out className="context-icon" />
                    </Link>
                  )}
                >
                  {chunk.where}
                </PreviewTrigger>
              </div>
            </Card.Root>
          </li>
        ))}
      </ul>
    </section>
  );
}
