import { useState } from 'react';
import { Banner } from '@muxui/react';

export function CustomColorBannerExample() {
  // The caller keeps the dismissal, so it can remember it and bring the Banner back.
  const [dismissed, setDismissed] = useState(false);
  return <Banner
    emphasis="solid"
    customColor="#6d28d9"
    align="center"
    label="Announcement"
    actions={[{ id: 'try', label: 'Try it', onAction: () => {} }, { id: 'later', label: 'Later', onAction: () => setDismissed(true) }]}
    dismissible
    dismissed={dismissed}
    onDismiss={() => setDismissed(true)}
  >
    Saved searches are here.
  </Banner>;
}
