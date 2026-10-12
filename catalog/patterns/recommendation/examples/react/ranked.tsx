import { useId, useRef, useState } from 'react';
import { Button, Card, Meter, RadioGroup, Text } from '@muxui/react';

const Check = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const choices = [
  { value: 'lodge', label: 'Hold Sample Lodge', confidence: 0.86 },
  { value: 'loft', label: 'Switch to the harbor loft', confidence: 0.54 },
  { value: 'wait', label: 'Wait for more RSVPs', confidence: 0.21 },
];
const percent = (value: number) => `${Math.round(value * 100)}%`;

export function RecommendationRankedExample() {
  const id = useId();
  // Local presentation state only: accepting locks the choice and nothing is booked.
  const [value, setValue] = useState(choices[0].value);
  const [accepted, setAccepted] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  // Accept disables itself, so focus moves to the heading, which the status below then reports on.
  const accept = () => {
    setAccepted(true);
    heading.current?.focus();
  };
  const chosen = choices.find((choice) => choice.value === value) ?? choices[0];
  return (
    <section className="ranked" aria-labelledby={`${id}-title`}>
      <style>{`
        .ranked {
          max-inline-size: 26rem;
          margin-inline: auto;
          padding: var(--muxui-semantic-layout-inset-xlarge) var(--muxui-semantic-layout-viewport-inset);
        }

        .ranked-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: var(--muxui-semantic-layout-action-gap);
          inline-size: 100%;
        }

        .ranked-row > :last-child {
          flex: none;
        }

        .ranked-foot {
          flex-wrap: wrap;
        }

        .ranked-foot .ranked-meter {
          flex: 1 1 8rem;
          min-inline-size: 0;
        }

        .ranked-foot .ranked-accept {
          margin-inline-start: auto;
        }

        .ranked-label {
          display: inline-flex;
          align-items: center;
          gap: var(--muxui-semantic-layout-control-gap);
        }

        .ranked-hidden {
          position: absolute;
          inline-size: 1px;
          block-size: 1px;
          overflow: hidden;
          clip-path: inset(50%);
          white-space: nowrap;
        }
      `}</style>
      <Card.Root variant="elevated" padding="md">
        <Card.Header><Text as="h2" ref={heading} tabIndex={-1} id={`${id}-title`} variant="title" size="sm">Suggested venue for the team offsite</Text></Card.Header>
        <Card.Body>
          <RadioGroup
            aria-label="Options, best match first"
            value={value}
            disabled={accepted}
            onChange={setValue}
            options={choices.map((choice, index) => ({
              value: choice.value,
              label: (
                <span className="ranked-row">
                  <span>{choice.label}{index === 0 && <Text as="span" size="sm" color="muted"> Recommended</Text>}</span>
                  <Text as="span" size="sm" color="muted">{percent(choice.confidence)}</Text>
                </span>
              ),
            }))}
          />
        </Card.Body>
        <Card.Footer className="ranked-foot">
          <Meter className="ranked-meter" label="Confidence" value={chosen.confidence} minValue={0} maxValue={1} formatOptions={{ style: 'percent' }} />
          <Button className="ranked-accept" disabled={accepted} onActivate={accept}>{accepted ? <span className="ranked-label"><Check />Accepted</span> : 'Accept'}</Button>
          <Text className="ranked-hidden" role="status">{accepted ? `Accepted ${chosen.label}. Nothing was booked.` : ''}</Text>
        </Card.Footer>
      </Card.Root>
    </section>
  );
}
