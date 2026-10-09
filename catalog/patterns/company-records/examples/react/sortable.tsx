import { useId, useState } from 'react';
import { Button, Menu, SearchField, Table, TagGroup, Text } from '@muxui/react';

type Sort = { column: string; direction: 'ascending' | 'descending' };

const levels = ['Dormant', 'New', 'Developing', 'Established'];

const companies = [
  { id: 'c1', name: 'Demo Partners', city: 'Lisbon', tags: ['Partner', 'Priority'], contact: '2026-03-02', relationship: 'Established' },
  { id: 'c2', name: 'Example Holdings', city: 'Osaka', tags: ['Vendor'], contact: '2025-11-19', relationship: 'Dormant' },
  { id: 'c3', name: 'Generic Supply', city: 'Nairobi', tags: ['Trial', 'Regional'], contact: '2026-04-21', relationship: 'Developing' },
  { id: 'c4', name: 'Placeholder Studio', city: 'Denver', tags: ['Partner'], contact: '2026-01-08', relationship: 'New' },
  { id: 'c5', name: 'Sample Company', city: 'Hobart', tags: ['Vendor', 'Priority', 'Regional'], contact: '2026-05-06', relationship: 'Established' },
  { id: 'c6', name: 'Sample Logistics', city: 'Gdansk', tags: ['Trial'], contact: '2025-09-30', relationship: 'Dormant' },
];

const columns = [
  { id: 'name', label: 'Name', isRowHeader: true, sortable: true },
  { id: 'city', label: 'City' },
  { id: 'tags', label: 'Tags' },
  { id: 'contact', label: 'Last contact', sortable: true },
  { id: 'relationship', label: 'Relationship', sortable: true },
  { id: 'actions', label: 'Actions' },
];

const sortValue = (company: (typeof companies)[number], column: string) => (
  column === 'relationship' ? String(levels.indexOf(company.relationship)) : column === 'contact' ? company.contact : company.name
);

export function CompanyRecordsSortableExample() {
  const titleId = useId();
  // Local presentation state only: the rows are placeholders and are never edited, fetched, or saved.
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>({ column: 'name', direction: 'ascending' });
  const [selected, setSelected] = useState<'all' | string[]>(['c2', 'c4']);
  const rows = companies
    .filter((company) => company.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => sortValue(a, sort.column).localeCompare(sortValue(b, sort.column)) * (sort.direction === 'ascending' ? 1 : -1))
    .map((company) => ({
      ...company,
      tags: <TagGroup aria-label={`Tags for ${company.name}`} items={company.tags} />,
      actions: (
        <Menu.Root>
          <Menu.Trigger className="records-menu" aria-label={`Actions for ${company.name}`}>
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
              <circle cx="3" cy="8" r="1.25" />
              <circle cx="8" cy="8" r="1.25" />
              <circle cx="13" cy="8" r="1.25" />
            </svg>
          </Menu.Trigger>
          <Menu.Popup>
            <Menu.List aria-label={`Actions for ${company.name}`} items={['Open', 'Add note', 'Archive']} />
          </Menu.Popup>
        </Menu.Root>
      ),
    }));
  const count = selected === 'all' ? rows.length : rows.filter((row) => selected.includes(row.id)).length;
  return (
    <section className="records" aria-labelledby={titleId}>
      {/* The table scrolls sideways inside its own wrapper, so the page never does. */}
      <style>{`
        .records {
          display: flex;
          flex-direction: column;
          gap: var(--muxui-semantic-layout-section-gap);
          padding: var(--muxui-semantic-layout-inset-xlarge) var(--muxui-semantic-layout-viewport-inset);
        }

        .records-bar, .records-tools {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--muxui-semantic-layout-section-gap);
        }

        .records-bar {
          justify-content: space-between;
        }

        .records-tools .records-search {
          flex: 1 1 14rem;
          max-inline-size: 22rem;
        }

        .records-scroll {
          overflow-x: auto;
          padding: 0.375rem;
          margin: -0.375rem;
        }

        .records-scroll .muxui-table {
          min-inline-size: 44rem;
          white-space: nowrap;
        }

        .records-menu {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          inline-size: 2rem;
          block-size: 2rem;
          padding: 0;
          border: 0;
          border-radius: var(--muxui-semantic-control-radius);
          background: transparent;
          color: var(--muxui-semantic-content-default);
        }

        .records-menu:hover {
          background-color: var(--muxui-semantic-action-neutral-background-hover);
        }

        .records-menu:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px var(--muxui-semantic-focus-inner), 0 0 0 4px var(--muxui-semantic-focus-ring);
        }
      `}</style>
      <div className="records-bar">
        <Text as="h2" id={titleId} variant="heading" size="md">Companies</Text>
        <div className="records-tools">
          <SearchField className="records-search" aria-label="Search companies" placeholder="Search companies" value={query} onChange={setQuery} />
          <Text size="sm" color="muted" role="status">{count} selected</Text>
          <Button variant="neutral" disabled={count === 0}>Add to list</Button>
        </div>
      </div>
      <div className="records-scroll">
        <Table aria-label="Companies" columns={columns} rows={rows} selectionMode="multiple" selectedIds={selected} onSelectionChange={setSelected} sortDescriptor={sort} onSortChange={setSort} />
      </div>
      {rows.length === 0 && <Text as="p" color="muted">No companies match this search</Text>}
    </section>
  );
}
