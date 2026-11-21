import { Banner } from '@muxui/react';

function InfoGlyph() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>;
}

export function BasicBannerExample() {
  return <Banner
    tone="brand"
    title="Planned maintenance"
    icon={<InfoGlyph />}
    actions={[{ id: 'schedule', label: 'See the schedule', onAction: () => {} }]}
    link={{ label: 'Status page', href: '#status' }}
    dismissible
  >
    The site is read-only on Saturday from 02:00 to 04:00 UTC.
  </Banner>;
}
