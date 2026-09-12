import { Table } from '@muxui/react';
export function BasicTableExample() {
  return <Table aria-label="People" columns={[
    { id: 'name', label: 'Name', isRowHeader: true },
    { id: 'role', label: 'Role' },
  ]} rows={[
    { id: 'ada', name: 'Ada Lovelace', role: 'Mathematician' },
    { id: 'grace', name: 'Grace Hopper', role: 'Computer scientist' },
    { id: 'margaret', name: 'Margaret Hamilton', role: 'Software engineer' },
  ]} />;
}
