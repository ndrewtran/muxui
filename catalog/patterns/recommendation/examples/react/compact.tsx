import { useId, useRef, useState } from 'react';
import { Avatar, Button, Card, Meter, Text } from '@muxui/react';

// One stroke path per icon.
const icon = (path: string) => () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);
const Down = icon('m6 9 6 6 6-6');
const Check = icon('M20 6 9 17l-5-5');

const alternatives = [
  { id: 'a1', label: 'Switch to the harbor loft', confidence: 0.54 },
  { id: 'a2', label: 'Wait for more RSVPs', confidence: 0.21 },
];
const percent = (value: number) => `${Math.round(value * 100)}%`;

export function RecommendationCompactExample() {
  const id = useId();
  // Local presentation state only: accepting marks the card and nothing is booked.
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  // Accept disables itself, so focus moves to the heading, which the status below then reports on.
  const accept = () => {
    setAccepted(true);
    heading.current?.focus();
  };
  return (
    <section className="reco" aria-labelledby={`${id}-title`}>
      <style>{`
        .reco {
          max-inline-size: 26rem;
          margin-inline: auto;
          padding: var(--muxui-semantic-layout-inset-xlarge) var(--muxui-semantic-layout-viewport-inset);
        }

        .reco-source {
          display: inline-flex;
          align-items: center;
          gap: var(--muxui-semantic-layout-control-gap);
          vertical-align: middle;
          padding: var(--muxui-semantic-layout-micro-gap) var(--muxui-semantic-layout-inset-small) var(--muxui-semantic-layout-micro-gap) var(--muxui-semantic-layout-micro-gap);
          border: 1px solid var(--muxui-semantic-border-default);
          border-radius: var(--muxui-semantic-shape-pill-radius);
          color: var(--muxui-semantic-content-default);
        }

        .reco-value {
          display: inline-block;
          padding: 0 var(--muxui-semantic-layout-inset-small);
          border: 1px solid var(--muxui-semantic-status-success);
          border-radius: var(--muxui-semantic-shape-radius-s);
          background-color: var(--muxui-semantic-surface-subtle);
          color: var(--muxui-semantic-content-default);
        }

        .reco-more {
          display: grid;
          gap: var(--muxui-semantic-layout-tight-gap);
          margin: var(--muxui-semantic-layout-section-gap) 0 0;
          padding: var(--muxui-semantic-layout-section-gap) 0 0;
          border-block-start: 1px solid var(--muxui-semantic-border-faint);
          list-style: none;
        }

        .reco-more li {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: var(--muxui-semantic-layout-action-gap);
        }

        .reco-foot {
          flex-wrap: wrap;
        }

        .reco-foot .reco-meter {
          flex: 1 1 8rem;
          min-inline-size: 0;
        }

        .reco-actions {
          display: flex;
          gap: var(--muxui-semantic-layout-tight-gap);
          margin-inline-start: auto;
        }

        .reco-label {
          display: inline-flex;
          align-items: center;
          gap: var(--muxui-semantic-layout-control-gap);
        }

        .reco-more-toggle[aria-expanded='true'] svg {
          rotate: 180deg;
        }

        .reco-hidden {
          position: absolute;
          inline-size: 1px;
          block-size: 1px;
          overflow: hidden;
          clip-path: inset(50%);
          white-space: nowrap;
        }
      `}</style>
      <Card.Root variant="elevated" padding="md">
        <Card.Header><Text as="h2" ref={heading} tabIndex={-1} id={`${id}-title`} variant="title" size="sm">Want me to book the team offsite?</Text></Card.Header>
        <Card.Body>
          <Text color="muted">
            Hold the lakeside lodge from <span className="reco-source"><Avatar.Root size="sm" aria-hidden="true"><Avatar.Fallback>L</Avatar.Fallback></Avatar.Root>Larch Lodge</span> with a deposit due in <span className="reco-value">5 days</span>
          </Text>
          {open && (
            <ul className="reco-more" id={`${id}-more`} aria-label="Alternatives">
              {alternatives.map((item) => (
                <li key={item.id}><Text>{item.label}</Text><Text size="sm" color="muted">{percent(item.confidence)}</Text></li>
              ))}
            </ul>
          )}
        </Card.Body>
        <Card.Footer className="reco-foot">
          <Meter className="reco-meter" label="Confidence" value={0.86} minValue={0} maxValue={1} formatOptions={{ style: 'percent' }} />
          <div className="reco-actions">
            <Button className="reco-more-toggle" variant="neutral" aria-expanded={open} aria-controls={`${id}-more`} onActivate={() => setOpen(!open)}><span className="reco-label">Alternatives<Down /></span></Button>
            <Button disabled={accepted} onActivate={accept}>{accepted ? <span className="reco-label"><Check />Accepted</span> : 'Accept'}</Button>
          </div>
          <Text className="reco-hidden" role="status">{accepted ? 'Accepted. Nothing was booked.' : ''}</Text>
        </Card.Footer>
      </Card.Root>
    </section>
  );
}
