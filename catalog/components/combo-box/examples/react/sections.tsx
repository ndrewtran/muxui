import { useState } from 'react';
import { ComboBox } from '@muxui/react';

// Each section is a named group: its title names it for assistive technology, and a section with no match is hidden.
const sections = [
  { id: 'recent', title: 'Recent', items: [{ id: 'design', label: 'Design' }, { id: 'research', label: 'Research' }] },
  { id: 'all-teams', title: 'All teams', items: [{ id: 'finance', label: 'Finance' }, { id: 'legal', label: 'Legal' }, { id: 'support', label: 'Support' }] },
];

export function ComboBoxSectionsExample() {
  const [team, setTeam] = useState('');
  return (
    <>
      <ComboBox label="Team" name="team" sections={sections} onSelect={(item) => setTeam(item?.id ?? '')} />
      <output>{team}</output>
    </>
  );
}
