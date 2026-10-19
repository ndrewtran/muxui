import { useState } from 'react';
import { Table } from '@muxui/react';
import type { MuxUITableSortDescriptor } from '@muxui/react';

type Person = { id: string; name: string; role: string };

const people: Person[] = [
  { id: 'ada', name: 'Ada Lovelace', role: 'Mathematician' },
  { id: 'grace', name: 'Grace Hopper', role: 'Computer scientist' },
  { id: 'margaret', name: 'Margaret Hamilton', role: 'Software engineer' },
];

const columns = [
  { id: 'name', label: 'Name', isRowHeader: true, sortable: true },
  { id: 'role', label: 'Role', sortable: true },
];

const readers: Record<string, (person: Person) => string> = {
  name: (person) => person.name,
  role: (person) => person.role,
};

export function SortableTableExample() {
  const [sort, setSort] = useState<MuxUITableSortDescriptor>({ column: 'name', direction: 'ascending' });
  // Table shows the rows in the order it receives them, so the application sorts them.
  const read = readers[sort.column];
  const direction = sort.direction === 'ascending' ? 1 : -1;
  const rows = [...people].sort((a, b) => direction * read(a).localeCompare(read(b)));
  return (
    <Table
      aria-label="People"
      columns={columns}
      rows={rows}
      selectionMode="single"
      defaultSelectedIds={['grace']}
      sortDescriptor={sort}
      onSortChange={setSort}
    />
  );
}
