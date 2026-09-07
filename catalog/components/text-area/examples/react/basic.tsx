import { TextArea } from "@muxui/react";

export function BasicTextAreaExample() {
  return <TextArea.Root><TextArea.Label>Notes</TextArea.Label><TextArea.TextArea rows={4} placeholder="Write a note" /><TextArea.Description>Keep it concise.</TextArea.Description></TextArea.Root>;
}
