import { useState } from 'react';
import { ListBox, RadioGroup, type MuxUISelection } from '@muxui/react';

const densities = [
  { id: 'compact', label: 'Compact' },
  { id: 'comfortable', label: 'Comfortable' },
  { id: 'spacious', label: 'Spacious' },
];

const templates = [
  { id: 'blank', title: 'Blank', detail: 'Start from an empty page' },
  { id: 'report', title: 'Weekly report', detail: 'Progress, risks, and next steps' },
  { id: 'brief', title: 'Project brief', detail: 'Goals, scope, and owners' },
  { id: 'retro', title: 'Retrospective', detail: 'What worked and what to change' },
  { id: 'plan', title: 'Launch plan', detail: 'Milestones and checklists' },
  { id: 'notes', title: 'Meeting notes', detail: 'Agenda, decisions, and actions' },
  { id: 'proposal', title: 'Proposal', detail: 'Problem, options, and a recommendation' },
  { id: 'onboarding', title: 'Onboarding guide', detail: 'First week for a new teammate' },
  { id: 'changelog', title: 'Changelog', detail: 'Release notes by version' },
];

export function SingleChoiceListBoxExample() {
  const [density, setDensity] = useState('comfortable');
  const [listed, setListed] = useState<MuxUISelection>(['comfortable']);
  const [template, setTemplate] = useState<MuxUISelection>(['report']);

  return (
    <div style={{ display: 'grid', gap: 'var(--muxui-reference-dimension-space-m)' }}>
      <div>
        <h3>Three short options to scan together: RadioGroup</h3>
        {/* A form field with a name, so a form submits the chosen value. A choice, once made, stays made. */}
        <RadioGroup
          label="Density"
          name="density"
          value={density}
          onChange={setDensity}
          options={densities.map(({ id, label }) => ({ value: id, label }))}
        />
        <p>Chosen: {density}</p>
      </div>
      <div>
        <h3>The same three as a ListBox</h3>
        {/* It selects one option too, but it is not a form field and a click on the selected option clears it. */}
        <ListBox aria-label="Density" items={densities} selectedIds={listed} onSelectionChange={setListed} />
        <p>Selected: {listed === 'all' || listed.length === 0 ? 'nothing' : listed.join(', ')}</p>
      </div>
      <div>
        <h3>Rich options in a longer list: ListBox</h3>
        {/* Each option carries a detail line, and the list scrolls, which a radio group would not fit. */}
        <ListBox.Root aria-label="Template" selectedIds={template} onSelectionChange={setTemplate}>
          {templates.map((item) => (
            <ListBox.Item key={item.id} id={item.id} textValue={item.title}>
              <span style={{ display: 'grid' }}>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </span>
            </ListBox.Item>
          ))}
        </ListBox.Root>
        <p>Selected: {template === 'all' || template.length === 0 ? 'nothing' : template.join(', ')}</p>
      </div>
    </div>
  );
}
