import { useId, useState } from 'react';
import { Table, Text, ToggleButton, ToggleButtonGroup } from '@muxui/react';

const tasks = [
  { id: 't1', task: 'Update the onboarding checklist', date: '2026-02-11', status: 'To do', owner: 'Operations' },
  { id: 't2', task: 'Review the draft outline', date: '2026-03-04', status: 'In progress', owner: 'Editorial' },
  { id: 't3', task: 'Schedule the quarterly check-in', date: '2026-03-18', status: 'To do', owner: 'Planning team' },
  { id: 't4', task: 'Archive last year files', date: '2026-01-27', status: 'Done', owner: 'Operations' },
  { id: 't5', task: 'Prepare the release notes', date: '2026-04-02', status: 'In progress', owner: 'Support' },
  { id: 't6', task: 'Confirm the vendor list', date: '2026-02-25', status: 'Done', owner: 'Review board' },
  { id: 't7', task: 'Draft the planning agenda', date: '2026-04-15', status: 'To do', owner: 'Planning team' },
  { id: 't8', task: 'Close the open questions', date: '2026-03-30', status: 'In progress', owner: 'Editorial' },
];

const filters = ['All', 'To do', 'In progress', 'Done'];

const columns = [
  { id: 'task', label: 'Task', isRowHeader: true },
  { id: 'date', label: 'Date' },
  { id: 'status', label: 'Status' },
  { id: 'owner', label: 'Owner' },
];

export function TaskFiltersStatusButtonsExample() {
  const titleId = useId();
  // Local presentation state only: the filter narrows placeholder rows already in memory.
  const [filter, setFilter] = useState('All');
  const matching = (status: string) => tasks.filter((task) => status === 'All' || task.status === status);
  return (
    <section className="tasks" aria-labelledby={titleId}>
      {/* The table scrolls sideways inside its own wrapper, so the page never does. */}
      <style>{`
        .tasks {
          display: flex;
          flex-direction: column;
          gap: var(--muxui-semantic-layout-section-gap);
          padding: var(--muxui-semantic-layout-inset-xlarge) var(--muxui-semantic-layout-viewport-inset);
        }

        .tasks-scroll {
          overflow-x: auto;
          padding: 0.375rem;
          margin: -0.375rem;
        }

        .tasks-scroll .muxui-table {
          min-inline-size: 32rem;
          white-space: nowrap;
        }
      `}</style>
      <Text as="h2" id={titleId} variant="heading" size="md">Tasks</Text>
      <ToggleButtonGroup aria-label="Filter by status" selectedIds={[filter]} disallowEmptySelection onSelectionChange={([next]) => { if (next) setFilter(next); }}>
        {filters.map((status) => <ToggleButton key={status} id={status}>{status} {matching(status).length}</ToggleButton>)}
      </ToggleButtonGroup>
      <div className="tasks-scroll">
        <Table aria-label="Tasks" columns={columns} rows={matching(filter)} />
      </div>
      <Text size="sm" color="muted" role="status">{matching(filter).length} of {tasks.length} tasks</Text>
    </section>
  );
}
