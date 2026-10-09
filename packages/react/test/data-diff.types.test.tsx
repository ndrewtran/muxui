import * as React from 'react';
import { DataDiff, type DataDiffColumn, type DataDiffRow, type DataDiffProps, type DataDiffValue } from '@muxui/react';

const columns: readonly DataDiffColumn[] = [{ id: 'stock', label: 'Stock' }];
const rows: readonly DataDiffRow[] = [
  { id: 'zero', label: 'Zero stock', kind: 'added', values: { stock: 0 } },
  { id: 'update', label: 'Updated stock', kind: 'updated', before: { stock: null }, after: { stock: false } },
];
const value: DataDiffValue = false;
const props: DataDiffProps = { label: 'Review', columns, rows };
const component = <DataDiff {...props} ref={React.createRef<HTMLDivElement>()} title="Native tooltip" selectedIds={['zero']} onSelectionChange={(ids) => {
  const selection: readonly string[] = ids;
  void selection;
}} onApply={(ids) => { const selection: readonly string[] = ids; void selection; }} onSelect={(event) => {
  const native: React.SyntheticEvent<HTMLDivElement> = event;
  void native;
}} data-consumer="kept" />;
void [component, props, value];

// @ts-expect-error A visible table name is required.
const missingLabel = <DataDiff columns={columns} rows={rows} />;
// @ts-expect-error Updated rows require both complete value records.
const missingAfter: DataDiffRow = { id: 'row', label: 'Row', kind: 'updated', before: { stock: 0 } };
// @ts-expect-error Updated rows cannot use the values mode.
const mixedRow: DataDiffRow = { id: 'row', label: 'Row', kind: 'updated', before: { stock: 0 }, after: { stock: 1 }, values: { stock: 2 } };
// @ts-expect-error Table values must be scalar data.
const contentRow: DataDiffRow = { id: 'row', label: 'Row', kind: 'added', values: { stock: <strong>unsafe</strong> } };
// @ts-expect-error IDs remain strings.
const numericIds = <DataDiff {...props} selectedIds={[1]} />;
// @ts-expect-error Content is owned by columns/rows.
const children = <DataDiff {...props}>extra</DataDiff>;
// @ts-expect-error Raw HTML cannot replace reviewed content.
const html = <DataDiff {...props} dangerouslySetInnerHTML={{ __html: 'extra' }} />;
// @ts-expect-error Native select event is not the domain selection callback.
const selectDomain = <DataDiff {...props} onSelect={(ids: readonly string[]) => { void ids; }} />;
// @ts-expect-error Ref targets the native div host.
const wrongRef = <DataDiff {...props} ref={React.createRef<HTMLButtonElement>()} />;
void [missingLabel, missingAfter, mixedRow, contentRow, numericIds, children, html, selectDomain, wrongRef];
