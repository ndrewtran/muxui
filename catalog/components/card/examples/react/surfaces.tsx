import { Button, Card } from '@muxui/react';

export function CardSurfacesExample() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--muxui-reference-dimension-space-m)', alignItems: 'flex-start' }}>
      {/* The default surface for an ordinary boundary. */}
      <Card.Root variant="outlined">
        <Card.Header>Profile</Card.Header>
        <Card.Body>Account details</Card.Body>
        <Card.Footer><Button variant="neutral">Edit</Button></Card.Footer>
      </Card.Root>
      {/* Low-emphasis grouping beside the main content. */}
      <Card.Root variant="filled">
        <Card.Header>Tip</Card.Header>
        <Card.Body>Invite your team from Settings.</Card.Body>
      </Card.Root>
      {/* Use elevated sparingly, for one card that should lift off the page. */}
      <Card.Root variant="elevated">
        <Card.Header>Team plan</Card.Header>
        <Card.Body>Up to 10 members</Card.Body>
        <Card.Footer><Button>Upgrade</Button></Card.Footer>
      </Card.Root>
    </div>
  );
}
