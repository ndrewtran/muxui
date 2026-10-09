import { useId, useRef, useState } from 'react';
import { Button, SearchField, Select, Table, TagGroup, Text } from '@muxui/react';

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

const statuses = [{ id: 'all', label: 'Any status' }, 'To do', 'In progress', 'Done'];

const columns = [
  { id: 'task', label: 'Task', isRowHeader: true },
  { id: 'date', label: 'Date' },
  { id: 'status', label: 'Status' },
  { id: 'owner', label: 'Owner' },
];

export function TaskFiltersFilterBarExample() {
  const titleId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  // Local presentation state only: the filters narrow placeholder rows already in memory.
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const rows = tasks.filter((task) => task.task.toLowerCase().includes(query.trim().toLowerCase()) && (status === 'all' || task.status === status));
  const active = [...(query ? [{ id: 'query', label: `Task: ${query}` }] : []), ...(status === 'all' ? [] : [{ id: 'status', label: `Status: ${status}` }])];
  // Removing the last filter unmounts its tags and disables Clear filters, so focus moves to the search field.
  const clear = () => {
    setQuery('');
    setStatus('all');
    searchRef.current?.focus();
  };
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

        .tasks-bar, .tasks-meta {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--muxui-semantic-layout-action-gap);
        }

        .tasks-bar .tasks-search {
          flex: 1 1 14rem;
          max-inline-size: 22rem;
        }

        .tasks-bar .tasks-status {
          flex: 0 1 12rem;
        }

        .tasks-meta {
          justify-content: space-between;
          min-block-size: 1.5rem;
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
      <div className="tasks-bar">
        <SearchField className="tasks-search" inputRef={searchRef} aria-label="Search tasks" placeholder="Search tasks" value={query} onChange={setQuery} />
        <Select className="tasks-status" aria-label="Status" items={statuses} value={status} onChange={(next) => { if (next) setStatus(next); }} />
        <Button variant="ghost" disabled={active.length === 0} onActivate={clear}>Clear filters</Button>
      </div>
      <div className="tasks-meta">
        {active.length > 0 && <TagGroup aria-label="Active filters" items={active} onRemove={(removed) => (removed.length === active.length ? clear() : removed.forEach(({ id }) => (id === 'query' ? setQuery('') : setStatus('all'))))} />}
        <Text size="sm" color="muted" role="status">{rows.length} of {tasks.length} tasks</Text>
      </div>
      <div className="tasks-scroll">
        <Table aria-label="Tasks" columns={columns} rows={rows} />
      </div>
      {rows.length === 0 && <Text as="p" color="muted">No tasks match these filters</Text>}
    </section>
  );
}
