import * as React from 'react';
import { Activity, type ActivityProps } from '@muxui/react';
const props: ActivityProps = { label: 'Checks', items: [{ id: 'one', label: 'Read', status: 'running', context: <span>Context</span>, time: '3s' }], expanded: true, onExpandedChange: (value) => { const flag: boolean = value; void flag; } };
const activity = <Activity {...props} ref={React.createRef<HTMLDivElement>()} title="Native title" onClick={(event) => { const native: React.MouseEvent<HTMLDivElement> = event; void native; }} />;
// @ts-expect-error Finite statuses only.
const wrongStatus = <Activity label="Wrong" items={[{ id: 'one', label: 'Task', status: 'processing' }]} />;
// @ts-expect-error Aggregate requires an accessible label.
const missingLabel = <Activity items={[]} />;
// @ts-expect-error Activity has one layout and no presentation variant prop.
const wrongVariant = <Activity label="Wrong" items={[]} variant="list" />;
void [activity, wrongStatus, missingLabel, wrongVariant];
