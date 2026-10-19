# FileTrigger usage

Use FileTrigger with a clearly named trigger and handle the selected File array. Passing text uses the existing Mux UI Button styling; a custom trigger keeps its own styling.

## Picker options

The options go to the native file picker. The accepted file types narrow what the picker offers by MIME type or extension, and multiple selection and folder selection are separate options. The default camera option picks the front or the rear camera and is passed to the browser as the native `capture` attribute. The FileTrigger selection example accepts several images.

## After selection

Selecting files only hands the File array to the application. FileTrigger uploads nothing and renders no named form field, so the files are not submitted with a form. The picker only narrows what it offers, so check each file, such as its size, before using it, as the example does. Choosing the same file again selects it again. The [API reference](#api-reference) lists the props Mux UI defines.
