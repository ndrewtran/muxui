import { AlertDialog, Button } from "@muxui/react";

export function BasicAlertDialogExample() {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger>Delete report</AlertDialog.Trigger>
      <AlertDialog.Backdrop>
        <AlertDialog.Popup>
          <AlertDialog.Content>
            <AlertDialog.Title>Delete Quarterly report?</AlertDialog.Title>
            <AlertDialog.Description>The report and its 12 comments are deleted. This cannot be undone.</AlertDialog.Description>
            <AlertDialog.Actions>
              <AlertDialog.Close>Cancel</AlertDialog.Close>
              <Button variant="danger" onActivate={() => undefined}>Delete report</Button>
            </AlertDialog.Actions>
          </AlertDialog.Content>
        </AlertDialog.Popup>
      </AlertDialog.Backdrop>
    </AlertDialog.Root>
  );
}
