import { Table } from '@muxui/react';

const columns = [
  { id: 'name', label: 'Name', isRowHeader: true },
  { id: 'role', label: 'Role' },
  { id: 'team', label: 'Team' },
  { id: 'location', label: 'Location' },
  { id: 'started', label: 'Started' },
];

const rows = [
  { id: 'ada', name: 'Ada Lovelace', role: 'Mathematician', team: 'Analytical Engine', location: 'London', started: '1833' },
  { id: 'grace', name: 'Grace Hopper', role: 'Computer scientist', team: 'Compilers', location: 'Arlington', started: '1944' },
  { id: 'margaret', name: 'Margaret Hamilton', role: 'Software engineer', team: 'Apollo guidance', location: 'Cambridge', started: '1960' },
];

export function ScrollingTableExample() {
  return (
    <>
      {/* To compare across columns, keep every column. The wrapper scrolls and the Table keeps a minimum width. */}
      <style>{`
        .table-scroller {
          overflow-x: auto;
          max-inline-size: 100%;
        }

        .table-scroller .wide-table {
          min-inline-size: 40rem;
        }
      `}</style>
      <div className="table-scroller" style={{ maxWidth: '20rem' }}>
        <Table aria-label="People" className="wide-table" columns={columns} rows={rows} />
      </div>
    </>
  );
}
