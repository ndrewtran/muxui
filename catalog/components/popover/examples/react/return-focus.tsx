import { useRef, useState } from 'react';
import { Button, Popover } from '@muxui/react';

export function PopoverReturnFocusExample() {
  const [reports, setReports] = useState(['Draft', 'Final']);
  const newReportRef = useRef<HTMLButtonElement>(null);

  return (
    <div style={{ display: 'grid', gap: 'var(--muxui-reference-dimension-space-xs)', justifyItems: 'start' }}>
      <Button ref={newReportRef} variant="neutral">New report</Button>
      <ul aria-label="Reports">
        {reports.map((report) => (
          <li key={report}>
            {report}{' '}
            {/* Delete removes the row with the trigger that opened the Popover, so focus goes to New report. */}
            <Popover aria-label={`${report} actions`} returnFocusRef={newReportRef} trigger={<Button variant="neutral">Actions</Button>}>
              <Button slot="close" onActivate={() => setReports((current) => current.filter((item) => item !== report))}>Delete</Button>
            </Popover>
          </li>
        ))}
      </ul>
    </div>
  );
}
