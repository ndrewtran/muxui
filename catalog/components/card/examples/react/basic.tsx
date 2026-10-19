import { Button, Card } from "@muxui/react";

export function BasicCardExample() {
  return <Card.Root variant="outlined"><Card.Header>Profile</Card.Header><Card.Body>Account details</Card.Body><Card.Footer><Button>Edit</Button></Card.Footer></Card.Root>;
}
