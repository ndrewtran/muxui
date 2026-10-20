import { useState } from 'react';
import { ListBox, type MuxUISelection } from '@muxui/react';

const areas = [
  { id: 'design-system', title: 'Design system', detail: 'Tokens, components, and guidance' },
  { id: 'product-research', title: 'Product research', detail: 'Interviews, surveys, and findings' },
  { id: 'release-notes', title: 'Release notes', detail: 'What changed in each version' },
  { id: 'accessibility', title: 'Accessibility reviews', detail: 'Audits and fixes by team' },
  { id: 'brand', title: 'Brand', detail: 'Logos, colour, and voice' },
  { id: 'support', title: 'Support articles', detail: 'Help for customers' },
  { id: 'roadmap', title: 'Roadmap', detail: 'Plans for the next two quarters' },
  { id: 'handbook', title: 'Engineering handbook', detail: 'How the teams build and ship' },
  { id: 'partners', title: 'Partner docs', detail: 'Guides for integrations' },
  { id: 'legal', title: 'Legal', detail: 'Terms, privacy, and licences' },
];

export function RichListBoxExample() {
  const [selectedIds, setSelectedIds] = useState<MuxUISelection>(['design-system', 'roadmap']);

  return (
    <>
      {/* Each option has a title and a detail line. The list scrolls once its options pass its maximum height. */}
      <ListBox.Root
        aria-label="Workspace areas"
        selectionMode="multiple"
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      >
        {areas.map((area) => (
          <ListBox.Item key={area.id} id={area.id} textValue={area.title}>
            <span style={{ display: 'grid' }}>
              <strong>{area.title}</strong>
              <span>{area.detail}</span>
            </span>
          </ListBox.Item>
        ))}
      </ListBox.Root>
      <p>{selectedIds === 'all' ? 'All areas' : `${selectedIds.length} selected`}</p>
    </>
  );
}
