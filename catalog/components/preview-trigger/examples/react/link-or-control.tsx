import { Button, PreviewTrigger } from '@muxui/react';

const row = { display: 'flex', flexWrap: 'wrap', gap: 'var(--muxui-reference-dimension-space-xs)', alignItems: 'center' } as const;

export function PreviewTriggerLinkOrControlExample() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--muxui-reference-dimension-space-m)' }}>
      {/* On the link: the link stays the one control, and the preview only adds detail. */}
      <PreviewTrigger aria-label="Quarterly report preview" trigger={<a href="#quarterly-report">Quarterly report</a>}>
        <p>Revenue by region, 4 pages.</p>
      </PreviewTrigger>
      {/* On a separate control: the preview is visible and named, and the link only navigates. */}
      <div style={row}>
        <a href="#annual-report">Annual report</a>
        <PreviewTrigger
          aria-label="Annual report preview"
          trigger={<Button variant="ghost" size="sm" aria-label="Preview Annual report">Preview</Button>}
        >
          <p>Year-end results, 12 pages.</p>
        </PreviewTrigger>
      </div>
    </div>
  );
}
