import { Card } from "@muxui/react";

export function BasicCardExample() {
  return <Card.Root variant="outlined"><Card.Header>Profile</Card.Header><Card.Body>Account details</Card.Body><Card.Footer><button type="button">Edit</button></Card.Footer></Card.Root>;
}
