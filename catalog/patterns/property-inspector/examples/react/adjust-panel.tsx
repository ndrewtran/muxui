import { useId, useState } from 'react';
import { Button, Card, NumberField, Select, Separator, Text, ToggleButton, ToggleButtonGroup } from '@muxui/react';

// One stroke path per icon.
const icon = (path: string) => () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);
const Spark = icon('M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z');
const Check = icon('m5 12 5 5 9-10');
const Row = icon('M3 9h4v6H3zM10 9h4v6h-4zM17 9h4v6h-4z');
const Column = icon('M9 3h6v4H9zM9 10h6v4H9zM9 17h6v4H9z');
const Grid = icon('M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7h-7zM13 13h7v7h-7z');

const initial = { layout: 'row', width: 480, height: 120, radius: 16, opacity: 1, type: undefined as string | undefined };
type Properties = typeof initial;
const sizes = [['width', 'Width'], ['height', 'Height'], ['radius', 'Radius']] as const;

export function PropertyInspectorAdjustPanelExample() {
  const id = useId();
  // Local presentation state only: the properties edit placeholder values and are never saved.
  const [values, setValues] = useState<Properties>(initial);
  const [edited, setEdited] = useState(false);
  const edit = (change: Partial<Properties>) => {
    setValues({ ...values, ...change });
    setEdited(true);
  };
  return (
    <section className="inspector" aria-labelledby={`${id}-title`}>
      <style>{`
        .inspector {
          max-inline-size: 22rem;
          margin-inline: auto;
          padding: var(--muxui-semantic-layout-inset-xlarge) var(--muxui-semantic-layout-viewport-inset);
        }

        /* The card keeps its own surface and border; each section inside carries the padding. */
        .inspector .inspector-card {
          padding: 0;
        }

        .inspector-section {
          display: flex;
          flex-direction: column;
          gap: var(--muxui-semantic-layout-group-gap);
          padding: var(--muxui-semantic-layout-inset-medium);
        }

        .inspector-head, .inspector-type, .inspector-state {
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          gap: var(--muxui-semantic-layout-action-gap);
        }

        .inspector-state {
          display: flex;
        }

        .inspector-edited {
          display: inline-flex;
          align-items: center;
          gap: var(--muxui-semantic-layout-control-gap);
        }

        .inspector-adjust {
          display: inline-flex;
          align-items: center;
          gap: var(--muxui-semantic-layout-control-gap);
        }

        .inspector-edited svg {
          color: var(--muxui-semantic-status-success);
        }

        .inspector-section .inspector-layout {
          display: flex;
          inline-size: 100%;
        }

        .inspector-layout .inspector-option {
          flex: 1 1 0;
        }

        .inspector-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--muxui-semantic-layout-group-gap);
        }
      `}</style>
      <Card.Root className="inspector-card" variant="outlined">
        <div className="inspector-section inspector-head">
          <Text as="h2" id={`${id}-title`} variant="label">Promo banner</Text>
          <div className="inspector-state">
            {edited && <Text className="inspector-edited" size="sm" role="status"><Check />Edited</Text>}
            <Button variant="ghost" size="sm" onActivate={() => (edited ? (setValues(initial), setEdited(false)) : setEdited(true))}>
              {edited ? 'Reset' : <span className="inspector-adjust"><Spark />Adjust</span>}
            </Button>
          </div>
        </div>
        <Separator />
        <div className="inspector-section">
          <Text as="h3" variant="label">Layout</Text>
          <ToggleButtonGroup className="inspector-layout" aria-label="Layout" disallowEmptySelection selectedIds={[values.layout]} onSelectionChange={([layout]) => edit({ layout })}>
            <ToggleButton className="inspector-option" id="row" aria-label="Row"><Row /></ToggleButton>
            <ToggleButton className="inspector-option" id="column" aria-label="Column"><Column /></ToggleButton>
            <ToggleButton className="inspector-option" id="grid" aria-label="Grid"><Grid /></ToggleButton>
          </ToggleButtonGroup>
          <div className="inspector-grid">
            {sizes.map(([key, label]) => (
              <NumberField key={key} label={label} size="sm" value={values[key]} onChange={(value) => edit({ [key]: value })} minValue={0} />
            ))}
            <NumberField label="Opacity" size="sm" value={values.opacity} onChange={(opacity) => edit({ opacity })} minValue={0} maxValue={1} step={0.05} formatOptions={{ style: 'percent' }} />
          </div>
        </div>
        <Separator />
        <div className="inspector-section inspector-type">
          <Text id={`${id}-type`} color="muted">Type</Text>
          <Select aria-labelledby={`${id}-type`} size="sm" placeholder="Select type" items={['Standard', 'Compact', 'Wide']} value={values.type ?? ''} onChange={(type) => edit({ type })} />
        </div>
      </Card.Root>
    </section>
  );
}
