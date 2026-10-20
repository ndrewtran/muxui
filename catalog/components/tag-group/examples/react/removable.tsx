import { useState } from 'react';
import { TagGroup } from '@muxui/react';

type FilterId = 'open' | 'mine' | 'urgent';
type Filter = { id: FilterId; label: string };
type Task = { id: string; title: string } & Record<FilterId, boolean>;

const tasks: Task[] = [
  { id: 'login', title: 'Fix login redirect', open: true, mine: true, urgent: true },
  { id: 'billing', title: 'Update billing copy', open: true, mine: true, urgent: false },
  { id: 'checklist', title: 'Review launch checklist', open: true, mine: false, urgent: true },
  { id: 'report', title: 'Prepare quarterly report', open: true, mine: false, urgent: false },
  { id: 'campaigns', title: 'Archive old campaigns', open: false, mine: true, urgent: false },
];

const initialFilters: Filter[] = [
  { id: 'open', label: 'Open' },
  { id: 'mine', label: 'Assigned to me' },
  { id: 'urgent', label: 'Urgent' },
];

export function RemovableTagGroupExample() {
  const [filters, setFilters] = useState(initialFilters);
  // The results come from the applied filters, so removing a filter updates them at once.
  const results = tasks.filter((task) => filters.every((filter) => task[filter.id]));
  return (
    <div>
      <TagGroup
        label="Applied filters"
        items={filters}
        onRemove={(removed) => {
          // TagGroup reports the removed items; the application removes them from its own list.
          const removedIds = new Set(removed.map((item) => item.id));
          setFilters((current) => current.filter((filter) => !removedIds.has(filter.id)));
        }}
      />
      {filters.length === 0 ? <p>No filters applied</p> : null}
      <p>Showing {results.length} of {tasks.length} tasks</p>
      <ul>
        {results.map((task) => (
          <li key={task.id}>{task.title}</li>
        ))}
      </ul>
    </div>
  );
}
