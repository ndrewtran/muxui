import { Badge, Link } from '@muxui/react';

export function CountBadgeExample() {
  return <Link href="/inbox">
    Inbox <Badge tone="brand" variant="solid" label="12 unread">12</Badge>
  </Link>;
}
