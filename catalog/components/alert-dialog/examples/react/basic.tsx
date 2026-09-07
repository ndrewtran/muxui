import { AlertDialog } from "@muxui/react";

export function BasicAlertDialogExample() {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger>Delete item</AlertDialog.Trigger>
      <AlertDialog.Backdrop>
        <AlertDialog.Popup>
          <AlertDialog.Content>
            <AlertDialog.Title>Delete item?</AlertDialog.Title>
            <AlertDialog.Description>This action cannot be undone.</AlertDialog.Description>
            <AlertDialog.Actions>
              <AlertDialog.Close>Cancel</AlertDialog.Close>
            </AlertDialog.Actions>
          </AlertDialog.Content>
        </AlertDialog.Popup>
      </AlertDialog.Backdrop>
    </AlertDialog.Root>
  );
}
