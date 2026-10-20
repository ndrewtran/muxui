# FileTrigger usage

Use FileTrigger with a clearly named trigger and handle the selected File array. Passing text uses the existing Mux UI Button styling; a custom trigger keeps its own styling.

## FileTrigger or DropZone

- Use FileTrigger alone for compact selection, such as an attachment in a form.
- Put it inside a [DropZone](/components/drop-zone/) for an upload area, so there is a named picker beside the drop target. The DropZone guide compares the two.

## Picker options

The options go to the native file picker. The accepted file types narrow what the picker offers by MIME type or extension, and multiple selection and folder selection are separate options. The default camera option picks the front or the rear camera and is passed to the browser as the native `capture` attribute. The FileTrigger selection example accepts several images.

## After selection

Selecting files only hands the File array to the application. FileTrigger uploads nothing and renders no named form field, so the files are not submitted with a form. Check each file, such as its size, before using it, as the FileTrigger selection example does. Choosing the same file again selects it again.

Decide when to start using the files by what the selection costs.

- Start right after validation for a simple, reversible attachment, such as a profile photo or a file added to a message.
- Stage the files behind a separate Upload or Confirm action when selection has a cost or consequence, such as a bulk import, so the user can review them first.
- Show filenames, rejections, and progress next to the picker, where the user chose.
- FileTrigger does not transfer or retry anything. Start, track, cancel, and retry the transfer in the application.

The FileTrigger with a confirmed upload example rejects files that are not CSV beside the picker, stages the rest behind an Upload Button, and reports only that an upload was requested. The [API reference](#api-reference) lists the props Mux UI defines.

## Content

- Label the trigger with a verb and an object, such as Choose images or Attach files.
- Say the limits near the trigger, such as "PNG or JPEG, up to 1 MB".

## Common mistake

Treating `acceptedFileTypes` as validation. It only narrows what the picker offers, and a user can still choose another file, so check every file in the handler.
