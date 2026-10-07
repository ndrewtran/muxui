import { useId, useState } from 'react';
import { Button, Card, Text, ToggleButton, ToggleButtonGroup } from '@muxui/react';

type Period = 'monthly' | 'annual';

const plans = [
  { id: 'starter', name: 'Starter', price: ['$0', '$0'], unit: 'per month', note: ['No card needed', 'No card needed'], summary: 'For individuals and small experiments.', features: ['1 project', '3 members', 'Community support', 'Basic analytics'], cta: 'Start free' },
  { id: 'team', name: 'Team', recommended: true, price: ['$20', '$16'], unit: 'per seat per month', note: ['Billed monthly', 'Billed yearly'], summary: 'For small teams shipping every week.', features: ['10 projects', '25 members', 'Email support', 'Advanced analytics', 'Audit log'], cta: 'Choose Team' },
  { id: 'scale', name: 'Scale', price: ['$50', '$40'], unit: 'per seat per month', note: ['Billed monthly', 'Billed yearly'], summary: 'For organizations with shared standards.', features: ['Unlimited projects', 'Unlimited members', 'Priority support', 'Advanced analytics', 'Audit log', 'Single sign-on'], cta: 'Choose Scale' },
];

export function PricingPlansColumnsExample() {
  const titleId = useId();
  // Local presentation state only: the toggle swaps the displayed prices.
  const [period, setPeriod] = useState<Period>('monthly');
  const column = period === 'monthly' ? 0 : 1;
  return (
    <div className="pricing-frame">
      {/* One column below 44rem of container width, the recommended plan first; three columns from 44rem. */}
      <style>{`
        .pricing-frame {
          container-type: inline-size;
          inline-size: 100%;
        }

        .pricing {
          display: flex;
          flex-direction: column;
          gap: var(--muxui-semantic-layout-inset-xlarge);
          padding: var(--muxui-semantic-layout-inset-xlarge) var(--muxui-semantic-layout-viewport-inset);
        }

        .pricing-head {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          justify-content: space-between;
          gap: var(--muxui-semantic-layout-section-gap);
        }

        .pricing-period {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--muxui-semantic-layout-action-gap);
        }

        .pricing-plans {
          display: grid;
          gap: var(--muxui-semantic-layout-section-gap);
        }

        /* A heavier top rule marks the recommended plan, which leads when the plans stack. */
        .pricing-plans .pricing-plan--recommended {
          order: -1;
          border-block-start: 2px solid var(--muxui-semantic-border-emphasis);
        }

        .pricing-stack {
          display: flex;
          flex-direction: column;
          gap: var(--muxui-semantic-layout-action-gap);
        }

        .pricing-body {
          margin-block-start: var(--muxui-semantic-layout-section-gap);
        }

        .pricing-name {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          justify-content: space-between;
          gap: var(--muxui-semantic-layout-tight-gap);
        }

        .pricing-price {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: var(--muxui-semantic-layout-tight-gap);
        }

        .pricing-features {
          display: flex;
          flex-direction: column;
          gap: var(--muxui-semantic-layout-action-gap);
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .pricing-features li {
          display: flex;
          align-items: baseline;
          gap: var(--muxui-semantic-layout-action-gap);
        }

        .pricing-check {
          flex: none;
          inline-size: 1em;
          block-size: 1em;
          align-self: center;
          fill: none;
          stroke: currentColor;
          stroke-width: 2;
        }

        .pricing-plans .pricing-action {
          inline-size: 100%;
        }

        @container (min-width: 44rem) {
          .pricing-plans {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .pricing-plans .pricing-plan--recommended {
            order: 0;
          }
        }
      `}</style>
      <section className="pricing" aria-labelledby={titleId}>
        <header className="pricing-head">
          <div>
            <Text as="h2" id={titleId} variant="heading" size="lg">Plans for every team</Text>
            <Text as="p" color="muted">Start free and upgrade when you need more.</Text>
          </div>
          <div className="pricing-period">
            <ToggleButtonGroup
              aria-label="Billing period"
              selectedIds={[period]}
              disallowEmptySelection
              onSelectionChange={([next]) => {
                if (next === 'monthly' || next === 'annual') setPeriod(next);
              }}
            >
              <ToggleButton id="monthly">Monthly</ToggleButton>
              <ToggleButton id="annual">Annual</ToggleButton>
            </ToggleButtonGroup>
            <Text size="sm" color="muted">Annual saves 20%</Text>
          </div>
        </header>
        <div className="pricing-plans">
          {plans.map((plan) => (
            <Card.Root key={plan.id} className={plan.recommended ? 'pricing-plan pricing-plan--recommended' : 'pricing-plan'}>
              <Card.Header className="pricing-stack">
                <div className="pricing-name">
                  <Text as="h3" variant="title" size="md">{plan.name}</Text>
                  {plan.recommended && <Text variant="label" size="sm">Recommended</Text>}
                </div>
                <div className="pricing-price">
                  <Text variant="display" size="sm">{plan.price[column]}</Text>
                  <Text size="sm" color="muted">{plan.unit}</Text>
                </div>
                <Text as="p" size="sm" color="muted">{plan.note[column]}</Text>
              </Card.Header>
              <Card.Body className="pricing-stack pricing-body">
                <Text as="p" size="sm" color="muted">{plan.summary}</Text>
                <ul className="pricing-features">
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <svg className="pricing-check" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8.5l3.5 3.5L13 4.5" /></svg>
                      <Text>{feature}</Text>
                    </li>
                  ))}
                </ul>
              </Card.Body>
              <Card.Footer>
                <Button className="pricing-action" variant={plan.recommended ? 'primary' : 'neutral'}>{plan.cta}</Button>
              </Card.Footer>
            </Card.Root>
          ))}
        </div>
      </section>
    </div>
  );
}
